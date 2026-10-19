// Seguir outro computador: conecta ao fluxo de eventos (SSE) do controle remoto do líder e entrega cada estado
// recebido. Reconecta sozinho se o líder cair. Sem Electron: quem aplica o estado é quem chama (onState).
const http = require('node:http');

const HOST_RE = /^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;
const DEFAULT_DELAYS = [1000, 2000, 5000, 10000];
const MAX_BUFFER_CHARS = 1_000_000;
// O líder manda um sinal a cada 25 s: um minuto sem nada é conexão morta.
const IDLE_MS = 60 * 1000;
// Relógios de computadores de culto diferem por segundos; horas de diferença é relógio errado ou líder mentindo.
const MAX_CLOCK_OFFSET_MS = 6 * 60 * 60 * 1000;
const FOLLOWING_REASON = 'O outro computador também está seguindo alguém. Siga o computador principal.';
const BAD_TOKEN_REASON = 'Endereço ou token inválido (o token muda a cada vez que o outro computador abre o app).';

// Endereço do controle remoto do líder (o mesmo que aparece no botão de celular): http://IP:porta/?t=token
function parseSyncUrl(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    return { ok: false, reason: 'Endereço inválido. Cole o endereço do controle remoto do outro computador.' };
  }
  if (url.protocol !== 'http:') return { ok: false, reason: 'O endereço deve começar com http://' };
  if (!HOST_RE.test(url.hostname)) return { ok: false, reason: 'Computador inválido no endereço.' };
  const port = Number(url.port || 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, reason: 'Porta inválida no endereço.' };
  const token = url.searchParams.get('t') || '';
  if (!TOKEN_RE.test(token)) return { ok: false, reason: 'O endereço não tem o token (?t=…). Copie o endereço inteiro do controle remoto.' };
  return { ok: true, host: url.hostname, port, token };
}

// Leitor de SSE: junta os pedaços que chegam, ignora comentários (": ping") e entrega o texto de cada "data:".
// Cada pedaço é examinado uma vez só (um líder que manda 1 byte por vez não pode forçar reler o buffer inteiro):
// os pedaços ficam numa lista e só são juntados quando aparece o fim de uma mensagem ("\n\n").
function createSseParser(onData) {
  let parts = [];
  let size = 0;
  let lastChar = '';
  let carryCr = false; // "\r" no fim do pedaço anterior: pode ser o começo de um "\r\n"
  const overflow = () => {
    parts = [];
    size = 0;
    lastChar = '';
    throw new Error('Mensagem grande demais do outro computador.');
  };
  const emit = (block) => {
    const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, ''));
    if (data.length) onData(data.join('\n'));
  };
  return {
    feed(chunk) {
      let piece = (carryCr ? '\r' : '') + chunk;
      carryCr = piece.endsWith('\r');
      if (carryCr) piece = piece.slice(0, -1);
      piece = piece.replace(/\r\n/g, '\n');
      if (!piece) return;
      const endsMessage = piece.includes('\n\n') || (lastChar === '\n' && piece[0] === '\n');
      parts.push(piece);
      size += piece.length;
      lastChar = piece[piece.length - 1];
      if (size > MAX_BUFFER_CHARS) overflow();
      if (!endsMessage) return;
      let rest = parts.join('');
      parts = [];
      let end = rest.indexOf('\n\n');
      while (end >= 0) {
        emit(rest.slice(0, end));
        rest = rest.slice(end + 2);
        end = rest.indexOf('\n\n');
      }
      size = rest.length;
      lastChar = rest.slice(-1);
      if (rest) parts.push(rest);
    },
  };
}

function createSyncClient({ onState, onStatus, now = Date.now, delays = DEFAULT_DELAYS }) {
  // Cada conexão (e cada parada) abre uma "época": eventos atrasados de uma conexão antiga não fazem nada.
  let epoch = 0;
  let request = null;
  let timer = null;
  let target = null;
  let attempt = 0;

  const setStatus = (state, reason) => onStatus({ state, host: target ? target.host : null, ...(reason ? { reason } : {}) });
  const drop = () => {
    clearTimeout(timer);
    timer = null;
    if (request) request.destroy();
    request = null;
  };

  // Uma mensagem do líder: o estado vem com o horário dele (serverTime); a diferença para o relógio daqui
  // vai junto, para o cronômetro bater.
  function handleData(data, mine = epoch) {
    let state;
    try {
      state = JSON.parse(data);
    } catch (err) {
      console.error(`[sync] mensagem ilegível do outro computador: ${err.message}`);
      return;
    }
    if (state && state.following === true) {
      giveUp(mine, FOLLOWING_REASON);
      return;
    }
    const offset = state && Number.isFinite(state.serverTime) ? now() - state.serverTime : 0;
    onState(state, Math.abs(offset) > MAX_CLOCK_OFFSET_MS ? 0 : offset);
  }

  function fail(mine, reason) {
    if (mine !== epoch) return;
    epoch += 1; // o que ainda chegar desta conexão não vale mais
    drop();
    setStatus('reconnecting', reason);
    const wait = delays[Math.min(attempt, delays.length - 1)];
    attempt += 1;
    timer = setTimeout(() => { timer = null; connectOnce(); }, wait);
  }

  function giveUp(mine, reason) {
    if (mine !== epoch) return;
    epoch += 1;
    drop();
    setStatus('stopped', reason);
  }

  function connectOnce() {
    const mine = ++epoch;
    const parser = createSseParser((data) => handleData(data, mine));
    const req = http.request({
      host: target.host, port: target.port, method: 'GET', path: `/api/events?t=${encodeURIComponent(target.token)}`, headers: { accept: 'text/event-stream' },
    }, (res) => {
      if (mine !== epoch) { res.destroy(); return; }
      if (res.statusCode === 401 || res.statusCode === 403) { res.resume(); giveUp(mine, BAD_TOKEN_REASON); return; }
      if (res.statusCode !== 200) { res.resume(); fail(mine, `Resposta ${res.statusCode} do outro computador`); return; }
      attempt = 0;
      setStatus('connected');
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (mine !== epoch) return;
        try {
          parser.feed(chunk);
        } catch (err) {
          fail(mine, err.message);
        }
      });
      res.on('end', () => fail(mine, 'Conexão encerrada pelo outro computador'));
      res.on('error', (err) => fail(mine, err.message));
    });
    req.on('error', (err) => fail(mine, err.code === 'ECONNREFUSED' ? 'Conexão recusada (o outro computador está aberto e na mesma rede?)' : err.message));
    req.setTimeout(IDLE_MS, () => req.destroy(new Error('Sem sinal do outro computador')));
    req.end();
    request = req;
  }

  return {
    // `next`: o resultado de parseSyncUrl.
    start(next) {
      epoch += 1;
      drop();
      target = next;
      attempt = 0;
      setStatus('connecting');
      connectOnce();
    },
    stop() {
      epoch += 1;
      drop();
      setStatus('stopped');
    },
    handleData,
  };
}

module.exports = { parseSyncUrl, createSseParser, createSyncClient };

// Automação: comandos OSC recebidos (lista fechada), eventos do estado que disparam regras OSC de saída,
// e o avanço automático de slides. Tudo puro; o processo principal cuida da rede.
const { ADDRESS_RE } = require('./osc');
const { nextAutoIndex } = require('../renderer/shared/liveInfo'); // também usado pelo operador
const { liveKeyOf } = require('./state');

const EVENTS = ['slide', 'item', 'blackoutOn', 'blackoutOff', 'clear', 'media'];
const EVENT_LABELS = {
  slide: 'Slide ao vivo', item: 'Item novo ao vivo', blackoutOn: 'Tela preta ligada', blackoutOff: 'Tela preta desligada',
  clear: 'Conteúdo limpo', media: 'Vídeo/imagem no ar',
};
const MAX_RULES = 30;
const MAX_ARGS_CHARS = 200;
const DEFAULT_IN_PORT = 8000;
const HOST_RE = /^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/i;
const PREFIX = '/xpresenter';
// Nome antigo do app: continua aceito para não quebrar botões já configurados no Companion/Stream Deck.
const PREFIXES = [PREFIX, '/apresentador'];

// Comandos aceitos pela entrada OSC. "operator": precisa do contexto de slides do operador (avançar/voltar).
const INPUT_MAP = {
  next: { kind: 'operator', command: 'next' },
  prev: { kind: 'operator', command: 'prev' },
  // Áudio de fundo: quem toca é a janela do operador (o computador do culto), então vão para ela.
  'audio/toggle': { kind: 'operator', command: 'audio/toggle' },
  'audio/next': { kind: 'operator', command: 'audio/next' },
  'audio/fade': { kind: 'operator', command: 'audio/fade' },
  clear: { kind: 'action', action: { type: 'clear' } },
  black: { kind: 'action', action: { type: 'blackout' } },
  cover: { kind: 'action', action: { type: 'toggleCover' } },
  lyrics: { kind: 'action', action: { type: 'toggleLayer', layer: 'content' } },
  background: { kind: 'action', action: { type: 'toggleLayer', layer: 'background' } },
  'timer/toggle': { kind: 'action', action: { type: 'timerToggle' } },
  'timer/reset': { kind: 'action', action: { type: 'timerReset' } },
  'media/play': { kind: 'action', action: { type: 'mediaControl', command: 'play' } },
  'media/pause': { kind: 'action', action: { type: 'mediaControl', command: 'pause' } },
  'media/restart': { kind: 'action', action: { type: 'mediaControl', command: 'restart' } },
};
const MACRO_RE = /^macro\/([1-9]\d?)$/; // /xpresenter/macro/N: o N-ésimo macro (1 a 99)
const INPUT_COMMANDS = [...Object.keys(INPUT_MAP).map((k) => `${PREFIX}/${k}`), `${PREFIX}/macro/N (N = 1 a 99, a ordem dos macros)`];

function commandFor(address) {
  if (typeof address !== 'string') return null;
  const prefix = PREFIXES.find((p) => address.startsWith(`${p}/`));
  if (!prefix) return null;
  const key = address.slice(prefix.length + 1);
  const macro = key.match(MACRO_RE);
  if (macro) return { kind: 'macro', index: Number(macro[1]) };
  if (!Object.hasOwn(INPUT_MAP, key)) return null;
  const hit = INPUT_MAP[key];
  return hit.kind === 'action' ? { kind: 'action', action: { ...hit.action } } : { ...hit };
}

const validPort = (p) => Number.isInteger(p) && p >= 1 && p <= 65535;

function sanitizeRule(r) {
  if (!r || typeof r !== 'object' || !EVENTS.includes(r.event)) return null;
  if (typeof r.host !== 'string' || r.host.length > 253 || !HOST_RE.test(r.host)) return null;
  if (!validPort(r.port) || typeof r.address !== 'string' || !ADDRESS_RE.test(r.address) || /[\s#,]/.test(r.address)) return null;
  const args = typeof r.args === 'string' ? r.args : '';
  if (args.length > MAX_ARGS_CHARS) return null;
  return { event: r.event, host: r.host, port: r.port, address: r.address, args };
}

function sanitizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const oscIn = src.oscIn && typeof src.oscIn === 'object' ? src.oscIn : {};
  return {
    oscIn: {
      enabled: oscIn.enabled === true,
      port: validPort(oscIn.port) && oscIn.port >= 1024 ? oscIn.port : DEFAULT_IN_PORT,
      allowNetwork: oscIn.allowNetwork === true, // padrão: só aceita do próprio computador
    },
    rules: (Array.isArray(src.rules) ? src.rules : []).map(sanitizeRule).filter(Boolean).slice(0, MAX_RULES),
  };
}

const itemOf = (key) => (key ? key.replace(/:\d+$/, '') : null);

// Eventos entre dois estados (para as regras de saída).
function eventsBetween(prev, next) {
  if (prev === next) return [];
  const events = [];
  const before = prev.layers.content.slide;
  const after = next.layers.content.slide;
  const itemBefore = itemOf(liveKeyOf(prev));
  const itemAfter = itemOf(liveKeyOf(next));
  const changedLive = (after && after !== before) || (next.layers.media && next.layers.media !== prev.layers.media);
  if (after && after !== before) events.push({ type: 'slide' });
  // "Item novo" só para o que veio do culto/slides (tem chave); vídeo avulso da biblioteca é só "media".
  if (changedLive && itemAfter && itemAfter !== itemBefore) events.push({ type: 'item' });
  if (!after && before && !next.layers.media) events.push({ type: 'clear' });
  if (next.blackout !== prev.blackout) events.push({ type: next.blackout ? 'blackoutOn' : 'blackoutOff' });
  const mediaBefore = prev.layers.media;
  const mediaAfter = next.layers.media;
  if (mediaAfter && (!mediaBefore || mediaAfter.seq !== mediaBefore.seq || mediaAfter.value !== mediaBefore.value)) {
    events.push({ type: 'media' });
  }
  return events;
}

module.exports = {
  EVENTS, EVENT_LABELS, INPUT_COMMANDS, sanitizeSettings, eventsBetween, commandFor, nextAutoIndex,
};

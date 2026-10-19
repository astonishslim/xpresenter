// Rede da automação: escuta comandos OSC (UDP) e envia as regras de saída quando o estado muda.
// Sem Electron: quem precisa do operador (avançar/voltar) recebe pelo callback sendToOperator.
const dgram = require('node:dgram');
const { encodeMessage, decodePacket, parseArgs } = require('./osc');
const { sanitizeSettings, eventsBetween, commandFor } = require('./automation');
const { isValidAction, stampAction } = require('./state');

const MAX_MESSAGES_PER_SECOND = 100;

function createAutomationService({ store, sendToOperator }) {
  let inSocket = null;
  let outSocket = null;
  let rules = [];
  let windowStart = 0;
  let windowCount = 0;

  // Limite simples: um script em loop na rede não trava a projeção.
  const allowMessage = () => {
    const now = Date.now();
    if (now - windowStart > 1000) { windowStart = now; windowCount = 0; }
    windowCount += 1;
    return windowCount <= MAX_MESSAGES_PER_SECOND;
  };

  const handlePacket = (buf) => {
    for (const msg of decodePacket(buf)) {
      if (!allowMessage()) return;
      const cmd = commandFor(msg.address);
      if (!cmd) continue;
      if (cmd.kind === 'operator') sendToOperator(cmd.command);
      else if (isValidAction(cmd.action)) store.dispatch(stampAction(cmd.action, Date.now()));
    }
  };

  const send = (rule) => {
    try {
      if (!outSocket) {
        outSocket = dgram.createSocket('udp4');
        outSocket.on('error', (err) => console.error(`[osc] envio: ${err.message}`));
      }
      outSocket.send(encodeMessage(rule.address, parseArgs(rule.args)), rule.port, rule.host, (err) => {
        if (err) console.error(`[osc] não foi possível enviar ${rule.address} para ${rule.host}:${rule.port}: ${err.message}`);
      });
    } catch (err) {
      console.error(`[osc] regra inválida ${rule.address}: ${err.message}`);
    }
  };

  let prev = store.getState();
  const unsubscribe = store.subscribe((state) => {
    const events = eventsBetween(prev, state);
    prev = state;
    if (!rules.length) return;
    events.forEach((e) => rules.filter((r) => r.event === e.type).forEach(send));
  });

  const closeIn = () => new Promise((resolve) => {
    if (!inSocket) { resolve(); return; }
    const s = inSocket;
    inSocket = null;
    s.close(() => resolve());
  });

  const openIn = ({ port, allowNetwork }) => new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', (err) => {
      sock.close();
      const reason = err.code === 'EADDRINUSE' ? `A porta ${port} já está em uso por outro programa.` : err.message;
      console.error(`[osc] entrada: ${reason}`);
      resolve({ port: null, error: reason });
    });
    sock.on('message', handlePacket);
    sock.bind(port, allowNetwork ? '0.0.0.0' : '127.0.0.1', () => {
      sock.removeAllListeners('error');
      sock.on('error', (err) => console.error(`[osc] entrada: ${err.message}`));
      inSocket = sock;
      resolve({ port: sock.address().port, error: null });
    });
  });

  return {
    // Aplica a configuração (regras já validadas por sanitizeSettings; porta 0 = qualquer livre, para testes).
    async apply(settings) {
      rules = sanitizeSettings({ rules: settings && settings.rules }).rules;
      await closeIn();
      const oscIn = (settings && settings.oscIn) || {};
      if (oscIn.enabled !== true || !Number.isInteger(oscIn.port) || oscIn.port < 0 || oscIn.port > 65535) {
        return { port: null, error: null };
      }
      return openIn({ port: oscIn.port, allowNetwork: oscIn.allowNetwork === true });
    },
    stop() {
      unsubscribe();
      closeIn();
      if (outSocket) { outSocket.close(); outSocket = null; }
    },
  };
}

module.exports = { createAutomationService };

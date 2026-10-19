const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const { createStore } = require('../src/core/store');
const { createAutomationService } = require('../src/core/automationService');
const { encodeMessage, decodePacket } = require('../src/core/osc');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function udpListener() {
  const sock = dgram.createSocket('udp4');
  const received = [];
  sock.on('message', (buf) => received.push(...decodePacket(buf)));
  return new Promise((resolve) => sock.bind(0, '127.0.0.1', () => resolve({ sock, received, port: sock.address().port })));
}

const sendTo = (port, address) => new Promise((resolve) => {
  const s = dgram.createSocket('udp4');
  s.send(encodeMessage(address, []), port, '127.0.0.1', () => { s.close(); resolve(); });
});

test('entrada OSC: comandos da lista viram ações ou avisos ao operador; o resto é ignorado', async (t) => {
  const store = createStore();
  const toOperator = [];
  const svc = createAutomationService({ store, sendToOperator: (c) => toOperator.push(c) });
  t.after(() => svc.stop());
  const { port } = await svc.apply({ oscIn: { enabled: true, port: 0 }, rules: [] });
  assert.ok(port > 0);
  await sendTo(port, '/apresentador/black');
  await sendTo(port, '/apresentador/next');
  await sendTo(port, '/apresentador/setBackground');
  await sendTo(port, '/apresentador/timer/toggle');
  await wait(150);
  assert.equal(store.getState().blackout, true);
  assert.notEqual(store.getState().timer.startedAt, null, 'timerToggle recebe o horário carimbado');
  assert.deepEqual(toOperator, ['next']);
});

test('regras de saída: evento do estado envia a mensagem OSC configurada', async (t) => {
  const store = createStore();
  const listener = await udpListener();
  const svc = createAutomationService({ store, sendToOperator: () => {} });
  t.after(() => { svc.stop(); listener.sock.close(); });
  await svc.apply({ oscIn: { enabled: false }, rules: [
    { event: 'item', host: '127.0.0.1', port: listener.port, address: '/luz/cena', args: '2 louvor' },
    { event: 'blackoutOn', host: '127.0.0.1', port: listener.port, address: '/luz/apagar' },
  ] });
  store.dispatch({ type: 'showSlide', slide: { text: 'a', key: 'k:0' } });
  store.dispatch({ type: 'showSlide', slide: { text: 'b', key: 'k:1' } }); // mesmo item: não dispara "item"
  store.dispatch({ type: 'blackout' });
  await wait(200);
  assert.deepEqual(listener.received, [{ address: '/luz/cena', args: [2, 'louvor'] }, { address: '/luz/apagar', args: [] }]);
});

test('aplicar de novo troca a porta; desligar fecha a entrada', async (t) => {
  const store = createStore();
  const svc = createAutomationService({ store, sendToOperator: () => {} });
  t.after(() => svc.stop());
  const first = await svc.apply({ oscIn: { enabled: true, port: 0 }, rules: [] });
  const off = await svc.apply({ oscIn: { enabled: false }, rules: [] });
  assert.equal(off.port, null);
  await sendTo(first.port, '/apresentador/black');
  await wait(100);
  assert.equal(store.getState().blackout, false, 'porta antiga não escuta mais');
});

test('apply simultâneos são feitos em fila: só a última configuração fica escutando', async (t) => {
  const store = createStore();
  const svc = createAutomationService({ store, sendToOperator: () => {} });
  t.after(() => svc.stop());
  const [a, b] = await Promise.all([
    svc.apply({ oscIn: { enabled: true, port: 0 }, rules: [] }),
    svc.apply({ oscIn: { enabled: true, port: 0 }, rules: [] }),
  ]);
  assert.ok(a.port && b.port && a.port !== b.port);
  await sendTo(a.port, '/apresentador/black');
  await wait(100);
  assert.equal(store.getState().blackout, false, 'o socket da primeira foi fechado (não vazou)');
  await sendTo(b.port, '/apresentador/black');
  await wait(100);
  assert.equal(store.getState().blackout, true);
});

test('porta ocupada: devolve erro legível em vez de derrubar', async (t) => {
  const busy = await udpListener();
  const svc = createAutomationService({ store: createStore(), sendToOperator: () => {} });
  t.after(() => { svc.stop(); busy.sock.close(); });
  const res = await svc.apply({ oscIn: { enabled: true, port: busy.port }, rules: [] }, { exactPort: true });
  assert.equal(res.port, null);
  assert.match(res.error, /porta/i);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  fieldsOf, fillMessage, sanitizeTemplate, pickValues, createMessageLibrary, createMessageRunner,
} = require('../src/core/messages');
const { createStore } = require('../src/core/store');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'msg-')), 'messages.json');

test('fieldsOf lista os campos {entre chaves} uma vez, na ordem', () => {
  assert.deepEqual(fieldsOf('Pais de {criança}, sala {sala}. {criança}!'), ['criança', 'sala']);
  assert.deepEqual(fieldsOf('Sem campos'), []);
  assert.deepEqual(fieldsOf('{ nome do carro }'), ['nome do carro']);
  assert.deepEqual(fieldsOf('{}{' + 'x'.repeat(31) + '}'), []);
  assert.deepEqual(fieldsOf(null), []);
});

test('fillMessage troca os campos pelos valores e limpa espaços', () => {
  assert.equal(fillMessage('Pais de {criança}, sala {sala}.', { criança: ' Ana ', sala: '2' }), 'Pais de Ana, sala 2.');
  assert.equal(fillMessage('Placa {placa}  ok', {}), 'Placa ok');
  assert.equal(fillMessage('{ nome }', { nome: 'Zé' }), 'Zé');
});

test('fillMessage corta valores longos e o texto final em 200 caracteres', () => {
  assert.equal(fillMessage('{a}', { a: 'x'.repeat(500) }).length, 80);
  assert.equal(fillMessage(`${'y'.repeat(190)} {a}`, { a: 'x'.repeat(80) }).length, 200);
  assert.equal(fillMessage('{a}', { a: 42 }), '');
});

test('sanitizeTemplate aceita só campos válidos', () => {
  const ok = sanitizeTemplate({ id: 'm1', name: ' Berçário ', text: 'Pais de {criança}', seconds: 30, target: 'both' });
  assert.deepEqual(ok, { id: 'm1', name: 'Berçário', text: 'Pais de {criança}', seconds: 30, target: 'both' });
  assert.equal(sanitizeTemplate({ name: 'A', text: 'x' }).target, 'screen');
  assert.equal(sanitizeTemplate({ name: 'A', text: 'x' }).seconds, 0);
  assert.ok(sanitizeTemplate({ name: 'A', text: 'x' }).id);
  assert.equal(sanitizeTemplate({ name: '', text: 'x' }), null);
  assert.equal(sanitizeTemplate({ name: 'A', text: '  ' }), null);
  assert.equal(sanitizeTemplate({ name: 'x'.repeat(41), text: 'x' }), null);
  assert.equal(sanitizeTemplate({ name: 'A', text: 'x'.repeat(201) }), null);
  assert.equal(sanitizeTemplate({ name: 'A', text: 'x', seconds: 3601 }).seconds, 0);
  assert.equal(sanitizeTemplate({ name: 'A', text: 'x', seconds: 2.5 }).seconds, 0);
  assert.equal(sanitizeTemplate({ name: 'A', text: 'x', target: 'hack' }).target, 'screen');
  assert.equal(sanitizeTemplate('lixo'), null);
});

test('biblioteca nova vem com modelos de exemplo; arquivo existente é respeitado', () => {
  const file = tmpFile();
  const lib = createMessageLibrary(file);
  assert.ok(lib.list().length >= 2);
  fs.writeFileSync(file, JSON.stringify([]));
  assert.deepEqual(createMessageLibrary(file).list(), []);
});

test('save cria e atualiza pelo id, persiste, e recusa modelo inválido', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '[]');
  const lib = createMessageLibrary(file);
  const created = lib.save({ name: 'Carro', text: 'Placa {placa}', seconds: 20 });
  assert.equal(created.ok, true);
  const id = created.templates[0].id;
  lib.save({ id, name: 'Carro', text: 'Veículo {placa}', seconds: 20 });
  assert.equal(createMessageLibrary(file).list()[0].text, 'Veículo {placa}');
  assert.equal(lib.list().length, 1);
  const bad = lib.save({ name: '', text: 'x' });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /nome/i);
});

test('save recusa nome repetido em outro modelo; remove apaga', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '[]');
  const lib = createMessageLibrary(file);
  const { templates } = lib.save({ name: 'Carro', text: 'x' });
  assert.equal(lib.save({ name: 'carro', text: 'y' }).ok, false);
  lib.remove(templates[0].id);
  assert.deepEqual(lib.list(), []);
});

test('arquivo corrompido ou com lixo não derruba', () => {
  const file = tmpFile();
  const origError = console.error;
  console.error = () => {};
  fs.writeFileSync(file, '{nao e json');
  assert.deepEqual(createMessageLibrary(file).list(), []);
  fs.writeFileSync(file, JSON.stringify([{ name: 'Ok', text: 'x' }, 'lixo', { name: '' }]));
  assert.deepEqual(createMessageLibrary(file).list().map((t) => t.name), ['Ok']);
  console.error = origError;
});

// Relógio falso para os timers do executor.
function fakeTimers() {
  const pending = new Map();
  let seq = 0;
  return {
    setTimer: (fn, ms) => { seq += 1; pending.set(seq, { fn, ms }); return seq; },
    clearTimer: (id) => pending.delete(id),
    fire: () => { const all = [...pending.values()]; pending.clear(); all.forEach((p) => p.fn()); },
    pending,
  };
}

test('show põe o aviso na tela com os campos preenchidos e some depois do tempo', () => {
  const store = createStore();
  const timers = fakeTimers();
  const runner = createMessageRunner({ dispatch: store.dispatch, getState: store.getState, ...timers });
  const res = runner.show({ text: 'Pais de {criança}', seconds: 30, target: 'screen' }, { criança: 'Ana' });
  assert.deepEqual(res, { ok: true, text: 'Pais de Ana' });
  assert.equal(store.getState().layers.announcement.text, 'Pais de Ana');
  assert.equal([...timers.pending.values()][0].ms, 30000);
  timers.fire();
  assert.equal(store.getState().layers.announcement.text, null);
});

test('show no palco usa a mensagem do retorno; "both" usa os dois', () => {
  const store = createStore();
  const runner = createMessageRunner({ dispatch: store.dispatch, getState: store.getState, ...fakeTimers() });
  runner.show({ text: 'Faltam 5 min', seconds: 0, target: 'stage' }, {});
  assert.equal(store.getState().stage.message, 'Faltam 5 min');
  assert.equal(store.getState().layers.announcement.text, null);
  runner.show({ text: 'Os dois', seconds: 0, target: 'both' }, {});
  assert.equal(store.getState().stage.message, 'Os dois');
  assert.equal(store.getState().layers.announcement.text, 'Os dois');
});

test('sem tempo (0) o aviso fica até limpar; clear tira o que o modelo pôs', () => {
  const store = createStore();
  const timers = fakeTimers();
  const runner = createMessageRunner({ dispatch: store.dispatch, getState: store.getState, ...timers });
  runner.show({ text: 'Fica', seconds: 0, target: 'both' }, {});
  assert.equal(timers.pending.size, 0);
  runner.clear();
  assert.equal(store.getState().layers.announcement.text, null);
  assert.equal(store.getState().stage.message, null);
});

test('o tempo esgotado não apaga um aviso diferente que o operador pôs depois', () => {
  const store = createStore();
  const timers = fakeTimers();
  const runner = createMessageRunner({ dispatch: store.dispatch, getState: store.getState, ...timers });
  runner.show({ text: 'Modelo', seconds: 10, target: 'screen' }, {});
  store.dispatch({ type: 'setAnnouncement', text: 'Manual' });
  timers.fire();
  assert.equal(store.getState().layers.announcement.text, 'Manual');
});

test('mensagem nova cancela o tempo da anterior', () => {
  const store = createStore();
  const timers = fakeTimers();
  const runner = createMessageRunner({ dispatch: store.dispatch, getState: store.getState, ...timers });
  runner.show({ text: 'Um', seconds: 10, target: 'screen' }, {});
  runner.show({ text: 'Dois', seconds: 0, target: 'screen' }, {});
  assert.equal(timers.pending.size, 0);
});

test('show recusa mensagem que ficou vazia (campos sem valor)', () => {
  const store = createStore();
  const runner = createMessageRunner({ dispatch: store.dispatch, getState: store.getState, ...fakeTimers() });
  const res = runner.show({ text: '{nome}', seconds: 0, target: 'screen' }, {});
  assert.equal(res.ok, false);
  assert.equal(store.getState().layers.announcement.text, null);
});

test('mensagem nova tira a anterior de onde ela estava (ex.: retorno), mesmo com outro alvo', () => {
  const store = createStore();
  const runner = createMessageRunner({ dispatch: store.dispatch, getState: store.getState, ...fakeTimers() });
  runner.show({ text: 'A', seconds: 0, target: 'both' }, {});
  runner.show({ text: 'B', seconds: 0, target: 'screen' }, {});
  assert.equal(store.getState().layers.announcement.text, 'B');
  assert.equal(store.getState().stage.message, null);
});

test('biblioteca descarta id e nome repetidos de um messages.json editado à mão', () => {
  const file = tmpFile();
  fs.writeFileSync(file, JSON.stringify([
    { id: 'x', name: 'A', text: '1' }, { id: 'x', name: 'B', text: '2' }, { id: 'y', name: 'a', text: '3' },
  ]));
  assert.deepEqual(createMessageLibrary(file).list().map((t) => t.name), ['A']);
});

test('pickValues fica só com os campos do modelo', () => {
  assert.deepEqual(pickValues('{a} {b}', { b: '2', c: '3', a: 1 }), { b: '2' });
  assert.deepEqual(pickValues('{a}', null), {});
});

test('findByName acha o modelo pelo nome, sem diferenciar maiúsculas e espaços nas pontas', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '[]');
  const lib = createMessageLibrary(file);
  const { templates } = lib.save({ name: 'Berçário', text: 'x' });
  assert.equal(lib.findByName('  berçário ').id, templates[0].id);
  assert.equal(lib.findByName('nada'), null);
  assert.equal(lib.findByName(42), null);
});

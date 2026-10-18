const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../src/core/store');

test('dispatch atualiza o estado e notifica os assinantes', () => {
  const store = createStore();
  const seen = [];
  store.subscribe((s) => seen.push(s.blackout));
  store.dispatch({ type: 'blackout' });
  assert.deepEqual(seen, [true]);
  assert.equal(store.getState().blackout, true);
});

test('ação sem efeito não notifica', () => {
  const store = createStore();
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  store.dispatch({ type: 'desconhecida' });
  assert.equal(calls, 0);
});

test('unsubscribe para de notificar', () => {
  const store = createStore();
  let calls = 0;
  const off = store.subscribe(() => { calls += 1; });
  off();
  store.dispatch({ type: 'blackout' });
  assert.equal(calls, 0);
});

test('erro em um assinante não impede os demais nem o dispatch', () => {
  const store = createStore();
  let reached = false;
  const origError = console.error;
  console.error = () => {};
  store.subscribe(() => { throw new Error('janela destruída'); });
  store.subscribe(() => { reached = true; });
  store.dispatch({ type: 'blackout' });
  console.error = origError;
  assert.equal(reached, true);
});

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

// Relógio controlado: cada ação "acontece" num instante escolhido pelo teste.
function clockedStore() {
  let t = 0;
  const store = createStore(undefined, { now: () => t });
  return { store, at: (ms) => { t = ms; } };
}
const show = (text, key) => ({ type: 'showSlide', slide: { label: 'V', text, key }, next: null });
const liveText = (store) => store.getState().layers.content.slide && store.getState().layers.content.slide.text;

test('undo volta ao slide anterior; redo refaz', () => {
  const { store, at } = clockedStore();
  at(1000); store.dispatch(show('a'));
  at(2000); store.dispatch(show('b'));
  store.undo();
  assert.equal(liveText(store), 'a');
  store.undo();
  assert.equal(liveText(store), null);
  store.redo();
  store.redo();
  assert.equal(liveText(store), 'b');
});

test('undo desfaz tela preta, limpar e camadas', () => {
  const { store, at } = clockedStore();
  at(1000); store.dispatch(show('a'));
  at(2000); store.dispatch({ type: 'clear' });
  at(3000); store.dispatch({ type: 'blackout' });
  store.undo();
  assert.equal(store.getState().blackout, false);
  store.undo();
  assert.equal(liveText(store), 'a');
});

test('ações em sequência rápida (tema automático + slide) viram um passo só', () => {
  const { store, at } = clockedStore();
  at(1000); store.dispatch(show('a'));
  at(5000); store.dispatch({ type: 'setBackground', background: { kind: 'color', value: '#112233' } });
  at(5010); store.dispatch({ type: 'setTextStyle', style: { uppercase: true } });
  at(5020); store.dispatch(show('b'));
  store.undo();
  assert.equal(liveText(store), 'a');
  assert.equal(store.getState().layers.background.value, '#000000');
  assert.equal(store.getState().textStyle.uppercase, false);
});

test('o passo agrupado não cresce para sempre: avanços espaçados viram passos separados', () => {
  const { store, at } = clockedStore();
  at(1000); store.dispatch(show('a'));
  at(1200); store.dispatch(show('b'));
  at(1400); store.dispatch(show('c'));
  store.undo();
  assert.equal(liveText(store), 'b');
});

test('cronômetro, controle de vídeo e mensagem do palco não entram no desfazer e são mantidos', () => {
  const { store, at } = clockedStore();
  at(1000); store.dispatch(show('a'));
  at(2000); store.dispatch(show('b'));
  at(3000); store.dispatch({ type: 'timerVisible' });
  at(4000); store.dispatch({ type: 'setStageMessage', text: 'Faltam 5 min' });
  store.undo();
  assert.equal(liveText(store), 'a');
  assert.equal(store.getState().timer.visible, true);
  assert.equal(store.getState().stage.message, 'Faltam 5 min');
});

test('ação nova depois de desfazer apaga o refazer', () => {
  const { store, at } = clockedStore();
  at(1000); store.dispatch(show('a'));
  at(2000); store.dispatch(show('b'));
  store.undo();
  at(3000); store.dispatch(show('c'));
  store.redo();
  assert.equal(liveText(store), 'c');
});

test('undo/redo sem histórico não muda nada nem notifica', () => {
  const { store } = clockedStore();
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  const before = store.getState();
  assert.equal(store.undo(), before);
  assert.equal(store.redo(), before);
  assert.equal(calls, 0);
});

test('undo notifica os assinantes e informa se ainda há o que desfazer', () => {
  const { store, at } = clockedStore();
  const seen = [];
  store.subscribe((s) => seen.push(s.blackout));
  at(1000); store.dispatch({ type: 'blackout' });
  assert.deepEqual(store.history(), { canUndo: true, canRedo: false });
  store.undo();
  assert.deepEqual(seen, [true, false]);
  assert.deepEqual(store.history(), { canUndo: false, canRedo: true });
});

test('o histórico guarda no máximo 50 passos', () => {
  const { store, at } = clockedStore();
  for (let i = 0; i < 60; i += 1) { at(1000 * (i + 1)); store.dispatch(show(String(i))); }
  for (let i = 0; i < 60; i += 1) store.undo();
  assert.equal(liveText(store), '9');
});

test('desfazer não traz de volta o aviso: o aviso atual é mantido e não vira passo', () => {
  const { store, at } = clockedStore();
  at(1000); store.dispatch({ type: 'setAnnouncement', text: 'Berçário' });
  at(2000); store.dispatch(show('a'));
  at(3000); store.dispatch({ type: 'setAnnouncement', text: '' });
  store.undo();
  assert.equal(liveText(store), null);
  assert.equal(store.getState().layers.announcement.text, null);
});

test('definir o horário do cronômetro não entra no desfazer nem apaga o refazer', () => {
  const { store, at } = clockedStore();
  at(1000); store.dispatch(show('a'));
  at(2000); store.dispatch(show('b'));
  store.undo();
  at(3000); store.dispatch({ type: 'timerUntil', time: '19:00', now: 3000 });
  assert.deepEqual(store.history(), { canUndo: true, canRedo: true });
  store.redo();
  assert.equal(liveText(store), 'b');
});

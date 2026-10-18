const test = require('node:test');
const assert = require('node:assert/strict');
const { initialState, reduce, isValidAction } = require('../src/core/state');

const slide = { label: 'Verso', text: 'Olá' };

test('estado inicial tem as 4 camadas e não está em blackout', () => {
  const s = initialState();
  assert.deepEqual(Object.keys(s.layers), ['background', 'content', 'cover', 'announcement']);
  assert.equal(s.blackout, false);
});

test('showSlide coloca o slide na camada de conteúdo e desliga blackout', () => {
  const s = reduce({ ...initialState(), blackout: true }, { type: 'showSlide', slide });
  assert.deepEqual(s.layers.content.slide, slide);
  assert.equal(s.blackout, false);
});

test('reduce não muta o estado anterior', () => {
  const before = initialState();
  const snapshot = JSON.stringify(before);
  reduce(before, { type: 'showSlide', slide });
  assert.equal(JSON.stringify(before), snapshot);
});

test('clear limpa o conteúdo', () => {
  const s = reduce(reduce(initialState(), { type: 'showSlide', slide }), { type: 'clear' });
  assert.equal(s.layers.content.slide, null);
});

test('blackout alterna', () => {
  const on = reduce(initialState(), { type: 'blackout' });
  assert.equal(on.blackout, true);
  assert.equal(reduce(on, { type: 'blackout' }).blackout, false);
});

test('setBackground e setAnnouncement atualizam suas camadas', () => {
  let s = reduce(initialState(), { type: 'setBackground', background: { kind: 'color', value: '#112233' } });
  s = reduce(s, { type: 'setAnnouncement', text: 'Culto às 19h' });
  assert.equal(s.layers.background.value, '#112233');
  assert.equal(s.layers.announcement.text, 'Culto às 19h');
});

test('toggleCover alterna a camada de capa', () => {
  const s = reduce(initialState(), { type: 'toggleCover' });
  assert.equal(s.layers.cover.visible, true);
});

test('ação desconhecida devolve o mesmo estado', () => {
  const s = initialState();
  assert.equal(reduce(s, { type: 'nada' }), s);
});

test('isValidAction aceita só tipos conhecidos com payload mínimo', () => {
  assert.equal(isValidAction({ type: 'clear' }), true);
  assert.equal(isValidAction({ type: 'showSlide', slide }), true);
  assert.equal(isValidAction({ type: 'showSlide' }), false);
  assert.equal(isValidAction({ type: 'hack' }), false);
  assert.equal(isValidAction(null), false);
});

test('isValidAction rejeita nomes herdados do protótipo (toString, constructor, __proto__)', () => {
  for (const type of ['toString', 'constructor', 'valueOf', '__proto__', 'hasOwnProperty']) {
    assert.equal(isValidAction({ type }), false, type);
  }
  const s = initialState();
  assert.equal(reduce(s, { type: 'toString' }), s);
});

test('setBackground valida formato: cor hex, ou URL file: sem host', () => {
  const ok = (background) => isValidAction({ type: 'setBackground', background });
  assert.equal(ok({ kind: 'color', value: '#aabbcc' }), true);
  assert.equal(ok({ kind: 'color', value: 'red' }), false);
  assert.equal(ok({ kind: 'image', value: 'file:///C:/img/a.png' }), true);
  assert.equal(ok({ kind: 'image', value: 'file://atacante/share/x.png' }), false);
  assert.equal(ok({ kind: 'video', value: 'http://x/y.mp4' }), false);
  assert.equal(ok({ kind: 'script', value: '#000000' }), false);
});

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

test('estado inicial tem a seção de retorno vazia', () => {
  assert.deepEqual(initialState().stage, { next: null, message: null });
});

test('showSlide guarda o próximo slide para o monitor de retorno', () => {
  const next = { label: 'Refrão', text: 'Aleluia' };
  const s = reduce(initialState(), { type: 'showSlide', slide, next });
  assert.deepEqual(s.stage.next, next);
  assert.equal(reduce(s, { type: 'showSlide', slide }).stage.next, null);
});

test('clear zera o próximo slide', () => {
  const s = reduce(initialState(), { type: 'showSlide', slide, next: { text: 'x' } });
  assert.equal(reduce(s, { type: 'clear' }).stage.next, null);
});

test('setStageMessage define e limpa a mensagem do retorno', () => {
  const s = reduce(initialState(), { type: 'setStageMessage', text: 'Acabar em 2 min' });
  assert.equal(s.stage.message, 'Acabar em 2 min');
  assert.equal(reduce(s, { type: 'setStageMessage', text: '' }).stage.message, null);
});

test('estado inicial usa o estilo de texto padrão, ou o visual informado', () => {
  const { DEFAULT_TEXT_STYLE } = require('../src/core/textStyle');
  assert.deepEqual(initialState().textStyle, DEFAULT_TEXT_STYLE);
  const s = initialState({ background: { kind: 'color', value: '#101010' }, style: { ...DEFAULT_TEXT_STYLE, size: 70 } });
  assert.equal(s.layers.background.value, '#101010');
  assert.equal(s.textStyle.size, 70);
});

test('setTextStyle aplica um patch do estilo sem mexer no slide ao vivo', () => {
  const live = reduce(initialState(), { type: 'showSlide', slide });
  const s = reduce(live, { type: 'setTextStyle', style: { uppercase: true, color: '#ffee00' } });
  assert.equal(s.textStyle.uppercase, true);
  assert.equal(s.textStyle.color, '#ffee00');
  assert.deepEqual(s.layers.content.slide, slide);
});

test('isValidAction valida o patch de setTextStyle', () => {
  assert.equal(isValidAction({ type: 'setTextStyle', style: { size: 110 } }), true);
  assert.equal(isValidAction({ type: 'setTextStyle', style: { color: 'url(x)' } }), false);
  assert.equal(isValidAction({ type: 'setTextStyle' }), false);
});

test('setBackground recusa caminhos UNC disfarçados de URL local (vazam NTLM)', () => {
  const ok = (value) => isValidAction({ type: 'setBackground', background: { kind: 'image', value } });
  assert.equal(ok('file:////atacante/share/a.png'), false);
  assert.equal(ok('file:///%5C%5Catacante/share/a.png'), false);
  assert.equal(ok('file:///%2F%2Fatacante/share/a.png'), false);
  assert.equal(ok('file:///C:/Users/x/a%20b.png'), true);
});

test('toggleLayer oculta e mostra fundo, letra e aviso sem perder o conteúdo', () => {
  let s = reduce(initialState(), { type: 'showSlide', slide });
  s = reduce(s, { type: 'setAnnouncement', text: 'Culto às 19h' });
  for (const layer of ['background', 'content', 'announcement']) {
    const hidden = reduce(s, { type: 'toggleLayer', layer });
    assert.equal(hidden.layers[layer].hidden, true, layer);
    assert.equal(reduce(hidden, { type: 'toggleLayer', layer }).layers[layer].hidden, false, layer);
  }
  const noLyrics = reduce(s, { type: 'toggleLayer', layer: 'content' });
  assert.deepEqual(noLyrics.layers.content.slide, slide, 'a letra continua lá para voltar');
  assert.equal(noLyrics.layers.announcement.text, 'Culto às 19h');
});

test('enviar um slide novo volta a mostrar a letra; trocar o fundo mantém a ocultação e o escurecimento', () => {
  let s = reduce(initialState(), { type: 'toggleLayer', layer: 'content' });
  s = reduce(s, { type: 'showSlide', slide });
  assert.equal(s.layers.content.hidden, false);
  s = reduce(s, { type: 'toggleLayer', layer: 'background' });
  s = reduce(s, { type: 'setBackgroundDim', value: 40 });
  s = reduce(s, { type: 'setBackground', background: { kind: 'color', value: '#123456' } });
  assert.equal(s.layers.background.hidden, true);
  assert.equal(s.layers.background.dim, 40);
  assert.equal(s.layers.background.value, '#123456');
});

test('isValidAction valida toggleLayer e setBackgroundDim', () => {
  assert.equal(isValidAction({ type: 'toggleLayer', layer: 'content' }), true);
  assert.equal(isValidAction({ type: 'toggleLayer', layer: 'cover' }), false);
  assert.equal(isValidAction({ type: 'toggleLayer', layer: '__proto__' }), false);
  assert.equal(isValidAction({ type: 'setBackgroundDim', value: 0 }), true);
  assert.equal(isValidAction({ type: 'setBackgroundDim', value: 80 }), true);
  assert.equal(isValidAction({ type: 'setBackgroundDim', value: 90 }), false);
  assert.equal(isValidAction({ type: 'setBackgroundDim', value: 15 }), false);
  assert.equal(isValidAction({ type: 'setBackgroundDim', value: '40' }), false);
});

test('setBackground aceita vídeo local', () => {
  assert.equal(isValidAction({ type: 'setBackground', background: { kind: 'video', value: 'file:///C:/videos/loop.mp4' } }), true);
});

test('isValidAction valida next e setStageMessage', () => {
  assert.equal(isValidAction({ type: 'showSlide', slide, next: { text: 'ok' } }), true);
  assert.equal(isValidAction({ type: 'showSlide', slide, next: { text: 5 } }), false);
  assert.equal(isValidAction({ type: 'setStageMessage', text: 'oi' }), true);
  assert.equal(isValidAction({ type: 'setStageMessage' }), false);
});

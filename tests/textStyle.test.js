const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_TEXT_STYLE, FONTS, isValidStylePatch, mergeStyle, normalizeStyle } = require('../src/core/textStyle');

test('estilo padrão é válido como patch e tem todos os campos', () => {
  assert.equal(isValidStylePatch(DEFAULT_TEXT_STYLE), true);
  assert.deepEqual(Object.keys(DEFAULT_TEXT_STYLE).sort(),
    ['align', 'blur', 'box', 'caption', 'captionPosition', 'color', 'font', 'outline', 'position', 'shadow', 'showLabel', 'size', 'transition', 'transitionMs', 'uppercase']);
});

test('transição: corte ou fade, duração de 100 a 2000 ms em passos de 100', () => {
  assert.equal(isValidStylePatch({ transition: 'cut' }), true);
  assert.equal(isValidStylePatch({ transition: 'fade', transitionMs: 800 }), true);
  for (const bad of [{ transition: 'wipe' }, { transitionMs: 50 }, { transitionMs: 2100 }, { transitionMs: 450 }, { transitionMs: '400' }]) {
    assert.equal(isValidStylePatch(bad), false, JSON.stringify(bad));
  }
});

test('legenda: texto curto sem controle, posição num dos cantos', () => {
  assert.equal(isValidStylePatch({ caption: '{titulo} · {hora}' }), true);
  assert.equal(isValidStylePatch({ caption: '' }), true);
  assert.equal(isValidStylePatch({ captionPosition: 'top-right' }), true);
  for (const bad of [{ caption: 'x'.repeat(81) }, { caption: 'a\nb' }, { caption: 'a‮b' }, { caption: 5 }, { captionPosition: 'middle' }]) {
    assert.equal(isValidStylePatch(bad), false, JSON.stringify(bad));
  }
});

test('FONTS lista só chaves, e a fonte padrão está entre elas', () => {
  assert.ok(FONTS.includes(DEFAULT_TEXT_STYLE.font));
  FONTS.forEach((f) => assert.match(f, /^[a-z]+$/));
});

test('isValidStylePatch aceita patch parcial com campos válidos', () => {
  assert.equal(isValidStylePatch({ color: '#ffcc00' }), true);
  assert.equal(isValidStylePatch({ size: 120, uppercase: true }), true);
  assert.equal(isValidStylePatch({ align: 'left', position: 'bottom' }), true);
});

test('isValidStylePatch rejeita vazio, chave desconhecida e valores fora da lista', () => {
  const bad = [
    null, undefined, 'x', [], {},
    { cor: '#fff' },
    { color: 'red' },
    { color: '#fff; background:url(x)' },
    { font: 'Comic Sans' },
    { font: 'sans;}' },
    { size: 49 }, { size: 151 }, { size: 105 }, { size: '100' },
    { align: 'justify' }, { position: 'center' },
    { uppercase: 'sim' }, { shadow: 1 }, { showLabel: null },
    { __proto__: { color: '#fff' } },
  ];
  bad.forEach((patch) => assert.equal(isValidStylePatch(patch), false, JSON.stringify(patch)));
});

test('mergeStyle aplica o patch sem mutar o original', () => {
  const before = { ...DEFAULT_TEXT_STYLE };
  const after = mergeStyle(before, { color: '#00ff00', size: 80 });
  assert.equal(after.color, '#00ff00');
  assert.equal(after.size, 80);
  assert.deepEqual(before, DEFAULT_TEXT_STYLE);
});

test('normalizeStyle mantém só campos válidos e completa com o padrão (dados do disco)', () => {
  const s = normalizeStyle({ color: '#123456', font: 'hackerfont', size: 999, extra: 'x' });
  assert.equal(s.color, '#123456');
  assert.equal(s.font, DEFAULT_TEXT_STYLE.font);
  assert.equal(s.size, DEFAULT_TEXT_STYLE.size);
  assert.equal('extra' in s, false);
  assert.deepEqual(normalizeStyle('lixo'), DEFAULT_TEXT_STYLE);
  assert.deepEqual(normalizeStyle(null), DEFAULT_TEXT_STYLE);
});

test('estilo: contorno, caixa atrás do texto e desfoque do fundo (valores fechados)', () => {
  const ok = (patch) => isValidStylePatch(patch);
  assert.equal(ok({ outline: 'none' }), true);
  assert.equal(ok({ outline: 'thin' }), true);
  assert.equal(ok({ outline: 'thick' }), true);
  assert.equal(ok({ outline: 'red' }), false);
  assert.equal(ok({ outline: '2px solid red' }), false);
  assert.equal(ok({ box: 0 }), true);
  assert.equal(ok({ box: 60 }), true);
  assert.equal(ok({ box: 80 }), true);
  assert.equal(ok({ box: 90 }), false);
  assert.equal(ok({ box: 15 }), false);
  assert.equal(ok({ box: '40' }), false);
  assert.equal(ok({ blur: 0 }), true);
  assert.equal(ok({ blur: 20 }), true);
  assert.equal(ok({ blur: 25 }), false);
  assert.equal(ok({ blur: 7 }), false);
});

test('estilo antigo (sem os campos novos) ganha o padrão: sem contorno, sem caixa, sem desfoque', () => {
  const old = normalizeStyle({ font: 'serif', color: '#112233' });
  assert.equal(old.outline, 'none');
  assert.equal(old.box, 0);
  assert.equal(old.blur, 0);
  assert.equal(old.font, 'serif');
  assert.equal(normalizeStyle({ outline: 'x', box: 5, blur: 'muito' }).outline, 'none');
});

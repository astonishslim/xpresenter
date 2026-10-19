const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_TEXT_STYLE, FONTS, isValidStylePatch, mergeStyle, normalizeStyle } = require('../src/core/textStyle');

test('estilo padrão é válido como patch e tem todos os campos', () => {
  assert.equal(isValidStylePatch(DEFAULT_TEXT_STYLE), true);
  assert.deepEqual(Object.keys(DEFAULT_TEXT_STYLE).sort(),
    ['align', 'color', 'font', 'position', 'shadow', 'showLabel', 'size', 'uppercase']);
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

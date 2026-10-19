const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/renderer/shared/layoutPresets');
const M = require('../src/renderer/shared/layoutModel');

test('há 4 presets prontos com ids e nomes únicos', () => {
  assert.deepEqual(P.BUILTIN.map((b) => b.id), ['padrao', 'culto', 'ensaio', 'midia']);
  assert.equal(new Set(P.BUILTIN.map((b) => b.name)).size, 4);
});

for (const preset of P.BUILTIN) {
  test(`preset "${preset.name}" é um layout válido e completo`, () => {
    const { order, spans, sections } = preset.layout;
    assert.equal(M.isValidOrder(order, P.TILE_IDS), true);
    assert.deepEqual(M.resolveSections(sections, P.DEFAULT_LAYOUT.sections), sections);
    for (const id of P.TILE_IDS) {
      assert.ok(spans[id].c >= 2 && spans[id].c <= 12, `${id} colunas`);
      assert.ok(spans[id].r >= 2 && spans[id].r <= 12, `${id} linhas`);
    }
  });

  test(`preset "${preset.name}" cabe na grade 12x12 sem estourar linhas`, () => {
    const packed = P.packDense(preset.layout.order, preset.layout.spans);
    assert.ok(packed.rows <= 12, `usou ${packed.rows} linhas`);
  });

  test(`preset "${preset.name}" aproveita a grade inteira (sem buracos)`, () => {
    const packed = P.packDense(preset.layout.order, preset.layout.spans);
    assert.equal(packed.filled, 144, `ocupou ${packed.filled} de 144 células`);
  });
}

test('packDense posiciona em fluxo denso e detecta estouro', () => {
  const p = P.packDense(['a', 'b'], { a: { c: 12, r: 8 }, b: { c: 12, r: 8 } });
  assert.equal(p.rows, 16);
  assert.deepEqual(p.positions.b, { x: 1, y: 9 });
  const dense = P.packDense(['a', 'b', 'c'], { a: { c: 8, r: 2 }, b: { c: 8, r: 2 }, c: { c: 4, r: 2 } });
  assert.deepEqual(dense.positions.c, { x: 9, y: 1 }); // preenche o buraco ao lado de "a"
});

test('sameLayout compara por conteúdo, ignorando referências', () => {
  const a = JSON.parse(JSON.stringify(P.DEFAULT_LAYOUT));
  assert.equal(P.sameLayout(a, P.DEFAULT_LAYOUT), true);
  a.spans.library.c = 4;
  assert.equal(P.sameLayout(a, P.DEFAULT_LAYOUT), false);
  assert.equal(P.sameLayout(P.BUILTIN[1].layout, P.DEFAULT_LAYOUT), false);
});

test('normalizeLayout corrige partes inválidas com o padrão', () => {
  const n = P.normalizeLayout({ order: ['x'], spans: { library: { c: 'a', r: 99 } }, sections: 'lixo' });
  assert.equal(M.isValidOrder(n.order, P.TILE_IDS), true);
  assert.deepEqual(n.sections, P.DEFAULT_LAYOUT.sections);
  assert.equal(n.spans.library.r, 12);
  assert.deepEqual(P.normalizeLayout(null), P.DEFAULT_LAYOUT);
});

test('validatePresetName recusa vazio, longo e nomes dos presets prontos', () => {
  assert.deepEqual(P.validatePresetName('  Meu layout '), { ok: true, name: 'Meu layout' });
  assert.equal(P.validatePresetName('   ').ok, false);
  assert.equal(P.validatePresetName('x'.repeat(41)).ok, false);
  assert.equal(P.validatePresetName('culto').ok, false);
  assert.equal(P.validatePresetName('PADRÃO').ok, false);
});

test('sanitizeSaved descarta entradas inválidas, duplicadas e excesso', () => {
  const good = { name: 'A', layout: P.BUILTIN[1].layout };
  const raw = [good, { name: 'a', layout: P.BUILTIN[2].layout }, { name: '', layout: {} }, { name: 'Culto', layout: {} }, null, 'x', { name: 'B' }];
  const out = P.sanitizeSaved(raw);
  assert.deepEqual(out.map((p) => p.name), ['A']);
  assert.equal(P.sanitizeSaved('lixo').length, 0);
  const many = Array.from({ length: 30 }, (_, i) => ({ name: `L${i}`, layout: P.DEFAULT_LAYOUT }));
  assert.equal(P.sanitizeSaved(many).length, P.MAX_SAVED);
});

test('sanitizeSaved normaliza o layout de cada preset salvo', () => {
  const out = P.sanitizeSaved([{ name: 'Quebrado', layout: { order: ['x'] } }]);
  assert.equal(M.isValidOrder(out[0].layout.order, P.TILE_IDS), true);
});

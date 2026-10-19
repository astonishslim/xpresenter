const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/renderer/shared/layoutModel');

const IDS = ['a', 'b', 'c'];

test('isValidOrder aceita só permutações exatas dos ids', () => {
  assert.equal(m.isValidOrder(['c', 'a', 'b'], IDS), true);
  assert.equal(m.isValidOrder(['a', 'b'], IDS), false);
  assert.equal(m.isValidOrder(['a', 'a', 'b'], IDS), false);
  assert.equal(m.isValidOrder(['a', 'b', 'x'], IDS), false);
  assert.equal(m.isValidOrder(null, IDS), false);
});

test('resolveOrder usa a ordem salva se válida, senão a padrão', () => {
  assert.deepEqual(m.resolveOrder(['c', 'b', 'a'], IDS), ['c', 'b', 'a']);
  assert.deepEqual(m.resolveOrder(['x'], IDS), IDS);
  assert.deepEqual(m.resolveOrder(undefined, IDS), IDS);
});

test('moveTo põe o bloco na posição do alvo, sem mutar a lista', () => {
  const order = ['a', 'b', 'c'];
  assert.deepEqual(m.moveTo(order, 'a', 'c'), ['b', 'c', 'a']);
  assert.deepEqual(m.moveTo(order, 'c', 'a'), ['c', 'a', 'b']);
  assert.deepEqual(order, ['a', 'b', 'c']);
});

test('moveTo com o mesmo id ou id desconhecido devolve a ordem igual', () => {
  assert.deepEqual(m.moveTo(['a', 'b'], 'a', 'a'), ['a', 'b']);
  assert.deepEqual(m.moveTo(['a', 'b'], 'a', 'z'), ['a', 'b']);
});

test('move desloca um passo e para nos limites', () => {
  assert.deepEqual(m.move(['a', 'b', 'c'], 'b', 1), ['a', 'c', 'b']);
  assert.deepEqual(m.move(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c']);
  assert.deepEqual(m.move(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c']);
});

test('clampSpan limita e arredonda', () => {
  assert.equal(m.clampSpan(0), 2);
  assert.equal(m.clampSpan(99), 12);
  assert.equal(m.clampSpan(4.6), 5);
  assert.equal(m.clampSpan(NaN), 2);
});

test('spanFromPixels converte pixels em número de células da grade', () => {
  // célula 100px, vão 10px: 1 célula = 100, 2 = 210, 3 = 320
  assert.equal(m.spanFromPixels(100, 100, 10, 1, 12), 1);
  assert.equal(m.spanFromPixels(215, 100, 10, 1, 12), 2);
  assert.equal(m.spanFromPixels(330, 100, 10, 1, 12), 3);
  assert.equal(m.spanFromPixels(5000, 100, 10, 1, 12), 12);
});

test('resolveSpans mescla o salvo com o padrão e normaliza valores inválidos', () => {
  const defaults = { a: { c: 3, r: 4 }, b: { c: 5, r: 2 } };
  assert.deepEqual(m.resolveSpans({ a: { c: 6, r: 8 } }, defaults), { a: { c: 6, r: 8 }, b: { c: 5, r: 2 } });
  assert.deepEqual(m.resolveSpans({ a: { c: 'x', r: 99 }, z: { c: 1, r: 1 } }, defaults), { a: { c: 3, r: 4 }, b: { c: 5, r: 2 } });
  assert.deepEqual(m.resolveSpans(null, defaults), defaults);
});

const DEF = { t1: ['s1', 's2'], t2: ['s3'], t3: [] };

test('resolveSections aceita o salvo só com exatamente as mesmas seções e blocos', () => {
  assert.deepEqual(m.resolveSections({ t1: ['s2'], t2: ['s3', 's1'], t3: [] }, DEF), { t1: ['s2'], t2: ['s3', 's1'], t3: [] });
  assert.deepEqual(m.resolveSections({ t1: ['s1'], t2: ['s3'], t3: [] }, DEF), DEF); // falta s2
  assert.deepEqual(m.resolveSections({ t1: ['s1', 's1', 's2'], t2: ['s3'], t3: [] }, DEF), DEF); // duplicada
  assert.deepEqual(m.resolveSections({ t1: ['s1', 's2'], t2: ['s3'] }, DEF), DEF); // falta bloco
  assert.deepEqual(m.resolveSections('lixo', DEF), DEF);
});

test('moveSection move entre blocos antes/depois de uma referência ou ao fim', () => {
  assert.deepEqual(m.moveSection(DEF, 's1', 't2', 's3', false), { t1: ['s2'], t2: ['s1', 's3'], t3: [] });
  assert.deepEqual(m.moveSection(DEF, 's1', 't2', 's3', true), { t1: ['s2'], t2: ['s3', 's1'], t3: [] });
  assert.deepEqual(m.moveSection(DEF, 's2', 't3', null, false), { t1: ['s1'], t2: ['s3'], t3: ['s2'] });
});

test('moveSection reordena dentro do mesmo bloco e não muta o original', () => {
  assert.deepEqual(m.moveSection(DEF, 's2', 't1', 's1', false), { t1: ['s2', 's1'], t2: ['s3'], t3: [] });
  assert.deepEqual(DEF, { t1: ['s1', 's2'], t2: ['s3'], t3: [] });
});

test('moveSection ignora seção ou bloco inexistente', () => {
  assert.deepEqual(m.moveSection(DEF, 'zz', 't2', null, false), DEF);
  assert.deepEqual(m.moveSection(DEF, 's1', 'zz', null, false), DEF);
});

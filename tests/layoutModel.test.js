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

test('resolveSections migra layout salvo: seção nova entra no bloco padrão; seção extinta sai', () => {
  // s2 é "nova" (não existia quando o layout foi salvo): vai para t1, onde fica por padrão, sem desfazer o resto
  assert.deepEqual(m.resolveSections({ t1: [], t2: ['s3', 's1'], t3: [] }, DEF), { t1: ['s2'], t2: ['s3', 's1'], t3: [] });
  // "velha" não existe mais: é descartada
  assert.deepEqual(m.resolveSections({ t1: ['velha', 's2'], t2: ['s3', 's1'], t3: [] }, DEF), { t1: ['s2'], t2: ['s3', 's1'], t3: [] });
});

test('resolveSections aceita o salvo válido e recusa estrutura quebrada', () => {
  assert.deepEqual(m.resolveSections({ t1: ['s2'], t2: ['s3', 's1'], t3: [] }, DEF), { t1: ['s2'], t2: ['s3', 's1'], t3: [] });
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

test('snapToFull: perto do tamanho máximo, encaixa no tamanho cheio', () => {
  assert.equal(m.snapToFull(12), 12);
  assert.equal(m.snapToFull(11), 12);
  assert.equal(m.snapToFull(10), 10);
  assert.equal(m.snapToFull(2), 2);
});

test('toggleFull: vai ao tamanho cheio no eixo e guarda o anterior; de novo, volta', () => {
  const full = m.toggleFull({ c: 4, r: 5 }, 'c', undefined);
  assert.deepEqual(full.size, { c: 12, r: 5 });
  assert.equal(full.before, 4);
  const back = m.toggleFull(full.size, 'c', full.before);
  assert.deepEqual(back.size, { c: 4, r: 5 });
  assert.equal(back.before, undefined);
});

test('toggleFull: no eixo vertical só muda a altura; sem anterior guardado volta à metade', () => {
  const full = m.toggleFull({ c: 3, r: 4 }, 'r', undefined);
  assert.deepEqual(full.size, { c: 3, r: 12 });
  const half = m.toggleFull({ c: 12, r: 12 }, 'c', undefined);
  assert.deepEqual(half.size, { c: 6, r: 12 });
});

test('toggleFull: anterior inválido (cheio ou fora da faixa) não é usado; eixo desconhecido não muda nada', () => {
  assert.deepEqual(m.toggleFull({ c: 12, r: 3 }, 'c', 12).size, { c: 6, r: 3 });
  assert.deepEqual(m.toggleFull({ c: 12, r: 3 }, 'c', 'x').size, { c: 6, r: 3 });
  assert.deepEqual(m.toggleFull({ c: 4, r: 3 }, 'z', undefined).size, { c: 4, r: 3 });
});

test('resizeAxis: muda só o eixo pedido; o canto muda os dois', () => {
  assert.deepEqual(m.resizeAxis({ c: 4, r: 5 }, 'c', 8), { c: 8, r: 5 });
  assert.deepEqual(m.resizeAxis({ c: 4, r: 5 }, 'r', 3), { c: 4, r: 3 });
  assert.deepEqual(m.resizeAxis({ c: 4, r: 5 }, 'both', 7, 9), { c: 7, r: 9 });
  assert.deepEqual(m.resizeAxis({ c: 4, r: 5 }, 'c', 99), { c: 12, r: 5 });
});

test('dropSide: em que lado do alvo o bloco arrastado vai parar (o que moveTo faz)', () => {
  const order = ['a', 'b', 'c', 'd'];
  assert.equal(m.dropSide(order, 'a', 'c'), 'after');
  assert.equal(m.dropSide(order, 'd', 'b'), 'before');
  assert.equal(m.dropSide(order, 'b', 'b'), null);
  assert.equal(m.dropSide(order, 'x', 'b'), null);
  assert.equal(m.dropSide(order, 'a', 'z'), null);
});

test('dropSide combina com moveTo: "before" fica antes do alvo, "after" depois', () => {
  const order = ['a', 'b', 'c', 'd'];
  [['a', 'c'], ['d', 'b'], ['b', 'a'], ['c', 'd']].forEach(([id, target]) => {
    const next = m.moveTo(order, id, target);
    const side = m.dropSide(order, id, target);
    const gap = next.indexOf(id) - next.indexOf(target);
    assert.equal(gap, side === 'after' ? 1 : -1);
  });
});

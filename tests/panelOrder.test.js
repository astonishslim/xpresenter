const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidOrder, swap, move, resolveOrder } = require('../src/renderer/shared/panelOrder');

const IDS = ['library', 'slides', 'right'];

test('isValidOrder aceita só permutações exatas dos ids', () => {
  assert.equal(isValidOrder(['right', 'library', 'slides'], IDS), true);
  assert.equal(isValidOrder(['library', 'slides'], IDS), false);
  assert.equal(isValidOrder(['library', 'library', 'right'], IDS), false);
  assert.equal(isValidOrder(['library', 'slides', 'x'], IDS), false);
  assert.equal(isValidOrder('library', IDS), false);
  assert.equal(isValidOrder(null, IDS), false);
});

test('swap troca duas posições sem alterar a lista original', () => {
  const order = ['library', 'slides', 'right'];
  assert.deepEqual(swap(order, 'library', 'right'), ['right', 'slides', 'library']);
  assert.deepEqual(order, ['library', 'slides', 'right']);
});

test('swap com o mesmo id ou id inexistente devolve a ordem igual', () => {
  const order = ['library', 'slides', 'right'];
  assert.deepEqual(swap(order, 'slides', 'slides'), order);
  assert.deepEqual(swap(order, 'slides', 'nada'), order);
});

test('move desloca um painel para a esquerda ou direita e para nos limites', () => {
  const order = ['library', 'slides', 'right'];
  assert.deepEqual(move(order, 'slides', 1), ['library', 'right', 'slides']);
  assert.deepEqual(move(order, 'slides', -1), ['slides', 'library', 'right']);
  assert.deepEqual(move(order, 'library', -1), order);
  assert.deepEqual(move(order, 'right', 1), order);
});

test('resolveOrder usa a ordem salva se válida, senão a padrão', () => {
  assert.deepEqual(resolveOrder(['right', 'slides', 'library'], IDS), ['right', 'slides', 'library']);
  assert.deepEqual(resolveOrder(['lixo'], IDS), IDS);
  assert.deepEqual(resolveOrder(undefined, IDS), IDS);
});

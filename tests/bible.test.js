const test = require('node:test');
const assert = require('node:assert/strict');
const { parseReference, lookup, normalize } = require('../src/core/bible');

const bible = {
  name: 'Teste',
  books: [
    { name: 'Salmos', abbrev: 'sl', chapters: [['v1', 'v2', 'v3']] },
    { name: 'João', abbrev: 'jo', chapters: [['a'], ['b'], ['c1', 'c2', 'c3', 'c4']] },
  ],
};

test('normalize remove acentos e caixa', () => {
  assert.equal(normalize('  João '), 'joao');
});

test('parseReference lê livro, capítulo e verso', () => {
  assert.deepEqual(parseReference('Jo 3:2'), { book: 'jo', chapter: 3, from: 2, to: 2 });
});

test('parseReference lê intervalo e livro com acento', () => {
  assert.deepEqual(parseReference('João 3:2-4'), { book: 'joao', chapter: 3, from: 2, to: 4 });
});

test('parseReference sem verso devolve o capítulo todo', () => {
  assert.deepEqual(parseReference('Salmos 1'), { book: 'salmos', chapter: 1, from: 1, to: Infinity });
});

test('parseReference aceita livro numerado', () => {
  assert.equal(parseReference('1 Co 13:4').book, '1co');
});

test('parseReference devolve null para entrada inválida', () => {
  assert.equal(parseReference('abc'), null);
  assert.equal(parseReference(''), null);
});

test('lookup devolve os versículos pedidos, por nome ou abreviação', () => {
  const r = lookup(bible, 'João 3:2-3');
  assert.equal(r.reference, 'João 3:2-3');
  assert.deepEqual(r.verses.map((v) => v.text), ['c2', 'c3']);
  assert.equal(lookup(bible, 'jo 3:1').verses[0].text, 'c1');
});

test('lookup limita o intervalo ao tamanho do capítulo', () => {
  assert.equal(lookup(bible, 'Sl 1:2-99').verses.length, 2);
});

test('lookup devolve null para livro ou capítulo inexistente', () => {
  assert.equal(lookup(bible, 'Apocalipse 1:1'), null);
  assert.equal(lookup(bible, 'João 9:1'), null);
});

test('lookup rejeita verso 0', () => {
  assert.equal(lookup(bible, 'João 3:0'), null);
});

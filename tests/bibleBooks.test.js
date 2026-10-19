const test = require('node:test');
const assert = require('node:assert/strict');
const { BOOKS, resolveBook, bookById } = require('../src/core/bibleBooks');

test('são 66 livros, ids 1..66 em ordem, com nome e sigla', () => {
  assert.equal(BOOKS.length, 66);
  BOOKS.forEach((b, i) => {
    assert.equal(b.id, i + 1);
    assert.ok(b.name && b.abbrev, `livro ${i + 1}`);
  });
  assert.equal(bookById(1).name, 'Gênesis');
  assert.equal(bookById(43).name, 'João');
  assert.equal(bookById(66).name, 'Apocalipse');
  assert.equal(bookById(99), null);
});

test('resolveBook reconhece nome, sigla e variações, sem diferenciar acento ou caixa', () => {
  assert.equal(resolveBook('Gênesis'), 1);
  assert.equal(resolveBook('genesis'), 1);
  assert.equal(resolveBook('GN'), 1);
  assert.equal(resolveBook('salmos'), 19);
  assert.equal(resolveBook('Salmo'), 19);
  assert.equal(resolveBook('sl'), 19);
  assert.equal(resolveBook('Apoc'), 66);
  assert.equal(resolveBook('Atos'), 44);
});

test('Jó e João não se confundem: acento decide, e sem acento "Jo" é João', () => {
  assert.equal(resolveBook('Jó'), 18);
  assert.equal(resolveBook('jó'), 18);
  assert.equal(resolveBook('Jo'), 43);
  assert.equal(resolveBook('João'), 43);
  assert.equal(resolveBook('joao'), 43);
  assert.equal(resolveBook('Job'), 18);
});

test('livros numerados aceitam espaço, ponto e a forma por extenso', () => {
  assert.equal(resolveBook('1 Co'), 46);
  assert.equal(resolveBook('1Co'), 46);
  assert.equal(resolveBook('1. Coríntios'), 46);
  assert.equal(resolveBook('2 Timóteo'), 55);
  assert.equal(resolveBook('1 João'), 62);
  assert.equal(resolveBook('3Jo'), 64);
  assert.equal(resolveBook('1 Sm'), 9);
  assert.equal(resolveBook('2 Reis'), 12);
});

test('prefixo único de pelo menos 3 letras resolve; ambíguo ou curto demais não', () => {
  assert.equal(resolveBook('levit'), 3);
  assert.equal(resolveBook('apocal'), 66);
  assert.equal(resolveBook('ma'), null); // curto demais (Mateus, Marcos, Malaquias...)
  assert.equal(resolveBook('mar'), 41);
  assert.equal(resolveBook('zzz'), null);
  assert.equal(resolveBook(''), null);
  assert.equal(resolveBook(undefined), null);
});

test('siglas dos 66 livros são únicas e cada uma resolve para o próprio livro', () => {
  const seen = new Set();
  for (const b of BOOKS) {
    assert.ok(!seen.has(b.abbrev.toLowerCase()), `sigla repetida ${b.abbrev}`);
    seen.add(b.abbrev.toLowerCase());
    assert.equal(resolveBook(b.abbrev), b.id, b.abbrev);
    assert.equal(resolveBook(b.name), b.id, b.name);
  }
});

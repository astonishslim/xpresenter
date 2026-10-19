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

// ---------- Versões com id canônico e busca por palavras ----------
const { searchText, splitReference } = require('../src/core/bible');

const withIds = {
  name: 'Com ids',
  code: 'CI',
  books: [
    { id: 18, name: 'Jó', abbrev: 'Jó', chapters: [['Havia um homem na terra de Uz.']] },
    { id: 19, name: 'Salmos', abbrev: 'Sl', chapters: [['O Senhor é o meu pastor, nada me faltará.', 'Deitar-me faz em verdes pastos.', '']] },
    { id: 43, name: 'João', abbrev: 'Jo', chapters: [['No princípio era o Verbo.'], ['As bodas de Caná.'], ['Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito.', 'Deus enviou o seu Filho ao mundo.']] },
  ],
};

test('lookup acha o livro pelo id canônico, mesmo com nome/sigla diferentes', () => {
  assert.equal(lookup(withIds, 'Jo 3:16'), null); // só há 2 versos no cap. 3 do exemplo
  assert.equal(lookup(withIds, 'João 3:1').reference, 'João 3:1');
  assert.equal(lookup(withIds, 'Salmo 23:1'), null); // capítulo 23 não existe no exemplo
  assert.equal(lookup(withIds, 'sl 1:1').reference, 'Salmos 1:1');
});

test('Jó e João são livros diferentes na busca por referência', () => {
  assert.equal(lookup(withIds, 'Jó 1:1').reference, 'Jó 1:1');
  assert.equal(lookup(withIds, 'Jo 1:1').reference, 'João 1:1');
});

test('lookup ignora versos vazios (versículos omitidos em algumas versões)', () => {
  const r = lookup(withIds, 'Sl 1:1-3');
  assert.deepEqual(r.verses.map((v) => v.number), [1, 2]);
});

test('lookup guarda o código da versão no resultado', () => {
  assert.equal(lookup(withIds, 'sl 1:1').code, 'CI');
});

test('splitReference preserva o acento do livro para distinguir Jó de João', () => {
  assert.equal(splitReference('Jó 3:2').bookText, 'jó');
  assert.equal(splitReference('1 Co 13:4-7').bookText, '1co');
  assert.equal(splitReference('lixo'), null);
});

test('searchText acha por palavras, sem acento e sem diferenciar caixa', () => {
  const r = searchText(withIds, 'SENHOR pastor');
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].reference, 'Salmos 1:1');
  assert.equal(searchText(withIds, 'principio').results[0].reference, 'João 1:1');
});

test('searchText exige todas as palavras e casa por início de palavra', () => {
  assert.equal(searchText(withIds, 'deus filho').results.length, 2); // 3:1 e 3:2
  assert.equal(searchText(withIds, 'deus zebra').results.length, 0);
  assert.equal(searchText(withIds, 'past').results.length, 2); // pastor e pastos
  assert.equal(searchText(withIds, 'astor').results.length, 0); // meio de palavra não conta
});

test('searchText aceita frase entre aspas', () => {
  assert.equal(searchText(withIds, '"amou o mundo"').results.length, 1);
  assert.equal(searchText(withIds, '"mundo amou"').results.length, 0);
});

test('searchText respeita o limite e avisa quando há mais resultados', () => {
  const big = { name: 'B', books: [{ id: 1, name: 'Gênesis', abbrev: 'Gn', chapters: [Array.from({ length: 80 }, () => 'palavra comum')] }] };
  const r = searchText(big, 'palavra', { limit: 50 });
  assert.equal(r.results.length, 50);
  assert.equal(r.truncated, true);
  assert.equal(searchText(big, 'palavra', { limit: 100 }).truncated, false);
});

test('searchText devolve vazio para consulta vazia ou só de símbolos', () => {
  assert.deepEqual(searchText(withIds, '   ').results, []);
  assert.deepEqual(searchText(withIds, '!!! ???').results, []);
});

test('searchText devolve referência, texto, livro, capítulo e verso', () => {
  const [hit] = searchText(withIds, 'bodas').results;
  assert.deepEqual({ ...hit }, { bookId: 43, bookName: 'João', chapter: 2, verse: 1, reference: 'João 2:1', text: 'As bodas de Caná.' });
});

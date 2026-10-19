const test = require('node:test');
const assert = require('node:assert/strict');
const { searchSongs } = require('../src/core/songSearch');

const songs = [
  { id: 'a', title: 'Grandes Coisas', text: '[Verso 1]\nTu és o Deus dessa terra\nTu és o rei desse povo\n\n[Refrão]\nGrandes coisas estão por vir' },
  { id: 'b', title: 'Porque Ele Vive', text: '[Verso]\n[G]Deus enviou seu [D]filho amado\nPara perdoar, pra me salvar' },
  { id: 'c', title: 'Coração Igual ao Teu', text: 'Se tu olhares, Senhor, pra dentro de mim\nNada encontrarás de bom' },
];

test('busca vazia devolve todas as músicas pelo título, sem trecho', () => {
  const r = searchSongs(songs, '   ');
  assert.deepEqual(r.map((x) => x.id), ['a', 'b', 'c']);
  assert.equal(r[0].snippet, null);
});

test('encontra pelo título ignorando acentos e maiúsculas', () => {
  const r = searchSongs(songs, 'coracao igual');
  assert.deepEqual(r.map((x) => x.id), ['c']);
  assert.equal(r[0].inTitle, true);
});

test('encontra por trecho da letra e devolve a linha como trecho', () => {
  const r = searchSongs(songs, 'enviou seu filho');
  assert.deepEqual(r.map((x) => x.id), ['b']);
  assert.equal(r[0].inTitle, false);
  assert.equal(r[0].snippet, 'Deus enviou seu filho amado', 'sem acordes no trecho');
});

test('marcadores de seção e acordes não contam como letra', () => {
  assert.deepEqual(searchSongs(songs, 'refrão'), []);
  assert.deepEqual(searchSongs(songs, 'verso'), []);
});

test('palavras casam pelo início (perd acha perdoar; doar não)', () => {
  assert.deepEqual(searchSongs(songs, 'perd').map((x) => x.id), ['b']);
  assert.deepEqual(searchSongs(songs, 'doar'), []);
});

test('palavras podem estar em linhas diferentes; título vem antes da letra', () => {
  const r = searchSongs(songs, 'deus');
  assert.deepEqual(r.map((x) => x.id).sort(), ['a', 'b']);
  const titled = searchSongs(songs, 'coisas');
  assert.equal(titled[0].id, 'a');
  assert.equal(titled[0].inTitle, true);
});

test('frase entre aspas exige a sequência exata', () => {
  assert.deepEqual(searchSongs(songs, '"rei desse povo"').map((x) => x.id), ['a']);
  assert.deepEqual(searchSongs(songs, '"povo desse rei"'), []);
});

test('respeita o limite e tolera entradas estranhas', () => {
  assert.equal(searchSongs(songs, '', { limit: 2 }).length, 2);
  assert.deepEqual(searchSongs(null, 'x'), []);
  assert.deepEqual(searchSongs([{ id: 'z' }], 'x'), []);
  assert.deepEqual(searchSongs(songs, 'x'.repeat(500)), []);
});

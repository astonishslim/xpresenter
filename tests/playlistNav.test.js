const test = require('node:test');
const assert = require('node:assert/strict');
const { slideActionFor, themeNameFor } = require('../src/core/playlistNav');
const { isValidAction } = require('../src/core/state');

const playlist = [
  { id: 'p1', kind: 'song', refId: 's1', title: 'Grandes Coisas', slides: [{ label: 'Verso', text: 'um' }, { label: 'Refrão', text: 'dois' }] },
  { id: 'p2', kind: 'verse', title: 'João 3:16 · TB', slides: [{ label: 'João 3:16', text: 'Porque Deus amou' }] },
  { id: 'p3', kind: 'media', title: 'Vinheta', slides: [{ label: 'Vídeo', text: 'Vinheta', media: { kind: 'video', value: 'file:///C:/v.mp4', title: 'Vinheta' } }] },
];

test('slideActionFor monta showSlide com título, chave do item e próximo slide', () => {
  const a = slideActionFor(playlist, 'p1', 0);
  assert.deepEqual(a, {
    type: 'showSlide',
    slide: { label: 'Verso', text: 'um', title: 'Grandes Coisas', key: 'p1:0' },
    next: { label: 'Refrão', text: 'dois' },
  });
  assert.equal(isValidAction(a), true);
  assert.equal(slideActionFor(playlist, 'p1', 1).next, null);
});

test('slideActionFor: slide de mídia vira showMedia; item ou índice inexistente → null', () => {
  const a = slideActionFor(playlist, 'p3', 0);
  assert.deepEqual(a, { type: 'showMedia', media: { kind: 'video', value: 'file:///C:/v.mp4', title: 'Vinheta' } });
  assert.equal(isValidAction(a), true);
  assert.equal(slideActionFor(playlist, 'nada', 0), null);
  assert.equal(slideActionFor(playlist, 'p1', 5), null);
  assert.equal(slideActionFor(playlist, 'p1', -1), null);
  assert.equal(slideActionFor(playlist, 'p1', 1.5), null);
});

test('themeNameFor: versículo usa o padrão; música usa o próprio tema existente ou o padrão', () => {
  const songs = [{ id: 's1', theme: 'Natal' }, { id: 's2', theme: 'Excluído' }];
  const defaults = { song: 'Louvor', verse: 'Bíblia' };
  const names = ['Natal', 'Louvor', 'Bíblia'];
  assert.equal(themeNameFor(playlist[1], songs, defaults, names), 'Bíblia');
  assert.equal(themeNameFor(playlist[0], songs, defaults, names), 'Natal');
  assert.equal(themeNameFor({ kind: 'song', refId: 's2' }, songs, defaults, names), 'Louvor', 'tema excluído cai no padrão');
  assert.equal(themeNameFor({ kind: 'song', refId: 's9' }, songs, defaults, names), 'Louvor');
  assert.equal(themeNameFor(playlist[2], songs, defaults, names), null, 'mídia não troca tema');
  assert.equal(themeNameFor({ kind: 'song', refId: 's1' }, songs, { song: null, verse: null }, []), null);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLibrary } = require('../src/core/library');

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apres-'));
  return path.join(dir, 'library.json');
}

test('biblioteca nova começa vazia', () => {
  const lib = createLibrary(tmpFile());
  assert.deepEqual(lib.listSongs(), []);
  assert.deepEqual(lib.getPlaylist(), []);
});

test('saveSong cria com id e persiste em disco', () => {
  const file = tmpFile();
  const lib = createLibrary(file);
  const saved = lib.saveSong({ title: 'Hino', text: '[Verso]\nOlá' });
  assert.ok(saved.id);
  assert.equal(createLibrary(file).listSongs()[0].title, 'Hino');
});

test('saveSong com id existente atualiza em vez de duplicar', () => {
  const lib = createLibrary(tmpFile());
  const a = lib.saveSong({ title: 'A', text: 'x' });
  lib.saveSong({ ...a, title: 'B' });
  assert.equal(lib.listSongs().length, 1);
  assert.equal(lib.listSongs()[0].title, 'B');
});

test('saveSong guarda o tema da música (nome curto) e descarta valor inválido', () => {
  const lib = createLibrary(tmpFile());
  assert.equal(lib.saveSong({ title: 'A', text: 'x', theme: '  Louvor ' }).theme, 'Louvor');
  assert.equal('theme' in lib.saveSong({ title: 'B', text: 'x', theme: '' }), false);
  assert.equal('theme' in lib.saveSong({ title: 'C', text: 'x', theme: 'x'.repeat(41) }), false);
  assert.equal('theme' in lib.saveSong({ title: 'D', text: 'x', theme: { nome: 'x' } }), false);
});

test('saveSong rejeita título vazio', () => {
  assert.throws(() => createLibrary(tmpFile()).saveSong({ title: ' ', text: 'x' }), /título/i);
});

test('deleteSong remove a música e suas entradas da playlist', () => {
  const lib = createLibrary(tmpFile());
  const s = lib.saveSong({ title: 'A', text: 'x' });
  lib.addToPlaylist({ kind: 'song', refId: s.id, title: 'A', slides: [] });
  lib.deleteSong(s.id);
  assert.equal(lib.listSongs().length, 0);
  assert.equal(lib.getPlaylist().length, 0);
});

test('playlist adiciona, remove e reordena', () => {
  const lib = createLibrary(tmpFile());
  const a = lib.addToPlaylist({ kind: 'verse', title: 'A', slides: [] });
  const b = lib.addToPlaylist({ kind: 'verse', title: 'B', slides: [] });
  lib.movePlaylistItem(b.id, 0);
  assert.deepEqual(lib.getPlaylist().map((i) => i.title), ['B', 'A']);
  lib.removeFromPlaylist(a.id);
  assert.deepEqual(lib.getPlaylist().map((i) => i.title), ['B']);
});

test('arquivo corrompido não derruba: biblioteca vazia', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{nao e json');
  assert.deepEqual(createLibrary(file).listSongs(), []);
});

test('listSongs devolve cópias, sem expor o estado interno', () => {
  const lib = createLibrary(tmpFile());
  lib.saveSong({ title: 'A', text: 'x' });
  lib.listSongs()[0].title = 'mutado';
  assert.equal(lib.listSongs()[0].title, 'A');
});

test('refreshSongSlides atualiza título e slides dos itens do culto daquela música', () => {
  const lib = createLibrary(tmpFile());
  const s = lib.saveSong({ title: 'A', text: 'x' });
  lib.addToPlaylist({ kind: 'song', refId: s.id, title: 'A', slides: [{ text: 'velho' }] });
  lib.addToPlaylist({ kind: 'verse', title: 'João 3:16', slides: [{ text: 'v' }] });
  lib.refreshSongSlides(s.id, 'B', [{ text: 'novo' }]);
  const [song, verse] = lib.getPlaylist();
  assert.equal(song.title, 'B');
  assert.equal(song.slides[0].text, 'novo');
  assert.equal(verse.slides[0].text, 'v');
});

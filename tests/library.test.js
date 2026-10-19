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

test('saveSong guarda arranjos válidos (nome e ordem) e descarta os inválidos', () => {
  const lib = createLibrary(tmpFile());
  const saved = lib.saveSong({
    title: 'A',
    text: 'x',
    arrangements: [
      { name: ' Culto ', order: 'V1 C V2 C' },
      { name: 'Acústico', order: ['V1', 'C'] },
      { name: 'culto', order: 'C' }, // nome repetido
      { name: '', order: 'C' },
      { name: 'Vazio', order: '' },
      { name: 'x'.repeat(41), order: 'C' },
      'lixo',
    ],
  });
  assert.deepEqual(saved.arrangements, [
    { name: 'Culto', order: ['V1', 'C', 'V2', 'C'] },
    { name: 'Acústico', order: ['V1', 'C'] },
  ]);
});

test('saveSong sem arranjos (ou lista inválida) não grava o campo; limita a 12', () => {
  const lib = createLibrary(tmpFile());
  assert.equal('arrangements' in lib.saveSong({ title: 'A', text: 'x' }), false);
  assert.equal('arrangements' in lib.saveSong({ title: 'B', text: 'x', arrangements: 'V1 C' }), false);
  const many = Array.from({ length: 20 }, (_, i) => ({ name: `A${i}`, order: 'C' }));
  assert.equal(lib.saveSong({ title: 'C', text: 'x', arrangements: many }).arrangements.length, 12);
});

test('refreshSongSlides com função recalcula os slides de cada item (cada um no seu arranjo)', () => {
  const lib = createLibrary(tmpFile());
  const s = lib.saveSong({ title: 'A', text: 'x' });
  lib.addToPlaylist({ kind: 'song', refId: s.id, title: 'A', slides: [], arrangement: 'Culto' });
  lib.addToPlaylist({ kind: 'song', refId: s.id, title: 'A', slides: [] });
  lib.refreshSongSlides(s.id, 'A', (item) => [{ text: item.arrangement || 'letra' }]);
  assert.deepEqual(lib.getPlaylist().map((i) => i.slides[0].text), ['Culto', 'letra']);
});

test('setItemArrangement troca o arranjo e os slides de um item do culto', () => {
  const lib = createLibrary(tmpFile());
  const item = lib.addToPlaylist({ kind: 'song', refId: 'm', title: 'A', slides: [{ text: 'velho' }] });
  const updated = lib.setItemArrangement(item.id, 'Culto', [{ text: 'novo' }]);
  assert.equal(updated.arrangement, 'Culto');
  assert.equal(lib.getPlaylist()[0].slides[0].text, 'novo');
  const back = lib.setItemArrangement(item.id, '', [{ text: 'letra' }]);
  assert.equal('arrangement' in back, false);
  assert.equal(lib.setItemArrangement('nao-existe', 'X', []), null);
});

test('editPlaylistSlide corrige o texto de um slide de texto do culto', () => {
  const lib = createLibrary(tmpFile());
  const item = lib.addToPlaylist({ kind: 'verse', title: 'Jo 3', slides: [{ label: 'Jo 3:16', text: 'errado' }, { image: 'file:///C:/p.png' }] });
  assert.equal(lib.editPlaylistSlide(item.id, 0, 'certo').slides[0].text, 'certo');
  assert.equal(lib.getPlaylist()[0].slides[0].text, 'certo');
  assert.equal(lib.editPlaylistSlide(item.id, 1, 'x'), null); // slide de imagem
  assert.equal(lib.editPlaylistSlide(item.id, 5, 'x'), null);
  assert.equal(lib.editPlaylistSlide(item.id, 0, 42), null);
  assert.equal(lib.editPlaylistSlide(item.id, 0, '  \n '), null);
  assert.equal(lib.editPlaylistSlide(item.id, 0, 'x'.repeat(2001)), null);
  assert.equal(lib.editPlaylistSlide('nao-existe', 0, 'x'), null);
});

test('editPlaylistSlide exige índice inteiro e não edita item de música', () => {
  const lib = createLibrary(tmpFile());
  const verse = lib.addToPlaylist({ kind: 'verse', title: 'Jo', slides: [{ text: 'a' }] });
  const song = lib.addToPlaylist({ kind: 'song', refId: 'm', title: 'M', slides: [{ text: 'a' }] });
  assert.equal(lib.editPlaylistSlide(verse.id, '0', 'b'), null);
  assert.equal(lib.editPlaylistSlide(verse.id, -1, 'b'), null);
  assert.equal(lib.editPlaylistSlide(song.id, 0, 'b'), null);
});

test('refreshSongSlides tira dos itens o arranjo que não existe mais na música', () => {
  const lib = createLibrary(tmpFile());
  lib.addToPlaylist({ kind: 'song', refId: 'm', title: 'A', slides: [], arrangement: 'Velho' });
  lib.addToPlaylist({ kind: 'song', refId: 'm', title: 'A', slides: [], arrangement: 'Culto' });
  lib.refreshSongSlides('m', 'A', () => [], ['Culto']);
  assert.deepEqual(lib.getPlaylist().map((i) => i.arrangement), [undefined, 'Culto']);
});

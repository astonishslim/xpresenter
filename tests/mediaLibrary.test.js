const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createMediaLibrary, kindOf, MAX_MEDIA } = require('../src/core/mediaLibrary');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apres-midia-'));
  const make = (name) => { const p = path.join(dir, name); fs.writeFileSync(p, 'x'); return p; };
  return { file: path.join(dir, 'media.json'), make, dir };
}

test('kindOf reconhece imagem e vídeo pela extensão (sem diferenciar maiúsculas)', () => {
  assert.equal(kindOf('C:/a/foto.JPG'), 'image');
  assert.equal(kindOf('/a/b.webp'), 'image');
  assert.equal(kindOf('/a/loop.mp4'), 'video');
  assert.equal(kindOf('/a/loop.webm'), 'video');
  assert.equal(kindOf('/a/doc.pdf'), null);
  assert.equal(kindOf('/a/semextensao'), null);
});

test('addPaths guarda nome, tipo e URL file:, persiste e ignora tipo desconhecido e repetido', () => {
  const { file, make } = setup();
  const lib = createMediaLibrary(file);
  const img = make('Fundo Azul.png');
  const vid = make('loop.mp4');
  const res = lib.addPaths([img, vid, make('notas.txt'), img]);
  assert.equal(res.added.length, 2);
  assert.equal(res.skipped, 2);
  const [a, b] = createMediaLibrary(file).list();
  assert.deepEqual([a.name, a.kind, a.url], ['Fundo Azul', 'image', pathToFileURL(img).href]);
  assert.equal(b.kind, 'video');
  assert.ok(a.id && a.id !== b.id);
});

test('list marca arquivos que sumiram do disco', () => {
  const { file, make } = setup();
  const lib = createMediaLibrary(file);
  const img = make('a.png');
  lib.addPaths([img]);
  fs.rmSync(img);
  assert.equal(lib.list()[0].missing, true);
});

test('recusa caminho de rede (UNC) e respeita o limite', () => {
  const { file, make } = setup();
  const lib = createMediaLibrary(file);
  assert.equal(lib.addPaths(['\\\\servidor\\share\\a.png']).added.length, 0);
  assert.equal(lib.addPaths([42, null]).added.length, 0);
  const many = Array.from({ length: MAX_MEDIA + 3 }, (_, i) => make(`m${i}.png`));
  const res = lib.addPaths(many);
  assert.equal(lib.list().length, MAX_MEDIA);
  assert.equal(res.skipped, 3);
});

test('remove apaga do catálogo (não do disco); get encontra por id', () => {
  const { file, make } = setup();
  const lib = createMediaLibrary(file);
  const img = make('a.png');
  const [m] = lib.addPaths([img]).added;
  assert.equal(lib.get(m.id).name, 'a');
  lib.remove(m.id);
  assert.deepEqual(lib.list(), []);
  assert.equal(lib.get(m.id), null);
  assert.ok(fs.existsSync(img), 'o arquivo continua no disco');
});

test('arquivo corrompido ou com entradas inválidas não derruba', () => {
  const { file } = setup();
  fs.writeFileSync(file, '{lixo');
  assert.deepEqual(createMediaLibrary(file).list(), []);
  fs.writeFileSync(file, JSON.stringify({ items: [{ id: 'x', kind: 'image', name: 'ok', url: 'file:///C:/a.png' }, { id: 'y', kind: 'image', url: 'http://mal/x.png' }, 'lixo'] }));
  assert.deepEqual(createMediaLibrary(file).list().map((m) => m.id), ['x']);
});

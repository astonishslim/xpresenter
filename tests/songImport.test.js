const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { importFiles, MAX_FILES } = require('../src/core/songImport');
const { createLibrary } = require('../src/core/library');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'import-'));
const write = (dir, name, content) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
};
const newLibrary = (dir) => createLibrary(path.join(dir, 'library.json'));

const OPENSONG = '<song><title>Grande é o Senhor</title><author>Ana</author><ccli>123</ccli><presentation>V1 C</presentation><lyrics>[V1]\n.G\n Linha\n[C]\n Refrão</lyrics></song>';
const CHORDPRO = '{title: Outra Música}\n[C]Linha um\n';

test('importa vários arquivos de formatos diferentes e grava autor, CCLI e arranjo', () => {
  const dir = tmp();
  const lib = newLibrary(dir);
  const res = importFiles([write(dir, 'a', OPENSONG), write(dir, 'b.cho', CHORDPRO), write(dir, 'Hino Simples.txt', '[Verso 1]\nlinha')], lib);
  assert.deepEqual(res.imported, ['Grande é o Senhor', 'Outra Música', 'Hino Simples']);
  assert.deepEqual(res.skipped, []);
  const songs = lib.listSongs();
  assert.equal(songs.length, 3);
  const first = songs.find((s) => s.title === 'Grande é o Senhor');
  assert.deepEqual([first.author, first.ccli], ['Ana', '123']);
  assert.deepEqual(first.arrangements, [{ name: 'Original', order: ['Verso 1', 'Refrão'] }]);
});

test('música com o mesmo título (sem diferenciar acento e maiúsculas) não duplica, nem dentro do mesmo lote', () => {
  const dir = tmp();
  const lib = newLibrary(dir);
  lib.saveSong({ title: 'GRANDE E O SENHOR', text: 'x' });
  const res = importFiles([write(dir, 'a', OPENSONG), write(dir, 'b.cho', CHORDPRO), write(dir, 'c.cho', CHORDPRO)], lib);
  assert.deepEqual(res.imported, ['Outra Música']);
  assert.equal(res.skipped.length, 2);
  assert.match(res.skipped[0].reason, /já existe/i);
  assert.equal(lib.listSongs().length, 2);
});

test('relata o que não deu: caminho relativo, rede, pasta, inexistente, vazio, grande demais, XML sem letra', () => {
  const dir = tmp();
  const lib = newLibrary(dir);
  fs.mkdirSync(path.join(dir, 'pasta'));
  const big = write(dir, 'grande.txt', 'x'.repeat(500_000));
  const res = importFiles([
    'relativo.txt', '\\\\servidor\\pasta\\a.txt', '//servidor/pasta/a.txt', path.join(dir, 'pasta'), path.join(dir, 'nao-existe.txt'),
    write(dir, 'vazio.txt', ''), big, write(dir, 'x.xml', '<song><title>x</title></song>'), 42, null,
  ], lib);
  assert.deepEqual(res.imported, []);
  assert.equal(res.skipped.length, 10);
  assert.ok(res.skipped.every((s) => s.name && s.reason));
  assert.match(res.skipped.find((s) => s.name === 'nao-existe.txt').reason, /não encontrado/i);
  assert.match(res.skipped.find((s) => s.name === 'grande.txt').reason, /grande/i);
  assert.equal(lib.listSongs().length, 0);
});

test('um arquivo ruim não impede os bons', () => {
  const dir = tmp();
  const lib = newLibrary(dir);
  const res = importFiles([write(dir, 'ruim.xml', '<html></html>'), write(dir, 'b.cho', CHORDPRO)], lib);
  assert.deepEqual(res.imported, ['Outra Música']);
  assert.equal(res.skipped.length, 1);
});

test('aceita no máximo MAX_FILES arquivos por vez', () => {
  const dir = tmp();
  const lib = newLibrary(dir);
  const files = Array.from({ length: MAX_FILES + 5 }, (_, i) => write(dir, `m${i}.txt`, `[Verso 1]\nlinha ${i}`));
  const res = importFiles(files, lib);
  assert.equal(res.imported.length, MAX_FILES);
  assert.equal(lib.listSongs().length, MAX_FILES);
});

test('lista que não é lista não derruba', () => {
  const lib = newLibrary(tmp());
  assert.deepEqual(importFiles(undefined, lib), { imported: [], skipped: [] });
  assert.deepEqual(importFiles('arquivo.txt', lib), { imported: [], skipped: [] });
});

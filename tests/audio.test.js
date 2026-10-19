const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { nextIndex, nextPlayableIndex, prevIndex, fadeVolume, clampVolume, enteredLive } = require('../src/renderer/shared/audioPlayer');
const { createAudioLibrary, isAudioPath } = require('../src/core/audioLibrary');
const { commandFor, INPUT_COMMANDS } = require('../src/core/automation');
const { initialState, reduce } = require('../src/core/state');

test('nextIndex: avança; no fim volta ao começo só com repetir; sem faixas é -1', () => {
  assert.equal(nextIndex(-1, 3, false), 0);
  assert.equal(nextIndex(0, 3, false), 1);
  assert.equal(nextIndex(2, 3, false), -1);
  assert.equal(nextIndex(2, 3, true), 0);
  assert.equal(nextIndex(0, 0, true), -1);
});

test('prevIndex: volta uma faixa; na primeira recomeça a primeira', () => {
  assert.equal(prevIndex(2, 3), 1);
  assert.equal(prevIndex(0, 3), 0);
  assert.equal(prevIndex(-1, 3), 0);
  assert.equal(prevIndex(0, 0), -1);
});

test('fadeVolume desce em linha reta até zero e nunca passa dos limites', () => {
  assert.equal(fadeVolume(0.8, 0, 3000), 0.8);
  assert.ok(Math.abs(fadeVolume(0.8, 1500, 3000) - 0.4) < 1e-9);
  assert.equal(fadeVolume(0.8, 3000, 3000), 0);
  assert.equal(fadeVolume(0.8, 9000, 3000), 0);
  assert.equal(fadeVolume(0.8, -50, 3000), 0.8);
  assert.equal(fadeVolume(0.8, 100, 0), 0);
});

test('clampVolume limita a 0–1 e usa 0,8 quando o valor não é número', () => {
  assert.equal(clampVolume(0.5), 0.5);
  assert.equal(clampVolume(-1), 0);
  assert.equal(clampVolume(7), 1);
  assert.equal(clampVolume(NaN), 0.8);
  assert.equal(clampVolume('abc'), 0.8);
  assert.equal(clampVolume(null), 0.8);
});

test('enteredLive: só quando o conteúdo passa de nada para algo no ar (slide ou mídia)', () => {
  const idle = initialState();
  const slide = reduce(idle, { type: 'showSlide', slide: { label: 'V', text: 'a' } });
  const next = reduce(slide, { type: 'showSlide', slide: { label: 'V', text: 'b' } });
  const media = reduce(idle, { type: 'showMedia', media: { kind: 'video', value: 'file:///C:/a.mp4' } });
  assert.equal(enteredLive(idle, slide), true);
  assert.equal(enteredLive(idle, media), true);
  assert.equal(enteredLive(slide, next), false);
  assert.equal(enteredLive(slide, idle), false);
  assert.equal(enteredLive(idle, idle), false);
  assert.equal(enteredLive(null, slide), true);
  assert.equal(enteredLive(idle, null), false);
});

// ---------- Biblioteca de áudio ----------
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'audio-'));
const touch = (dir, name) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, 'x');
  return p;
};

test('isAudioPath reconhece as extensões de áudio (sem diferenciar maiúsculas)', () => {
  for (const ext of ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac', 'MP3']) assert.equal(isAudioPath(`C:\\m\\a.${ext}`), true, ext);
  for (const ext of ['mp4', 'png', 'txt', 'exe']) assert.equal(isAudioPath(`C:\\m\\a.${ext}`), false, ext);
  assert.equal(isAudioPath(42), false);
});

test('addPaths guarda faixas de áudio com nome do arquivo; ignora outros tipos, caminhos relativos e repetidos', () => {
  const dir = tmpDir();
  const lib = createAudioLibrary(path.join(dir, 'audio.json'));
  const res = lib.addPaths([touch(dir, 'Louvor 1.mp3'), touch(dir, 'foto.png'), 'relativo.mp3', touch(dir, 'Louvor 1.mp3'), 42]);
  assert.equal(res.added.length, 1);
  assert.equal(res.skipped, 4);
  assert.equal(res.added[0].name, 'Louvor 1');
  assert.ok(res.added[0].url.startsWith('file:///'));
  assert.equal(lib.list().length, 1);
});

test('lista marca faixa cuja arquivo sumiu, e persiste em disco', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'audio.json');
  const lib = createAudioLibrary(file);
  const a = touch(dir, 'a.mp3');
  lib.addPaths([a]);
  assert.equal(lib.list()[0].missing, false);
  fs.unlinkSync(a);
  assert.equal(createAudioLibrary(file).list()[0].missing, true);
});

test('caminho de rede (UNC) não entra', () => {
  const lib = createAudioLibrary(path.join(tmpDir(), 'audio.json'));
  assert.equal(lib.addPaths(['\\\\servidor\\pasta\\a.mp3']).added.length, 0);
});

test('move reordena a lista; remove tira a faixa; id desconhecido não faz nada', () => {
  const dir = tmpDir();
  const lib = createAudioLibrary(path.join(dir, 'audio.json'));
  lib.addPaths([touch(dir, 'a.mp3'), touch(dir, 'b.mp3'), touch(dir, 'c.mp3')]);
  const [a, b, c] = lib.list();
  lib.move(c.id, 0);
  assert.deepEqual(lib.list().map((t) => t.name), ['c', 'a', 'b']);
  lib.move(a.id, 99);
  assert.deepEqual(lib.list().map((t) => t.name), ['c', 'b', 'a']);
  lib.move('nao-existe', 0);
  assert.equal(lib.list().length, 3);
  lib.remove(b.id);
  assert.deepEqual(lib.list().map((t) => t.name), ['c', 'a']);
  lib.remove('nao-existe');
  assert.equal(lib.list().length, 2);
});

test('limite de 100 faixas', () => {
  const dir = tmpDir();
  const lib = createAudioLibrary(path.join(dir, 'audio.json'));
  const paths = Array.from({ length: 105 }, (_, i) => touch(dir, `f${i}.mp3`));
  const res = lib.addPaths(paths);
  assert.equal(res.added.length, 100);
  assert.equal(res.skipped, 5);
});

test('audio.json corrompido ou adulterado não derruba: só entram itens válidos', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'audio.json');
  const origError = console.error;
  console.error = () => {};
  fs.writeFileSync(file, '{nao e json');
  assert.deepEqual(createAudioLibrary(file).list(), []);
  fs.writeFileSync(file, JSON.stringify({ items: [
    { id: 'a', name: 'Boa', url: 'file:///C:/m/a.mp3' },
    { id: 'b', name: 'Rede', url: 'file://atacante/share/b.mp3' },
    { id: 'c', name: 'Site', url: 'http://x/c.mp3' },
    { id: 'd', name: 'Tipo errado', url: 'file:///C:/m/d.png' },
    { id: 'a', name: 'Id repetido', url: 'file:///C:/m/e.mp3' },
    'lixo',
  ] }));
  console.error = origError;
  assert.deepEqual(createAudioLibrary(file).list().map((t) => t.id), ['a']);
});

// ---------- OSC ----------
test('OSC: /audio/toggle, /audio/next e /audio/fade vão para o operador (quem toca é a janela dele)', () => {
  assert.deepEqual(commandFor('/xpresenter/audio/toggle'), { kind: 'operator', command: 'audio/toggle' });
  assert.deepEqual(commandFor('/xpresenter/audio/next'), { kind: 'operator', command: 'audio/next' });
  assert.deepEqual(commandFor('/apresentador/audio/fade'), { kind: 'operator', command: 'audio/fade' });
  assert.equal(commandFor('/xpresenter/audio/formatar'), null);
  assert.ok(INPUT_COMMANDS.includes('/xpresenter/audio/toggle'));
});

const T = (missing = false) => ({ missing });

test('nextPlayableIndex pula faixa cujo arquivo sumiu, sem parar a música de fundo', () => {
  const tracks = [T(), T(true), T()];
  assert.equal(nextPlayableIndex(0, tracks, false), 2);
  assert.equal(nextPlayableIndex(-1, tracks, false), 0);
  assert.equal(nextPlayableIndex(2, tracks, false), -1, 'fim da lista sem repetir');
  assert.equal(nextPlayableIndex(2, tracks, true), 0, 'repetir volta ao começo');
  assert.equal(nextPlayableIndex(0, [T(), T(true), T(true)], false), -1, 'só restam faixas que sumiram');
});

test('nextPlayableIndex: com repetir, uma única faixa tocável repete a si mesma; sem nenhuma, -1', () => {
  assert.equal(nextPlayableIndex(1, [T(true), T()], true), 1);
  assert.equal(nextPlayableIndex(0, [T(true), T(true)], true), -1);
  assert.equal(nextPlayableIndex(0, [], true), -1);
  assert.equal(nextPlayableIndex(-1, [], false), -1);
});

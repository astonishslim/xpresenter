const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseSong, toSlides, arrange, slidesForSong } = require('../src/core/songParser');
const { isChord } = require('../src/core/chords');
const { isValidAction } = require('../src/core/state');
const { chordLines, layoutFor, LAYOUTS, LAYOUT_NAMES, DEFAULT_LAYOUT } = require('../src/renderer/shared/stageLayouts');

test('isChord reconhece acordes comuns e recusa o resto', () => {
  for (const c of ['A', 'Am', 'C#m7', 'Bb', 'G/B', 'Dsus4', 'Cmaj7', 'F#dim', 'Eadd9']) assert.equal(isChord(c), true, c);
  for (const c of ['H', 'Verso', '', 'am', 'A m', 'C#m7 ', '<b>', 42, null]) assert.equal(isChord(c), false, String(c));
});

test('parseSong guarda a posição de cada acorde na linha já limpa', () => {
  const song = parseSong('X', '[Verso]\n[G]Grande é o [D]Senhor\nE mui digno');
  assert.deepEqual(song.sections[0].lines, ['Grande é o Senhor', 'E mui digno']);
  assert.deepEqual(song.sections[0].chords, [[{ at: 0, chord: 'G' }, { at: 11, chord: 'D' }], []]);
});

test('a posição acompanha a limpeza de espaços repetidos e das pontas', () => {
  const song = parseSong('X', '[Verso]\n  [Am]  Senhor   [C]tu  ');
  assert.deepEqual(song.sections[0].lines, ['Senhor tu']);
  assert.deepEqual(song.sections[0].chords, [[{ at: 0, chord: 'Am' }, { at: 7, chord: 'C' }]]);
});

test('linha só de acordes continua ignorada e os acordes seguem alinhados às linhas', () => {
  const song = parseSong('X', '[Verso]\n[Am] [G]\n[C]linha um\nlinha dois\n[F]linha três');
  assert.deepEqual(song.sections[0].lines, ['linha um', 'linha dois', 'linha três']);
  assert.deepEqual(song.sections[0].chords.map((c) => c.length), [1, 0, 1]);
});

test('toSlides leva os acordes só quando existem, alinhados às linhas de cada slide', () => {
  const plain = toSlides(parseSong('X', '[Verso]\na\nb'));
  assert.equal('chords' in plain[0], false);
  const slides = toSlides(parseSong('X', '[Verso]\n[C]1\n2\n[G]3\n4\n[D]5'), { maxLines: 2 });
  assert.deepEqual(slides.map((s) => s.text), ['1\n2', '3\n4', '5']);
  assert.deepEqual(slides[0].chords, [[{ at: 0, chord: 'C' }], []]);
  assert.deepEqual(slides[1].chords, [[{ at: 0, chord: 'G' }], []]);
  assert.deepEqual(slides[2].chords, [[{ at: 0, chord: 'D' }]]);
});

test('arranjo e slidesForSong mantêm os acordes (e não compartilham o objeto da música)', () => {
  const text = '[Verso 1]\n[G]um\n\n[Refrão]\n[D]dois';
  const song = parseSong('X', text);
  const { song: arranged } = arrange(song, ['C', 'V1', 'C']);
  assert.deepEqual(arranged.sections.map((s) => s.chords[0][0].chord), ['D', 'G', 'D']);
  arranged.sections[0].chords[0][0].chord = 'MUTADO';
  assert.equal(song.sections[1].chords[0][0].chord, 'D');
  const slides = slidesForSong({ title: 'X', text, arrangements: [{ name: 'Culto', order: ['C', 'V1'] }] }, 'Culto');
  assert.deepEqual(slides.map((s) => s.chords[0][0].chord), ['D', 'G']);
});

test('showSlide aceita acordes bem formados e recusa o resto', () => {
  const show = (chords, text = 'a\nb') => isValidAction({ type: 'showSlide', slide: { label: 'V', text, chords } });
  assert.equal(show(undefined), true);
  assert.equal(show([[{ at: 0, chord: 'Am' }], []]), true);
  assert.equal(show([]), true);
  assert.equal(show('Am'), false);
  assert.equal(show([[{ at: 0, chord: 'X9' }]]), false);
  assert.equal(show([[{ at: -1, chord: 'Am' }]]), false);
  assert.equal(show([[{ at: 301, chord: 'Am' }]]), false);
  assert.equal(show([[{ at: 1.5, chord: 'Am' }]]), false);
  assert.equal(show([[{ chord: 'Am' }]]), false);
  assert.equal(show([[null]]), false);
  assert.equal(show([[], [], []]), false, 'mais linhas de acorde que linhas de texto');
  assert.equal(show([Array(25).fill({ at: 0, chord: 'C' })]), false);
  assert.equal(show([[{ at: 0, chord: '<img src=x>' }]]), false);
});

// ---------- Retorno de palco: acordes sobre a letra e layouts ----------
test('chordLines coloca cada acorde sobre a sílaba (coluna) e separa acordes que se encostam', () => {
  assert.deepEqual(chordLines('Grande é o Senhor', [[{ at: 0, chord: 'G' }, { at: 11, chord: 'D' }]]),
    [{ chords: `G${' '.repeat(10)}D`, text: 'Grande é o Senhor' }]);
  assert.equal(chordLines('abcdef', [[{ at: 0, chord: 'Am7' }, { at: 1, chord: 'G' }]])[0].chords, 'Am7 G');
  assert.deepEqual(chordLines('a\nb', [[{ at: 0, chord: 'C' }], []]).map((r) => r.chords), ['C', '']);
});

test('chordLines tolera falta de acordes ou menos linhas de acorde que de texto', () => {
  assert.deepEqual(chordLines('a\nb', undefined), [{ chords: '', text: 'a' }, { chords: '', text: 'b' }]);
  assert.deepEqual(chordLines('a\nb', [[{ at: 0, chord: 'C' }]]).map((r) => r.chords), ['C', '']);
  assert.deepEqual(chordLines('', null), [{ chords: '', text: '' }]);
});

test('layouts do retorno: letra (padrão), banda (com acordes) e pregador (tempo grande)', () => {
  assert.deepEqual(LAYOUT_NAMES, ['letra', 'banda', 'pregador']);
  assert.equal(DEFAULT_LAYOUT, 'letra');
  assert.equal(layoutFor('banda').chords, true);
  assert.equal(layoutFor('letra').chords, false);
  assert.equal(layoutFor('letra').now, true);
  assert.equal(layoutFor('pregador').now, false);
  assert.equal(layoutFor('pregador').bigTimer, true);
  assert.equal(layoutFor('nao-existe'), LAYOUTS.letra);
  assert.equal(layoutFor('toString'), LAYOUTS.letra);
  assert.equal(layoutFor(undefined), LAYOUTS.letra);
  for (const name of LAYOUT_NAMES) assert.ok(LAYOUTS[name].label, name);
});

test('a cópia de stageLayouts.js do remoto é idêntica à compartilhada', () => {
  const root = path.join(__dirname, '..', 'src');
  assert.equal(
    fs.readFileSync(path.join(root, 'remote', 'stageLayouts.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'renderer', 'shared', 'stageLayouts.js'), 'utf8'),
  );
});

test('música importada com acorde muito à direita ou acordes demais: o slide continua válido (só perde o excesso)', () => {
  const { toSlides, parseSong } = require('../src/core/songParser');
  const { isValidAction } = require('../src/core/state');
  const longLine = `${'a '.repeat(200)}[Am]fim`;
  const manyChords = Array.from({ length: 30 }, (_, i) => `[C]x${i}`).join('');
  const slides = toSlides(parseSong('T', `[Verso 1]\n${longLine}\n${manyChords}`));
  assert.equal(slides.length, 1);
  assert.ok(isValidAction({ type: 'showSlide', slide: { label: slides[0].label, text: slides[0].text, chords: slides[0].chords } }));
  assert.ok(slides[0].chords[1].length <= 24);
  assert.ok(slides[0].chords[0].every((c) => c.at <= 300));
});

test('mais linhas por slide que o limite de acordes: o slide continua válido', () => {
  const { toSlides, parseSong } = require('../src/core/songParser');
  const { isValidAction } = require('../src/core/state');
  const lines = Array.from({ length: 20 }, (_, i) => `[G]linha ${i}`).join('\n');
  const [slide] = toSlides(parseSong('T', `[Verso 1]\n${lines}`), { maxLines: 20 });
  assert.ok(isValidAction({ type: 'showSlide', slide: { label: slide.label, text: slide.text, chords: slide.chords } }));
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSong, toSlides, arrange, slidesForSong } = require('../src/core/songParser');

const SAMPLE = `[Verso 1]
Linha um
Linha dois

[Refrão]
Aleluia
Aleluia
Aleluia
Aleluia
Aleluia`;

test('parseSong separa seções pelos marcadores entre colchetes', () => {
  const song = parseSong('Hino', SAMPLE);
  assert.equal(song.title, 'Hino');
  assert.deepEqual(song.sections.map((s) => s.label), ['Verso 1', 'Refrão']);
  assert.deepEqual(song.sections[0].lines, ['Linha um', 'Linha dois']);
});

test('parseSong usa "Letra" quando o texto não tem marcadores', () => {
  const song = parseSong('X', 'a\nb');
  assert.equal(song.sections[0].label, 'Letra');
  assert.deepEqual(song.sections[0].lines, ['a', 'b']);
});

test('parseSong separa blocos por linha em branco dentro da mesma seção', () => {
  const song = parseSong('X', 'a\nb\n\nc\nd');
  assert.equal(song.sections.length, 2);
});

test('parseSong remove acordes inline como [Am] mas mantém marcadores de seção', () => {
  const song = parseSong('X', '[Verso]\n[Am]Senhor [C]tu és');
  assert.equal(song.sections[0].lines[0], 'Senhor tu és');
});

test('parseSong ignora texto vazio', () => {
  assert.deepEqual(parseSong('X', '  \n ').sections, []);
});

test('toSlides divide seções longas respeitando maxLines', () => {
  const slides = toSlides(parseSong('Hino', SAMPLE), { maxLines: 2 });
  assert.equal(slides[0].text, 'Linha um\nLinha dois');
  const refrao = slides.filter((s) => s.label === 'Refrão');
  assert.equal(refrao.length, 3);
  assert.equal(refrao[2].text, 'Aleluia');
});

test('toSlides numera os slides sequencialmente a partir de zero', () => {
  const slides = toSlides(parseSong('Hino', SAMPLE), { maxLines: 4 });
  assert.deepEqual(slides.map((s) => s.index), slides.map((_, i) => i));
});

test('toSlides não altera o objeto de entrada', () => {
  const song = parseSong('Hino', SAMPLE);
  const copy = JSON.parse(JSON.stringify(song));
  toSlides(song, { maxLines: 1 });
  assert.deepEqual(song, copy);
});

test('rótulos que começam com A-G ([Bridge], [Coro], [Final]) continuam sendo seções', () => {
  const song = parseSong('X', '[Bridge]\na\n\n[Coro]\nb\n\n[Final]\nc');
  assert.deepEqual(song.sections.map((s) => s.label), ['Bridge', 'Coro', 'Final']);
});

test('acordes reais ([Am], [C#m7], [G/B]) seguem ignorados', () => {
  const song = parseSong('X', '[Verso]\n[C#m7]a [G/B]b [F]c');
  assert.equal(song.sections[0].lines[0], 'a b c');
});

test('linha só com acorde não quebra o slide', () => {
  const song = parseSong('X', '[Verso]\nlinha\n[Am]\noutra');
  assert.equal(song.sections.length, 1);
  assert.deepEqual(song.sections[0].lines, ['linha', 'outra']);
});

const ARRANGED = `[Verso 1]
Primeiro verso

[Refrão]
Aleluia um
Aleluia dois

[Verso 2]
Segundo verso

[Ponte]
Ponte`;

test('arrange monta as seções na ordem pedida (siglas ou nomes), repetindo o refrão', () => {
  const { song, unknown } = arrange(parseSong('Hino', ARRANGED), ['V1', 'C', 'V2', 'C', 'P', 'C', 'C']);
  assert.deepEqual(song.sections.map((s) => s.label), ['Verso 1', 'Refrão', 'Verso 2', 'Refrão', 'Ponte', 'Refrão', 'Refrão']);
  assert.deepEqual(unknown, []);
  assert.equal(song.title, 'Hino');
});

test('arrange avisa o que não existe na música e ignora', () => {
  const { song, unknown } = arrange(parseSong('Hino', ARRANGED), ['V1', 'X', 'Final', 'C']);
  assert.deepEqual(song.sections.map((s) => s.label), ['Verso 1', 'Refrão']);
  assert.deepEqual(unknown, ['X', 'Final']);
});

test('arrange: seção quebrada em blocos (linha em branco) entra inteira', () => {
  const text = '[Refrão]\na\nb\n\nc\nd\n\n[Verso]\ne';
  const { song } = arrange(parseSong('X', text), ['C', 'V', 'C']);
  assert.deepEqual(song.sections.map((s) => s.lines.join('|')), ['a|b', 'c|d', 'e', 'a|b', 'c|d']);
});

test('arrange: refrão escrito de novo mais adiante não duplica o grupo', () => {
  const text = '[Refrão]\na\n\n[Verso]\nb\n\n[Refrão]\na';
  const { song } = arrange(parseSong('X', text), ['C']);
  assert.deepEqual(song.sections.map((s) => s.lines.join('|')), ['a']);
});

test('arrange prefere o nome exato à sigla', () => {
  const text = '[P]\nnome exato\n\n[Ponte]\nponte';
  const { song } = arrange(parseSong('X', text), ['P']);
  assert.deepEqual(song.sections.map((s) => s.lines[0]), ['nome exato']);
});

test('arrange não altera a música de entrada', () => {
  const song = parseSong('Hino', ARRANGED);
  const copy = JSON.parse(JSON.stringify(song));
  arrange(song, ['C', 'C']).song.sections[0].lines.push('mutado');
  assert.deepEqual(song, copy);
});

test('slidesForSong usa o arranjo pelo nome; sem arranjo (ou nome que não existe) segue a ordem da letra', () => {
  const record = { title: 'Hino', text: ARRANGED, arrangements: [{ name: 'Culto', order: ['V1', 'C', 'C'] }] };
  assert.deepEqual(slidesForSong(record, 'Culto').map((s) => s.label), ['Verso 1', 'Refrão', 'Refrão']);
  assert.deepEqual(slidesForSong(record, 'Culto').map((s) => s.index), [0, 1, 2]);
  assert.deepEqual(slidesForSong(record).map((s) => s.label), ['Verso 1', 'Refrão', 'Verso 2', 'Ponte']);
  assert.deepEqual(slidesForSong(record, 'Outro').map((s) => s.label), ['Verso 1', 'Refrão', 'Verso 2', 'Ponte']);
  assert.equal(slidesForSong({ title: 'X', text: 'a', arrangements: 'lixo' }, 'Culto').length, 1);
});

test('slidesForSong: arranjo que não acha nenhuma seção cai na ordem da letra (nunca fica sem slides)', () => {
  const record = { title: 'Hino', text: ARRANGED, arrangements: [{ name: 'Errado', order: ['X', 'Y'] }] };
  assert.equal(slidesForSong(record, 'Errado').length, 4);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { importSong } = require('../src/core/importers');
const { parseSong, toSlides, slidesForSong } = require('../src/core/songParser');

const OPENSONG = `<?xml version="1.0" encoding="UTF-8"?>
<song>
  <title>Grande é o Senhor</title>
  <author>Fulano</author>
  <ccli>7654321</ccli>
  <presentation>V1 C V2 C T</presentation>
  <lyrics>[V1]
.G          D
 Grande é o Senhor
 E mui digno de louvor
[C]
 Aleluia, aleluia
 Santo é o Senhor
[V2]
; comentário que não aparece
 Na cidade do nosso Deus
[T]
 Amém
</lyrics>
</song>`;

const OPENLYRICS = `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.8">
  <properties>
    <titles><title>Santo</title></titles>
    <authors><author>Ana</author><author>Beto</author></authors>
    <ccliNo>1234</ccliNo>
    <verseOrder>v1 c v2 c b</verseOrder>
  </properties>
  <lyrics>
    <verse name="v1"><lines>Santo, <chord name="G"/>santo<br/>é o Senhor</lines></verse>
    <verse name="c"><lines>Aleluia &amp; louvor</lines></verse>
    <verse name="v2"><lines>Segundo<br/>verso</lines></verse>
    <verse name="b"><lines>Ponte</lines></verse>
  </lyrics>
</song>`;

const CHORDPRO = `{title: Digno é o Cordeiro}
{artist: Maria}
{ccli: 555}
# comentário
[G]Digno é o [D]Cordeiro
Que foi morto

{soc}
[C]Santo, santo
{eoc}

{comment: Ponte}
Tu és rei
`;

const labelsOf = (song) => parseSong(song.title, song.text).sections.map((s) => s.label);

test('OpenSong: título, autor, CCLI, seções, ordem de apresentação e acordes sobre a letra', () => {
  const res = importSong('grande', OPENSONG);
  assert.equal(res.ok, true);
  assert.equal(res.format, 'opensong');
  const { song } = res;
  assert.deepEqual([song.title, song.author, song.ccli], ['Grande é o Senhor', 'Fulano', '7654321']);
  assert.deepEqual(labelsOf(song), ['Verso 1', 'Refrão', 'Verso 2', 'Final']);
  const parsed = parseSong(song.title, song.text);
  assert.deepEqual(parsed.sections[0].lines, ['Grande é o Senhor', 'E mui digno de louvor']);
  assert.deepEqual(parsed.sections[0].chords[0], [{ at: 0, chord: 'G' }, { at: 11, chord: 'D' }]);
  assert.deepEqual(song.arrangements, [{ name: 'Original', order: ['Verso 1', 'Refrão', 'Verso 2', 'Refrão', 'Final'] }]);
  assert.equal(song.text.includes('comentário'), false);
});

test('OpenSong: o arranjo importado monta a música na ordem de apresentação', () => {
  const { song } = importSong('g', OPENSONG);
  const slides = slidesForSong({ title: song.title, text: song.text, arrangements: song.arrangements }, 'Original');
  assert.deepEqual(slides.map((s) => s.label), ['Verso 1', 'Refrão', 'Verso 2', 'Refrão', 'Final']);
});

test('OpenSong: [V] com linhas numeradas vira Verso 1, Verso 2…; seção sem linhas some', () => {
  const xml = '<song><title>T</title><lyrics>[V]\n1Primeiro verso\n2Segundo verso\n[C]\n Refrão</lyrics></song>';
  const { song } = importSong('t', xml);
  assert.deepEqual(labelsOf(song), ['Verso 1', 'Verso 2', 'Refrão']);
});

test('OpenSong: acorde além do fim da linha, CDATA e entidades', () => {
  const xml = '<song><title>A &amp; B</title><lyrics><![CDATA[[V1]\n.C      G\n Oi\n]]></lyrics></song>';
  const { song } = importSong('t', xml);
  assert.equal(song.title, 'A & B');
  const parsed = parseSong(song.title, song.text);
  assert.deepEqual(parsed.sections[0].lines, ['Oi']);
  assert.deepEqual(parsed.sections[0].chords[0].map((c) => c.chord), ['C', 'G']);
});

test('OpenLyrics: título, autores, CCLI, seções, ordem, acordes e entidades', () => {
  const res = importSong('santo.xml', OPENLYRICS);
  assert.equal(res.ok, true);
  assert.equal(res.format, 'openlyrics');
  const { song } = res;
  assert.deepEqual([song.title, song.author, song.ccli], ['Santo', 'Ana, Beto', '1234']);
  assert.deepEqual(labelsOf(song), ['Verso 1', 'Refrão', 'Verso 2', 'Ponte']);
  const parsed = parseSong(song.title, song.text);
  assert.deepEqual(parsed.sections[0].lines, ['Santo, santo', 'é o Senhor']);
  assert.deepEqual(parsed.sections[0].chords[0], [{ at: 7, chord: 'G' }]);
  assert.deepEqual(parsed.sections[1].lines, ['Aleluia & louvor']);
  assert.deepEqual(song.arrangements[0].order, ['Verso 1', 'Refrão', 'Verso 2', 'Refrão', 'Ponte']);
});

test('OpenLyrics: tags desconhecidas não passam, e códigos c2/p/e/i viram Refrão 2, Pré-Refrão, Final, Intro', () => {
  const xml = `<song xmlns="http://openlyrics.info/namespace/2009/song"><properties><titles><title>X</title></titles></properties><lyrics>
    <verse name="i"><lines>Intro</lines></verse>
    <verse name="p"><lines><b>Pré</b> <script>alert(1)</script></lines></verse>
    <verse name="c2"><lines>Coro dois</lines></verse>
    <verse name="e"><lines>Fim</lines></verse></lyrics></song>`;
  const { song } = importSong('x', xml);
  assert.deepEqual(labelsOf(song), ['Intro', 'Pré-Refrão', 'Refrão 2', 'Final']);
  assert.equal(/<|script/.test(song.text.replace('alert(1)', '')), false);
});

test('ChordPro: diretivas viram título, autor e CCLI; {soc} vira Refrão; {comment} nomeia a seção', () => {
  const res = importSong('x.cho', CHORDPRO);
  assert.equal(res.ok, true);
  assert.equal(res.format, 'chordpro');
  const { song } = res;
  assert.deepEqual([song.title, song.author, song.ccli], ['Digno é o Cordeiro', 'Maria', '555']);
  assert.deepEqual(labelsOf(song), ['Verso 1', 'Refrão', 'Ponte']);
  const parsed = parseSong(song.title, song.text);
  assert.deepEqual(parsed.sections[0].lines, ['Digno é o Cordeiro', 'Que foi morto']);
  assert.deepEqual(parsed.sections[0].chords[0], [{ at: 0, chord: 'G' }, { at: 10, chord: 'D' }]);
  assert.deepEqual(song.arrangements, []);
});

test('ChordPro: blocos sem rótulo viram versos numerados; {sot}…{eot} (tablatura) é ignorado', () => {
  const text = '{t: X}\nprimeiro\n\nsegundo\n{sot}\ne|--3--|\n{eot}\n\nterceiro';
  const { song } = importSong('x.cho', text);
  assert.deepEqual(labelsOf(song), ['Verso 1', 'Verso 2', 'Verso 3']);
  assert.equal(song.text.includes('e|--3--|'), false);
});

test('texto simples: usa o nome do arquivo como título e mantém marcadores e acordes', () => {
  const res = importSong('C:\\musicas\\Meu Hino.txt', '[Verso 1]\n[Am]linha\n\n[Refrão]\nrefrão');
  assert.equal(res.ok, true);
  assert.equal(res.format, 'texto');
  assert.equal(res.song.title, 'Meu Hino');
  assert.deepEqual(labelsOf(res.song), ['Verso 1', 'Refrão']);
});

test('limites e recusas: vazio, grande demais, XML sem letra, caracteres de controle', () => {
  assert.equal(importSong('a.txt', '').ok, false);
  assert.equal(importSong('a.txt', '   \n  ').ok, false);
  assert.match(importSong('a.xml', '<song><title>x</title></song>').reason, /letra/i);
  assert.equal(importSong('a.xml', '<html><body>oi</body></html>').ok, false);
  assert.match(importSong('a.txt', 'x'.repeat(300_001)).reason, /grande/i);
  const ctrl = importSong('a.txt', '[Verso]\nlin\u0000ha\u0007');
  assert.equal(ctrl.song.text.includes('\u0000'), false);
  assert.equal(importSong(42, 'x').ok, false);
  assert.equal(importSong('a.txt', null).ok, false);
});

test('título e autor são cortados (120 e 80) e CCLI só aceita dígitos', () => {
  const xml = `<song><title>${'t'.repeat(300)}</title><author>${'a'.repeat(300)}</author><ccli>ABC</ccli><lyrics>[V1]\n x</lyrics></song>`;
  const { song } = importSong('x', xml);
  assert.equal(song.title.length, 120);
  assert.equal(song.author.length, 80);
  assert.equal(song.ccli, '');
});

test('a letra importada gera slides com os acordes posicionados', () => {
  const { song } = importSong('g', OPENSONG);
  const slides = toSlides(parseSong(song.title, song.text));
  assert.deepEqual(slides[0].chords[0], [{ at: 0, chord: 'G' }, { at: 11, chord: 'D' }]);
});

// Entrada hostil: cada formato precisa terminar rápido mesmo com 300 KB montados para travar expressões regulares.
const MAX_HOSTILE_MS = 1500;
const timed = (name, content, fileName = 'a.txt') => {
  const t0 = Date.now();
  importSong(fileName, content);
  const took = Date.now() - t0;
  assert.ok(took < MAX_HOSTILE_MS, `${name} levou ${took} ms`);
};

test('entrada hostil termina rápido (sem expressões regulares quadráticas)', () => {
  const N = 290_000;
  timed('linhas em branco', `a${'\n'.repeat(N)}a`);
  timed('{t: com espaços', `{t:${' '.repeat(N)}x`);
  timed('< sem fechar no título', `<song><title>${'<'.repeat(N)}</title><lyrics>[V1]\nx</lyrics></song>`, 'a.xml');
  timed('CDATA sem fechar', `<song><lyrics>${'<![CDATA['.repeat(N / 9 | 0)}</lyrics></song>`, 'a.xml');
  timed('<verse sem fechar', `<song xmlns="http://openlyrics.info/namespace/2009/song">${'<verse name="v1">'.repeat(N / 17 | 0)}</song>`, 'a.xml');
  timed('<lyrics> sem fechar', `<song>${'<lyrics>'.repeat(N / 8 | 0)}</song>`, 'a.xml');
  timed('<chord sem >', `<song><verse name="v1"><lines>${'<chord name="C" '.repeat(N / 16 | 0)}</lines></verse></song>`, 'a.xml');
  timed('acordes OpenSong', `<song><lyrics>[V]\n.${'C '.repeat(N / 2 | 0)}\nletra</lyrics></song>`, 'a.xml');
});

test('mergeChords: linha de acordes enorme não vira letra gigante', () => {
  const res = importSong('a.xml', `<song><lyrics>[V]\n.${'C '.repeat(5000)}\nletra</lyrics></song>`);
  assert.equal(res.ok, true);
  assert.ok(res.song.text.length < 5000);
});

test('limite de tamanho: 300 mil caracteres', () => {
  assert.match(importSong('a.txt', 'x'.repeat(300_001)).reason, /grande/i);
  assert.equal(importSong('a.txt', 'x'.repeat(300_000)).ok, true);
});

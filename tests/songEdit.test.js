const test = require('node:test');
const assert = require('node:assert/strict');
const { replaceSlideText } = require('../src/core/songEdit');
const { parseSong, toSlides } = require('../src/core/songParser');

const TEXT = `[Verso 1]
Linha um
Linha dois

[Refrão]
[G]Aleluia [D]santo
Aleluia dois`;

test('troca as linhas do slide dentro da letra, sem mexer no resto', () => {
  const next = replaceSlideText(TEXT, 'Linha um\nLinha dois', 'Linha UM\nLinha dois');
  assert.equal(next, TEXT.replace('Linha um', 'Linha UM'));
});

test('linha que não mudou mantém os acordes; linha alterada perde os acordes dela', () => {
  const next = replaceSlideText(TEXT, 'Aleluia santo\nAleluia dois', 'Aleluia santo\nAleluia TRÊS');
  assert.match(next, /\[G\]Aleluia \[D\]santo\nAleluia TRÊS$/);
});

test('aceita mais ou menos linhas que o original', () => {
  const more = replaceSlideText(TEXT, 'Linha um\nLinha dois', 'a\nb\nc');
  assert.deepEqual(parseSong('X', more).sections[0].lines, ['a', 'b', 'c']);
  const less = replaceSlideText(TEXT, 'Linha um\nLinha dois', 'só uma');
  assert.deepEqual(parseSong('X', less).sections[0].lines, ['só uma']);
  assert.match(less, /^\[Verso 1\]\nsó uma\n\n\[Refrão\]/);
});

test('linhas só de acorde no meio do trecho são mantidas junto da linha seguinte', () => {
  const text = '[Verso]\nlinha a\n[Am]\nlinha b';
  assert.equal(replaceSlideText(text, 'linha a\nlinha b', 'linha a\nlinha b!'), '[Verso]\nlinha a\nlinha b!');
  assert.equal(replaceSlideText(text, 'linha a\nlinha b', 'linha a!\nlinha b'), '[Verso]\nlinha a!\n[Am]\nlinha b');
});

test('slide de seção longa (dividida por maxLines) é achado pelo trecho do meio', () => {
  const text = '[Verso]\n1\n2\n3\n4\n5\n6';
  const slides = toSlides(parseSong('X', text));
  assert.equal(slides[1].text, '5\n6');
  assert.equal(replaceSlideText(text, slides[1].text, 'cinco\n6'), '[Verso]\n1\n2\n3\n4\ncinco\n6');
});

test('não junta linhas de blocos diferentes (linha em branco ou marcador no meio)', () => {
  assert.equal(replaceSlideText(TEXT, 'Linha dois\nAleluia santo', 'x'), null);
});

test('devolve null se o trecho não existe, ou se o texto novo é vazio', () => {
  assert.equal(replaceSlideText(TEXT, 'não existe', 'x'), null);
  assert.equal(replaceSlideText(TEXT, 'Linha um\nLinha dois', '   \n '), null);
  assert.equal(replaceSlideText(TEXT, '', 'x'), null);
});

test('mantém a quebra de linha do Windows (\\r\\n) do arquivo original', () => {
  const crlf = TEXT.replace(/\n/g, '\r\n');
  assert.equal(replaceSlideText(crlf, 'Linha um\nLinha dois', 'x\nLinha dois'), crlf.replace('Linha um', 'x'));
});

test('texto novo: tira espaços das pontas e linhas vazias do começo/fim', () => {
  const next = replaceSlideText(TEXT, 'Linha um\nLinha dois', '\n  nova  \n\n');
  assert.deepEqual(parseSong('X', next).sections[0].lines, ['nova']);
});

test('com o rótulo, edita o trecho da seção certa (texto igual em dois versos)', () => {
  const text = '[Verso 1]\nAleluia\n\n[Verso 3]\nAleluia';
  assert.equal(replaceSlideText(text, 'Aleluia', 'Amém', { label: 'Verso 3' }), '[Verso 1]\nAleluia\n\n[Verso 3]\nAmém');
  assert.equal(replaceSlideText(text, 'Aleluia', 'Amém', { label: 'Verso 1' }), '[Verso 1]\nAmém\n\n[Verso 3]\nAleluia');
});

test('rótulo vale também para blocos sem marcador (continuação da seção) e para letra sem marcadores', () => {
  assert.equal(replaceSlideText('[Refrão]\na\n\nb', 'b', 'B', { label: 'Refrão' }), '[Refrão]\na\n\nB');
  assert.equal(replaceSlideText('a\nb', 'a\nb', 'x', { label: 'Letra' }), 'x');
  assert.equal(replaceSlideText('[Verso]\na', 'a', 'x', { label: 'Ponte' }), null);
});

test('texto novo grande demais é recusado', () => {
  assert.equal(replaceSlideText('[V]\na', 'a', 'x'.repeat(2001)), null);
});

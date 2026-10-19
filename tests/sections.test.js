const test = require('node:test');
const assert = require('node:assert/strict');
const {
  kindOf, hotkeyOf, abbrOf, matchesToken, parseOrder, formatOrder, groupStarts, findGroupStart,
} = require('../src/renderer/shared/sections');

test('kindOf reconhece o tipo da seção pelo rótulo, sem acento nem maiúsculas', () => {
  assert.equal(kindOf('Verso 1'), 'verse');
  assert.equal(kindOf('ESTROFE'), 'verse');
  assert.equal(kindOf('Refrão'), 'chorus');
  assert.equal(kindOf('refrao 2'), 'chorus');
  assert.equal(kindOf('Coro'), 'chorus');
  assert.equal(kindOf('Chorus'), 'chorus');
  assert.equal(kindOf('Pré-Refrão'), 'prechorus');
  assert.equal(kindOf('Pre Chorus'), 'prechorus');
  assert.equal(kindOf('Ponte'), 'bridge');
  assert.equal(kindOf('Bridge'), 'bridge');
  assert.equal(kindOf('Intro'), 'intro');
  assert.equal(kindOf('Introdução'), 'intro');
  assert.equal(kindOf('Final'), 'ending');
  assert.equal(kindOf('Outro'), 'ending');
  assert.equal(kindOf('Letra'), 'other');
  assert.equal(kindOf('João 3:16 · TB'), 'other');
  assert.equal(kindOf(undefined), 'other');
});

test('kindOf só olha o começo do rótulo (versículo "Finalmente" não vira Final)', () => {
  assert.equal(kindOf('Finalmente'), 'other');
  assert.equal(kindOf('Versículo'), 'other');
});

test('hotkeyOf: verso usa o número, refrão C, pré-refrão E, ponte P, intro I, final F', () => {
  assert.equal(hotkeyOf('Verso 1'), '1');
  assert.equal(hotkeyOf('Verso 3'), '3');
  assert.equal(hotkeyOf('Verso'), '1');
  assert.equal(hotkeyOf('Verso 12'), null);
  assert.equal(hotkeyOf('Refrão'), 'c');
  assert.equal(hotkeyOf('Pré-Refrão'), 'e');
  assert.equal(hotkeyOf('Ponte'), 'p');
  assert.equal(hotkeyOf('Intro'), 'i');
  assert.equal(hotkeyOf('Final'), 'f');
  assert.equal(hotkeyOf('Letra'), null);
});

test('abbrOf dá a sigla usada nos arranjos', () => {
  assert.equal(abbrOf('Verso 2'), 'V2');
  assert.equal(abbrOf('Verso'), 'V1');
  assert.equal(abbrOf('Refrão'), 'C');
  assert.equal(abbrOf('Refrão 2'), 'C2');
  assert.equal(abbrOf('Pré-Refrão'), 'PC');
  assert.equal(abbrOf('Ponte'), 'P');
  assert.equal(abbrOf('Intro'), 'I');
  assert.equal(abbrOf('Final'), 'F');
  assert.equal(abbrOf('Tag'), 'Tag');
});

test('matchesToken aceita o nome inteiro ou a sigla (com sinônimos)', () => {
  assert.equal(matchesToken('Verso 1', 'verso 1'), true);
  assert.equal(matchesToken('Verso 1', 'V1'), true);
  assert.equal(matchesToken('Verso 1', 'v'), true);
  assert.equal(matchesToken('Verso', 'V1'), true);
  assert.equal(matchesToken('Verso 2', 'V1'), false);
  assert.equal(matchesToken('Verso 2', 'V'), false);
  assert.equal(matchesToken('Refrão', 'C'), true);
  assert.equal(matchesToken('Refrão', 'R'), true);
  assert.equal(matchesToken('Refrão', 'refrao'), true);
  assert.equal(matchesToken('Refrão 2', 'C2'), true);
  assert.equal(matchesToken('Refrão 2', 'C'), false);
  assert.equal(matchesToken('Pré-Refrão', 'PC'), true);
  assert.equal(matchesToken('Pré-Refrão', 'PR'), true);
  assert.equal(matchesToken('Ponte', 'P'), true);
  assert.equal(matchesToken('Ponte', 'B'), true);
  assert.equal(matchesToken('Final', 'F'), true);
  assert.equal(matchesToken('Tag', 'tag'), true);
  assert.equal(matchesToken('Tag', 'T'), false);
  assert.equal(matchesToken('Refrão', ''), false);
});

test('parseOrder separa por espaço, ou por vírgula quando há nomes com espaço', () => {
  assert.deepEqual(parseOrder('V1 C V2  C P C'), ['V1', 'C', 'V2', 'C', 'P', 'C']);
  assert.deepEqual(parseOrder('Verso 1, Refrão ,Verso 2,,Refrão'), ['Verso 1', 'Refrão', 'Verso 2', 'Refrão']);
  assert.deepEqual(parseOrder(''), []);
  assert.deepEqual(parseOrder(null), []);
  assert.deepEqual(parseOrder(['V1', ' C ', '', 5]), ['V1', 'C']);
});

test('parseOrder limita a quantidade e o tamanho dos itens', () => {
  assert.equal(parseOrder(Array(100).fill('C').join(' ')).length, 60);
  assert.deepEqual(parseOrder(`V1 ${'x'.repeat(41)}`), ['V1']);
});

test('formatOrder volta ao texto do campo', () => {
  assert.equal(formatOrder(['V1', 'C', 'V2']), 'V1 C V2');
  assert.equal(formatOrder(['Verso 1', 'Refrão']), 'Verso 1, Refrão');
});

const SLIDES = [
  { label: 'Verso 1', text: 'a' }, { label: 'Verso 1', text: 'b' },
  { label: 'Refrão', text: 'c' }, { label: 'Refrão', text: 'd' },
  { label: 'Verso 2', text: 'e' },
  { label: 'Refrão', text: 'c' }, { label: 'Refrão', text: 'd' },
  { label: 'Ponte', text: 'f' },
];

test('groupStarts marca onde cada seção começa, com atalho, sigla e tipo', () => {
  const starts = groupStarts(SLIDES);
  assert.deepEqual(starts.map((g) => g.index), [0, 2, 4, 5, 7]);
  assert.deepEqual(starts.map((g) => g.hotkey), ['1', 'c', '2', 'c', 'p']);
  assert.deepEqual(starts.map((g) => g.abbr), ['V1', 'C', 'V2', 'C', 'P']);
  assert.equal(starts[1].kind, 'chorus');
  assert.deepEqual(groupStarts([]), []);
});

test('findGroupStart vai para a próxima ocorrência depois do slide ao vivo e volta à primeira no fim', () => {
  assert.equal(findGroupStart(SLIDES, 'c', -1), 2);
  assert.equal(findGroupStart(SLIDES, 'c', 2), 5);
  assert.equal(findGroupStart(SLIDES, 'c', 4), 5);
  assert.equal(findGroupStart(SLIDES, 'c', 6), 2);
  assert.equal(findGroupStart(SLIDES, '2', 0), 4);
  assert.equal(findGroupStart(SLIDES, 'C', 0), 2);
  assert.equal(findGroupStart(SLIDES, 'i', 0), -1);
});

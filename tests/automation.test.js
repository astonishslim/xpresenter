const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EVENTS, INPUT_COMMANDS, sanitizeSettings, eventsBetween, commandFor, nextAutoIndex,
} = require('../src/core/automation');
const { initialState, reduce } = require('../src/core/state');

const slide = (text, key, title = 'Hino') => ({ text, key, title, label: 'Verso' });

test('sanitizeSettings: entrada OSC desligada e só local por padrão; regras validadas', () => {
  assert.deepEqual(sanitizeSettings(null), { oscIn: { enabled: false, port: 8000, allowNetwork: false }, rules: [] });
  const s = sanitizeSettings({
    oscIn: { enabled: true, port: 70000, allowNetwork: 'sim' },
    rules: [
      { event: 'slide', host: '192.168.0.20', port: 7700, address: '/luz/go', args: '1' },
      { event: 'nada', host: 'x', port: 1, address: '/a' },
      { event: 'blackoutOn', host: 'mesa.local', port: 9000, address: 'sem-barra' },
      { event: 'clear', host: 'a b', port: 9000, address: '/a' },
      { event: 'clear', host: 'mesa.local', port: 0, address: '/a' },
      { event: 'item', host: 'mesa.local', port: 53000, address: '/cue/{x}/go', args: 'x'.repeat(300) },
    ],
  });
  assert.deepEqual(s.oscIn, { enabled: true, port: 8000, allowNetwork: false });
  assert.deepEqual(s.rules.map((r) => r.event), ['slide']);
});

test('eventsBetween: slide, item novo, tela preta, limpar e mídia', () => {
  const s0 = initialState();
  const s1 = reduce(s0, { type: 'showSlide', slide: slide('a', 'k1:0') });
  assert.deepEqual(eventsBetween(s0, s1).map((e) => e.type), ['slide', 'item']);
  const s2 = reduce(s1, { type: 'showSlide', slide: slide('b', 'k1:1') });
  assert.deepEqual(eventsBetween(s1, s2).map((e) => e.type), ['slide']);
  const s3 = reduce(s2, { type: 'showSlide', slide: slide('c', 'k2:0', 'Outro') });
  assert.deepEqual(eventsBetween(s2, s3).map((e) => e.type), ['slide', 'item']);
  const s4 = reduce(s3, { type: 'blackout' });
  assert.deepEqual(eventsBetween(s3, s4).map((e) => e.type), ['blackoutOn']);
  assert.deepEqual(eventsBetween(s4, reduce(s4, { type: 'blackout' })).map((e) => e.type), ['blackoutOff']);
  const s5 = reduce(s3, { type: 'clear' });
  assert.deepEqual(eventsBetween(s3, s5).map((e) => e.type), ['clear']);
  const s6 = reduce(s5, { type: 'showMedia', media: { kind: 'video', value: 'file:///C:/v.mp4' } });
  assert.deepEqual(eventsBetween(s5, s6).map((e) => e.type), ['media']);
  assert.deepEqual(eventsBetween(s6, s6), []);
  EVENTS.forEach((e) => assert.equal(typeof e, 'string'));
});

test('commandFor: só endereços da lista; ações de estado ou de navegação do operador', () => {
  assert.deepEqual(commandFor('/apresentador/next'), { kind: 'operator', command: 'next' });
  assert.deepEqual(commandFor('/apresentador/prev'), { kind: 'operator', command: 'prev' });
  assert.deepEqual(commandFor('/apresentador/black'), { kind: 'action', action: { type: 'blackout' } });
  assert.deepEqual(commandFor('/apresentador/lyrics'), { kind: 'action', action: { type: 'toggleLayer', layer: 'content' } });
  assert.deepEqual(commandFor('/apresentador/timer/toggle'), { kind: 'action', action: { type: 'timerToggle' } });
  assert.equal(commandFor('/apresentador/setBackground'), null);
  assert.deepEqual(commandFor('/xpresenter/next'), { kind: 'operator', command: 'next' });
  assert.deepEqual(commandFor('/xpresenter/black'), { kind: 'action', action: { type: 'blackout' } });
  assert.equal(commandFor('/xpresenter/setBackground'), null);
  assert.equal(commandFor('/xpresenterx/next'), null);
  assert.equal(commandFor('/outra/coisa'), null);
  assert.ok(INPUT_COMMANDS.length >= 8);
});

test('nextAutoIndex: avança, para no fim ou volta ao começo em loop', () => {
  assert.equal(nextAutoIndex(0, 3, false), 1);
  assert.equal(nextAutoIndex(2, 3, false), -1);
  assert.equal(nextAutoIndex(2, 3, true), 0);
  assert.equal(nextAutoIndex(-1, 3, false), 0, 'nada ao vivo: começa do primeiro');
  assert.equal(nextAutoIndex(0, 0, true), -1);
});

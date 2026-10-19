const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createUsageLog, createUsageTracker, toCsv, dateOf, isValidDate } = require('../src/core/usageLog');
const { initialState, reduce } = require('../src/core/state');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'uso-')), 'usage.jsonl');
const at = (y, mo, d, h = 10, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const song = { songId: 's1', title: 'Grande é o Senhor', author: 'Fulano', ccli: '1234567' };

test('dateOf dá a data local AAAA-MM-DD e isValidDate confere o formato', () => {
  assert.equal(dateOf(at(2026, 10, 5)), '2026-10-05');
  assert.equal(isValidDate('2026-10-05'), true);
  assert.equal(isValidDate('2026-13-05'), false);
  assert.equal(isValidDate('05/10/2026'), false);
  assert.equal(isValidDate(20261005), false);
});

test('record grava a música com data e hora, e conta uma vez por música por dia', () => {
  const log = createUsageLog(tmpFile(), { now: () => at(2026, 10, 18, 9, 30) });
  assert.equal(log.record(song), true);
  assert.equal(log.record(song), false);
  assert.equal(log.record({ ...song, songId: 's2', title: 'Outra' }), true);
  const [first] = log.list();
  assert.deepEqual({ date: first.date, time: first.time, title: first.title, author: first.author, ccli: first.ccli },
    { date: '2026-10-18', time: '09:30', title: 'Grande é o Senhor', author: 'Fulano', ccli: '1234567' });
  assert.equal(log.list().length, 2);
});

test('no dia seguinte a mesma música conta de novo', () => {
  let t = at(2026, 10, 18);
  const log = createUsageLog(tmpFile(), { now: () => t });
  log.record(song);
  t = at(2026, 10, 19);
  assert.equal(log.record(song), true);
  assert.equal(log.list().length, 2);
});

test('persiste em disco, mantém a regra do dia ao reabrir e ignora linhas quebradas', () => {
  const file = tmpFile();
  const now = () => at(2026, 10, 18);
  createUsageLog(file, { now }).record(song);
  fs.appendFileSync(file, 'lixo que não é json\n{"x":1}\n');
  const again = createUsageLog(file, { now });
  assert.equal(again.list().length, 1);
  assert.equal(again.record(song), false);
});

test('list filtra por período (inclusive) e ignora limite inválido', () => {
  let t = at(2026, 10, 4);
  const log = createUsageLog(tmpFile(), { now: () => t });
  log.record(song);
  t = at(2026, 10, 11); log.record(song);
  t = at(2026, 10, 18); log.record(song);
  assert.deepEqual(log.list({ from: '2026-10-11', to: '2026-10-18' }).map((e) => e.date), ['2026-10-11', '2026-10-18']);
  assert.deepEqual(log.list({ to: '2026-10-04' }).map((e) => e.date), ['2026-10-04']);
  assert.equal(log.list({ from: 'ontem', to: 42 }).length, 3);
});

test('record corta campos longos e descarta CCLI que não é número', () => {
  const log = createUsageLog(tmpFile(), { now: () => at(2026, 10, 18) });
  log.record({ songId: 'a', title: 'x'.repeat(500), author: 'y'.repeat(500), ccli: 'abc' });
  const [entry] = log.list();
  assert.equal(entry.title.length, 120);
  assert.equal(entry.author.length, 80);
  assert.equal(entry.ccli, '');
});

test('record recusa música sem id ou sem título', () => {
  const log = createUsageLog(tmpFile(), { now: () => at(2026, 10, 18) });
  assert.equal(log.record({ title: 'x' }), false);
  assert.equal(log.record({ songId: 'a', title: '  ' }), false);
  assert.equal(log.record(null), false);
});

test('toCsv: BOM, cabeçalho em português, separador ; e quebra de linha do Windows', () => {
  const csv = toCsv([{ date: '2026-10-18', time: '09:30', title: 'Hino', author: 'Ana', ccli: '123' }]);
  assert.equal(csv, '﻿Data;Hora;Título;Autor;CCLI\r\n2026-10-18;09:30;Hino;Ana;123\r\n');
  assert.equal(toCsv([]), '﻿Data;Hora;Título;Autor;CCLI\r\n');
});

test('toCsv protege aspas, ponto e vírgula e fórmulas de planilha', () => {
  const csv = toCsv([{ date: '2026-10-18', time: '09:30', title: 'Ele disse "oi"; e foi', author: '=SOMA(A1)', ccli: '' }]);
  assert.match(csv, /;"Ele disse ""oi""; e foi";'=SOMA\(A1\);/);
  const plus = toCsv([{ date: 'd', time: 't', title: '+1', author: '@x', ccli: '' }]);
  assert.match(plus, /;'\+1;'@x;/);
});

function trackerFor(resolve) {
  const log = createUsageLog(tmpFile(), { now: () => at(2026, 10, 18) });
  const tracker = createUsageTracker({ log, resolveSong: resolve });
  return { log, tracker };
}
const live = (key) => reduce(initialState(), { type: 'showSlide', slide: { label: 'V', text: 'x', key } });

test('tracker registra a música quando o item entra ao vivo, e não de novo a cada slide', () => {
  const { log, tracker } = trackerFor((id) => (id === 'item-1' ? song : null));
  tracker.observe(live('item-1:0'));
  tracker.observe(live('item-1:1'));
  tracker.observe(live('item-1:2'));
  assert.equal(log.list().length, 1);
});

test('tracker ignora o que não é música, estado sem slide e chave inválida', () => {
  const { log, tracker } = trackerFor((id) => (id === 'item-1' ? song : null));
  tracker.observe(live('versiculo-1:0'));
  tracker.observe(initialState());
  tracker.observe(live(undefined));
  assert.equal(log.list().length, 0);
});

test('tracker: voltar a um item depois de outro conta pela regra do dia', () => {
  const { log, tracker } = trackerFor((id) => ({ songId: id, title: id, author: '', ccli: '' }));
  tracker.observe(live('a:0'));
  tracker.observe(live('b:0'));
  tracker.observe(live('a:0'));
  assert.equal(log.list().length, 2);
});

test('tracker não derruba o estado ao vivo se o resolvedor ou o disco falharem', () => {
  const log = { record: () => { throw new Error('disco cheio'); } };
  const origError = console.error;
  console.error = () => {};
  const tracker = createUsageTracker({ log, resolveSong: () => song });
  assert.doesNotThrow(() => tracker.observe(live('a:0')));
  const broken = createUsageTracker({ log: createUsageLog(tmpFile()), resolveSong: () => { throw new Error('x'); } });
  assert.doesNotThrow(() => broken.observe(live('b:0')));
  console.error = origError;
});

test('autor e CCLI cadastrados depois, no mesmo dia, completam o registro (sem duplicar)', () => {
  const file = tmpFile();
  const now = () => at(2026, 10, 18);
  const log = createUsageLog(file, { now });
  log.record({ songId: 's1', title: 'Hino', author: '', ccli: '' });
  assert.equal(log.record({ songId: 's1', title: 'Hino', author: 'Ana', ccli: '999' }), false);
  assert.equal(log.list().length, 1);
  assert.deepEqual([log.list()[0].author, log.list()[0].ccli], ['Ana', '999']);
  const again = createUsageLog(file, { now });
  assert.equal(again.list().length, 1);
  assert.deepEqual([again.list()[0].author, again.list()[0].ccli], ['Ana', '999']);
});

test('o registro do dia nunca perde um dado já preenchido (vazio não apaga)', () => {
  const log = createUsageLog(tmpFile(), { now: () => at(2026, 10, 18) });
  log.record({ songId: 's1', title: 'Hino', author: 'Ana', ccli: '999' });
  log.record({ songId: 's1', title: 'Hino', author: '', ccli: '' });
  assert.deepEqual([log.list()[0].author, log.list()[0].ccli], ['Ana', '999']);
});

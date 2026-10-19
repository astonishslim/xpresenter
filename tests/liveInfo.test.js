const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { timerValueMs, formatTimer, fillTemplate, isTimerInUse } = require('../src/renderer/shared/liveInfo');

const countdown = (over = {}) => ({ mode: 'countdown', setMs: 300000, baseMs: 300000, startedAt: null, visible: false, ...over });

test('timerValueMs: parado devolve a base; rodando desconta (regressiva) ou soma (cronômetro)', () => {
  assert.equal(timerValueMs(countdown(), 999), 300000);
  assert.equal(timerValueMs(countdown({ startedAt: 1000 }), 61000), 240000);
  assert.equal(timerValueMs({ mode: 'stopwatch', setMs: 0, baseMs: 5000, startedAt: 1000 }, 3000), 7000);
  assert.equal(timerValueMs(null, 0), 0);
});

test('formatTimer: mm:ss, h:mm:ss e estouro negativo', () => {
  assert.equal(formatTimer(0), '00:00');
  assert.equal(formatTimer(65000), '01:05');
  assert.equal(formatTimer(64001), '01:05', 'arredonda para cima na regressiva (não mostra 00:00 antes da hora)');
  assert.equal(formatTimer(3723000), '1:02:03');
  assert.equal(formatTimer(-15000), '-00:15');
  assert.equal(formatTimer(Number.NaN), '00:00');
});

test('isTimerInUse: só quando rodando ou pausado no meio', () => {
  assert.equal(isTimerInUse(countdown()), false);
  assert.equal(isTimerInUse(countdown({ startedAt: 5 })), true);
  assert.equal(isTimerInUse(countdown({ baseMs: 1000 })), true);
  assert.equal(isTimerInUse({ mode: 'stopwatch', setMs: 0, baseMs: 0, startedAt: null }), false);
  assert.equal(isTimerInUse(undefined), false);
});

test('fillTemplate troca variáveis e limpa separadores que sobram', () => {
  const vars = { titulo: 'Grandes Coisas', rotulo: 'Refrão', hora: '19:05', data: '18/10', cronometro: '04:59' };
  assert.equal(fillTemplate('{titulo} · {rotulo}', vars), 'Grandes Coisas · Refrão');
  assert.equal(fillTemplate('{titulo} · {hora}', { ...vars, titulo: '' }), '19:05');
  assert.equal(fillTemplate('{titulo} - {rotulo} | {hora}', { hora: '19:05' }), '19:05');
  assert.equal(fillTemplate('Faltam {cronometro}', vars), 'Faltam 04:59');
  assert.equal(fillTemplate('{desconhecida} {hora}', vars), '{desconhecida} 19:05', 'variável desconhecida fica como texto');
  assert.equal(fillTemplate('', vars), '');
  assert.equal(fillTemplate(null, vars), '');
});

test('fillTemplate é rápido mesmo com valores enormes (trunca cada variável)', () => {
  const start = Date.now();
  const out = fillTemplate('{titulo} · {hora}', { titulo: `${' '.repeat(60000)}a`, hora: '-'.repeat(60000) });
  assert.ok(Date.now() - start < 100, `levou ${Date.now() - start} ms`);
  assert.ok(out.length <= 420);
});

test('a cópia de liveInfo.js do remoto é idêntica à compartilhada', () => {
  const root = path.join(__dirname, '..', 'src');
  assert.equal(
    fs.readFileSync(path.join(root, 'remote', 'liveInfo.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'renderer', 'shared', 'liveInfo.js'), 'utf8'),
  );
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { STEP_TYPES } = require('../src/renderer/shared/macroSteps');
const { sanitizeStep, sanitizeMacro, createMacroLibrary, createMacroRunner } = require('../src/core/macros');
const { createStore } = require('../src/core/store');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'macros-')), 'macros.json');

test('todo passo tem rótulo e um tipo de valor conhecido', () => {
  for (const [key, def] of Object.entries(STEP_TYPES)) {
    assert.ok(def.label, key);
    assert.ok([null, 'name', 'minutes', 'time'].includes(def.value), key);
    if (def.value === 'name') assert.ok(['themes', 'props', 'messages'].includes(def.source), key);
  }
});

test('sanitizeStep: valor conforme o tipo; o que não serve vira null', () => {
  assert.deepEqual(sanitizeStep({ do: 'theme', value: ' Culto ' }), { do: 'theme', value: 'Culto' });
  assert.deepEqual(sanitizeStep({ do: 'propsClear', value: 'sobra' }), { do: 'propsClear' });
  assert.deepEqual(sanitizeStep({ do: 'timerCountdown', value: 5 }), { do: 'timerCountdown', value: 5 });
  assert.deepEqual(sanitizeStep({ do: 'timerUntil', value: '19:00' }), { do: 'timerUntil', value: '19:00' });
  assert.equal(sanitizeStep({ do: 'theme' }), null);
  assert.equal(sanitizeStep({ do: 'theme', value: '  ' }), null);
  assert.equal(sanitizeStep({ do: 'theme', value: 'x'.repeat(41) }), null);
  assert.equal(sanitizeStep({ do: 'theme', value: 7 }), null);
  assert.equal(sanitizeStep({ do: 'timerCountdown', value: 1441 }), null);
  assert.equal(sanitizeStep({ do: 'timerCountdown', value: 2.5 }), null);
  assert.equal(sanitizeStep({ do: 'timerCountdown', value: '5' }), null);
  assert.equal(sanitizeStep({ do: 'timerUntil', value: '25:00' }), null);
  assert.equal(sanitizeStep({ do: 'apagarTudo' }), null);
  assert.equal(sanitizeStep({ do: 'toString' }), null);
  assert.equal(sanitizeStep('theme'), null);
  assert.equal(sanitizeStep(null), null);
});

test('sanitizeMacro: nome obrigatório, passos inválidos saem, pelo menos um passo, até 20', () => {
  const m = sanitizeMacro({ id: 'm1', name: ' Início ', steps: [{ do: 'clear' }, { do: 'nada' }, { do: 'coverOff' }] });
  assert.deepEqual(m, { id: 'm1', name: 'Início', steps: [{ do: 'clear' }, { do: 'coverOff' }] });
  assert.ok(sanitizeMacro({ name: 'A', steps: [{ do: 'clear' }] }).id);
  assert.equal(sanitizeMacro({ name: '', steps: [{ do: 'clear' }] }), null);
  assert.equal(sanitizeMacro({ name: 'x'.repeat(41), steps: [{ do: 'clear' }] }), null);
  assert.equal(sanitizeMacro({ name: 'A', steps: [{ do: 'nada' }] }), null);
  assert.equal(sanitizeMacro({ name: 'A', steps: 'clear' }), null);
  assert.equal(sanitizeMacro({ name: 'A', steps: Array(30).fill({ do: 'clear' }) }).steps.length, 20);
  assert.equal(sanitizeMacro(null), null);
});

test('biblioteca nova vem com exemplos; arquivo existente é respeitado; save/remove persistem', () => {
  const file = tmpFile();
  const lib = createMacroLibrary(file);
  assert.ok(lib.list().length >= 2);
  fs.writeFileSync(file, '[]');
  const empty = createMacroLibrary(file);
  assert.deepEqual(empty.list(), []);
  const saved = empty.save({ name: 'Zerar', steps: [{ do: 'clear' }] });
  assert.equal(saved.ok, true);
  assert.equal(createMacroLibrary(file).list()[0].name, 'Zerar');
  assert.equal(empty.get(saved.macros[0].id).name, 'Zerar');
  assert.equal(empty.save({ name: 'zerar', steps: [{ do: 'clear' }] }).ok, false);
  assert.match(empty.save({ name: '', steps: [] }).reason, /nome|passo/i);
  empty.remove(saved.macros[0].id);
  assert.deepEqual(empty.list(), []);
});

test('macros.json com lixo, id ou nome repetido não derruba', () => {
  const file = tmpFile();
  const origError = console.error;
  console.error = () => {};
  fs.writeFileSync(file, '{nao e json');
  assert.deepEqual(createMacroLibrary(file).list(), []);
  const ok = { id: 'a', name: 'A', steps: [{ do: 'clear' }] };
  fs.writeFileSync(file, JSON.stringify([ok, { ...ok, name: 'B' }, { id: 'c', name: 'a', steps: [{ do: 'clear' }] }, 'lixo']));
  assert.deepEqual(createMacroLibrary(file).list().map((m) => m.name), ['A']);
  console.error = origError;
});

// ---------- Execução ----------
const logo = { id: 'p1', name: 'Logo', kind: 'image', value: pathToFileURL(__filename).href, position: 'top-right', size: 20 };
const gone = { id: 'p2', name: 'Sumiu', kind: 'image', value: pathToFileURL(path.join(os.tmpdir(), 'xp-nao-existe-9876.png')).href, position: 'top-left', size: 20 };
const welcome = { id: 'p3', name: 'Boas-vindas', kind: 'text', value: 'Bem-vindo!', position: 'lower-third', size: 30 };

function setup(extra = {}) {
  let clock = 0;
  const store = createStore(undefined, { now: () => clock });
  const calls = [];
  const props = [logo, gone, welcome];
  const themes = { Culto: [{ type: 'setBackground', background: { kind: 'color', value: '#112233' } }, { type: 'setTextStyle', style: { uppercase: true } }] };
  const templates = { Berçário: { text: 'Pais, compareçam', seconds: 30, target: 'screen' } };
  const runner = createMacroRunner({
    dispatch: store.dispatch,
    getState: store.getState,
    now: () => 5000,
    themeActions: (name) => themes[name] || null,
    getProp: (name) => props.find((p) => p.name.toLowerCase() === String(name).toLowerCase()) || null,
    getMessage: (name) => templates[name] || null,
    messages: {
      show: (template, values) => { calls.push(['show', template.text, values]); return { ok: true, text: template.text }; },
      clear: () => calls.push(['clear']),
    },
    ...extra,
  });
  const run = (...steps) => runner.run({ id: 'm', name: 'Teste', steps });
  return { store, runner, run, calls, at: (ms) => { clock = ms; } };
}
const state = (ctx) => ctx.store.getState();

test('tema: aplica fundo e estilo do tema; tema que não existe é relatado', () => {
  const ctx = setup();
  const ok = ctx.run({ do: 'theme', value: 'Culto' });
  assert.equal(ok.ok, true);
  assert.equal(state(ctx).layers.background.value, '#112233');
  assert.equal(state(ctx).textStyle.uppercase, true);
  const bad = ctx.run({ do: 'theme', value: 'Fantasma' });
  assert.equal(bad.ok, false);
  assert.match(bad.results[0].reason, /Tema não encontrado: Fantasma/);
});

test('props: ligar, desligar e desligar todos; nome sem prop e imagem que sumiu são relatados', () => {
  const ctx = setup();
  assert.equal(ctx.run({ do: 'propOn', value: 'logo' }, { do: 'propOn', value: 'Boas-vindas' }).ok, true);
  assert.deepEqual(state(ctx).layers.props.items.map((i) => i.id), ['p1', 'p3']);
  ctx.run({ do: 'propOff', value: 'Logo' });
  assert.deepEqual(state(ctx).layers.props.items.map((i) => i.id), ['p3']);
  ctx.run({ do: 'propsClear' });
  assert.deepEqual(state(ctx).layers.props.items, []);
  assert.match(ctx.run({ do: 'propOn', value: 'Nada' }).results[0].reason, /Prop não encontrado: Nada/);
  const missing = ctx.run({ do: 'propOn', value: 'Sumiu' });
  assert.equal(missing.ok, false);
  assert.match(missing.results[0].reason, /não encontrado/i);
  assert.deepEqual(state(ctx).layers.props.items, []);
});

test('mensagem: mostra o modelo (sem campos) e tira; modelo inexistente é relatado', () => {
  const ctx = setup();
  assert.equal(ctx.run({ do: 'message', value: 'Berçário' }).ok, true);
  assert.deepEqual(ctx.calls[0], ['show', 'Pais, compareçam', {}]);
  ctx.run({ do: 'messageClear' });
  assert.deepEqual(ctx.calls[1], ['clear']);
  assert.match(ctx.run({ do: 'message', value: 'Nada' }).results[0].reason, /Modelo de mensagem não encontrado: Nada/);
});

test('mensagem que o executor recusa (campos vazios) vira falha do passo', () => {
  const ctx = setup({ messages: { show: () => ({ ok: false, reason: 'A mensagem ficou vazia: preencha os campos.' }), clear() {} } });
  const res = ctx.run({ do: 'message', value: 'Berçário' });
  assert.equal(res.ok, false);
  assert.match(res.results[0].reason, /vazia/);
});

test('capa, tela preta e limpar: ligam/desligam sem inverter se já estão como pedido', () => {
  const ctx = setup();
  ctx.run({ do: 'coverOn' }, { do: 'coverOn' }, { do: 'blackOn' }, { do: 'blackOn' });
  assert.equal(state(ctx).layers.cover.visible, true);
  assert.equal(state(ctx).blackout, true);
  ctx.run({ do: 'coverOff' }, { do: 'coverOff' }, { do: 'blackOff' });
  assert.equal(state(ctx).layers.cover.visible, false);
  assert.equal(state(ctx).blackout, false);
  ctx.store.dispatch({ type: 'showSlide', slide: { label: 'V', text: 'a' } });
  ctx.run({ do: 'clear' });
  assert.equal(state(ctx).layers.content.slide, null);
});

test('cronômetro: regressiva, até o horário, iniciar/pausar sem inverter, zerar, mostrar/esconder', () => {
  const ctx = setup();
  ctx.run({ do: 'timerCountdown', value: 10 });
  assert.equal(state(ctx).timer.mode, 'countdown');
  assert.equal(state(ctx).timer.setMs, 600000);
  ctx.run({ do: 'timerStart' }, { do: 'timerStart' });
  assert.equal(state(ctx).timer.startedAt, 5000, 'iniciar duas vezes não pausa; carimba o horário');
  ctx.run({ do: 'timerPause' }, { do: 'timerPause' });
  assert.equal(state(ctx).timer.startedAt, null);
  ctx.run({ do: 'timerReset' });
  assert.equal(state(ctx).timer.baseMs, 600000);
  ctx.run({ do: 'timerShow' }, { do: 'timerShow' });
  assert.equal(state(ctx).timer.visible, true);
  ctx.run({ do: 'timerHide' }, { do: 'timerHide' });
  assert.equal(state(ctx).timer.visible, false);
  ctx.run({ do: 'timerUntil', value: '19:00' });
  assert.equal(state(ctx).timer.mode, 'until');
  assert.equal(ctx.run({ do: 'timerStart' }).ok, true, 'iniciar no modo "até o horário" não é erro (já está contando)');
});

test('um passo que falha não impede os outros; o relatório diz quais falharam', () => {
  const ctx = setup();
  const res = ctx.run({ do: 'theme', value: 'Fantasma' }, { do: 'coverOn' }, { do: 'propOn', value: 'Nada' }, { do: 'blackOn' });
  assert.equal(res.ok, false);
  assert.deepEqual(res.results.map((r) => r.ok), [false, true, false, true]);
  assert.equal(state(ctx).layers.cover.visible, true);
  assert.equal(state(ctx).blackout, true);
});

test('o macro inteiro é um passo só no desfazer', () => {
  const ctx = setup();
  ctx.at(1000);
  ctx.store.dispatch({ type: 'showSlide', slide: { label: 'V', text: 'a' } });
  ctx.at(5000);
  ctx.run({ do: 'theme', value: 'Culto' }, { do: 'coverOn' }, { do: 'clear' });
  assert.equal(state(ctx).layers.cover.visible, true);
  ctx.store.undo();
  assert.equal(state(ctx).layers.cover.visible, false);
  assert.equal(state(ctx).layers.content.slide.text, 'a');
  assert.equal(state(ctx).layers.background.value, '#000000');
});

test('run recusa macro inválido ou sem passos', () => {
  const ctx = setup();
  assert.equal(ctx.runner.run(null).ok, false);
  assert.equal(ctx.runner.run({ name: 'x', steps: [] }).ok, false);
  assert.equal(ctx.runner.run({ name: 'x', steps: [{ do: 'apagarTudo' }] }).ok, false);
});

test('save recusa macro com passo inválido (em vez de salvar sem ele) e diz qual é', () => {
  const lib = createMacroLibrary(tmpFile());
  const bad = lib.save({ name: 'X', steps: [{ do: 'clear' }, { do: 'theme', value: '' }, { do: 'coverOn' }] });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /Passo 2/);
  assert.equal(lib.save({ name: 'X', steps: [{ do: 'timerUntil', value: '' }] }).ok, false);
  assert.equal(lib.save({ name: 'X', steps: Array(21).fill({ do: 'clear' }) }).ok, false);
  assert.equal(lib.save({ name: 'X', steps: Array(20).fill({ do: 'clear' }) }).ok, true);
});

test('macros.json com passo inválido: avisa no log o que descartou', () => {
  const file = tmpFile();
  fs.writeFileSync(file, JSON.stringify([{ id: 'a', name: 'Culto', steps: [{ do: 'clear' }, { do: 'apagarTudo' }] }]));
  const logged = [];
  const origError = console.error;
  console.error = (m) => logged.push(m);
  const lib = createMacroLibrary(file);
  console.error = origError;
  assert.equal(lib.list()[0].steps.length, 1);
  assert.match(logged.join(' '), /Culto/);
});

test('arquivo corrompido vai para .bak antes de ser regravado (não se perde o que estava lá)', () => {
  const file = tmpFile();
  const origError = console.error;
  console.error = () => {};
  fs.writeFileSync(file, '{texto editado a mao, sem fechar');
  createMacroLibrary(file);
  console.error = origError;
  assert.equal(fs.readFileSync(`${file}.bak`, 'utf8'), '{texto editado a mao, sem fechar');
});

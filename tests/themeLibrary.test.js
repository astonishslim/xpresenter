const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createThemeLibrary, MAX_THEMES, validateThemeName, persistCurrentLook } = require('../src/core/themeLibrary');
const { DEFAULT_TEXT_STYLE } = require('../src/core/textStyle');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'apres-tema-')), 'themes.json');
}

const look = (color = '#112233', size = 120) => ({
  background: { kind: 'color', value: color },
  style: { ...DEFAULT_TEXT_STYLE, size },
});

test('biblioteca de temas nova: sem temas e visual atual padrão', () => {
  const lib = createThemeLibrary(tmpFile());
  assert.deepEqual(lib.list(), []);
  assert.deepEqual(lib.getCurrent(), { background: { kind: 'color', value: '#000000' }, style: DEFAULT_TEXT_STYLE });
});

test('save guarda fundo e estilo com nome e persiste em disco', () => {
  const file = tmpFile();
  createThemeLibrary(file).save('Culto da noite', look());
  const [theme] = createThemeLibrary(file).list();
  assert.equal(theme.name, 'Culto da noite');
  assert.deepEqual(theme.background, { kind: 'color', value: '#112233' });
  assert.equal(theme.style.size, 120);
});

test('save com o mesmo nome (sem diferenciar maiúsculas) substitui e mantém o nome original', () => {
  const lib = createThemeLibrary(tmpFile());
  lib.save('Natal', look('#aa0000'));
  lib.save('NATAL', look('#00aa00'));
  assert.equal(lib.list().length, 1);
  assert.equal(lib.list()[0].name, 'Natal');
  assert.equal(lib.list()[0].background.value, '#00aa00');
});

test('save rejeita nome vazio, longo demais, fundo inválido e acima do limite', () => {
  const lib = createThemeLibrary(tmpFile());
  assert.throws(() => lib.save('  ', look()), /nome/i);
  assert.throws(() => lib.save('x'.repeat(41), look()), /40/);
  assert.throws(() => lib.save('Ruim', { background: { kind: 'image', value: 'http://x/y.png' }, style: DEFAULT_TEXT_STYLE }), /fundo/i);
  for (let i = 0; i < MAX_THEMES; i += 1) lib.save(`T${i}`, look());
  assert.throws(() => lib.save('Mais um', look()), /limite/i);
  lib.save('T0', look('#ffffff')); // substituir continua permitido no limite
});

test('save normaliza o estilo (campos inválidos voltam ao padrão)', () => {
  const lib = createThemeLibrary(tmpFile());
  lib.save('Estranho', { background: { kind: 'color', value: '#000000' }, style: { font: 'x', color: '#abcdef' } });
  const [t] = lib.list();
  assert.equal(t.style.font, DEFAULT_TEXT_STYLE.font);
  assert.equal(t.style.color, '#abcdef');
});

test('get encontra pelo nome sem diferenciar maiúsculas; remove apaga', () => {
  const lib = createThemeLibrary(tmpFile());
  lib.save('Jovens', look());
  assert.equal(lib.get('jovens').name, 'Jovens');
  assert.equal(lib.get('outro'), null);
  lib.remove('JOVENS');
  assert.deepEqual(lib.list(), []);
});

test('setCurrent persiste o visual atual e ignora fundo inválido', () => {
  const file = tmpFile();
  const lib = createThemeLibrary(file);
  lib.setCurrent(look('#334455', 90));
  assert.deepEqual(createThemeLibrary(file).getCurrent(), look('#334455', 90));
  lib.setCurrent({ background: { kind: 'video', value: 'file://servidor/x.mp4' }, style: DEFAULT_TEXT_STYLE });
  assert.equal(createThemeLibrary(file).getCurrent().background.value, '#334455');
});

test('arquivo corrompido ou com temas inválidos não derruba', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{nao json');
  assert.deepEqual(createThemeLibrary(file).list(), []);
  fs.writeFileSync(file, JSON.stringify({
    themes: [{ name: 'Bom', background: { kind: 'color', value: '#000000' }, style: {} }, { name: '', background: {} }, 'x'],
    current: { background: { kind: 'color', value: 'vermelho' } },
  }));
  const lib = createThemeLibrary(file);
  assert.deepEqual(lib.list().map((t) => t.name), ['Bom']);
  assert.equal(lib.getCurrent().background.value, '#000000');
});

test('list devolve cópias', () => {
  const lib = createThemeLibrary(tmpFile());
  lib.save('A', look());
  lib.list()[0].name = 'mutado';
  assert.equal(lib.list()[0].name, 'A');
});

test('persistCurrentLook grava só mudanças de fundo/estilo, com atraso, e flush grava na hora', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { createStore } = require('../src/core/store');
  const store = createStore();
  const saved = [];
  const flush = persistCurrentLook({ store, themes: { setCurrent: (l) => saved.push(l) }, delayMs: 100 });

  store.dispatch({ type: 'showSlide', slide: { text: 'x' } });
  t.mock.timers.tick(200);
  assert.equal(saved.length, 0, 'slide não é visual');

  store.dispatch({ type: 'setBackground', background: { kind: 'color', value: '#111111' } });
  store.dispatch({ type: 'setBackground', background: { kind: 'color', value: '#222222' } });
  t.mock.timers.tick(50);
  assert.equal(saved.length, 0);
  t.mock.timers.tick(100);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].background.value, '#222222');

  store.dispatch({ type: 'setTextStyle', style: { size: 60 } });
  flush();
  assert.equal(saved.length, 2);
  assert.equal(saved[1].style.size, 60);
  flush();
  assert.equal(saved.length, 2, 'flush sem pendência não grava');
});

test('persistCurrentLook não derruba se gravar falhar', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'error', () => {});
  const { createStore } = require('../src/core/store');
  const store = createStore();
  const flush = persistCurrentLook({ store, themes: { setCurrent: () => { throw new Error('disco cheio'); } } });
  store.dispatch({ type: 'setTextStyle', style: { shadow: false } });
  assert.doesNotThrow(flush);
  assert.equal(console.error.mock.callCount(), 1);
});

test('validateThemeName apara espaços e explica o erro', () => {
  assert.deepEqual(validateThemeName('  Páscoa  '), { ok: true, name: 'Páscoa' });
  assert.equal(validateThemeName('').ok, false);
  assert.equal(validateThemeName(42).ok, false);
});

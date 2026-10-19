const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { initialState, reduce, isValidAction } = require('../src/core/state');
const { createStore } = require('../src/core/store');
const { applyProfile } = require('../src/core/outputConfig');
const { missingFileOf } = require('../src/core/fileCheck');
const { createPropLibrary, sanitizeProp } = require('../src/core/propLibrary');

const logo = { id: 'p1', name: 'Logo', kind: 'image', value: 'file:///C:/igreja/logo.png', position: 'top-right', size: 20 };
const welcome = { id: 'p2', name: 'Boas-vindas', kind: 'text', value: 'Bem-vindo!', position: 'lower-third', size: 30 };
const itemsOf = (s) => s.layers.props.items;
const showing = (...props) => props.reduce((s, prop) => reduce(s, { type: 'showProp', prop }), initialState());

test('estado inicial tem a camada de props vazia', () => {
  assert.deepEqual(initialState().layers.props, { items: [] });
});

test('showProp liga o prop com só os campos de projeção (sem o nome)', () => {
  const s = showing(logo);
  assert.deepEqual(itemsOf(s), [{ id: 'p1', kind: 'image', value: 'file:///C:/igreja/logo.png', position: 'top-right', size: 20 }]);
});

test('showProp do mesmo id troca no lugar (editar o prop no ar não duplica nem muda a ordem)', () => {
  const s = reduce(showing(logo, welcome), { type: 'showProp', prop: { ...logo, position: 'top-left' } });
  assert.deepEqual(itemsOf(s).map((i) => [i.id, i.position]), [['p1', 'top-left'], ['p2', 'lower-third']]);
});

test('no máximo 6 props no ar: o mais antigo sai quando entra o sétimo', () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ ...welcome, id: `t${i}` }));
  const s = showing(...many);
  assert.deepEqual(itemsOf(s).map((i) => i.id), ['t1', 't2', 't3', 't4', 't5', 't6']);
});

test('hideProp tira um; clearProps tira todos; id que não está no ar não muda nada', () => {
  const s = showing(logo, welcome);
  assert.deepEqual(itemsOf(reduce(s, { type: 'hideProp', id: 'p1' })).map((i) => i.id), ['p2']);
  assert.deepEqual(itemsOf(reduce(s, { type: 'clearProps' })), []);
  assert.equal(reduce(s, { type: 'hideProp', id: 'nao-existe' }), s);
});

test('reduce não muta o estado ao ligar e desligar props', () => {
  const before = showing(logo);
  const snapshot = JSON.stringify(before);
  reduce(before, { type: 'showProp', prop: welcome });
  reduce(before, { type: 'hideProp', id: 'p1' });
  assert.equal(JSON.stringify(before), snapshot);
});

test('showProp só aceita prop bem formado (tipos, posição e tamanho fechados; imagem só local)', () => {
  const ok = (prop) => isValidAction({ type: 'showProp', prop });
  assert.equal(ok(logo), true);
  assert.equal(ok(welcome), true);
  assert.equal(ok({ ...logo, name: undefined }), true);
  assert.equal(ok({ ...logo, kind: 'html' }), false);
  assert.equal(ok({ ...logo, position: 'meio' }), false);
  assert.equal(ok({ ...logo, size: 15 }), false);
  assert.equal(ok({ ...logo, size: 70 }), false);
  assert.equal(ok({ ...logo, id: '' }), false);
  assert.equal(ok({ ...logo, id: 7 }), false);
  assert.equal(ok({ ...logo, value: 'http://x/y.png' }), false);
  assert.equal(ok({ ...logo, value: 'file://atacante/share/y.png' }), false);
  assert.equal(ok({ ...logo, value: 'file:///C:/a.png")' }), false);
  assert.equal(ok({ ...welcome, value: 'a'.repeat(81) }), false);
  assert.equal(ok({ ...welcome, value: 'linha\nquebrada' }), false);
  assert.equal(ok({ ...welcome, value: '' }), false);
  assert.equal(ok(null), false);
  assert.equal(isValidAction({ type: 'showProp' }), false);
  assert.equal(isValidAction({ type: 'hideProp', id: 'p1' }), true);
  assert.equal(isValidAction({ type: 'hideProp', id: 5 }), false);
  assert.equal(isValidAction({ type: 'clearProps' }), true);
});

test('desfazer não mexe nos props (como aviso e mensagem): ficam como estão', () => {
  let t = 0;
  const store = createStore(undefined, { now: () => t });
  t = 1000; store.dispatch({ type: 'showSlide', slide: { label: 'V', text: 'a' } });
  t = 2000; store.dispatch({ type: 'showSlide', slide: { label: 'V', text: 'b' } });
  t = 3000; store.dispatch({ type: 'showProp', prop: logo });
  store.undo();
  assert.equal(store.getState().layers.content.slide.text, 'a');
  assert.deepEqual(itemsOf(store.getState()).map((i) => i.id), ['p1']);
  assert.deepEqual(store.history(), { canUndo: true, canRedo: true }, 'ligar prop não apaga o refazer');
});

test('perfil "só letra" (laterais, banda) não mostra props; os outros perfis mostram', () => {
  const s = showing(logo);
  assert.deepEqual(itemsOf(applyProfile(s, 'lyrics')), []);
  assert.equal(applyProfile(s, 'full'), s);
  assert.deepEqual(itemsOf(applyProfile(s, 'background')).map((i) => i.id), ['p1']);
});

test('missingFileOf avisa quando a imagem do prop sumiu; texto e arquivo existente passam', () => {
  const gone = { type: 'showProp', prop: { ...logo, value: pathToFileURL(path.join(os.tmpdir(), 'xp-nao-existe-1234.png')).href } };
  assert.equal(missingFileOf(gone), gone.prop.value);
  assert.equal(missingFileOf({ type: 'showProp', prop: welcome }), null);
  assert.equal(missingFileOf({ type: 'showProp', prop: { ...logo, value: pathToFileURL(__filename).href } }), null);
});

// ---------- Biblioteca de props ----------
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'props-')), 'props.json');

test('sanitizeProp exige nome e valida o resto; completa o id', () => {
  const p = sanitizeProp({ name: ' Pix ', kind: 'text', value: 'Pix: igreja@x.com', position: 'bottom-left', size: 20 });
  assert.equal(p.name, 'Pix');
  assert.ok(p.id);
  assert.equal(sanitizeProp({ ...logo, name: '' }), null);
  assert.equal(sanitizeProp({ ...logo, name: 'x'.repeat(41) }), null);
  assert.equal(sanitizeProp({ ...logo, kind: 'video' }), null);
  assert.equal(sanitizeProp({ ...logo, value: 'http://a/b.png' }), null);
  assert.equal(sanitizeProp('lixo'), null);
  assert.deepEqual(sanitizeProp(logo), logo);
});

test('biblioteca nova começa vazia; save cria e atualiza pelo id e persiste', () => {
  const file = tmpFile();
  const lib = createPropLibrary(file);
  assert.deepEqual(lib.list(), []);
  const created = lib.save({ name: 'Logo', kind: 'image', value: 'file:///C:/l.png', position: 'top-right', size: 20 });
  assert.equal(created.ok, true);
  const id = created.props[0].id;
  lib.save({ ...created.props[0], position: 'top-left' });
  assert.equal(createPropLibrary(file).list()[0].position, 'top-left');
  assert.equal(lib.list().length, 1);
  assert.equal(lib.get(id).name, 'Logo');
  assert.equal(lib.findByName(' logo ').id, id);
  assert.equal(lib.findByName('nada'), null);
});

test('save recusa prop inválido e nome repetido em outro prop; remove apaga', () => {
  const lib = createPropLibrary(tmpFile());
  const first = lib.save(logo);
  assert.equal(lib.save({ ...logo, id: undefined, name: 'LOGO' }).ok, false);
  assert.match(lib.save({ ...logo, id: undefined, name: 'Outro', size: 15 }).reason, /prop/i);
  lib.remove(first.props[0].id);
  assert.deepEqual(lib.list(), []);
});

test('biblioteca limita a 30 props e ignora lixo e ids/nomes repetidos de um props.json editado à mão', () => {
  const file = tmpFile();
  const origError = console.error;
  console.error = () => {};
  fs.writeFileSync(file, '{nao e json');
  assert.deepEqual(createPropLibrary(file).list(), []);
  fs.writeFileSync(file, JSON.stringify([logo, { ...logo, name: 'Outro' }, { ...welcome, id: 'x', name: 'logo' }, 'lixo', { name: '' }]));
  assert.deepEqual(createPropLibrary(file).list().map((p) => p.name), ['Logo']);
  console.error = origError;
  const lib = createPropLibrary(tmpFile());
  for (let i = 0; i < 30; i += 1) lib.save({ ...welcome, id: undefined, name: `P${i}` });
  assert.equal(lib.save({ ...welcome, id: undefined, name: 'P30' }).ok, false);
  assert.equal(lib.list().length, 30);
});

test('props.json corrompido vai para .bak antes de ser regravado', () => {
  const file = tmpFile();
  const origError = console.error;
  console.error = () => {};
  fs.writeFileSync(file, '[{"name": "Logo", sem fechar');
  createPropLibrary(file);
  console.error = origError;
  assert.equal(fs.readFileSync(`${file}.bak`, 'utf8'), '[{"name": "Logo", sem fechar');
});

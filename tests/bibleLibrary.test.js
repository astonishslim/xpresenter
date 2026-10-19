const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBibleLibrary } = require('../src/core/bibleLibrary');

const bible = (code, name, extra = {}) => ({
  code, name, year: 1917, license: 'public-domain', source: 'teste', attribution: '',
  books: [{ id: 43, name: 'João', abbrev: 'Jo', chapters: [['No princípio era o Verbo.']] }],
  ...extra,
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bib-'));
  const builtinDir = path.join(root, 'builtin');
  const userDir = path.join(root, 'user');
  fs.mkdirSync(builtinDir);
  fs.writeFileSync(path.join(builtinDir, 'TB.json'), JSON.stringify(bible('TB', 'Tradução Brasileira')));
  fs.writeFileSync(path.join(builtinDir, 'ALM.json'), JSON.stringify(bible('ALM', 'Almeida 1911')));
  return { root, builtinDir, userDir, lib: createBibleLibrary({ builtinDir, userDir }) };
}

test('list devolve as versões embutidas, só com metadados, em ordem de nome', () => {
  const { lib } = setup();
  const list = lib.list();
  assert.deepEqual(list.map((v) => v.code), ['ALM', 'TB']);
  assert.equal(list[0].builtin, true);
  assert.equal(list[0].license, 'public-domain');
  assert.equal(list[0].books, undefined);
});

test('get devolve a Bíblia completa e a mesma instância nas chamadas seguintes (cache)', () => {
  const { lib } = setup();
  const tb = lib.get('TB');
  assert.equal(tb.books[0].chapters[0][0], 'No princípio era o Verbo.');
  assert.equal(lib.get('TB'), tb);
  assert.equal(lib.get('NAO-EXISTE'), null);
  assert.equal(lib.get('../../etc/passwd'), null);
});

test('arquivos inválidos ou corrompidos são ignorados sem derrubar a lista', () => {
  const { builtinDir, lib } = setup();
  fs.writeFileSync(path.join(builtinDir, 'RUIM.json'), '{nao e json');
  fs.writeFileSync(path.join(builtinDir, 'VAZIA.json'), JSON.stringify({ code: 'VAZIA', name: 'x', books: [] }));
  const quiet = console.error; console.error = () => {};
  try { assert.deepEqual(lib.list().map((v) => v.code), ['ALM', 'TB']); } finally { console.error = quiet; }
});

test('importText converte, grava no diretório do usuário e passa a listar', () => {
  const { userDir, lib } = setup();
  const text = JSON.stringify([{ abbrev: 'jo', name: 'João', chapters: [['Deus é amor.']] }]);
  const meta = lib.importText(text, 'minha.json');
  assert.equal(meta.code, 'MINHA');
  assert.equal(meta.builtin, false);
  assert.ok(fs.existsSync(path.join(userDir, 'MINHA.json')));
  assert.deepEqual(lib.list().map((v) => v.code), ['ALM', 'TB', 'MINHA']);
  assert.equal(lib.get('MINHA').books[0].chapters[0][0], 'Deus é amor.');
});

test('versões importadas sobrevivem a um novo carregamento', () => {
  const { builtinDir, userDir, lib } = setup();
  lib.importText(JSON.stringify([{ abbrev: 'jo', name: 'João', chapters: [['x']] }]), 'minha.json');
  const again = createBibleLibrary({ builtinDir, userDir });
  assert.ok(again.list().some((v) => v.code === 'MINHA'));
});

test('importar com código já existente cria um código novo, sem sobrescrever a versão embutida', () => {
  const { lib } = setup();
  const meta = lib.importText(JSON.stringify([{ abbrev: 'jo', name: 'João', chapters: [['outra']] }]), 'TB.json');
  assert.equal(meta.code, 'TB-2');
  assert.equal(lib.get('TB').books[0].chapters[0][0], 'No princípio era o Verbo.');
  const again = lib.importText(JSON.stringify([{ abbrev: 'jo', name: 'João', chapters: [['mais uma']] }]), 'TB.json');
  assert.equal(again.code, 'TB-3');
});

test('importText rejeita arquivo inválido com mensagem clara e não grava nada', () => {
  const { userDir, lib } = setup();
  assert.throws(() => lib.importText('{ruim', 'a.json'), /JSON/);
  assert.equal(fs.existsSync(userDir) ? fs.readdirSync(userDir).length : 0, 0);
});

test('remove apaga só versões do usuário', () => {
  const { userDir, lib } = setup();
  lib.importText(JSON.stringify([{ abbrev: 'jo', name: 'João', chapters: [['x']] }]), 'minha.json');
  assert.equal(lib.remove('MINHA'), true);
  assert.equal(fs.existsSync(path.join(userDir, 'MINHA.json')), false);
  assert.equal(lib.get('MINHA'), null);
  assert.equal(lib.remove('TB'), false); // embutida
  assert.ok(lib.get('TB'));
  assert.equal(lib.remove('../x'), false);
});

test('limita a quantidade de versões importadas', () => {
  const { lib } = setup();
  const text = JSON.stringify([{ abbrev: 'jo', name: 'João', chapters: [['x']] }]);
  for (let i = 0; i < 30; i += 1) lib.importText(text, `v${i}.json`);
  assert.throws(() => lib.importText(text, 'excesso.json'), /limite/i);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { createImportStore } = require('../src/core/importStore');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'apres-imp-'));

test('cria importação, grava páginas PNG numeradas e devolve URL file:', () => {
  const dir = tmp();
  const store = createImportStore(dir);
  const id = store.create();
  const url = store.savePage(id, 0, PNG);
  const file = fileURLToPath(url);
  assert.equal(path.basename(file), 'page-001.png');
  assert.equal(path.dirname(path.dirname(file)), dir);
  assert.deepEqual(fs.readFileSync(file), PNG);
});

test('recusa id inválido (travessia de pasta), índice fora do limite e conteúdo que não é PNG', () => {
  const store = createImportStore(tmp());
  const id = store.create();
  assert.throws(() => store.savePage('../../etc', 0, PNG), /importação/i);
  assert.throws(() => store.savePage(id, -1, PNG), /página/i);
  assert.throws(() => store.savePage(id, 1000, PNG), /página/i);
  assert.throws(() => store.savePage(id, 0, Buffer.from('<script>')), /PNG/);
  assert.throws(() => store.savePage(id, 0, 'texto'), /PNG/);
});

test('remove apaga a pasta da importação; id inválido não apaga nada', () => {
  const dir = tmp();
  const store = createImportStore(dir);
  const id = store.create();
  store.savePage(id, 0, PNG);
  store.remove('..');
  assert.ok(fs.existsSync(dir));
  store.remove(id);
  assert.equal(fs.existsSync(path.join(dir, id)), false);
});

test('prune não apaga importação em andamento (criada e ainda não adicionada ao culto)', () => {
  const dir = tmp();
  const store = createImportStore(dir);
  const pending = store.create();
  store.savePage(pending, 0, PNG);
  assert.deepEqual(store.prune(new Set()), []);
  store.settle(pending); // entrou no culto (ou foi descartada): volta a valer a regra normal
  assert.deepEqual(store.prune(new Set()), [pending]);
});

test('prune apaga importações que nenhum item do culto usa mais', () => {
  const dir = tmp();
  const store = createImportStore(dir);
  const keep = store.create();
  const drop = store.create();
  store.savePage(keep, 0, PNG);
  store.savePage(drop, 0, PNG);
  store.settle(keep);
  store.settle(drop);
  fs.mkdirSync(path.join(dir, 'pasta-estranha'));
  assert.deepEqual(store.prune(new Set([keep])), [drop]);
  assert.ok(fs.existsSync(path.join(dir, keep)));
  assert.ok(fs.existsSync(path.join(dir, 'pasta-estranha')), 'não mexe no que não criou');
});

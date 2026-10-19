const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveUserDataDir } = require('../src/main/userDataDir');

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'userdata-'));
}

test('renomeia a pasta antiga para o nome novo e mantém os arquivos', () => {
  const root = tempRoot();
  fs.mkdirSync(path.join(root, 'Apresentador'));
  fs.writeFileSync(path.join(root, 'Apresentador', 'library.json'), '[]');
  const current = path.join(root, 'xpresenter');

  assert.equal(resolveUserDataDir(current), current);
  assert.equal(fs.readFileSync(path.join(current, 'library.json'), 'utf8'), '[]');
  assert.equal(fs.existsSync(path.join(root, 'Apresentador')), false);
});

test('pasta nova já existente é usada como está', () => {
  const root = tempRoot();
  fs.mkdirSync(path.join(root, 'Apresentador'));
  fs.mkdirSync(path.join(root, 'xpresenter'));
  const current = path.join(root, 'xpresenter');

  assert.equal(resolveUserDataDir(current), current);
  assert.equal(fs.existsSync(path.join(root, 'Apresentador')), true);
});

test('instalação nova (sem pasta antiga) usa a pasta nova', () => {
  const root = tempRoot();
  const current = path.join(root, 'xpresenter');
  assert.equal(resolveUserDataDir(current), current);
});

test('se não der para renomear, continua usando a pasta antiga', (t) => {
  const root = tempRoot();
  const legacy = path.join(root, 'Apresentador');
  fs.mkdirSync(legacy);
  t.mock.method(fs, 'renameSync', () => { throw new Error('EBUSY'); });
  t.mock.method(console, 'error', () => {});

  assert.equal(resolveUserDataDir(path.join(root, 'xpresenter')), legacy);
});

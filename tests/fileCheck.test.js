const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { missingFileOf } = require('../src/core/fileCheck');

test('missingFileOf: aponta o arquivo local que sumiu em showMedia e em slide de imagem', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apres-arq-'));
  const ok = path.join(dir, 'ok.png');
  fs.writeFileSync(ok, 'x');
  const gone = pathToFileURL(path.join(dir, 'sumiu.mp4')).href;
  assert.equal(missingFileOf({ type: 'showMedia', media: { kind: 'video', value: gone } }), gone);
  assert.equal(missingFileOf({ type: 'showMedia', media: { kind: 'image', value: pathToFileURL(ok).href } }), null);
  assert.equal(missingFileOf({ type: 'showSlide', slide: { text: '', image: gone } }), gone);
  assert.equal(missingFileOf({ type: 'showSlide', slide: { text: 'letra' } }), null);
  assert.equal(missingFileOf({ type: 'setBackground', background: { kind: 'image', value: gone } }), gone);
  assert.equal(missingFileOf({ type: 'setBackground', background: { kind: 'color', value: '#000000' } }), null);
  assert.equal(missingFileOf({ type: 'clear' }), null);
});

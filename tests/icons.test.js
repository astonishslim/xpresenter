const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { NODES, ALLOWED_TAGS } = require('../src/renderer/shared/icons');

const ROOT = path.join(__dirname, '..', 'src', 'renderer');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const REMOTE = path.join(__dirname, '..', 'src', 'remote');
const html = read('operator', 'index.html');
const remoteHtml = ['index.html', 'stage.html'].map((f) => fs.readFileSync(path.join(REMOTE, f), 'utf8')).join('\n');
const scripts = ['operator.js', 'presets.js', 'layout.js', 'bible-panel.js', 'theme-panel.js', 'lyrics-panel.js', 'media-panel.js', 'outputs-panel.js', 'automation-panel.js'].map((f) => read('operator', f)).join('\n');

// data-on/data-off: ícones que um botão de liga/desliga alterna (ex.: camadas no cabeçalho).
const usedInHtml = [...(html + remoteHtml).matchAll(/data-(?:icon|on|off)="([a-z0-9-]+)"/g)].map((m) => m[1]);
// Formas usadas no JS: icon('x'), miniButton('x', ...), setIcon(el, 'x') e setIcon(el, cond ? 'x' : 'y').
const usedInJs = [
  ...[...scripts.matchAll(/\bicon\(\s*'([a-z0-9-]+)'/g)].map((m) => m[1]),
  ...[...scripts.matchAll(/\b(?:miniButton|iconButton|create)\(\s*'([a-z0-9-]+)'/g)].map((m) => m[1]),
  ...[...scripts.matchAll(/setIcon\(\s*\w+\s*,\s*(?:[\w.]+\s*\?\s*)?'([a-z0-9-]+)'(?:\s*:\s*'([a-z0-9-]+)')?/g)].flatMap((m) => [m[1], m[2]].filter(Boolean)),
];

test('o HTML usa ícones (garante que o teste está olhando para algo)', () => {
  assert.ok(usedInHtml.length >= 20, `só ${usedInHtml.length} ícones no HTML`);
});

test('o controle remoto e o retorno de palco usam ícones e carregam a sua cópia de icons.js', () => {
  assert.ok([...remoteHtml.matchAll(/data-icon="/g)].length >= 8);
  for (const page of ['index.html', 'stage.html']) {
    assert.match(fs.readFileSync(path.join(REMOTE, page), 'utf8'), /<script src="icons\.js"><\/script>/, page);
  }
});

test('a cópia de icons.js do remoto é idêntica à do operador (rode npm run icons)', () => {
  assert.equal(fs.readFileSync(path.join(REMOTE, 'icons.js'), 'utf8'), read('shared', 'icons.js'));
});

test('todo ícone usado no HTML existe na tabela gerada', () => {
  const missing = [...new Set(usedInHtml)].filter((n) => !(n in NODES));
  assert.deepEqual(missing, []);
});

test('todo ícone chamado pelo JS existe na tabela gerada', () => {
  const missing = [...new Set(usedInJs)].filter((n) => !(n in NODES));
  assert.deepEqual(missing, []);
});

test('cada ícone tem geometria com apenas tags SVG permitidas e atributos simples', () => {
  for (const [name, nodes] of Object.entries(NODES)) {
    assert.ok(nodes.length > 0, `${name} vazio`);
    for (const [tag, attrs] of nodes) {
      assert.ok(ALLOWED_TAGS.includes(tag), `${name}: tag ${tag}`);
      for (const [k, v] of Object.entries(attrs)) {
        assert.match(k, /^[a-z][a-z0-9-]*$/, `${name}: atributo ${k}`);
        assert.equal(typeof v, 'string');
        assert.doesNotMatch(v, /[<>"]/, `${name}: valor suspeito em ${k}`);
      }
    }
  }
});

test('não sobram ícones na tabela sem uso (evita inchar o app)', () => {
  const used = new Set([...usedInHtml, ...usedInJs]);
  const unused = Object.keys(NODES).filter((n) => !used.has(n));
  assert.deepEqual(unused, []);
});

test('botões só com ícone (classe ib) têm title e aria-label', () => {
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]).filter((t) => /class="[^"]*\bib\b/.test(t));
  assert.ok(buttons.length >= 10, `só ${buttons.length} botões ib`);
  const bad = buttons.filter((t) => !/\btitle="[^"]+"/.test(t) || !/\baria-label="[^"]+"/.test(t));
  assert.deepEqual(bad, []);
});

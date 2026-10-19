// Gera src/renderer/shared/icons.js a partir do Lucide (ISC), só com os ícones usados.
// Uso: node scripts/build-icons.js   (depois de editar a lista abaixo)
const fs = require('node:fs');
const path = require('node:path');

const ICONS = [
  'audio-lines', 'book-open', 'eye', 'radio', 'layout-grid', 'sliders-horizontal', 'monitor-speaker', 'list-music',
  'save', 'trash', 'rotate-ccw', 'smartphone', 'monitor-play', 'skip-back', 'skip-forward', 'eraser', 'eye-off',
  'layers', 'megaphone', 'send', 'image', 'palette', 'circle-play', 'plus', 'search', 'file-up', 'list-plus',
  'pencil', 'zap', 'monitor-up', 'monitor-off', 'x', 'arrow-up', 'grip', 'grip-vertical', 'move-diagonal-2', 'check',
  'layout-dashboard', 'clock', 'video', 'type', 'case-upper', 'blend', 'tag', 'swatch-book',
  'globe', 'captions', 'captions-off', 'image-off', 'megaphone-off', 'sun-dim',
];

const root = path.join(__dirname, '..');
const nodes = require(path.join(root, 'node_modules', 'lucide-static', 'icon-nodes.json'));
const missing = ICONS.filter((n) => !(n in nodes));
if (missing.length) throw new Error(`ícones inexistentes no Lucide: ${missing.join(', ')}`);

const table = Object.fromEntries(ICONS.map((n) => [n, nodes[n]]));
const body = `// GERADO por scripts/build-icons.js: não edite à mão.
// Ícones: Lucide (https://lucide.dev), licença ISC. Veja licenses/lucide-LICENSE.txt.
(function defineIcons(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.icons = api; }
}(typeof window !== 'undefined' ? window : globalThis, () => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ALLOWED_TAGS = ['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse'];
  const NODES = ${JSON.stringify(table)};

  // Monta o <svg> por DOM (sem innerHTML). Herda a cor do texto (currentColor).
  function create(name, size = 14) {
    const nodesOf = NODES[name];
    if (!nodesOf) throw new Error(\`ícone desconhecido: \${name}\`);
    const svg = document.createElementNS(SVG_NS, 'svg');
    const attrs = { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'icon' };
    Object.entries(attrs).forEach(([k, v]) => svg.setAttribute(k, v));
    nodesOf.forEach(([tag, a]) => {
      const el = document.createElementNS(SVG_NS, tag);
      Object.entries(a).forEach(([k, v]) => el.setAttribute(k, v));
      svg.appendChild(el);
    });
    return svg;
  }

  // Troca o ícone de um botão/elemento marcado com data-icon (mantém o texto de .label, se houver).
  function setIcon(el, name, size) {
    el.dataset.icon = name;
    el.querySelector(':scope > svg.icon')?.remove();
    el.prepend(create(name, size || Number(el.dataset.iconSize) || 14));
  }

  // Preenche todos os elementos [data-icon] dentro de \`scope\`.
  function apply(scope = document) {
    scope.querySelectorAll('[data-icon]').forEach((el) => setIcon(el, el.dataset.icon));
  }

  return { NODES, ALLOWED_TAGS, create, setIcon, apply };
}));
`;
// O servidor remoto só serve a pasta src/remote, então o controle remoto e o retorno levam a sua própria cópia.
fs.writeFileSync(path.join(root, 'src', 'renderer', 'shared', 'icons.js'), body);
fs.writeFileSync(path.join(root, 'src', 'remote', 'icons.js'), body);
fs.mkdirSync(path.join(root, 'licenses'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules', 'lucide-static', 'LICENSE'), path.join(root, 'licenses', 'lucide-LICENSE.txt'));
console.log(`icons.js gerado com ${ICONS.length} ícones`);

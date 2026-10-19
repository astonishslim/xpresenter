// Presets de layout da grade bento: padrões prontos, normalização e validação.
// Funções puras, usadas no navegador (global) e nos testes (CommonJS).
(function definePresets(root, factory) {
  const model = typeof module === 'object' && module.exports ? require('./layoutModel') : root.layoutModel;
  const api = factory(model);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.layoutPresets = api;
}(typeof window !== 'undefined' ? window : globalThis, (model) => {
  const GRID_COLS = 12;
  const GRID_ROWS = 12;
  const MAX_NAME = 40;
  const MAX_SAVED = 20;

  const TILE_IDS = ['library', 'preview', 'program', 'slides', 'controls', 'stage', 'playlist'];
  const SECTIONS = {
    library: ['songs', 'bible', 'media'],
    preview: ['preview'],
    program: ['program'],
    slides: ['slides'],
    controls: ['controls', 'look'],
    stage: ['stage', 'timer'],
    playlist: ['playlist'],
  };
  const sp = (c, r) => ({ c, r });
  const layout = (order, spans) => ({ order, spans, sections: SECTIONS });

  // Cada preset ocupa exatamente a grade 12x12 (verificado por packDense nos testes).
  const DEFAULT_LAYOUT = layout(TILE_IDS, {
    library: sp(3, 12), preview: sp(4, 4), program: sp(5, 4), slides: sp(6, 5), controls: sp(3, 4), stage: sp(3, 4), playlist: sp(6, 3),
  });

  const BUILTIN = [
    { id: 'padrao', name: 'Padrão', layout: DEFAULT_LAYOUT },
    // Operação ao vivo: monitores grandes no topo, slides e controles embaixo.
    {
      id: 'culto',
      name: 'Culto',
      layout: layout(['program', 'preview', 'stage', 'slides', 'controls', 'playlist', 'library'], {
        program: sp(5, 6), preview: sp(4, 6), stage: sp(3, 6), slides: sp(6, 6), controls: sp(3, 6), playlist: sp(3, 3), library: sp(3, 3),
      }),
    },
    // Preparação: biblioteca alta, slides e culto em destaque.
    {
      id: 'ensaio',
      name: 'Ensaio',
      layout: layout(['library', 'slides', 'preview', 'playlist', 'program', 'stage', 'controls'], {
        library: sp(4, 12), slides: sp(5, 6), preview: sp(3, 4), playlist: sp(5, 4), program: sp(3, 4), stage: sp(5, 2), controls: sp(3, 4),
      }),
    },
    // Operador de mídia: monitores e controles em faixa, retorno e slides abaixo.
    {
      id: 'midia',
      name: 'Operador de mídia',
      layout: layout(['preview', 'program', 'controls', 'slides', 'stage', 'playlist', 'library'], {
        preview: sp(4, 5), program: sp(4, 5), controls: sp(4, 5), slides: sp(6, 7), stage: sp(3, 7), playlist: sp(3, 4), library: sp(3, 3),
      }),
    },
  ];
  const BUILTIN_NAMES = BUILTIN.map((b) => b.name.toLowerCase());

  // Simula grid-auto-flow: dense (12 colunas): cada bloco vai para a primeira posição livre.
  function packDense(order, spans) {
    const used = new Set();
    const positions = {};
    let rows = 0;
    const fits = (x, y, c, r) => {
      for (let j = y; j < y + r; j += 1) for (let i = x; i < x + c; i += 1) if (used.has(`${i},${j}`)) return false;
      return true;
    };
    order.forEach((id) => {
      const { c, r } = spans[id];
      for (let y = 1; !positions[id]; y += 1) {
        for (let x = 1; x + c - 1 <= GRID_COLS && !positions[id]; x += 1) {
          if (fits(x, y, c, r)) {
            positions[id] = { x, y };
            for (let j = y; j < y + r; j += 1) for (let i = x; i < x + c; i += 1) used.add(`${i},${j}`);
            rows = Math.max(rows, y + r - 1);
          }
        }
      }
    });
    return { positions, rows, filled: used.size };
  }

  const canonical = (l) => JSON.stringify({
    order: l.order,
    spans: TILE_IDS.map((id) => [id, l.spans[id].c, l.spans[id].r]),
    sections: TILE_IDS.map((id) => [id, l.sections[id]]),
  });
  const sameLayout = (a, b) => canonical(a) === canonical(b);

  function normalizeLayout(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      order: model.resolveOrder(src.order, TILE_IDS),
      spans: model.resolveSpans(src.spans, DEFAULT_LAYOUT.spans),
      sections: model.resolveSections(src.sections, SECTIONS),
    };
  }

  function validatePresetName(input) {
    const name = String(input ?? '').trim();
    if (!name) return { ok: false, reason: 'Dê um nome ao layout.' };
    if (name.length > MAX_NAME) return { ok: false, reason: `Use até ${MAX_NAME} caracteres.` };
    if (BUILTIN_NAMES.includes(name.toLowerCase())) return { ok: false, reason: 'Esse nome é de um layout pronto. Escolha outro.' };
    return { ok: true, name };
  }

  function sanitizeSaved(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    raw.forEach((entry) => {
      if (out.length >= MAX_SAVED || !entry || typeof entry !== 'object' || !entry.layout || typeof entry.layout !== 'object') return;
      const checked = validatePresetName(entry.name);
      if (!checked.ok || seen.has(checked.name.toLowerCase())) return;
      seen.add(checked.name.toLowerCase());
      out.push({ name: checked.name, layout: normalizeLayout(entry.layout) });
    });
    return out;
  }

  return {
    GRID_COLS, GRID_ROWS, MAX_NAME, MAX_SAVED, TILE_IDS, SECTIONS, DEFAULT_LAYOUT, BUILTIN,
    packDense, sameLayout, normalizeLayout, validatePresetName, sanitizeSaved,
  };
}));

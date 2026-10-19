// Modelo do layout "bento": ordem e tamanho dos blocos, e seções dentro dos blocos.
// Funções puras, usadas no navegador (global) e nos testes (CommonJS).
(function defineModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.layoutModel = api;
}(typeof window !== 'undefined' ? window : globalThis, () => {
  const MIN_SPAN = 2;
  const MAX_SPAN = 12;

  const clampSpan = (value, min = MIN_SPAN, max = MAX_SPAN) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
  };

  // pixels desde a borda do bloco -> quantas células (com vão) ele ocupa
  const spanFromPixels = (px, cell, gap, min = MIN_SPAN, max = MAX_SPAN) => clampSpan((px + gap) / (cell + gap), min, max);

  // Perto do tamanho máximo o bloco encaixa no cheio (a última célula "gruda" na borda da grade).
  const SNAP_CELLS = 1;
  const snapToFull = (span, snap = SNAP_CELLS) => (span >= MAX_SPAN - snap ? MAX_SPAN : span);

  // Alterna um eixo ('c' largura, 'r' altura) entre o tamanho cheio e o anterior. Sem anterior guardado, volta à metade.
  function toggleFull(size, axis, before) {
    if (axis !== 'c' && axis !== 'r') return { size: { ...size }, before };
    if (size[axis] < MAX_SPAN) return { size: { ...size, [axis]: MAX_SPAN }, before: size[axis] };
    const back = Number.isFinite(before) && before >= MIN_SPAN && before < MAX_SPAN ? before : MAX_SPAN / 2;
    return { size: { ...size, [axis]: back }, before: undefined };
  }

  // Novo tamanho ao arrastar: 'c' só a largura, 'r' só a altura, 'both' (o canto) os dois.
  function resizeAxis(size, axis, c, r = c) {
    if (axis === 'both') return { c: clampSpan(c), r: clampSpan(r) };
    if (axis === 'c') return { c: clampSpan(c), r: size.r };
    if (axis === 'r') return { c: size.c, r: clampSpan(c) };
    return { ...size };
  }

  function isValidOrder(order, ids) {
    return Array.isArray(order) && order.length === ids.length
      && new Set(order).size === ids.length && order.every((id) => ids.includes(id));
  }
  const resolveOrder = (saved, ids) => (isValidOrder(saved, ids) ? [...saved] : [...ids]);

  function moveTo(order, id, targetId) {
    const from = order.indexOf(id);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return [...order];
    const rest = order.filter((x) => x !== id);
    rest.splice(to, 0, id);
    return rest;
  }

  // De que lado do alvo o bloco arrastado cai: indo para trás entra antes do alvo, indo para frente entra depois.
  function dropSide(order, id, targetId) {
    const from = order.indexOf(id);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return null;
    return from > to ? 'before' : 'after';
  }

  function move(order, id, delta) {
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return [...order];
    return moveTo(order, id, order[j]);
  }

  function resolveSpans(saved, defaults) {
    const out = {};
    Object.keys(defaults).forEach((id) => {
      const s = saved && saved[id];
      const ok = s && Number.isFinite(Number(s.c)) && Number.isFinite(Number(s.r));
      out[id] = ok ? { c: clampSpan(s.c), r: clampSpan(s.r) } : { ...defaults[id] };
    });
    return out;
  }

  const flatten = (sections) => Object.values(sections).flat();

  // Layout salvo numa versão anterior continua valendo: seções que não existem mais saem e as novas
  // entram no fim do bloco onde ficam por padrão. Estrutura quebrada (bloco faltando, repetição) volta ao padrão.
  function resolveSections(saved, defaults) {
    const tileIds = Object.keys(defaults);
    const copy = (src) => Object.fromEntries(tileIds.map((t) => [t, [...src[t]]]));
    const structureOk = saved && typeof saved === 'object'
      && Object.keys(saved).length === tileIds.length
      && tileIds.every((t) => Array.isArray(saved[t]))
      && new Set(flatten(saved)).size === flatten(saved).length;
    if (!structureOk) return copy(defaults);
    const known = new Set(flatten(defaults));
    const kept = Object.fromEntries(tileIds.map((t) => [t, saved[t].filter((k) => known.has(k))]));
    const present = new Set(flatten(kept));
    tileIds.forEach((t) => defaults[t].forEach((k) => { if (!present.has(k)) kept[t].push(k); }));
    return kept;
  }

  function moveSection(sections, key, toTile, refKey, after) {
    if (!(toTile in sections) || !flatten(sections).includes(key)) return sections;
    const next = Object.fromEntries(Object.entries(sections).map(([t, list]) => [t, list.filter((k) => k !== key)]));
    const list = next[toTile];
    const at = refKey && refKey !== key ? list.indexOf(refKey) : -1;
    if (at < 0) list.push(key);
    else list.splice(after ? at + 1 : at, 0, key);
    return next;
  }

  return { MIN_SPAN, MAX_SPAN, SNAP_CELLS, snapToFull, toggleFull, resizeAxis, clampSpan, spanFromPixels, isValidOrder, resolveOrder, moveTo, dropSide, move, resolveSpans, resolveSections, moveSection };
}));

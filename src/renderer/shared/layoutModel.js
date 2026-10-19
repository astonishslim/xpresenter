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

  function resolveSections(saved, defaults) {
    const tileIds = Object.keys(defaults);
    const copy = (src) => Object.fromEntries(tileIds.map((t) => [t, [...src[t]]]));
    const valid = saved && typeof saved === 'object'
      && Object.keys(saved).length === tileIds.length
      && tileIds.every((t) => Array.isArray(saved[t]))
      && (() => {
        const all = flatten(saved);
        const expected = flatten(defaults);
        return all.length === expected.length && new Set(all).size === all.length && expected.every((k) => all.includes(k));
      })();
    return copy(valid ? saved : defaults);
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

  return { MIN_SPAN, MAX_SPAN, clampSpan, spanFromPixels, isValidOrder, resolveOrder, moveTo, move, resolveSpans, resolveSections, moveSection };
}));

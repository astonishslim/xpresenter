// Ordem dos painéis: funções puras, usadas no navegador (global) e nos testes (CommonJS).
(function defineOrder(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.panelOrder = api;
}(typeof window !== 'undefined' ? window : globalThis, () => {
  function isValidOrder(order, ids) {
    return Array.isArray(order)
      && order.length === ids.length
      && new Set(order).size === ids.length
      && order.every((id) => ids.includes(id));
  }

  function swap(order, a, b) {
    const i = order.indexOf(a);
    const j = order.indexOf(b);
    if (i < 0 || j < 0 || i === j) return [...order];
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  }

  function move(order, id, delta) {
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return [...order];
    return swap(order, id, order[j]);
  }

  const resolveOrder = (saved, ids) => (isValidOrder(saved, ids) ? [...saved] : [...ids]);

  return { isValidOrder, swap, move, resolveOrder };
}));

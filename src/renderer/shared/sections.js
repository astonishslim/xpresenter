// Seções da música (Verso, Refrão, Ponte…): tipo, atalho de teclado, sigla e arranjos.
// Funções puras, usadas no operador (global), no processo principal e nos testes (CommonJS).
(function defineSections(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.sections = api;
}(typeof window !== 'undefined' ? window : globalThis, () => {
  const MAX_ORDER_ITEMS = 60;
  const MAX_TOKEN_CHARS = 40;
  const MAX_HOTKEY_VERSE = 9;

  // Sem acento, minúsculas, hífen vira espaço ("Pré-Refrão" -> "pre refrao").
  const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[\s-]+/g, ' ').trim();

  // Ordem importa: "pré-refrão" antes de "refrão". Só o começo do rótulo conta ("Finalmente" não é Final).
  const KINDS = [
    ['prechorus', /^pre ?(refrao|chorus|coro)\b/],
    ['chorus', /^(refrao|coro|chorus)\b/],
    ['verse', /^(verso|verse|estrofe)\b/],
    ['bridge', /^(ponte|bridge)\b/],
    ['intro', /^(intro|introducao)\b/],
    ['ending', /^(final|fim|outro|ending|coda)\b/],
  ];
  const HOTKEYS = { chorus: 'c', prechorus: 'e', bridge: 'p', intro: 'i', ending: 'f' };
  const ABBR = { verse: 'V', chorus: 'C', prechorus: 'PC', bridge: 'P', intro: 'I', ending: 'F' };
  // Siglas aceitas nos arranjos (além do nome inteiro da seção).
  const ALIASES = { v: 'verse', c: 'chorus', r: 'chorus', pc: 'prechorus', pr: 'prechorus', p: 'bridge', b: 'bridge', i: 'intro', f: 'ending' };

  function kindOf(label) {
    const text = normalize(label);
    const hit = KINDS.find(([, re]) => re.test(text));
    return hit ? hit[0] : 'other';
  }

  function numberOf(label) {
    const m = normalize(label).match(/\d+/);
    return m ? Number(m[0]) : null;
  }

  function hotkeyOf(label) {
    const kind = kindOf(label);
    if (kind === 'verse') {
      const n = numberOf(label) || 1;
      return n <= MAX_HOTKEY_VERSE ? String(n) : null;
    }
    return HOTKEYS[kind] || null;
  }

  function abbrOf(label) {
    const kind = kindOf(label);
    if (kind === 'other') return String(label ?? '').trim();
    const n = numberOf(label);
    return `${ABBR[kind]}${kind === 'verse' ? n || 1 : n || ''}`;
  }

  // "Verso" sem número vale como "Verso 1" dos dois lados.
  function matchesToken(label, token) {
    const t = normalize(token);
    if (!t) return false;
    if (normalize(label) === t) return true;
    const m = t.replace(/\s/g, '').match(/^([a-z]+)(\d*)$/);
    const kind = m && ALIASES[m[1]];
    if (!kind || kindOf(label) !== kind) return false;
    return (numberOf(label) || 1) === (Number(m[2]) || 1);
  }

  // "V1 C V2 C" (siglas, por espaço) ou "Verso 1, Refrão" (nomes, por vírgula). Também aceita lista.
  function parseOrder(input) {
    let parts = [];
    if (Array.isArray(input)) parts = input.filter((t) => typeof t === 'string');
    else if (typeof input === 'string') parts = input.includes(',') ? input.split(',') : input.split(/\s+/);
    return parts.map((t) => t.trim()).filter((t) => t && t.length <= MAX_TOKEN_CHARS).slice(0, MAX_ORDER_ITEMS);
  }

  const formatOrder = (tokens) => (tokens.some((t) => /\s/.test(t)) ? tokens.join(', ') : tokens.join(' '));

  // Onde cada ocorrência de seção começa na lista de slides (o rótulo muda).
  function groupStarts(slides) {
    const out = [];
    (slides || []).forEach((slide, index) => {
      const label = (slide && slide.label) || '';
      if (index > 0 && label === ((slides[index - 1] && slides[index - 1].label) || '')) return;
      out.push({ index, label, hotkey: hotkeyOf(label), abbr: abbrOf(label), kind: kindOf(label) });
    });
    return out;
  }

  // Atalho de seção: a próxima ocorrência depois do slide ao vivo; no fim, volta à primeira. -1 se não há.
  function findGroupStart(slides, hotkey, fromIndex) {
    const key = String(hotkey ?? '').toLowerCase();
    const starts = groupStarts(slides).filter((g) => g.hotkey === key);
    if (!starts.length) return -1;
    const after = starts.find((g) => g.index > fromIndex);
    return (after || starts[0]).index;
  }

  return {
    MAX_ORDER_ITEMS, normalize, kindOf, numberOf, hotkeyOf, abbrOf, matchesToken, parseOrder, formatOrder, groupStarts, findGroupStart,
  };
}));

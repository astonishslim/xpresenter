// Retorno de palco: layouts (o que cada tela mostra) e acordes sobre a letra. Funções puras, usadas na janela do
// retorno e no navegador do tablet. A cópia em src/remote/ precisa ser idêntica (o servidor só serve aquela pasta).
(function defineStageLayouts(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.stageLayouts = api;
}(typeof window !== 'undefined' ? window : globalThis, () => {
  // now/next: caixas da letra; chords: acordes sobre a letra; clock/timer/message: cabeçalho e aviso; bigTimer: cronômetro grande.
  const LAYOUTS = {
    letra: { label: 'Letra (agora e próximo)', now: true, next: true, chords: false, clock: true, timer: true, bigTimer: false, message: true },
    banda: { label: 'Banda (com acordes)', now: true, next: true, chords: true, clock: true, timer: true, bigTimer: false, message: true },
    pregador: { label: 'Pregador (tempo grande)', now: false, next: false, chords: false, clock: true, timer: true, bigTimer: true, message: true },
  };
  const LAYOUT_NAMES = Object.keys(LAYOUTS);
  const DEFAULT_LAYOUT = 'letra';

  const layoutFor = (name) => (typeof name === 'string' && Object.hasOwn(LAYOUTS, name) ? LAYOUTS[name] : LAYOUTS[DEFAULT_LAYOUT]);

  // Linhas "acordes + letra": cada acorde na coluna da sílaba; acordes que se encostam ganham um espaço entre eles.
  function chordLines(text, chords) {
    const lines = String(text ?? '').split('\n');
    return lines.map((line, i) => {
      const entries = [...((Array.isArray(chords) && chords[i]) || [])].sort((a, b) => a.at - b.at);
      let row = '';
      entries.forEach((entry) => {
        const column = Math.max(entry.at, row ? row.length + 1 : 0);
        row = `${row.padEnd(column, ' ')}${entry.chord}`;
      });
      return { chords: row, text: line };
    });
  }

  return { LAYOUTS, LAYOUT_NAMES, DEFAULT_LAYOUT, layoutFor, chordLines };
}));
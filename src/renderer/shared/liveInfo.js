// Cronômetro e legenda com variáveis: funções puras usadas na projeção, no retorno de palco (remoto) e nos testes.
// A cópia em src/remote/liveInfo.js precisa ser idêntica (o servidor remoto só serve aquela pasta).
(function defineLiveInfo(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.liveInfo = api;
}(typeof window !== 'undefined' ? window : globalThis, () => {
  const VARIABLES = ['titulo', 'rotulo', 'hora', 'data', 'cronometro'];
  const MAX_VALUE_CHARS = 200;
  const SEPARATORS = '·•|–—\\-,:';
  const EDGE_SEP = new RegExp(`^[\\s${SEPARATORS}]+|[\\s${SEPARATORS}]+$`, 'g');
  const REPEATED_SEP = new RegExp(`\\s*[${SEPARATORS}](\\s*[${SEPARATORS}])+\\s*`, 'g');

  // Milissegundos no instante `now`: regressiva desconta desde o início; cronômetro soma.
  function timerValueMs(timer, now) {
    if (!timer) return 0;
    if (timer.startedAt == null) return timer.baseMs;
    const elapsed = now - timer.startedAt;
    return timer.mode === 'countdown' ? timer.baseMs - elapsed : timer.baseMs + elapsed;
  }

  const isTimerInUse = (timer) => Boolean(timer) && (timer.startedAt != null || timer.baseMs !== timer.setMs);

  const pad = (n) => String(n).padStart(2, '0');

  // Arredonda para cima: na regressiva, "00:00" só aparece quando o tempo acabou de fato.
  function formatTimer(ms) {
    const value = Number.isFinite(ms) ? ms : 0;
    const negative = value < 0;
    const total = negative ? Math.floor(-value / 1000) : Math.ceil(value / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const body = h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    return negative && total ? `-${body}` : body;
  }

  // Troca {variavel} pelos valores; variável vazia some junto com o separador que sobraria.
  function fillTemplate(template, vars) {
    if (typeof template !== 'string' || !template) return '';
    const values = vars || {};
    // Cada valor é truncado: a limpeza de separadores roda a cada tique e não pode crescer com o texto.
    const filled = template.replace(/\{([a-z]+)\}/g, (whole, name) => (
      VARIABLES.includes(name) ? String(values[name] ?? '').slice(0, MAX_VALUE_CHARS) : whole));
    return filled.replace(REPEATED_SEP, (m) => ` ${m.trim().charAt(0)} `).replace(EDGE_SEP, '').replace(/\s{2,}/g, ' ');
  }

  return { VARIABLES, timerValueMs, isTimerInUse, formatTimer, fillTemplate };
}));

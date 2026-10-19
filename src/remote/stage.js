// Monitor de retorno: roda na janela do Electron (via preload) ou num navegador (HTTP + SSE).
const $ = (id) => document.getElementById(id);
const FONT_MAX_VH = 9;
const FONT_MIN_VH = 2.5;
const FIT_STEPS = 8;

// Maior fonte (vh) em que o texto cabe na caixa.
function fit(el) {
  let lo = FONT_MIN_VH;
  let hi = FONT_MAX_VH;
  for (let i = 0; i < FIT_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = `${mid}vh`;
    if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) lo = mid; else hi = mid;
  }
  el.style.fontSize = `${lo}vh`;
}

function show(id, slide, empty) {
  const el = $(id);
  el.textContent = slide ? slide.text : empty;
  fit(el);
}

function render(state) {
  const { content } = state.layers;
  $('now-label').textContent = content.slide && content.slide.label ? `AGORA · ${content.slide.label.toUpperCase()}` : 'AGORA';
  show('now-text', content.slide, '—');
  const next = state.stage.next;
  $('next-label').textContent = next && next.label ? `PRÓXIMO · ${next.label.toUpperCase()}` : 'PRÓXIMO';
  show('next-text', next, '—');

  const lyricsHidden = Boolean(content.slide && content.hidden);
  $('status').hidden = !state.blackout && !lyricsHidden;
  $('status-text').textContent = state.blackout ? 'TELA EM PRETO' : (lyricsHidden ? 'LETRA OCULTA' : '');
  $('message-text').textContent = state.stage.message || '';
  $('message').classList.toggle('visible', Boolean(state.stage.message));
}

function tickClock() {
  $('clock').textContent = new Date().toLocaleTimeString('pt-BR');
}

function connect(onState) {
  if (window.apresentador) {
    window.apresentador.getState().then(onState);
    window.apresentador.onState(onState);
    return;
  }
  const token = encodeURIComponent(new URLSearchParams(location.search).get('t') || '');
  const events = new EventSource(`/api/events?t=${token}`);
  events.onmessage = (e) => onState(JSON.parse(e.data));
}

let lastState = null;
window.icons.apply();
connect((state) => { lastState = state; render(state); });
window.addEventListener('resize', () => lastState && render(lastState));
tickClock();
setInterval(tickClock, 1000);

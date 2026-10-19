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

// Layout do retorno (?layout=letra|banda|pregador): o que a tela mostra. Sem parâmetro, o padrão (letra).
const layoutName = new URLSearchParams(location.search).get('layout');
const layout = window.stageLayouts.layoutFor(layoutName);
document.body.dataset.layout = window.stageLayouts.LAYOUT_NAMES.includes(layoutName) ? layoutName : window.stageLayouts.DEFAULT_LAYOUT;
$('stage-main').hidden = !layout.now && !layout.next;
$('now').hidden = !layout.now;
$('next').hidden = !layout.next;
$('clock-box').hidden = !layout.clock;

// Letra com os acordes sobre as sílabas (layout da banda). Fonte de largura fixa para as colunas alinharem.
function showChorded(el, slide) {
  el.classList.add('chorded');
  el.replaceChildren(...window.stageLayouts.chordLines(slide.text, slide.chords).map((row) => {
    const line = document.createElement('div');
    const chords = document.createElement('pre');
    const lyric = document.createElement('pre');
    line.className = 'cline';
    chords.className = 'chord-row';
    lyric.className = 'lyric-row';
    chords.textContent = row.chords || ' ';
    lyric.textContent = row.text;
    line.append(chords, lyric);
    return line;
  }));
  fit(el);
}

// Página de PDF não tem texto: o palco vê o rótulo ("Página 3").
function show(id, slide, empty) {
  const el = $(id);
  el.classList.remove('chorded');
  if (id === 'now-text' && layout.chords && slide && slide.text && slide.chords) {
    showChorded(el, slide);
    return;
  }
  el.textContent = slide ? (slide.text || (slide.image ? `🖼 ${slide.label || 'Imagem'}` : empty)) : empty;
  fit(el);
}

function render(state) {
  const { content, media } = state.layers;
  // Vídeo/imagem no ar ocupa o lugar da letra: o palco vê o que está passando.
  const now = media ? { label: { video: 'VÍDEO', camera: 'CÂMERA' }[media.kind] || 'IMAGEM', text: media.title || '—' } : content.slide;
  $('now-label').textContent = now && now.label ? `AGORA · ${now.label.toUpperCase()}` : 'AGORA';
  show('now-text', now, '—');
  const next = state.stage.next;
  $('next-label').textContent = next && next.label ? `PRÓXIMO · ${next.label.toUpperCase()}` : 'PRÓXIMO';
  show('next-text', next, '—');

  const lyricsHidden = Boolean(content.slide && content.hidden);
  $('status').hidden = !state.blackout && !lyricsHidden;
  $('status-text').textContent = state.blackout ? 'TELA EM PRETO' : (lyricsHidden ? 'LETRA OCULTA' : '');
  $('message-text').textContent = state.stage.message || '';
  $('message').classList.toggle('visible', layout.message && Boolean(state.stage.message));
}

// Diferença entre o relógio do computador do operador e o deste aparelho (0 na janela do próprio app).
let clockOffsetMs = 0;
const serverNow = () => Date.now() + clockOffsetMs;
const WARN_MS = 60 * 1000;

// Cronômetro aparece no retorno sempre que estiver em uso, mesmo oculto na projeção (tempo da pregação).
function renderTimer() {
  const timer = lastState && lastState.timer;
  const { isTimerInUse, timerValueMs, formatTimer } = window.liveInfo;
  const inUse = isTimerInUse(timer) && layout.timer;
  $('timer').hidden = !inUse;
  if (!inUse) return;
  const ms = timerValueMs(timer, serverNow());
  $('timer-text').textContent = formatTimer(ms);
  $('timer').classList.toggle('over', window.liveInfo.isCountdown(timer) && ms <= 0);
  $('timer').classList.toggle('warn', window.liveInfo.isCountdown(timer) && ms > 0 && ms <= WARN_MS);
  $('timer').classList.toggle('paused', timer.mode !== 'until' && timer.startedAt == null); // até o horário nunca pausa
}

function tickClock() {
  $('clock').textContent = new Date(serverNow()).toLocaleTimeString('pt-BR');
  renderTimer();
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
connect((state) => {
  if (Number.isFinite(state.serverTime)) clockOffsetMs = state.serverTime - Date.now();
  lastState = state;
  render(state);
  renderTimer();
});
window.addEventListener('resize', () => lastState && render(lastState));
tickClock();
setInterval(tickClock, 1000);

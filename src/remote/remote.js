const token = new URLSearchParams(location.search).get('t') || '';
const $ = (id) => document.getElementById(id);
const withToken = (path) => `${path}?t=${encodeURIComponent(token)}`;

let playlist = [];
let flat = [];
let liveKey = null;

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => (k.startsWith('on') ? el.addEventListener(k.slice(2), v) : el.setAttribute(k, v)));
  el.append(...children);
  return el;
}

// Pede ao computador o slide N do item X; o conteúdo (e o tema automático) vem do culto salvo lá.
function showByKey(key) {
  const target = flat.find((s) => s.key === key);
  return target ? send({ type: 'goTo', itemId: target.itemId, index: target.index }) : undefined;
}

function send(action) {
  return fetch(withToken('/api/action'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action) });
}

function renderPlaylist() {
  flat = playlist.flatMap((item) => item.slides.map((slide, i) => ({ ...slide, key: `${item.id}:${i}`, itemId: item.id, index: i })));
  $('playlist').replaceChildren(...playlist.map((item) => h('div', { class: 'item' },
    h('h3', {}, item.title),
    ...item.slides.map((slide, i) => {
      const key = `${item.id}:${i}`;
      return h('div', {
        class: `slide${key === liveKey ? ' live' : ''}`,
        onclick: () => showByKey(key),
      }, h('small', {}, slide.label || ''), slide.text || (slide.image ? '(imagem)' : ''));
    }))));
}

const PLAYLIST_REFRESH_MS = 5000;

async function loadPlaylist() {
  try {
    const res = await fetch(withToken('/api/playlist'));
    if (!res.ok) return;
    const next = await res.json();
    if (JSON.stringify(next) !== JSON.stringify(playlist)) {
      playlist = next;
      renderPlaylist();
    }
  } catch {
    // sem rede: mantém a última playlist e tenta de novo no próximo ciclo
  }
}

function step(delta) {
  const at = flat.findIndex((s) => s.key === liveKey);
  const target = flat[at + delta];
  if (target) showByKey(target.key);
}

let lastState = null;
let clockOffsetMs = 0; // relógio do computador do operador menos o deste aparelho

function renderTimer() {
  const timer = lastState && lastState.timer;
  if (!timer) return;
  const { timerValueMs, formatTimer } = window.liveInfo;
  const ms = timerValueMs(timer, Date.now() + clockOffsetMs);
  $('timer-text').textContent = formatTimer(ms);
  $('timer-text').classList.toggle('over', timer.mode === 'countdown' && ms <= 0 && timer.startedAt != null);
  const running = timer.startedAt != null;
  $('timer-toggle').querySelector('.label').textContent = running ? 'Pausar' : 'Iniciar';
  window.icons.setIcon($('timer-toggle'), running ? 'pause' : 'play', 22);
}

function renderState(state) {
  lastState = state;
  if (Number.isFinite(state.serverTime)) clockOffsetMs = state.serverTime - Date.now();
  const { content, media } = state.layers;
  const slide = content.slide;
  liveKey = slide ? slide.key || null : null;
  $('live-label').textContent = media ? (media.kind === 'video' ? 'VÍDEO' : 'IMAGEM') : (slide ? slide.label || '' : '');
  $('live-text').textContent = media ? media.title || '—' : (slide ? slide.text || slide.label || '—' : '—');
  $('black').classList.toggle('on', state.blackout);
  $('cover').classList.toggle('on', state.layers.cover.visible);
  $('lyrics').classList.toggle('on', Boolean(content.hidden));
  // Controle do vídeo só aparece com vídeo no ar
  const video = media && media.kind === 'video';
  $('media-bar').hidden = !video;
  if (video) {
    $('media-toggle').querySelector('.label').textContent = media.playing ? 'Pausar vídeo' : 'Tocar vídeo';
    window.icons.setIcon($('media-toggle'), media.playing ? 'pause' : 'play', 22);
  }
  renderTimer();
  renderPlaylist();
}

async function init() {
  window.icons.apply();
  $('prev').onclick = () => step(-1);
  $('next').onclick = () => step(1);
  $('clear').onclick = () => send({ type: 'clear' });
  $('black').onclick = () => send({ type: 'blackout' });
  $('cover').onclick = () => send({ type: 'toggleCover' });
  $('lyrics').onclick = () => send({ type: 'toggleLayer', layer: 'content' });
  $('timer-toggle').onclick = () => send({ type: 'timerToggle' });
  $('timer-reset').onclick = () => send({ type: 'timerReset' });
  $('media-toggle').onclick = () => lastState && lastState.layers.media
    && send({ type: 'mediaControl', command: lastState.layers.media.playing ? 'pause' : 'play' });
  $('media-restart').onclick = () => send({ type: 'mediaControl', command: 'restart' });
  setInterval(renderTimer, 500);
  $('stage-link').href = `/stage.html?t=${encodeURIComponent(token)}`;

  const events = new EventSource(withToken('/api/events'));
  events.onopen = () => { $('conn').classList.add('ok'); loadPlaylist(); };
  setInterval(loadPlaylist, PLAYLIST_REFRESH_MS);
  events.onerror = () => $('conn').classList.remove('ok');
  events.onmessage = (e) => renderState(JSON.parse(e.data));
}

init();

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

// Envia um slide ao vivo junto com o próximo (usado pelo monitor de retorno).
function showByKey(key) {
  const at = flat.findIndex((s) => s.key === key);
  if (at < 0) return undefined;
  const next = flat[at + 1];
  return send({
    type: 'showSlide',
    slide: flat[at],
    next: next ? { label: next.label, text: next.text } : null,
  });
}

function send(action) {
  return fetch(withToken('/api/action'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action) });
}

function renderPlaylist() {
  flat = playlist.flatMap((item) => item.slides.map((slide, i) => ({ ...slide, key: `${item.id}:${i}` })));
  $('playlist').replaceChildren(...playlist.map((item) => h('div', { class: 'item' },
    h('h3', {}, item.title),
    ...item.slides.map((slide, i) => {
      const key = `${item.id}:${i}`;
      return h('div', {
        class: `slide${key === liveKey ? ' live' : ''}`,
        onclick: () => showByKey(key),
      }, h('small', {}, slide.label || ''), slide.text);
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

function renderState(state) {
  const slide = state.layers.content.slide;
  liveKey = slide ? slide.key || null : null;
  $('live-label').textContent = slide ? slide.label || '' : '';
  $('live-text').textContent = slide ? slide.text : '—';
  $('black').classList.toggle('on', state.blackout);
  $('cover').classList.toggle('on', state.layers.cover.visible);
  renderPlaylist();
}

async function init() {
  $('prev').onclick = () => step(-1);
  $('next').onclick = () => step(1);
  $('clear').onclick = () => send({ type: 'clear' });
  $('black').onclick = () => send({ type: 'blackout' });
  $('cover').onclick = () => send({ type: 'toggleCover' });
  $('stage-link').href = `/stage.html?t=${encodeURIComponent(token)}`;

  const events = new EventSource(withToken('/api/events'));
  events.onopen = () => { $('conn').classList.add('ok'); loadPlaylist(); };
  setInterval(loadPlaylist, PLAYLIST_REFRESH_MS);
  events.onerror = () => $('conn').classList.remove('ok');
  events.onmessage = (e) => renderState(JSON.parse(e.data));
}

init();

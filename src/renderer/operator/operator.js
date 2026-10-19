const api = window.apresentador;
const $ = (id) => document.getElementById(id);

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else el.setAttribute(key, value);
  }
  el.append(...children);
  return el;
}

const DIRECT_KEY = 'apresentador.direct';
const ui = { songs: [], playlist: [], current: null, index: -1, selected: -1, state: null, filter: '', direct: false };
let previewStage = null;
let programStage = null;

const slidesOf = () => (ui.current ? ui.current.slides : []);
const slideInfo = (slide) => (slide ? { label: slide.label, text: slide.text } : null);

// ---------- Preview / Programa ----------
function renderPreview() {
  if (!previewStage || !ui.state) return;
  const slide = slidesOf()[ui.selected] || null;
  const { layers } = ui.state;
  previewStage.update({
    ...ui.state,
    blackout: false,
    layers: { ...layers, content: { slide }, cover: { visible: false }, announcement: { text: null } },
  });
  $('btn-take').disabled = !slide;
}

// ---------- Slides ----------
function setCurrent(item) {
  ui.current = item;
  ui.index = -1;
  ui.selected = item && item.slides.length ? 0 : -1;
  $('slides-title').textContent = item ? item.title : 'Slides';
  $('btn-add-playlist').disabled = !item || item.fromPlaylist;
  $('btn-edit').disabled = !item || !item.songId;
  renderSlides();
  renderPreview();
}

function selectSlide(index) {
  if (index < 0 || index >= slidesOf().length) return;
  ui.selected = index;
  renderSlides();
  renderPreview();
}

function goLive(index) {
  const slides = slidesOf();
  if (index < 0 || index >= slides.length) return;
  ui.index = index;
  ui.selected = Math.min(index + 1, slides.length - 1); // o Preview passa a mostrar o próximo
  api.dispatch({
    type: 'showSlide',
    slide: { ...slides[index], key: `${ui.current.key}:${index}` },
    next: slideInfo(slides[index + 1]),
  });
  renderSlides();
  renderPreview();
}

function renderSlides() {
  $('slides').replaceChildren(...slidesOf().map((slide, i) => h('div', {
    class: `slide${i === ui.index ? ' live' : ''}${i === ui.selected ? ' selected' : ''}`,
    onclick: () => (ui.direct ? goLive(i) : selectSlide(i)),
    ondblclick: () => goLive(i),
  }, h('div', { class: 'tag' }, slide.label || ''), h('div', { class: 'body' }, slide.text))));
}

// ---------- Biblioteca ----------
function renderSongs() {
  const term = ui.filter.trim().toLowerCase();
  const items = ui.songs.filter((s) => s.title.toLowerCase().includes(term));
  $('songs').replaceChildren(...items.map((song) => h('li', { onclick: () => openSong(song) },
    h('span', {}, song.title),
    h('button', { title: 'Adicionar ao culto', onclick: (e) => { e.stopPropagation(); addSongToPlaylist(song); } }, '+'))));
}

async function openSong(song) {
  const slides = await api.songs.slides(song);
  setCurrent({ title: song.title, slides, songId: song.id, song, key: `lib-${song.id}` });
}

async function refreshSongs() {
  ui.songs = await api.songs.list();
  renderSongs();
}

// ---------- Culto (playlist) ----------
function renderPlaylist() {
  $('playlist').replaceChildren(...ui.playlist.map((item, i) => h('li', {
    onclick: () => setCurrent({
      title: item.title,
      slides: item.slides,
      songId: item.kind === 'song' ? item.refId : null,
      song: ui.songs.find((s) => s.id === item.refId),
      fromPlaylist: true,
      key: item.id,
    }),
  },
  h('span', {}, item.title),
  h('button', { title: 'Subir', onclick: (e) => { e.stopPropagation(); movePlaylist(item.id, i - 1); } }, '↑'),
  h('button', { title: 'Remover', onclick: (e) => { e.stopPropagation(); removePlaylist(item.id); } }, '✕'))));
}

async function refreshPlaylist() {
  ui.playlist = await api.playlist.list();
  renderPlaylist();
}

async function addSongToPlaylist(song) {
  const slides = await api.songs.slides(song);
  await api.playlist.add({ kind: 'song', refId: song.id, title: song.title, slides });
  refreshPlaylist();
}

async function movePlaylist(id, index) {
  await api.playlist.move(id, Math.max(0, index));
  refreshPlaylist();
}

async function removePlaylist(id) {
  await api.playlist.remove(id);
  refreshPlaylist();
}

// ---------- Bíblia ----------
async function searchVerse() {
  const result = await api.bible.lookup($('verse-ref').value);
  $('verse-msg').textContent = result ? `Versão: ${result.version}` : 'Referência não encontrada.';
  if (!result) return;
  const chapterRef = result.reference.slice(0, result.reference.lastIndexOf(':'));
  const slides = result.verses.map((v, index) => ({ index, label: `${chapterRef}:${v.number}`, text: v.text }));
  setCurrent({ title: result.reference, slides, songId: null, verse: true, key: `verse-${result.reference}` });
  $('btn-add-playlist').disabled = false;
}

// ---------- Editor ----------
function openEditor(song) {
  const editing = song || { title: '', text: '' };
  $('ed-title').value = editing.title;
  $('ed-text').value = editing.text;
  $('ed-delete').hidden = !song;
  $('editor').dataset.id = editing.id || '';
  $('editor').showModal();
}

async function saveEditor() {
  const saved = await api.songs.save({ id: $('editor').dataset.id || undefined, title: $('ed-title').value, text: $('ed-text').value });
  await refreshSongs();
  await refreshPlaylist();
  openSong(saved);
}

// ---------- Estado ao vivo ----------
function renderLive(state) {
  ui.state = state;
  programStage.update(state);
  renderPreview();
  $('btn-black').classList.toggle('primary', state.blackout);
  $('btn-cover').classList.toggle('primary', state.layers.cover.visible);
}

async function syncOutputButtons() {
  const [output, stage] = await Promise.all([api.outputs.isOpen(), api.stage.isOpen()]);
  $('btn-output').classList.toggle('on', output);
  $('btn-output').textContent = output ? 'Parar projeção' : 'Projetar';
  $('btn-stage').textContent = stage ? 'Fechar retorno' : 'Abrir retorno';
}

async function loadDisplays() {
  const displays = await api.displays.list();
  $('stage-display').replaceChildren(
    h('option', { value: '' }, 'Em janela'),
    ...displays.map((d) => h('option', { value: String(d.id) }, d.label)),
  );
}

// ---------- Ligações ----------
function bindEvents() {
  $('search').addEventListener('input', (e) => { ui.filter = e.target.value; renderSongs(); });
  $('btn-new').addEventListener('click', () => openEditor(null));
  $('btn-edit').addEventListener('click', () => ui.current && ui.current.song && openEditor(ui.current.song));
  $('btn-verse').addEventListener('click', searchVerse);
  $('verse-ref').addEventListener('keydown', (e) => e.key === 'Enter' && searchVerse());
  $('btn-import-bible').addEventListener('click', async () => {
    const r = await api.bible.import();
    $('verse-msg').textContent = r.ok ? `Bíblia importada: ${r.name}` : `Importação: ${r.reason}`;
  });
  $('btn-add-playlist').addEventListener('click', async () => {
    const cur = ui.current;
    if (!cur) return;
    await api.playlist.add({ kind: cur.verse ? 'verse' : 'song', refId: cur.songId, title: cur.title, slides: cur.slides });
    refreshPlaylist();
  });

  $('direct').addEventListener('change', (e) => {
    ui.direct = e.target.checked;
    try { localStorage.setItem(DIRECT_KEY, ui.direct ? '1' : '0'); } catch { /* sem persistência */ }
  });

  $('ed-save').addEventListener('click', (e) => { if ($('ed-title').value.trim()) { e.preventDefault(); $('editor').close(); saveEditor(); } });
  $('ed-delete').addEventListener('click', async () => {
    await api.songs.remove($('editor').dataset.id);
    $('editor').close();
    setCurrent(null);
    refreshSongs();
    refreshPlaylist();
  });

  $('btn-take').addEventListener('click', () => goLive(ui.selected));
  $('btn-next').addEventListener('click', () => goLive(ui.index + 1));
  $('btn-prev').addEventListener('click', () => goLive(ui.index - 1));
  $('btn-clear').addEventListener('click', () => api.dispatch({ type: 'clear' }));
  $('btn-black').addEventListener('click', () => api.dispatch({ type: 'blackout' }));
  $('btn-cover').addEventListener('click', () => api.dispatch({ type: 'toggleCover' }));
  const announce = (text) => api.dispatch({ type: 'setAnnouncement', text });
  $('btn-announce').addEventListener('click', () => announce($('announce').value.trim()));
  $('announce').addEventListener('keydown', (e) => e.key === 'Enter' && announce($('announce').value.trim()));
  $('bg-color').addEventListener('input', (e) => api.dispatch({ type: 'setBackground', background: { kind: 'color', value: e.target.value } }));
  $('btn-bg-image').addEventListener('click', async () => {
    const url = await api.background.pickImage();
    if (url) api.dispatch({ type: 'setBackground', background: { kind: 'image', value: url } });
  });

  const stageMessage = (text) => api.dispatch({ type: 'setStageMessage', text });
  $('btn-stage-msg').addEventListener('click', () => stageMessage($('stage-msg').value.trim()));
  $('stage-msg').addEventListener('keydown', (e) => e.key === 'Enter' && stageMessage($('stage-msg').value.trim()));
  $('btn-stage-clear').addEventListener('click', () => { $('stage-msg').value = ''; stageMessage(''); });
  $('btn-stage').addEventListener('click', async () => {
    const id = Number($('stage-display').value);
    await api.stage.toggle(Number.isInteger(id) && id > 0 ? id : undefined);
    syncOutputButtons();
  });

  $('btn-output').addEventListener('click', async () => { await api.outputs.toggle(); syncOutputButtons(); });
  $('btn-remote').addEventListener('click', async () => {
    const info = await api.remote.info();
    $('remote-url').textContent = info.url;
    $('remote-stage-url').textContent = info.stageUrl;
    $('remote-dialog').showModal();
  });
  $('remote-close').addEventListener('click', () => $('remote-dialog').close());

  document.addEventListener('keydown', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const typing = target && target.matches('input, textarea, select');
    // Alças usam as setas para mover/redimensionar; Espaço/Enter em botões ativam o próprio botão.
    const onGrip = target && target.closest('.grip, .resize-handle');
    const activatesControl = target && target.closest('button, summary, a') && (e.key === ' ' || e.key === 'Enter');
    if (typing || onGrip || activatesControl || e.defaultPrevented || document.querySelector('dialog[open]')) return;
    const actions = {
      ArrowRight: () => goLive(ui.index + 1),
      ' ': () => goLive(ui.index + 1),
      ArrowLeft: () => goLive(ui.index - 1),
      Enter: () => goLive(ui.selected),
      b: () => api.dispatch({ type: 'blackout' }),
      Escape: () => api.dispatch({ type: 'clear' }),
    };
    const act = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (act) { e.preventDefault(); act(); }
  });
}

async function init() {
  window.initLayout();
  previewStage = window.createStage($('mon-preview'));
  programStage = window.createStage($('mon-program'));
  try { ui.direct = localStorage.getItem(DIRECT_KEY) === '1'; } catch { ui.direct = false; }
  $('direct').checked = ui.direct;

  bindEvents();
  api.onState(renderLive);
  window.addEventListener('focus', syncOutputButtons);
  window.addEventListener('resize', () => ui.state && (programStage.update(ui.state), renderPreview()));
  renderLive(await api.getState());
  await Promise.all([refreshSongs(), refreshPlaylist(), syncOutputButtons(), loadDisplays()]);
}

init();

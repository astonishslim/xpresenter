const api = window.apresentador;
const $ = (id) => document.getElementById(id);
const icon = (name, size = 12) => window.icons.create(name, size);

// Botão de ícone minúsculo para listas (sempre com title e aria-label).
function miniButton(name, label, onclick) {
  return h('button', { class: 'mini', title: label, 'aria-label': label, onclick }, icon(name));
}

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
let themePanel = null;
let lyricsPanel = null;
const DIM_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80];

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
// Busca por título ou trecho da letra (no processo principal, sem acentos). Quem acha pela letra mostra a linha.
let songSearchSeq = 0;
const SONG_SEARCH_DELAY_MS = 120;
let songSearchTimer = null;
const scheduleSongSearch = () => {
  clearTimeout(songSearchTimer);
  songSearchTimer = setTimeout(renderSongs, SONG_SEARCH_DELAY_MS);
};

// Se a busca falhar, cai para o filtro simples por título, para a lista nunca ficar parada.
async function findSongs(term) {
  try {
    return await api.songs.search(term);
  } catch (err) {
    console.error(`[músicas] busca falhou: ${err.message}`);
    const t = term.toLowerCase();
    return ui.songs.filter((s) => s.title.toLowerCase().includes(t)).map((s) => ({ id: s.id, snippet: null }));
  }
}

async function renderSongs() {
  const seq = ++songSearchSeq;
  const term = ui.filter.trim();
  const hits = await findSongs(term);
  if (seq !== songSearchSeq) return; // chegou uma busca mais nova enquanto esta rodava
  const byId = new Map(ui.songs.map((s) => [s.id, s]));
  const items = hits.filter((hit) => byId.has(hit.id)).map((hit) => {
    const song = byId.get(hit.id);
    const label = hit.snippet ? h('span', { class: 'two-lines' }, song.title, h('small', {}, hit.snippet)) : h('span', {}, song.title);
    return h('li', { onclick: () => openSong(song) },
      label,
      miniButton('plus', 'Adicionar ao culto', (e) => { e.stopPropagation(); addSongToPlaylist(song); }));
  });
  if (!items.length && term) {
    items.push(h('li', { class: 'hint', onclick: () => lyricsPanel.open(term) },
      icon('globe'), h('span', {}, `Buscar “${term}” na internet`)));
  }
  $('songs').replaceChildren(...items);
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
  miniButton('arrow-up', 'Subir no culto', (e) => { e.stopPropagation(); movePlaylist(item.id, i - 1); }),
  miniButton('x', 'Remover do culto', (e) => { e.stopPropagation(); removePlaylist(item.id); }))));
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
// Coloca uma passagem nos Slides: um slide por verso, com a versão no rótulo (ex.: "João 3:16 · TB").
function showVerses(result) {
  const chapterRef = result.reference.slice(0, result.reference.lastIndexOf(':'));
  const suffix = result.code ? ` · ${result.code}` : '';
  const slides = result.verses.map((v, index) => ({ index, label: `${chapterRef}:${v.number}${suffix}`, text: v.text }));
  const title = `${result.reference}${suffix}`;
  setCurrent({ title, slides, songId: null, verse: true, key: `verse-${title}` });
  $('btn-add-playlist').disabled = false;
}

// ---------- Editor ----------
function openEditor(song) {
  const editing = song || { title: '', text: '' };
  $('ed-title').value = editing.title;
  $('ed-text').value = editing.text;
  $('ed-delete').hidden = !(song && song.id); // letra vinda da internet ainda não existe na biblioteca
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
  themePanel.render(state);
  if (state.layers.background.kind === 'color' && document.activeElement !== $('bg-color')) $('bg-color').value = state.layers.background.value;
  $('btn-black').classList.toggle('primary', state.blackout);
  $('btn-cover').classList.toggle('primary', state.layers.cover.visible);
  renderLayerButtons(state);
  if (document.activeElement !== $('bg-dim')) $('bg-dim').value = String(state.layers.background.dim || 0);
}

// Botão aceso (pressionado) = camada oculta; o ícone troca para a versão riscada.
function renderLayerButtons(state) {
  document.querySelectorAll('.layer-btn').forEach((btn) => {
    const hidden = Boolean(state.layers[btn.dataset.layer].hidden);
    const label = `${hidden ? 'Mostrar' : 'Ocultar'} ${btn.dataset.name}${btn.dataset.layer === 'content' ? ' (L)' : ''}`;
    btn.setAttribute('aria-pressed', String(hidden));
    btn.setAttribute('aria-label', label);
    btn.title = label;
    const iconName = hidden ? btn.dataset.off : btn.dataset.on;
    if (btn.dataset.icon !== iconName) window.icons.setIcon(btn, iconName);
  });
}

async function syncOutputButtons() {
  const [output, stage] = await Promise.all([api.outputs.isOpen(), api.stage.isOpen()]);
  $('btn-output').classList.toggle('on', output);
  const outputBtn = $('btn-output');
  outputBtn.querySelector('.label').textContent = output ? 'Parar projeção' : 'Projetar';
  window.icons.setIcon(outputBtn, output ? 'monitor-off' : 'monitor-play');

  const stageBtn = $('btn-stage');
  const stageLabel = stage ? 'Fechar retorno' : 'Abrir retorno';
  stageBtn.title = stageLabel;
  stageBtn.setAttribute('aria-label', stageLabel);
  window.icons.setIcon(stageBtn, stage ? 'monitor-off' : 'monitor-up');
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
  $('search').addEventListener('input', (e) => { ui.filter = e.target.value; scheduleSongSearch(); });
  $('btn-new').addEventListener('click', () => openEditor(null));
  $('btn-lyrics-online').addEventListener('click', () => lyricsPanel.open(ui.filter.trim()));
  const toggleLayer = (layer) => api.dispatch({ type: 'toggleLayer', layer });
  document.querySelectorAll('.layer-btn').forEach((btn) => btn.addEventListener('click', () => toggleLayer(btn.dataset.layer)));
  $('bg-dim').replaceChildren(...DIM_STEPS.map((v) => h('option', { value: String(v) }, v ? `Escurecer ${v}%` : 'Fundo normal')));
  $('bg-dim').addEventListener('change', (e) => api.dispatch({ type: 'setBackgroundDim', value: Number(e.target.value) }));
  $('btn-edit').addEventListener('click', () => ui.current && ui.current.song && openEditor(ui.current.song));
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
  const pickBackground = (kind, pick) => async () => {
    const url = await pick();
    if (url) api.dispatch({ type: 'setBackground', background: { kind, value: url } });
  };
  $('btn-bg-image').addEventListener('click', pickBackground('image', api.background.pickImage));
  $('btn-bg-video').addEventListener('click', pickBackground('video', api.background.pickVideo));

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
    $('remote-live-url').textContent = info.liveUrl;
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
      l: () => toggleLayer('content'),
      Escape: () => api.dispatch({ type: 'clear' }),
    };
    const act = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (act) { e.preventDefault(); act(); }
  });
}

async function init() {
  window.icons.apply();
  window.initPresets(window.initLayout());
  previewStage = window.createStage($('mon-preview'));
  programStage = window.createStage($('mon-program'));
  themePanel = window.initThemePanel({ api });
  lyricsPanel = window.initLyricsPanel({ api, openEditor });
  try { ui.direct = localStorage.getItem(DIRECT_KEY) === '1'; } catch { ui.direct = false; }
  $('direct').checked = ui.direct;

  bindEvents();
  api.onState(renderLive);
  window.addEventListener('focus', syncOutputButtons);
  window.addEventListener('resize', () => ui.state && (programStage.update(ui.state), renderPreview()));
  renderLive(await api.getState());
  await Promise.all([window.initBiblePanel({ api, showVerses }), themePanel.load(), refreshSongs(), refreshPlaylist(), syncOutputButtons(), loadDisplays()]);
}

init();

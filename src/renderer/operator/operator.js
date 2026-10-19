const api = window.apresentador;
const $ = (id) => document.getElementById(id);
const icon = (name, size = 12) => window.icons.create(name, size);

// Botão de ícone minúsculo para listas (sempre com title e aria-label).
function miniButton(name, label, onclick) {
  return h('button', { class: 'mini', title: label, 'aria-label': label, onclick }, icon(name));
}

// Desenha a matriz do QR (linhas de '0' e '1') como um SVG de um só caminho, com margem de 4 módulos.
const QR_MARGIN = 4;
function drawQr(box, rows) {
  box.replaceChildren();
  if (!Array.isArray(rows) || !rows.length) return;
  const NS = 'http://www.w3.org/2000/svg';
  const size = rows.length + QR_MARGIN * 2;
  const path = rows.flatMap((row, y) => [...row].map((bit, x) => (bit === '1' ? `M${x + QR_MARGIN} ${y + QR_MARGIN}h1v1h-1z` : ''))).join('');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const shape = document.createElementNS(NS, 'path');
  shape.setAttribute('d', path);
  shape.setAttribute('fill', '#000');
  svg.append(shape);
  box.append(svg);
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
let mediaPanel = null;
let messagesPanel = null;
let propsPanel = null;
let macrosPanel = null;
let audioPanel = null;
const DIM_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80];

const slidesOf = () => (ui.current ? ui.current.slides : []);
const slideInfo = (slide) => (slide ? { label: slide.label, text: slide.text } : null);
// Mensagem de erro do IPC sem o prefixo técnico do Electron.
const cleanError = (err) => String(err && err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
// O primeiro arranjo da música é o padrão; sem arranjo, a ordem da letra ('').
const defaultArrangement = (song) => (song && Array.isArray(song.arrangements) && song.arrangements[0] ? song.arrangements[0].name : '');

// ---------- Preview / Programa ----------
function renderPreview() {
  if (!previewStage || !ui.state) return;
  const slide = slidesOf()[ui.selected] || null;
  const { layers } = ui.state;
  // Slide de mídia aparece parado no Preview (sem tocar); slide comum esconde a mídia ao vivo.
  const media = slide && slide.media ? { ...slide.media, playing: false, seq: 0 } : null;
  previewStage.update({
    ...ui.state,
    blackout: false,
    layers: { ...layers, media, content: { slide: media ? null : slide }, cover: { visible: false }, announcement: { text: null } },
  });
  $('btn-take').disabled = !slide;
}

// ---------- Slides ----------
// keepPosition: o mesmo item foi recarregado (arranjo trocado, slide editado); mantém o ao vivo e a seleção.
function setCurrent(item, { keepPosition = false } = {}) {
  const sameItem = Boolean(item && ui.current && item.key === ui.current.key);
  // Abrir outro item só para ver não pode colocá-lo no ar pelo avanço automático.
  if (autoTimer && !sameItem) {
    stopAuto();
    $('auto-advance').value = '0';
    setSlidesMessage('Avanço automático desligado: outro item foi aberto.');
  }
  ui.current = item;
  const count = item ? item.slides.length : 0;
  if (keepPosition && sameItem) {
    ui.index = Math.min(ui.index, count - 1);
    ui.selected = count ? Math.min(Math.max(ui.selected, 0), count - 1) : -1;
  } else {
    ui.index = -1;
    ui.selected = count ? 0 : -1;
  }
  $('slides-title').textContent = item ? item.title : 'Slides';
  $('btn-add-playlist').disabled = !item || item.fromPlaylist;
  $('btn-edit').disabled = !item || !item.songId;
  renderArrangement();
  renderSlides();
  renderPreview();
}

// ---------- Arranjos ----------
// Seletor só aparece para música com arranjos. Arranjo que foi excluído continua visível, marcado.
function renderArrangement() {
  const cur = ui.current;
  const list = cur && cur.song && Array.isArray(cur.song.arrangements) ? cur.song.arrangements : [];
  $('arrangement-box').hidden = !list.length;
  if (!list.length) return;
  const options = [h('option', { value: '' }, 'Ordem da letra'), ...list.map((a) => h('option', { value: a.name }, a.name))];
  if (cur.arrangement && !list.some((a) => a.name === cur.arrangement)) {
    options.push(h('option', { value: cur.arrangement }, `${cur.arrangement} (excluído)`));
  }
  $('arrangement').replaceChildren(...options);
  $('arrangement').value = cur.arrangement || '';
}

// Trocar o arranjo de um item do culto vale para o culto salvo (e o celular); na biblioteca, só para o que está aberto.
async function changeArrangement(name) {
  const cur = ui.current;
  if (!cur || !cur.song) return;
  try {
    if (cur.fromPlaylist) {
      const item = await api.playlist.setArrangement(cur.key, name);
      await refreshPlaylist();
      setCurrent(currentFromPlaylist(item), { keepPosition: true });
    } else {
      const slides = await api.songs.slides(cur.song, name);
      setCurrent({ ...cur, slides, arrangement: name }, { keepPosition: true });
    }
    setSlidesMessage('');
  } catch (err) {
    setSlidesMessage(cleanError(err));
    renderArrangement();
  }
}

// ---------- Seções: atalhos e cores ----------
// Botões das seções (V1, C, V2, P…) acima dos slides; clique põe o começo da seção ao vivo.
function renderGroups(slides) {
  const starts = window.sections.groupStarts(slides);
  const groups = starts.filter((g) => g.kind !== 'other');
  const endOf = (g) => (starts.find((x) => x.index > g.index) || { index: slides.length }).index;
  $('slide-groups').hidden = !groups.length;
  $('slide-groups').replaceChildren(...groups.map((g) => {
    const label = `Ao vivo: ${g.label}${g.hotkey ? ` (tecla ${g.hotkey.toUpperCase()})` : ''}`;
    const live = ui.index >= g.index && ui.index < endOf(g);
    return h('button', {
      class: `group-chip kind-${g.kind}${live ? ' live' : ''}`, type: 'button', title: label, 'aria-label': label, onclick: () => goLive(g.index),
    }, g.abbr);
  }));
}

// Tecla de seção (1–9 verso, C refrão, E pré-refrão, P ponte, I intro, F final): próxima ocorrência ao vivo.
function jumpToGroup(key) {
  const index = window.sections.findGroupStart(slidesOf(), key, ui.index);
  if (index < 0) return false;
  goLive(index);
  return true;
}

function selectSlide(index) {
  if (index < 0 || index >= slidesOf().length) return;
  ui.selected = index;
  renderSlides();
  renderPreview();
}

// Quando um item novo (outra música ou passagem) entra ao vivo, aplica o tema dele antes do primeiro slide.
// Avanços seguidos no mesmo item esperam a MESMA aplicação (não aplicam duas vezes nem passam na frente).
function applyItemTheme(item) {
  if (item.key === ui.liveKey) return ui.themePending;
  ui.liveKey = item.key;
  ui.themePending = (async () => {
    const name = themePanel.themeFor(item);
    if (!name) return;
    try {
      const res = await themePanel.apply(name);
      if (!res.ok) console.error(`[temas] tema automático "${name}": ${res.reason}`);
    } catch (err) {
      console.error(`[temas] tema automático "${name}" falhou: ${err.message}`); // o slide vai ao ar mesmo assim
    }
  })();
  return ui.themePending;
}

// ---------- Avanço automático ----------
// A cada N s manda o próximo slide do item aberto; em loop volta ao primeiro. Avançar à mão reinicia a contagem.
let autoTimer = null;
const autoSeconds = () => Number($('auto-advance').value);

function stopAuto() {
  clearInterval(autoTimer);
  autoTimer = null;
}

function restartAuto() {
  stopAuto();
  if (!autoSeconds()) return;
  autoTimer = setInterval(() => {
    // Tela preta, letra oculta ou conteúdo limpo: o operador tirou do ar de propósito; não traz de volta.
    const live = ui.state && ui.state.layers;
    if (!live || ui.state.blackout || live.content.hidden || (!live.content.slide && !live.media)) return;
    const next = window.liveInfo.nextAutoIndex(ui.index, slidesOf().length, $('auto-loop').checked);
    if (next < 0) {
      $('auto-advance').value = '0';
      stopAuto();
      return;
    }
    goLive(next, { auto: true });
  }, autoSeconds() * 1000);
}

let liveSeq = 0;
async function goLive(index, { auto = false } = {}) {
  const slides = slidesOf();
  if (index < 0 || index >= slides.length) return;
  if (!auto && autoTimer) restartAuto();
  const item = ui.current;
  const seq = ++liveSeq;
  ui.index = index;
  ui.selected = Math.min(index + 1, slides.length - 1); // o Preview passa a mostrar o próximo
  renderSlides();
  renderPreview();
  await applyItemTheme(item);
  if (seq !== liveSeq) return; // outro avanço aconteceu enquanto o tema era aplicado: ele manda o slide certo
  const key = `${item.key}:${index}`;
  const action = slides[index].media
    ? { type: 'showMedia', media: { ...slides[index].media, key } }
    : { type: 'showSlide', slide: { ...slides[index], title: item.title, key }, next: slideInfo(slides[index + 1]) };
  try {
    await api.dispatch(action);
    setSlidesMessage('');
  } catch (err) {
    // ex.: vídeo ou página de PDF cujo arquivo foi movido/apagado: avisa em vez de projetar tela vazia
    setSlidesMessage(cleanError(err));
  }
}

function setSlidesMessage(text) {
  $('slides-msg').textContent = text;
}

// Cada slide leva a cor do tipo da seção; o começo de cada seção mostra a tecla de atalho.
function renderSlides() {
  const slides = slidesOf();
  const starts = new Map(window.sections.groupStarts(slides).map((g) => [g.index, g]));
  $('slides').replaceChildren(...slides.map((slide, i) => {
    const hotkey = starts.has(i) ? starts.get(i).hotkey : null;
    const tag = h('div', { class: 'tag' },
      ...(hotkey ? [h('span', { class: 'hotkey', title: `Tecla ${hotkey.toUpperCase()}` }, hotkey.toUpperCase())] : []),
      slide.label || '');
    return h('div', {
      class: `slide kind-${window.sections.kindOf(slide.label)}${i === ui.index ? ' live' : ''}${i === ui.selected ? ' selected' : ''}`,
      title: isEditable(slide) ? 'Clique: Preview · duplo clique: ao vivo · botão direito (ou F2): editar' : '',
      onclick: () => (ui.direct ? goLive(i) : selectSlide(i)),
      ondblclick: () => goLive(i),
      oncontextmenu: (e) => { e.preventDefault(); openQuickEdit(i); },
    }, tag,
    slide.image ? h('img', { class: 'slide-thumb', src: slide.image, alt: slide.label || '', loading: 'lazy' }) : h('div', { class: 'body' }, slide.text));
  }));
  renderGroups(slides);
}

// ---------- Edição rápida (botão direito ou F2 no slide) ----------
const isEditable = (slide) => Boolean(slide) && !slide.image && !slide.media && typeof slide.text === 'string';
let quickIndex = -1;

function openQuickEdit(index) {
  const slide = slidesOf()[index];
  if (!isEditable(slide)) return;
  quickIndex = index;
  const cur = ui.current;
  $('quick-text').value = slide.text;
  $('quick-error').textContent = '';
  $('quick-hint').textContent = cur.songId
    ? 'Corrige a letra da música: vale para todas as vezes que este trecho aparece, inclusive no culto.'
    : (cur.fromPlaylist ? 'Corrige este slide no culto.' : 'Corrige só o que está aberto (não fica salvo). Adicione ao culto para guardar.');
  $('quick-edit').showModal();
  $('quick-text').focus();
}

// Recarrega o item aberto com os dados novos, sem perder o slide ao vivo nem a seleção.
async function reloadCurrent() {
  const cur = ui.current;
  await refreshSongs();
  await refreshPlaylist();
  if (cur.fromPlaylist) {
    const item = ui.playlist.find((i) => i.id === cur.key);
    if (item) setCurrent(currentFromPlaylist(item), { keepPosition: true });
    return;
  }
  const song = cur.songId && ui.songs.find((s) => s.id === cur.songId);
  if (song) await openSong(song, cur.arrangement, { keepPosition: true });
}

async function saveQuickEdit() {
  const cur = ui.current;
  const index = quickIndex;
  const slide = cur && slidesOf()[index];
  const text = $('quick-text').value.trim();
  if (!slide || !text) return;
  if (text === slide.text) { $('quick-edit').close(); return; }
  try {
    if (cur.songId) await api.songs.editSlide(cur.songId, slide.label, slide.text, text);
    else if (cur.fromPlaylist) await api.playlist.editSlide(cur.key, index, text);
    else ui.current = { ...cur, slides: cur.slides.map((s, i) => (i === index ? { ...s, text } : s)) };
  } catch (err) {
    $('quick-error').textContent = cleanError(err);
    return;
  }
  $('quick-edit').close();
  // O slide no ar tem o texto antigo (este slide ou outra repetição do mesmo trecho): reenvia corrigido.
  const liveIndex = ui.index;
  const liveSlide = slidesOf()[liveIndex];
  const resend = liveKey() === `${cur.key}:${liveIndex}` && liveSlide && liveSlide.text === slide.text;
  if (cur.songId || cur.fromPlaylist) await reloadCurrent();
  else setCurrent(ui.current, { keepPosition: true });
  if (resend) goLive(liveIndex);
}

const liveKey = () => {
  if (!ui.state) return null;
  const { content, media } = ui.state.layers;
  return media ? media.key : content.slide && content.slide.key;
};

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

// Resultado da importação de letras: o que entrou e o que foi recusado (com o motivo de cada um).
async function reportImport({ imported, skipped }) {
  const parts = [];
  if (imported.length) parts.push(`${imported.length} ${imported.length === 1 ? 'música importada' : 'músicas importadas'}`);
  if (skipped.length) {
    const reasons = skipped.map((s) => `${s.name} (${s.reason})`).join('; ');
    parts.push(`${skipped.length} ${skipped.length === 1 ? 'ignorado' : 'ignorados'}: ${reasons}`);
  }
  $('songs-msg').textContent = parts.join(' · ');
  if (imported.length) await refreshSongs();
}

// Arquivos soltos sobre a seção Músicas.
function bindSongDrop() {
  const fold = document.querySelector('details[data-key="songs"]');
  fold.addEventListener('dragover', (e) => { e.preventDefault(); fold.classList.add('file-over'); });
  fold.addEventListener('dragleave', () => fold.classList.remove('file-over'));
  fold.addEventListener('drop', async (e) => {
    e.preventDefault();
    fold.classList.remove('file-over');
    if (e.dataTransfer && e.dataTransfer.files.length) reportImport(await api.songs.importFiles([...e.dataTransfer.files]));
  });
}

async function openSong(song, arrangement = defaultArrangement(song), options = {}) {
  const slides = await api.songs.slides(song, arrangement);
  setCurrent({ title: song.title, slides, songId: song.id, song, arrangement, key: `lib-${song.id}` }, options);
}

async function refreshSongs() {
  ui.songs = await api.songs.list();
  renderSongs();
}

// ---------- Culto (playlist) ----------
// Item do culto como "item aberto" nos Slides.
function currentFromPlaylist(item) {
  return {
    title: item.title,
    slides: item.slides,
    songId: item.kind === 'song' ? item.refId : null,
    song: ui.songs.find((s) => s.id === item.refId),
    arrangement: item.arrangement || '',
    verse: item.kind === 'verse',
    fromPlaylist: true,
    key: item.id,
  };
}

function renderPlaylist() {
  $('playlist').replaceChildren(...ui.playlist.map((item, i) => h('li', {
    onclick: () => setCurrent(currentFromPlaylist(item)),
  },
  h('span', { title: item.arrangement ? `Arranjo: ${item.arrangement}` : '' }, item.arrangement ? `${item.title} · ${item.arrangement}` : item.title),
  miniButton('arrow-up', 'Subir no culto', (e) => { e.stopPropagation(); movePlaylist(item.id, i - 1); }),
  miniButton('x', 'Remover do culto', (e) => { e.stopPropagation(); removePlaylist(item.id); }))));
}

async function refreshPlaylist() {
  ui.playlist = await api.playlist.list();
  renderPlaylist();
}

async function addSongToPlaylist(song, arrangement = defaultArrangement(song)) {
  const slides = await api.songs.slides(song, arrangement);
  await api.playlist.add({ kind: 'song', refId: song.id, title: song.title, slides, ...(arrangement ? { arrangement } : {}) });
  refreshPlaylist();
}

async function movePlaylist(id, index) {
  await api.playlist.move(id, Math.max(0, index));
  refreshPlaylist();
}

async function removePlaylist(id) {
  if (ui.current && ui.current.key === id) setCurrent(null); // o item aberto saiu do culto
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
  $('ed-theme').replaceChildren(
    h('option', { value: '' }, 'Automático (tema padrão das músicas)'),
    ...themePanel.names().map((name) => h('option', { value: name }, name)),
  );
  // Tema que não existe mais continua visível, para não sumir sem o operador perceber.
  if (editing.theme && !themePanel.names().includes(editing.theme)) {
    $('ed-theme').append(h('option', { value: editing.theme }, `${editing.theme} (excluído)`));
  }
  $('ed-theme').value = editing.theme || '';
  $('ed-author').value = editing.author || '';
  $('ed-ccli').value = editing.ccli || '';
  $('ed-delete').hidden = !(song && song.id); // letra vinda da internet ainda não existe na biblioteca
  $('editor').dataset.id = editing.id || '';
  $('ed-arrangements').replaceChildren(...(editing.arrangements || []).map(arrangementRow));
  $('editor').showModal();
  renderSectionHint();
}

// Uma linha do editor de arranjos: nome + ordem ("V1 C V2 C").
function arrangementRow(arrangement = { name: '', order: [] }) {
  const row = h('div', { class: 'row arr-row' },
    h('input', { class: 'arr-name', placeholder: 'Nome (ex.: Culto)', maxlength: '40', 'aria-label': 'Nome do arranjo', autocomplete: 'off' }),
    h('input', { class: 'arr-order', placeholder: 'V1 C V2 C P C C', maxlength: '400', 'aria-label': 'Ordem das seções', autocomplete: 'off' }),
    miniButton('x', 'Remover arranjo', () => { row.remove(); renderSectionHint(); }));
  row.querySelector('.arr-name').value = arrangement.name;
  row.querySelector('.arr-order').value = window.sections.formatOrder(arrangement.order || []);
  return row;
}

const readArrangements = () => [...$('ed-arrangements').querySelectorAll('.arr-row')]
  .map((row) => ({ name: row.querySelector('.arr-name').value.trim(), order: row.querySelector('.arr-order').value }))
  .filter((a) => a.name || a.order.trim());

// Mostra as siglas das seções desta letra e avisa o que cada arranjo pede e não existe.
let hintSeq = 0;
let hintTimer = null;
const HINT_DELAY_MS = 250;
const scheduleSectionHint = () => { clearTimeout(hintTimer); hintTimer = setTimeout(renderSectionHint, HINT_DELAY_MS); };

async function renderSectionHint() {
  const seq = ++hintSeq;
  const slides = await api.songs.slides({ title: 'x', text: $('ed-text').value });
  if (seq !== hintSeq) return;
  const labels = [...new Set(slides.map((s) => s.label))];
  $('ed-sections').textContent = labels.length
    ? `Seções desta letra: ${labels.map((l) => `${window.sections.abbrOf(l)} (${l})`).join(' · ')}`
    : '';
  const problems = readArrangements().flatMap((a) => {
    const order = window.sections.parseOrder(a.order);
    if (!a.name) return ['Arranjo sem nome não é salvo.'];
    if (!order.length) return [`"${a.name}" sem ordem não é salvo.`];
    const missing = [...new Set(order.filter((t) => !labels.some((l) => window.sections.matchesToken(l, t))))];
    return missing.length ? [`"${a.name}": não achei ${missing.join(', ')} (será ignorado).`] : [];
  });
  $('ed-arr-warn').textContent = problems.join(' ');
}

async function saveEditor() {
  // Mantém o arranjo que estava aberto; se a música ainda não tinha arranjos, abre no padrão (o primeiro).
  const cur = ui.current;
  const hadArrangements = cur && cur.song && Array.isArray(cur.song.arrangements) && cur.song.arrangements.length > 0;
  const keep = hadArrangements && cur.songId === $('editor').dataset.id ? cur.arrangement : undefined;
  const saved = await api.songs.save({
    id: $('editor').dataset.id || undefined,
    title: $('ed-title').value,
    text: $('ed-text').value,
    theme: $('ed-theme').value,
    author: $('ed-author').value,
    ccli: $('ed-ccli').value,
    arrangements: readArrangements(),
  });
  await refreshSongs();
  await refreshPlaylist();
  const stillThere = keep === '' || (saved.arrangements || []).some((a) => a.name === keep);
  openSong(saved, stillThere ? keep : defaultArrangement(saved));
}

// ---------- Estado ao vivo ----------
// O slide ao vivo pode ter mudado por fora (celular, OSC): se é do item aberto, acompanha o índice.
function syncLiveIndex(state) {
  if (!ui.current) return;
  const { content, media } = state.layers;
  const key = media ? media.key : content.slide && content.slide.key;
  const prefix = `${ui.current.key}:`;
  if (typeof key !== 'string' || !key.startsWith(prefix)) return;
  const index = Number(key.slice(prefix.length));
  if (!Number.isInteger(index) || index === ui.index) return;
  ui.index = index;
  ui.selected = Math.min(index + 1, slidesOf().length - 1);
  renderSlides();
}

function renderLive(state) {
  ui.state = state;
  syncLiveIndex(state);
  programStage.update(state);
  renderPreview();
  themePanel.render(state);
  mediaPanel.renderLive(state);
  messagesPanel.render(state);
  propsPanel.render(state);
  audioPanel.render(state);
  if (state.layers.background.kind === 'color' && document.activeElement !== $('bg-color')) $('bg-color').value = state.layers.background.value;
  $('btn-black').classList.toggle('primary', state.blackout);
  $('btn-cover').classList.toggle('primary', state.layers.cover.visible);
  renderLayerButtons(state);
  renderTimerControls(state.timer);
  if (document.activeElement !== $('bg-dim')) $('bg-dim').value = String(state.layers.background.dim || 0);
}

// ---------- Atualização ----------
// Baixada em segundo plano; instala ao fechar o app. Reiniciar agora exige dois cliques (nada de reinício acidental no culto).
const UPDATE_CONFIRM_MS = 4000;
function bindUpdate() {
  const btn = $('btn-update');
  let confirmTimer = null;
  const show = (version) => {
    btn.hidden = false;
    btn.querySelector('.label').textContent = `Atualizar (${version})`;
  };
  api.update.onReady(({ version }) => show(version));
  api.update.status().then((s) => s.ready && show(s.ready));
  btn.addEventListener('click', () => {
    if (!confirmTimer) {
      btn.querySelector('.label').textContent = 'Clique de novo para reiniciar';
      confirmTimer = setTimeout(() => { confirmTimer = null; api.update.status().then((s) => s.ready && show(s.ready)); }, UPDATE_CONFIRM_MS);
      return;
    }
    api.update.install();
  });
}

// ---------- Cronômetro ----------
const TIMER_TICK_MS = 250;
const SECONDS_PER_MINUTE = 60;

function renderTimerReadout() {
  const timer = ui.state && ui.state.timer;
  if (!timer) return;
  const ms = window.liveInfo.timerValueMs(timer, Date.now());
  $('timer-readout').textContent = window.liveInfo.formatTimer(ms);
  $('timer-readout').classList.toggle('over', window.liveInfo.isCountdown(timer) && ms <= 0 && window.liveInfo.isTimerInUse(timer));
}

function renderTimerControls(timer) {
  const running = timer.startedAt != null;
  const toggle = $('btn-timer-toggle');
  const label = running ? 'Pausar' : 'Iniciar';
  toggle.title = label;
  toggle.setAttribute('aria-label', `${label} cronômetro`);
  if (toggle.dataset.icon !== (running ? 'pause' : 'play')) window.icons.setIcon(toggle, running ? 'pause' : 'play');
  $('btn-timer-visible').setAttribute('aria-pressed', String(timer.visible));
  if (document.activeElement !== $('timer-mode')) $('timer-mode').value = timer.mode;
  const until = timer.mode === 'until';
  toggle.disabled = until; // até o horário não pausa: só zerar
  $('timer-minutes').hidden = until;
  $('timer-clock').hidden = !until;
  if (until && document.activeElement !== $('timer-clock')) $('timer-clock').value = clockText(timer.targetAt);
  $('timer-minutes').disabled = timer.mode !== 'countdown';
  if (document.activeElement !== $('timer-minutes') && timer.mode === 'countdown') {
    $('timer-minutes').value = String(Math.round(timer.setMs / 1000 / SECONDS_PER_MINUTE));
  }
  renderTimerReadout();
}

const clockText = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function setTimerFromInputs() {
  const mode = $('timer-mode').value;
  if (mode === 'until') {
    // Sem horário preenchido, não troca de modo (o campo de hora do navegador devolve vazio): o seletor volta ao estado real.
    if (/^\d{2}:\d{2}$/.test($('timer-clock').value)) api.dispatch({ type: 'timerUntil', time: $('timer-clock').value });
    else if (ui.state) $('timer-mode').value = ui.state.timer.mode;
    return;
  }
  const minutes = Math.max(0, Math.min(1440, Math.round(Number($('timer-minutes').value) || 0)));
  api.dispatch({ type: 'timerSet', mode, seconds: minutes * SECONDS_PER_MINUTE });
}

function bindTimer() {
  $('timer-mode').addEventListener('change', setTimerFromInputs);
  $('timer-minutes').addEventListener('change', setTimerFromInputs);
  $('timer-clock').addEventListener('change', setTimerFromInputs);
  $('timer-minutes').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); setTimerFromInputs(); } });
  $('btn-timer-toggle').addEventListener('click', () => api.dispatch({ type: 'timerToggle' }));
  $('btn-timer-reset').addEventListener('click', () => api.dispatch({ type: 'timerReset' }));
  $('btn-timer-visible').addEventListener('click', () => api.dispatch({ type: 'timerVisible' }));
  setInterval(renderTimerReadout, TIMER_TICK_MS);
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

// Layouts do retorno (letra, banda com acordes, pregador): o escolhido fica salvo neste computador.
const STAGE_LAYOUT_KEY = 'apresentador.stageLayout';
function loadStageLayouts() {
  const { LAYOUTS, LAYOUT_NAMES, DEFAULT_LAYOUT } = window.stageLayouts;
  $('stage-layout').replaceChildren(...LAYOUT_NAMES.map((name) => h('option', { value: name }, LAYOUTS[name].label)));
  let saved = DEFAULT_LAYOUT;
  try { saved = localStorage.getItem(STAGE_LAYOUT_KEY) || DEFAULT_LAYOUT; } catch { /* sem persistência */ }
  $('stage-layout').value = LAYOUT_NAMES.includes(saved) ? saved : DEFAULT_LAYOUT;
  $('stage-layout').addEventListener('change', () => {
    try { localStorage.setItem(STAGE_LAYOUT_KEY, $('stage-layout').value); } catch { /* sem persistência */ }
  });
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
  $('btn-import-songs').addEventListener('click', async () => reportImport(await api.songs.import()));
  bindSongDrop();
  const toggleLayer = (layer) => api.dispatch({ type: 'toggleLayer', layer });
  document.querySelectorAll('.layer-btn').forEach((btn) => btn.addEventListener('click', () => toggleLayer(btn.dataset.layer)));
  $('bg-dim').replaceChildren(...DIM_STEPS.map((v) => h('option', { value: String(v) }, v ? `Escurecer ${v}%` : 'Fundo normal')));
  $('bg-dim').addEventListener('change', (e) => api.dispatch({ type: 'setBackgroundDim', value: Number(e.target.value) }));
  $('btn-edit').addEventListener('click', () => ui.current && ui.current.song && openEditor(ui.current.song));
  $('btn-add-playlist').addEventListener('click', async () => {
    const cur = ui.current;
    if (!cur) return;
    const arrangement = cur.songId && cur.arrangement ? { arrangement: cur.arrangement } : {};
    await api.playlist.add({ kind: cur.verse ? 'verse' : 'song', refId: cur.songId, title: cur.title, slides: cur.slides, ...arrangement });
    refreshPlaylist();
  });
  $('arrangement').addEventListener('change', (e) => changeArrangement(e.target.value));

  // Editor: arranjos e siglas das seções
  $('ed-arr-add').addEventListener('click', () => { $('ed-arrangements').append(arrangementRow()); $('ed-arrangements').lastElementChild.querySelector('input').focus(); });
  $('ed-text').addEventListener('input', scheduleSectionHint);
  $('ed-arrangements').addEventListener('input', scheduleSectionHint);
  // Enter num campo de arranjo enviaria o formulário pelo primeiro botão (Cancelar): não faz nada.
  $('ed-arrangements').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });

  // Edição rápida
  $('quick-form').addEventListener('submit', (e) => { e.preventDefault(); saveQuickEdit(); });
  $('quick-cancel').addEventListener('click', () => $('quick-edit').close());
  $('quick-text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); saveQuickEdit(); } });

  // Desfazer/refazer o que foi ao ar
  $('btn-undo').addEventListener('click', () => api.undo());
  $('btn-redo').addEventListener('click', () => api.redo());

  $('auto-advance').addEventListener('change', restartAuto);
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
    await api.stage.toggle(Number.isInteger(id) && id > 0 ? id : undefined, $('stage-layout').value);
    syncOutputButtons();
  });

  $('btn-output').addEventListener('click', async () => { await api.outputs.toggle(); syncOutputButtons(); });
  $('btn-remote').addEventListener('click', async () => {
    const info = await api.remote.info();
    $('remote-url').textContent = info.url;
    $('remote-stage-url').textContent = info.stageUrl;
    $('remote-live-url').textContent = info.liveUrl;
    drawQr($('remote-qr'), info.qr);
    drawQr($('remote-stage-qr'), info.stageQr);
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
    // Ctrl+Z desfaz o que foi ao ar; Ctrl+Shift+Z ou Ctrl+Y refaz.
    if (e.ctrlKey && !e.altKey && ['z', 'y'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      if (e.key.toLowerCase() === 'y' || e.shiftKey) api.redo(); else api.undo();
      return;
    }
    // Alt+1…9 executa o N-ésimo macro.
    if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) { e.preventDefault(); macrosPanel.runAt(Number(e.key) - 1); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'F2') { e.preventDefault(); openQuickEdit(ui.selected); return; }
    // Teclas de seção (1–9, C, E, P, I, F): só quando o item aberto tem essa seção.
    if (/^[1-9cepif]$/i.test(e.key) && jumpToGroup(e.key)) { e.preventDefault(); return; }
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
  mediaPanel = window.initMediaPanel({
    api,
    addToPlaylist: async (item) => { await api.playlist.add(item); refreshPlaylist(); },
    getProgramVideo: () => programStage.mediaVideo(),
  });
  window.initOutputsPanel({ api });
  window.initAutomationPanel({ api });
  messagesPanel = window.initMessagesPanel({ api });
  window.initUsagePanel({ api });
  propsPanel = window.initPropsPanel({ api });
  audioPanel = window.initAudioPanel({ api });
  window.initCameraPanel({ api });
  window.initSyncPanel({ api });
  macrosPanel = window.initMacrosPanel({ api, sources: { themes: () => themePanel.names(), props: () => propsPanel.names(), messages: () => messagesPanel.names() } });
  bindUpdate();
  // OSC: avançar/voltar precisam do contexto de slides daqui.
  api.automation.onCommand((command) => {
    if (command === 'next') goLive(ui.index + 1);
    if (command === 'prev') goLive(ui.index - 1);
    if (command.startsWith('audio/')) audioPanel.command(command); // OSC: música de fundo
  });
  // O import-panel é um módulo (carrega depois): liga quando ele estiver pronto.
  const bindImport = () => window.bindImport({ api, onImported: async (item) => { await api.playlist.add(item); refreshPlaylist(); } });
  if (window.bindImport) bindImport(); else window.addEventListener('import-panel-ready', bindImport, { once: true });
  try { ui.direct = localStorage.getItem(DIRECT_KEY) === '1'; } catch { ui.direct = false; }
  $('direct').checked = ui.direct;

  loadStageLayouts();
  bindEvents();
  bindTimer();
  api.onState(renderLive);
  window.addEventListener('focus', syncOutputButtons);
  window.addEventListener('resize', () => ui.state && (programStage.update(ui.state), renderPreview()));
  renderLive(await api.getState());
  await Promise.all([window.initBiblePanel({ api, showVerses }), themePanel.load(), messagesPanel.load(), propsPanel.load(), macrosPanel.load(), audioPanel.load(), mediaPanel.refresh(), refreshSongs(), refreshPlaylist(), syncOutputButtons(), loadDisplays()]);
}

init();

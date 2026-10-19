const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { parseOrder } = require('../renderer/shared/sections');

const EMPTY = { songs: [], playlist: [] };
const MAX_THEME_NAME_CHARS = 40;

function load(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      songs: Array.isArray(data.songs) ? data.songs : [],
      playlist: Array.isArray(data.playlist) ? data.playlist : [],
    };
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[library] não foi possível ler ${file}: ${err.message}`);
    return { ...EMPTY };
  }
}

function persist(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const clone = (value) => JSON.parse(JSON.stringify(value));

const MAX_ARRANGEMENTS = 12;
const MAX_ARRANGEMENT_NAME_CHARS = 40;
const MAX_SLIDE_TEXT_CHARS = 2000;
const MAX_AUTHOR_CHARS = 80;
const CCLI_RE = /^\d{1,10}$/;

// Arranjos da música: { name, order: ['V1', 'C', …] }. Nome único (sem diferenciar maiúsculas) e ordem não vazia.
function sanitizeArrangements(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    if (out.length >= MAX_ARRANGEMENTS) break;
    if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string') continue;
    const name = entry.name.trim();
    const order = parseOrder(entry.order);
    if (!name || name.length > MAX_ARRANGEMENT_NAME_CHARS || !order.length || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, order });
  }
  return out;
}

function createLibrary(file) {
  let data = load(file);
  const commit = (next) => {
    data = next;
    persist(file, data);
  };

  return {
    listSongs: () => clone(data.songs),
    getPlaylist: () => clone(data.playlist),

    saveSong(input) {
      const title = String(input.title || '').trim();
      if (!title) throw new Error('O título da música é obrigatório.');
      const theme = typeof input.theme === 'string' ? input.theme.trim() : '';
      const song = { id: input.id || randomUUID(), title, text: String(input.text || '') };
      // Tema próprio da música (nome); aplicado quando ela vai ao ar. Inválido é descartado.
      if (theme && theme.length <= MAX_THEME_NAME_CHARS) song.theme = theme;
      // Autor e número CCLI (opcionais) vão para o relatório de uso.
      const author = typeof input.author === 'string' ? input.author.trim().slice(0, MAX_AUTHOR_CHARS) : '';
      const ccli = typeof input.ccli === 'string' ? input.ccli.trim() : '';
      if (author) song.author = author;
      if (CCLI_RE.test(ccli)) song.ccli = ccli;
      const arrangements = sanitizeArrangements(input.arrangements);
      if (arrangements.length) song.arrangements = arrangements;
      const exists = data.songs.some((s) => s.id === song.id);
      const songs = exists ? data.songs.map((s) => (s.id === song.id ? song : s)) : [...data.songs, song];
      commit({ ...data, songs });
      return clone(song);
    },

    deleteSong(id) {
      commit({
        songs: data.songs.filter((s) => s.id !== id),
        playlist: data.playlist.filter((i) => i.refId !== id),
      });
    },

    addToPlaylist(item) {
      const entry = { ...clone(item), id: randomUUID() };
      commit({ ...data, playlist: [...data.playlist, entry] });
      return clone(entry);
    },

    // `slides`: lista, ou função (item) => slides, para cada item seguir o seu arranjo.
    // `arrangementNames` (opcional): arranjos que a música ainda tem; item com arranjo que sumiu volta à ordem da letra.
    refreshSongSlides(refId, title, slides, arrangementNames) {
      const slidesOf = typeof slides === 'function' ? slides : () => slides;
      const keeps = (name) => !Array.isArray(arrangementNames) || arrangementNames.includes(name);
      const playlist = data.playlist.map((i) => {
        if (i.refId !== refId || i.kind !== 'song') return i;
        const { arrangement, ...rest } = i;
        const next = arrangement && keeps(arrangement) ? { ...rest, arrangement } : rest;
        return { ...next, title, slides: clone(slidesOf(next)) };
      });
      commit({ ...data, playlist });
    },

    // Arranjo escolhido para um item do culto ('' = ordem da letra), com os slides já montados.
    setItemArrangement(id, arrangement, slides) {
      const item = data.playlist.find((i) => i.id === id);
      if (!item) return null;
      const { arrangement: _old, ...rest } = item;
      const next = { ...rest, ...(arrangement ? { arrangement: String(arrangement) } : {}), slides: clone(slides) };
      commit({ ...data, playlist: data.playlist.map((i) => (i.id === id ? next : i)) });
      return clone(next);
    },

    // Edição rápida de um slide de texto do culto (versículo, PPTX). Imagem e mídia não têm texto.
    // Música não passa por aqui: a correção vai para a letra (senão seria sobrescrita no próximo refresh).
    editPlaylistSlide(id, index, text) {
      const item = data.playlist.find((i) => i.id === id);
      const ok = item && item.kind !== 'song' && Array.isArray(item.slides) && Number.isInteger(index) && index >= 0;
      const slide = ok ? item.slides[index] : null;
      if (!slide || slide.image || slide.media || typeof text !== 'string' || !text.trim() || text.length > MAX_SLIDE_TEXT_CHARS) return null;
      const slides = item.slides.map((s, i) => (i === index ? { ...s, text } : s));
      const next = { ...item, slides };
      commit({ ...data, playlist: data.playlist.map((i) => (i.id === id ? next : i)) });
      return clone(next);
    },

    removeFromPlaylist(id) {
      commit({ ...data, playlist: data.playlist.filter((i) => i.id !== id) });
    },

    movePlaylistItem(id, toIndex) {
      const item = data.playlist.find((i) => i.id === id);
      if (!item) return;
      const rest = data.playlist.filter((i) => i.id !== id);
      const at = Math.max(0, Math.min(toIndex, rest.length));
      commit({ ...data, playlist: [...rest.slice(0, at), item, ...rest.slice(at)] });
    },
  };
}

module.exports = { createLibrary };

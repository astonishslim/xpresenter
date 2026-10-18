const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const EMPTY = { songs: [], playlist: [] };

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
      const song = { id: input.id || randomUUID(), title, text: String(input.text || '') };
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

    refreshSongSlides(refId, title, slides) {
      const playlist = data.playlist.map((i) => (i.refId === refId && i.kind === 'song' ? { ...i, title, slides: clone(slides) } : i));
      commit({ ...data, playlist });
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

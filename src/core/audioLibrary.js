// Biblioteca de áudio de fundo: faixas locais (MP3, M4A, OGG…) tocadas antes do culto, na ordem da lista.
// Guarda só a referência (URL file:), sem copiar arquivos; quem sumiu do disco aparece marcado.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { isLocalFileUrl } = require('./state');

const MAX_TRACKS = 100;
const MAX_NAME_CHARS = 80;
const EXTENSIONS = ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav', '.flac'];

const isAudioPath = (p) => typeof p === 'string' && EXTENSIONS.includes(path.extname(p).toLowerCase());

const isValidTrack = (t) => t && typeof t.id === 'string' && typeof t.name === 'string' && isAudioPath(t.url) && isLocalFileUrl(t.url);

function load(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const seen = new Set();
    return (Array.isArray(data && data.items) ? data.items : []).filter((t) => {
      if (!isValidTrack(t) || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    }).slice(0, MAX_TRACKS).map((t) => ({ id: t.id, name: t.name.slice(0, MAX_NAME_CHARS), url: t.url }));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[áudio] não foi possível ler ${file}: ${err.message}`);
    return [];
  }
}

function persist(file, items) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ items }, null, 2));
  fs.renameSync(tmp, file);
}

const existsUrl = (url) => {
  try {
    return fs.existsSync(fileURLToPath(url));
  } catch {
    return false;
  }
};

function createAudioLibrary(file) {
  let items = load(file);

  // Caminho local absoluto de um arquivo de áudio; null para outro tipo ou caminho de rede (UNC).
  const toTrack = (p) => {
    if (!isAudioPath(p) || !path.isAbsolute(p)) return null;
    const url = pathToFileURL(p).href;
    if (!isLocalFileUrl(url)) return null;
    return { id: randomUUID(), name: path.basename(p, path.extname(p)).slice(0, MAX_NAME_CHARS), url };
  };

  return {
    list: () => items.map((t) => ({ ...t, missing: !existsUrl(t.url) })),

    addPaths(paths) {
      const added = [];
      let skipped = 0;
      const known = new Set(items.map((t) => t.url));
      for (const p of Array.isArray(paths) ? paths : []) {
        const track = toTrack(p);
        if (!track || known.has(track.url) || items.length + added.length >= MAX_TRACKS) {
          skipped += 1;
          continue;
        }
        known.add(track.url);
        added.push(track);
      }
      if (added.length) {
        items = [...items, ...added];
        persist(file, items);
      }
      return { added: added.map((t) => ({ ...t })), skipped };
    },

    // Reordena: a faixa vai para a posição pedida (limitada ao tamanho da lista).
    move(id, toIndex) {
      const track = items.find((t) => t.id === id);
      if (!track || !Number.isInteger(toIndex)) return;
      const rest = items.filter((t) => t.id !== id);
      const at = Math.max(0, Math.min(toIndex, rest.length));
      items = [...rest.slice(0, at), track, ...rest.slice(at)];
      persist(file, items);
    },

    remove(id) {
      const next = items.filter((t) => t.id !== id);
      if (next.length === items.length) return;
      items = next;
      persist(file, items);
    },
  };
}

module.exports = { createAudioLibrary, isAudioPath, EXTENSIONS, MAX_TRACKS };

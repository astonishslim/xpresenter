// Biblioteca de mídia: imagens e vídeos locais usados como fundo ou como item do culto.
// Guarda só a referência (URL file:), sem copiar arquivos grandes; quem sumiu do disco aparece marcado.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { isValidBackground } = require('./state');

const MAX_MEDIA = 200;
const MAX_NAME_CHARS = 80;
const KINDS = {
  image: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  video: ['.mp4', '.webm', '.m4v', '.ogv'],
};

function kindOf(filePath) {
  const ext = path.extname(String(filePath)).toLowerCase();
  return Object.keys(KINDS).find((k) => KINDS[k].includes(ext)) || null;
}

const isValidItem = (m) => m && typeof m.id === 'string' && Object.hasOwn(KINDS, m.kind)
  && typeof m.name === 'string' && isValidBackground({ kind: m.kind, value: m.url });

function load(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const items = Array.isArray(data && data.items) ? data.items : [];
    return items.filter(isValidItem).slice(0, MAX_MEDIA)
      .map((m) => ({ id: m.id, kind: m.kind, name: m.name.slice(0, MAX_NAME_CHARS), url: m.url }));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[mídia] não foi possível ler ${file}: ${err.message}`);
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

function createMediaLibrary(file) {
  let items = load(file);

  // Converte um caminho local em item; null para tipo desconhecido ou caminho de rede (UNC).
  const toItem = (p) => {
    if (typeof p !== 'string' || !path.isAbsolute(p)) return null;
    const kind = kindOf(p);
    if (!kind) return null;
    const url = pathToFileURL(p).href;
    if (!isValidBackground({ kind, value: url })) return null;
    return { id: randomUUID(), kind, name: path.basename(p, path.extname(p)).slice(0, MAX_NAME_CHARS), url };
  };

  return {
    list: () => items.map((m) => ({ ...m, missing: !existsUrl(m.url) })),
    get: (id) => {
      const hit = items.find((m) => m.id === id);
      return hit ? { ...hit } : null;
    },

    addPaths(paths) {
      const added = [];
      let skipped = 0;
      const known = new Set(items.map((m) => m.url));
      for (const p of Array.isArray(paths) ? paths : []) {
        const item = toItem(p);
        if (!item || known.has(item.url) || items.length + added.length >= MAX_MEDIA) {
          skipped += 1;
          continue;
        }
        known.add(item.url);
        added.push(item);
      }
      if (added.length) {
        items = [...items, ...added];
        persist(file, items);
      }
      return { added: added.map((m) => ({ ...m })), skipped };
    },

    remove(id) {
      const next = items.filter((m) => m.id !== id);
      if (next.length === items.length) return;
      items = next;
      persist(file, items);
    },
  };
}

module.exports = { createMediaLibrary, kindOf, MAX_MEDIA, KINDS };

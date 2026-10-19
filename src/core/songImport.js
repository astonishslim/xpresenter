// Importação de arquivos de letras para a biblioteca: lê cada arquivo, converte (importers.js), recusa o que já
// existe e relata o que não deu. Um arquivo ruim não impede os outros.
const fs = require('node:fs');
const path = require('node:path');
const { importSong } = require('./importers');
const { normalize } = require('../renderer/shared/sections');

const MAX_FILES = 50;
// Um pouco acima do limite de caracteres do conversor: UTF-8 tem caracteres de mais de um byte.
const MAX_BYTES = 400_000;
const NETWORK_PATH = /^[/\\]{2}/;

function readOne(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p)) return { reason: 'Caminho inválido.' };
  if (NETWORK_PATH.test(p)) return { reason: 'Caminho de rede não é aceito.' };
  const stat = fs.statSync(p);
  if (!stat.isFile()) return { reason: 'Não é um arquivo.' };
  if (stat.size > MAX_BYTES) return { reason: 'Arquivo grande demais para ser uma letra (máximo 300 KB).' };
  return { content: fs.readFileSync(p, 'utf8') };
}

function importFiles(paths, library) {
  const known = new Set(library.listSongs().map((s) => normalize(s.title)));
  const imported = [];
  const skipped = [];
  for (const p of Array.isArray(paths) ? paths.slice(0, MAX_FILES) : []) {
    const name = typeof p === 'string' ? path.basename(p) : String(p);
    try {
      const read = readOne(p);
      const res = read.content === undefined ? { ok: false, reason: read.reason } : importSong(name, read.content);
      if (!res.ok) {
        skipped.push({ name, reason: res.reason });
      } else if (known.has(normalize(res.song.title))) {
        skipped.push({ name, reason: `"${res.song.title}" já existe na biblioteca.` });
      } else {
        library.saveSong(res.song);
        known.add(normalize(res.song.title));
        imported.push(res.song.title);
      }
    } catch (err) {
      skipped.push({ name, reason: err.code === 'ENOENT' ? 'Arquivo não encontrado.' : err.message });
    }
  }
  return { imported, skipped };
}

module.exports = { importFiles, MAX_FILES, MAX_BYTES };

// Conversão de arquivos de Bíblia (JSON por livro, JSON simples, Zefania XML) para o formato do app:
// { code, name, year, license, source, attribution, books: [{ id, name, abbrev, chapters: [[verso, ...], ...] }] }
const { resolveBook } = require('./bibleBooks');

const MAX_VERSE_CHARS = 2000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BOOKS = 80;
const MAX_CHAPTERS = 200;
const MAX_VERSES = 300;
const MAX_NAME_CHARS = 80;
const MAX_NOTE_CHARS = 200;
const MAX_CODE_CHARS = 16;
const CANON_BOOKS = 66;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function sanitizeText(value, max = MAX_VERSE_CHARS) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function sanitizeCode(value) {
  const code = String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, MAX_CODE_CHARS);
  return code || null;
}

const decodeEntities = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
  if (body[0] === '#') {
    const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
  }
  return ENTITIES[body.toLowerCase()] ?? match;
});

const isCanonId = (id) => Number.isInteger(id) && id >= 1 && id <= CANON_BOOKS;

// Lista de versos indexada pelo número (buracos viram texto vazio, para o número do verso continuar certo).
function versesToArray(items, bookName) {
  const out = [];
  items.forEach(({ number, text }) => {
    const n = Number(number);
    if (!Number.isInteger(n) || n < 1 || n > MAX_VERSES) throw new Error(`Número de verso inválido em ${bookName}.`);
    if (typeof text !== 'string' && typeof text !== 'number') throw new Error(`Verso inválido (não é texto) em ${bookName}.`);
    out[n - 1] = sanitizeText(text);
  });
  return Array.from(out, (v) => v ?? '');
}

function chaptersFromBookFile(file) {
  const name = sanitizeText(file.name, MAX_NAME_CHARS) || 'Livro';
  if (!Array.isArray(file.chapters)) throw new Error(`O livro "${name}" não tem capítulos.`);
  const out = [];
  file.chapters.forEach((chapter, i) => {
    const n = Number(chapter && chapter.number) || i + 1;
    if (!chapter || !Array.isArray(chapter.verses)) throw new Error(`Capítulo ${n} de "${name}" sem versos.`);
    out[n - 1] = versesToArray(chapter.verses, name);
  });
  return Array.from(out, (c) => c ?? []);
}

function chaptersFromArrays(book) {
  const name = sanitizeText(book.name, MAX_NAME_CHARS) || 'Livro';
  if (!Array.isArray(book.chapters)) throw new Error(`O livro "${name}" não tem capítulos.`);
  return book.chapters.map((chapter) => {
    if (!Array.isArray(chapter)) throw new Error(`Capítulo inválido em "${name}".`);
    return chapter.map((verse) => {
      if (typeof verse !== 'string') throw new Error(`Verso inválido (não é texto) em "${name}".`);
      return sanitizeText(verse);
    });
  });
}

function validateBible(bible) {
  if (!bible || !Array.isArray(bible.books) || !bible.books.length) throw new Error('A Bíblia está vazia.');
  if (bible.books.length > MAX_BOOKS) throw new Error(`Livros demais (máximo ${MAX_BOOKS}).`);
  const ids = new Set();
  bible.books.forEach((book) => {
    if (book.id !== undefined) {
      if (ids.has(book.id)) throw new Error(`Id de livro repetido: ${book.id}.`);
      ids.add(book.id);
    }
    if (!Array.isArray(book.chapters) || !book.chapters.length) throw new Error(`O livro "${book.name}" não tem capítulos.`);
    if (book.chapters.length > MAX_CHAPTERS) throw new Error(`Capítulos demais em "${book.name}" (máximo ${MAX_CHAPTERS}).`);
    book.chapters.forEach((chapter) => {
      if (!Array.isArray(chapter) || chapter.some((v) => typeof v !== 'string')) throw new Error(`Versos inválidos em "${book.name}".`);
      if (chapter.length > MAX_VERSES) throw new Error(`Versos demais em um capítulo de "${book.name}" (máximo ${MAX_VERSES}).`);
    });
  });
  return bible;
}

// Atribui ids canônicos: o id do arquivo, senão o nome/sigla, senão a posição (só com 66 livros).
function assignIds(books) {
  const taken = new Set();
  const withIds = books.map((book) => {
    const guess = [book.id, resolveBook(book.name), resolveBook(book.abbrev)].find((id) => isCanonId(id) && !taken.has(id));
    if (guess) taken.add(guess);
    return { ...book, id: guess };
  });
  if (withIds.length === CANON_BOOKS && withIds.some((b) => !b.id)) return withIds.map((b, i) => ({ ...b, id: i + 1 }));
  return withIds.map(({ id, ...rest }) => (id ? { id, ...rest } : rest));
}

function finalize(meta, books) {
  const code = sanitizeCode(meta.code) || sanitizeCode(meta.name);
  if (!code) throw new Error('Informe um nome ou código para a versão.');
  const sorted = [...books].sort((a, b) => (a.id ?? 1e9) - (b.id ?? 1e9));
  return validateBible({
    code,
    name: sanitizeText(meta.name, MAX_NAME_CHARS) || code,
    year: Number.isFinite(Number(meta.year)) && Number(meta.year) > 0 ? Number(meta.year) : null,
    license: sanitizeText(meta.license, MAX_NAME_CHARS) || 'desconhecida',
    source: sanitizeText(meta.source, MAX_NOTE_CHARS),
    attribution: sanitizeText(meta.attribution, MAX_NOTE_CHARS),
    books: sorted,
  });
}

// ---------- Um JSON por livro (damarals/biblias) ----------
function fromBookFiles(meta, files) {
  const books = files.map((file) => ({
    id: file.id,
    name: sanitizeText(file.name, MAX_NAME_CHARS),
    abbrev: sanitizeText(file.abbrev, MAX_NAME_CHARS),
    chapters: chaptersFromBookFile(file),
  }));
  return finalize(meta, assignIds(books));
}

// ---------- JSON simples: lista de livros ou o formato do próprio app ----------
const pick = (...values) => values.find((v) => v !== undefined && v !== null && v !== '');

function fromJson(raw, meta = {}) {
  const isApp = raw && !Array.isArray(raw) && Array.isArray(raw.books);
  if (!Array.isArray(raw) && !isApp) throw new Error('Formato não reconhecido: esperado uma lista de livros ou { books: [...] }.');
  const list = isApp ? raw.books : raw;
  if (!list.length) throw new Error('O arquivo está vazio (nenhum livro).');

  const books = list.map((book) => {
    if (!book || typeof book !== 'object') throw new Error('Livro inválido no arquivo.');
    const byFile = Array.isArray(book.chapters) && book.chapters[0] && !Array.isArray(book.chapters[0]);
    return {
      id: book.id,
      name: sanitizeText(book.name, MAX_NAME_CHARS),
      abbrev: sanitizeText(book.abbrev, MAX_NAME_CHARS),
      chapters: byFile ? chaptersFromBookFile(book) : chaptersFromArrays(book),
    };
  });
  const own = isApp ? raw : {};
  return finalize({
    code: pick(meta.code, own.code),
    name: pick(meta.name, own.name),
    year: pick(meta.year, own.year),
    license: pick(meta.license, own.license),
    source: pick(meta.source, own.source),
    attribution: pick(meta.attribution, own.attribution),
  }, assignIds(books));
}

// ---------- Zefania XML ----------
const attr = (attrs, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs);
  return m ? decodeEntities(m[1]) : '';
};
const xmlText = (raw) => sanitizeText(decodeEntities(raw.replace(/<[^>]*>/g, '')));

function fromZefania(xml, meta = {}) {
  const biblename = /<XMLBIBLE\b[^>]*\bbiblename\s*=\s*"([^"]*)"/i.exec(xml);
  const books = [];
  for (const bm of xml.matchAll(/<BIBLEBOOK\b([^>]*)>([\s\S]*?)<\/BIBLEBOOK>/gi)) {
    const chapters = [];
    for (const cm of bm[2].matchAll(/<CHAPTER\b([^>]*)>([\s\S]*?)<\/CHAPTER>/gi)) {
      const c = Number(attr(cm[1], 'cnumber')) || chapters.length + 1;
      const verses = [...cm[2].matchAll(/<VERS\b([^>]*)>([\s\S]*?)<\/VERS>/gi)].map((vm, i) => ({
        number: Number(attr(vm[1], 'vnumber')) || i + 1,
        text: xmlText(vm[2]),
      }));
      chapters[c - 1] = versesToArray(verses, attr(bm[1], 'bname') || 'livro');
    }
    books.push({
      id: Number(attr(bm[1], 'bnumber')) || undefined,
      name: sanitizeText(attr(bm[1], 'bname'), MAX_NAME_CHARS),
      abbrev: sanitizeText(attr(bm[1], 'bsname'), MAX_NAME_CHARS),
      chapters: Array.from(chapters, (c) => c ?? []),
    });
  }
  if (!books.length) throw new Error('Nenhum livro encontrado no XML (esperado o formato Zefania).');
  return finalize({ ...meta, name: pick(meta.name, biblename && decodeEntities(biblename[1])) }, assignIds(books));
}

// ---------- Detecção automática ----------
function convertAuto(text, fileName = '', meta = {}) {
  if (typeof text !== 'string' || text.length > MAX_FILE_BYTES) throw new Error('Arquivo grande demais (máximo 20 MB).');
  const base = String(fileName).replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
  const withFallback = { ...meta, code: pick(meta.code, sanitizeCode(base)), name: pick(meta.name) };

  if (text.trimStart().startsWith('<')) {
    return fromZefania(text, { ...withFallback, name: withFallback.name });
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido (nem um XML Zefania).');
  }
  const bible = fromJson(parsed, { ...withFallback, name: pick(withFallback.name, parsed && parsed.name, base) });
  return bible;
}

module.exports = {
  MAX_VERSE_CHARS, MAX_FILE_BYTES, sanitizeText, sanitizeCode, validateBible,
  fromBookFiles, fromJson, fromZefania, convertAuto,
};

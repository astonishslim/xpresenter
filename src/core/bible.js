const { resolveBook } = require('./bibleBooks');

function normalize(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

const MAX_QUERY_CHARS = 200;
const DEFAULT_LIMIT = 50;
const MIN_WORD_CHARS = 2;

// "1 Co 13:4-7", "João 3", "Jó 1:1". Os acentos são mantidos em bookText (Jó x João).
const REF_RE = /^(\d?\s?[^\d:]+?)\s*(\d+)(?::(\d+)(?:\s*-\s*(\d+))?)?$/;
const compactBook = (text) => text.replace(/[\s.]+/g, '');

function splitReference(input) {
  const match = REF_RE.exec(String(input || '').trim().toLowerCase().slice(0, MAX_QUERY_CHARS));
  if (!match) return null;
  const [, rawBook, chapter, from, to] = match;
  const bookText = compactBook(rawBook);
  if (!bookText) return null;
  const start = from ? Number(from) : 1;
  const end = to ? Number(to) : from ? start : Infinity;
  return { bookText, chapter: Number(chapter), from: start, to: end };
}

// Compatível com a forma anterior: o livro vem sem acento.
function parseReference(input) {
  const ref = splitReference(input);
  if (!ref) return null;
  const { bookText, ...rest } = ref;
  return { book: normalize(bookText), ...rest };
}

function findBook(bible, bookText) {
  const id = resolveBook(bookText);
  const byId = id && bible.books.find((b) => b.id === id);
  if (byId) return byId;
  // Versões sem id (formato antigo): compara por nome ou sigla.
  const key = normalize(bookText).replace(/\s+/g, '');
  return bible.books.find((b) => normalize(b.name).replace(/\s+/g, '') === key || normalize(b.abbrev || '') === key);
}

function lookup(bible, input) {
  const ref = splitReference(input);
  if (!ref || ref.from < 1) return null;
  const book = findBook(bible, ref.bookText);
  const chapter = book && book.chapters[ref.chapter - 1];
  if (!chapter) return null;

  const last = Math.min(ref.to, chapter.length);
  const verses = [];
  for (let n = ref.from; n <= last; n += 1) {
    if (typeof chapter[n - 1] === 'string' && chapter[n - 1].trim()) verses.push({ number: n, text: chapter[n - 1] });
  }
  if (!verses.length) return null;

  const first = verses[0].number;
  const end = verses[verses.length - 1].number;
  const range = first === end ? `${first}` : `${first}-${end}`;
  return { reference: `${book.name} ${ref.chapter}:${range}`, version: bible.name, code: bible.code, verses };
}

// ---------- Busca por palavras ----------
const indexCache = new WeakMap();

// Texto de cada verso já sem acento e em minúsculas, guardado por versão (a normalização é o custo da busca).
function normalizedIndex(bible) {
  if (!indexCache.has(bible)) {
    indexCache.set(bible, bible.books.map((b) => b.chapters.map((c) => c.map((v) => normalize(v || '')))));
  }
  return indexCache.get(bible);
}

function parseQuery(query) {
  const text = normalize(String(query || '').slice(0, MAX_QUERY_CHARS));
  const terms = [];
  const rest = text.replace(/"([^"]+)"/g, (_, phrase) => {
    const clean = phrase.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean) terms.push({ phrase: clean });
    return ' ';
  });
  rest.split(/[^a-z0-9]+/).filter((w) => w.length >= MIN_WORD_CHARS).forEach((w) => terms.push({ word: w }));
  return terms;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildMatcher(terms) {
  const tests = terms.map((t) => {
    if (t.phrase) {
      const re = new RegExp(`(^|[^a-z0-9])${escapeRe(t.phrase).replace(/\s+/g, '[^a-z0-9]+')}([^a-z0-9]|$)`);
      return (v) => re.test(v);
    }
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(t.word)}`);
    return (v) => re.test(v);
  });
  return (verse) => tests.every((t) => t(verse));
}

function searchText(bible, query, { limit = DEFAULT_LIMIT } = {}) {
  const terms = parseQuery(query);
  if (!terms.length) return { results: [], truncated: false };
  const matches = buildMatcher(terms);
  const index = normalizedIndex(bible);
  const results = [];

  for (let b = 0; b < bible.books.length; b += 1) {
    const book = bible.books[b];
    for (let c = 0; c < book.chapters.length; c += 1) {
      for (let v = 0; v < book.chapters[c].length; v += 1) {
        if (!index[b][c][v] || !matches(index[b][c][v])) continue;
        if (results.length >= limit) return { results, truncated: true };
        results.push({
          bookId: book.id,
          bookName: book.name,
          chapter: c + 1,
          verse: v + 1,
          reference: `${book.name} ${c + 1}:${v + 1}`,
          text: book.chapters[c][v],
        });
      }
    }
  }
  return { results, truncated: false };
}

module.exports = { parseReference, splitReference, lookup, searchText, normalize };

function normalize(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

const REF_RE = /^(\d?\s?[^\d:]+?)\s*(\d+)(?::(\d+)(?:\s*-\s*(\d+))?)?$/;

function parseReference(input) {
  const match = REF_RE.exec(normalize(input || ''));
  if (!match) return null;
  const [, rawBook, chapter, from, to] = match;
  const book = rawBook.replace(/\s+/g, '').replace(/\.$/, '');
  if (!book) return null;
  const start = from ? Number(from) : 1;
  const end = to ? Number(to) : from ? start : Infinity;
  return { book, chapter: Number(chapter), from: start, to: end };
}

function findBook(bible, key) {
  return bible.books.find((b) => normalize(b.name).replace(/\s+/g, '') === key || normalize(b.abbrev) === key);
}

function lookup(bible, input) {
  const ref = parseReference(input);
  if (!ref || ref.from < 1) return null;
  const book = findBook(bible, ref.book);
  const chapter = book && book.chapters[ref.chapter - 1];
  if (!chapter) return null;

  const last = Math.min(ref.to, chapter.length);
  const verses = [];
  for (let n = ref.from; n <= last; n += 1) verses.push({ number: n, text: chapter[n - 1] });
  if (!verses.length) return null;

  const range = last === ref.from ? `${ref.from}` : `${ref.from}-${last}`;
  return { reference: `${book.name} ${ref.chapter}:${range}`, version: bible.name, verses };
}

module.exports = { parseReference, lookup, normalize };

// Busca de músicas por título ou trecho da letra, sem diferenciar acentos e maiúsculas.
// Palavras soltas precisam aparecer todas (em qualquer linha, pelo início da palavra); "entre aspas" exige a sequência exata.
const { normalize } = require('./bible');
const { parseSong } = require('./songParser');

const MAX_QUERY_CHARS = 200;
const DEFAULT_LIMIT = 50;

// Letra sem marcadores de seção nem acordes: só o que vai para a tela.
const lyricLines = (text) => parseSong('', text).sections.flatMap((s) => s.lines);

function parseQuery(query) {
  const raw = typeof query === 'string' ? query.trim() : '';
  if (raw.length > MAX_QUERY_CHARS) return null;
  const phrase = raw.match(/^"(.+)"$/);
  if (phrase) return { phrase: normalize(phrase[1]), words: [] };
  return { phrase: null, words: normalize(raw).split(/\s+/).filter(Boolean) };
}

const tokens = (normText) => normText.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const hasWord = (toks, w) => toks.some((t) => t.startsWith(w));

function matches(normText, q) {
  if (q.phrase) return normText.includes(q.phrase);
  const toks = tokens(normText);
  return q.words.every((w) => hasWord(toks, w));
}

// Linha que melhor mostra por que a música apareceu (a primeira com a frase ou com a primeira palavra).
function snippetOf(lines, q) {
  const found = (line) => (q.phrase ? normalize(line).includes(q.phrase) : hasWord(tokens(normalize(line)), q.words[0]));
  return lines.find(found) || null;
}

function searchSongs(songs, query, { limit = DEFAULT_LIMIT } = {}) {
  if (!Array.isArray(songs)) return [];
  const q = parseQuery(query);
  if (!q) return [];
  const valid = songs.filter((s) => s && typeof s.title === 'string');
  if (!q.phrase && !q.words.length) {
    return valid.slice(0, limit).map((s) => ({ id: s.id, title: s.title, inTitle: true, snippet: null }));
  }

  const inTitle = [];
  const inLyrics = [];
  for (const song of valid) {
    if (matches(normalize(song.title), q)) {
      inTitle.push({ id: song.id, title: song.title, inTitle: true, snippet: null });
      continue;
    }
    const lines = lyricLines(song.text);
    if (lines.length && matches(normalize(lines.join('\n')), q)) {
      inLyrics.push({ id: song.id, title: song.title, inTitle: false, snippet: snippetOf(lines, q) });
    }
  }
  return [...inTitle, ...inLyrics].slice(0, limit);
}

module.exports = { searchSongs };

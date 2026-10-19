// Acordes cifrados: o padrão aceito na letra ([Am], [C#m7], [G/B]) e o teste usado ao validar slides.
// Só os acordes mais comuns: o que não casa fica como texto na letra, em vez de virar acorde errado.
const CHORD = '[A-G][#b]?(?:maj|min|dim|aug|sus|add|m)?\\d*(?:\\/[A-G][#b]?)?';
const CHORD_TOKEN_RE = new RegExp(`^${CHORD}$`);

const isChord = (value) => typeof value === 'string' && CHORD_TOKEN_RE.test(value);

// Limites dos acordes de um slide (validados em state.js); o que passa deles é cortado ao montar o slide,
// em vez de derrubar o slide inteiro: o texto sempre vai ao ar.
const MAX_CHORD_LINES = 12;
const MAX_CHORDS_PER_LINE = 24;
const MAX_CHORD_COLUMN = 300;

function fitChords(lines) {
  return lines.slice(0, MAX_CHORD_LINES).map((line) => line.filter((e) => e.at <= MAX_CHORD_COLUMN).slice(0, MAX_CHORDS_PER_LINE));
}

module.exports = { CHORD, CHORD_TOKEN_RE, isChord, fitChords, MAX_CHORD_LINES, MAX_CHORDS_PER_LINE, MAX_CHORD_COLUMN };
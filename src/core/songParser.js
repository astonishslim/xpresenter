const { normalize, matchesToken, parseOrder } = require('../renderer/shared/sections');

const SECTION_RE =/^\s*\[([^\]]+)\]\s*$/;
const CHORD = '[A-G][#b]?(?:maj|min|dim|aug|sus|add|m)?\\d*(?:\\/[A-G][#b]?)?';
const INLINE_CHORD_RE = new RegExp(`\\[${CHORD}\\]`, 'g');
const CHORD_TOKEN_RE = new RegExp(`^${CHORD}$`);
const DEFAULT_LABEL = 'Letra';
const DEFAULT_MAX_LINES = 4;

function cleanLine(line) {
  return line.replace(INLINE_CHORD_RE, '').replace(/\s+/g, ' ').trim();
}

// Linha da letra: marcador de seção, em branco, só acordes, ou texto (já sem acordes).
function classifyLine(raw) {
  const marker = raw.match(SECTION_RE);
  if (marker && !CHORD_TOKEN_RE.test(marker[1].trim())) return { kind: 'marker', label: marker[1].trim() };
  if (!raw.trim()) return { kind: 'blank' };
  const clean = cleanLine(raw);
  return clean ? { kind: 'text', clean } : { kind: 'chords' };
}

function parseSong(title, text) {
  const sections = [];
  let current = null;

  const open = (label) => {
    current = { label, lines: [] };
    sections.push(current);
  };

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = classifyLine(raw);
    if (line.kind === 'marker') {
      open(line.label);
      continue;
    }
    // Só linha em branco separa slides; linha de acordes é ignorada sem quebrar.
    if (line.kind === 'blank' && current && current.lines.length) current = null;
    if (line.kind !== 'text') continue;
    if (!current) open(sections.length ? sections[sections.length - 1].label : DEFAULT_LABEL);
    current.lines.push(line.clean);
  }

  return { title, sections: sections.filter((s) => s.lines.length) };
}

function toSlides(song, { maxLines = DEFAULT_MAX_LINES } = {}) {
  const slides = [];
  for (const section of song.sections) {
    for (let i = 0; i < section.lines.length; i += maxLines) {
      slides.push({
        index: slides.length,
        label: section.label,
        text: section.lines.slice(i, i + maxLines).join('\n'),
      });
    }
  }
  return slides;
}

// Grupos da música: cada rótulo com os blocos do seu PRIMEIRO trecho contínuo
// (um refrão escrito de novo mais adiante é repetição, não conteúdo novo).
function groupsOf(song) {
  const groups = [];
  const closed = new Set();
  let previous = null;
  for (const section of song.sections) {
    const key = normalize(section.label);
    if (key !== previous && previous !== null) closed.add(previous);
    previous = key;
    if (closed.has(key)) continue;
    const group = groups.find((g) => g.key === key);
    if (group) group.sections.push(section);
    else groups.push({ key, label: section.label, sections: [section] });
  }
  return groups;
}

// Arranjo: a música montada na ordem pedida ("V1 C V2 C"). O que não existe na música volta em `unknown`.
function arrange(song, order) {
  const groups = groupsOf(song);
  const sections = [];
  const unknown = [];
  for (const token of order) {
    const group = groups.find((g) => g.key === normalize(token)) || groups.find((g) => matchesToken(g.label, token));
    if (!group) unknown.push(token);
    else group.sections.forEach((s) => sections.push({ label: s.label, lines: [...s.lines] }));
  }
  return { song: { title: song.title, sections }, unknown };
}

// Slides de uma música da biblioteca no arranjo escolhido (pelo nome). Sem arranjo válido: ordem da letra.
function slidesForSong(record, arrangementName) {
  const song = parseSong(record.title, record.text);
  const list = Array.isArray(record.arrangements) ? record.arrangements : [];
  const chosen = arrangementName ? list.find((a) => a && a.name === arrangementName) : null;
  if (!chosen) return toSlides(song);
  const arranged = arrange(song, parseOrder(chosen.order)).song;
  return toSlides(arranged.sections.length ? arranged : song);
}

module.exports = { parseSong, toSlides, arrange, slidesForSong, classifyLine };

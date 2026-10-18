const SECTION_RE = /^\s*\[([^\]]+)\]\s*$/;
const CHORD = '[A-G][#b]?(?:maj|min|dim|aug|sus|add|m)?\\d*(?:\\/[A-G][#b]?)?';
const INLINE_CHORD_RE = new RegExp(`\\[${CHORD}\\]`, 'g');
const CHORD_TOKEN_RE = new RegExp(`^${CHORD}$`);
const DEFAULT_LABEL = 'Letra';
const DEFAULT_MAX_LINES = 4;

function cleanLine(line) {
  return line.replace(INLINE_CHORD_RE, '').replace(/\s+/g, ' ').trim();
}

function parseSong(title, text) {
  const sections = [];
  let current = null;

  const open = (label) => {
    current = { label, lines: [] };
    sections.push(current);
  };

  for (const raw of String(text || '').split(/\r?\n/)) {
    const marker = raw.match(SECTION_RE);
    if (marker && !CHORD_TOKEN_RE.test(marker[1].trim())) {
      open(marker[1].trim());
      continue;
    }

    const line = cleanLine(raw);
    if (!line) {
      // Só linha em branco separa slides; linha de acordes é ignorada sem quebrar.
      if (!raw.trim() && current && current.lines.length) current = null;
      continue;
    }
    if (!current) open(sections.length ? sections[sections.length - 1].label : DEFAULT_LABEL);
    current.lines.push(line);
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

module.exports = { parseSong, toSlides };

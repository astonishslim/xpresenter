// Importadores de letras de outros programas: OpenLyrics (OpenLP), OpenSong, ChordPro e texto simples.
// Tudo vira o formato interno do app: marcadores [Verso 1], [Refrão]… e acordes inline [Am]. A ordem de
// apresentação do arquivo (verseOrder/presentation) vira um arranjo chamado "Original".
// Sem biblioteca de XML: lê só os elementos conhecidos, com tamanho limitado, e nada do conteúdo é tratado
// como marcação (só texto). As leituras são varreduras lineares (indexOf), nunca expressões regulares que
// voltam atrás: um arquivo hostil não pode travar o processo principal.
const { isChord } = require('./chords');

const MAX_FILE_CHARS = 300_000;
const MAX_LINE_CHARS = 2000;
const MAX_ELEMENTS = 500;
const MAX_TITLE_CHARS = 120;
const MAX_AUTHOR_CHARS = 80;
const MAX_LABEL_CHARS = 40;
const CCLI_RE = /^\d{1,10}$/;
const ARRANGEMENT_NAME = 'Original';
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const KIND_OF_CODE = { v: 'verse', c: 'chorus', b: 'bridge', p: 'prechorus', e: 'ending', t: 'ending', i: 'intro' };

// Código de seção (v1, C, b2, p, e, t, i) para o rótulo do app; null se não é um código conhecido.
function labelForCode(code) {
  const m = /^([a-z])(\d*)[a-z]?$/i.exec(String(code).trim());
  if (!m || !Object.hasOwn(KIND_OF_CODE, m[1].toLowerCase())) return null;
  const number = Number(m[2]) || 0;
  const numbered = (name) => (number > 1 ? `${name} ${number}` : name);
  switch (KIND_OF_CODE[m[1].toLowerCase()]) {
    case 'verse': return `Verso ${number || 1}`;
    case 'chorus': return numbered('Refrão');
    case 'bridge': return numbered('Ponte');
    case 'prechorus': return numbered('Pré-Refrão');
    case 'intro': return 'Intro';
    default: return 'Final';
  }
}
const labelOrName = (name) => labelForCode(name) || String(name).trim().slice(0, MAX_LABEL_CHARS);

const cleanText = (s) => String(s).replace(CONTROL_CHARS, '');

// ---------- XML mínimo ----------
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, e) => {
    const name = e.toLowerCase();
    if (name === 'amp') return '&';
    if (name === 'lt') return '<';
    if (name === 'gt') return '>';
    if (name === 'quot') return '"';
    if (name === 'apos') return "'";
    const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isInteger(code) && code > 31 && code < 0x110000 ? String.fromCodePoint(code) : '';
  });
}
// Remove <tags>; um "<" sem ">" depois fica como texto. Uma passada só.
function stripTags(s) {
  let out = '';
  let pos = 0;
  for (;;) {
    const open = s.indexOf('<', pos);
    if (open < 0) break;
    const close = s.indexOf('>', open + 1);
    if (close < 0) break;
    out += s.slice(pos, open);
    pos = close + 1;
  }
  return out + s.slice(pos);
}

function unCdata(s) {
  const OPEN = '<![CDATA[';
  const CLOSE = ']]>';
  let out = '';
  let pos = 0;
  for (;;) {
    const open = s.indexOf(OPEN, pos);
    if (open < 0) break;
    const close = s.indexOf(CLOSE, open + OPEN.length);
    if (close < 0) break;
    out += s.slice(pos, open) + s.slice(open + OPEN.length, close);
    pos = close + CLOSE.length;
  }
  return out + s.slice(pos);
}
const textOf = (xml) => decodeEntities(stripTags(xml)).trim();

const isNameEnd = (ch) => ch === '>' || ch === '/' || ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';

// Elementos <name ...>conteúdo</name> (sem diferenciar maiúsculas), no máximo MAX_ELEMENTS, em uma passada.
// Sem o fechamento a leitura para: não recomeça do próximo <name.
function elementsOf(xml, name) {
  const lower = xml.toLowerCase();
  if (lower.length !== xml.length) return [];
  const open = `<${name.toLowerCase()}`;
  const close = `</${name.toLowerCase()}>`;
  const found = [];
  let pos = 0;
  while (found.length < MAX_ELEMENTS) {
    const at = lower.indexOf(open, pos);
    if (at < 0) break;
    const attrsFrom = at + open.length;
    if (!isNameEnd(lower[attrsFrom])) { pos = attrsFrom; continue; }
    const gt = lower.indexOf('>', attrsFrom);
    if (gt < 0) break;
    const closeAt = lower.indexOf(close, gt + 1);
    if (closeAt < 0) break;
    found.push({ attrs: xml.slice(attrsFrom, gt), inner: xml.slice(gt + 1, closeAt) });
    pos = closeAt + close.length;
  }
  return found;
}
const firstTag = (xml, name) => { const [first] = elementsOf(xml, name); return first ? first.inner : null; };
const allTags = (xml, name) => elementsOf(xml, name).map((e) => e.inner);

// ---------- Resultado ----------
function finish(format, fields, text, order, sectionLabels) {
  const title = cleanText(fields.title || '').trim().slice(0, MAX_TITLE_CHARS);
  const author = cleanText(fields.author || '').trim().slice(0, MAX_AUTHOR_CHARS);
  const ccli = CCLI_RE.test(String(fields.ccli || '').trim()) ? String(fields.ccli).trim() : '';
  const valid = (order || []).filter((label) => sectionLabels.has(label));
  return {
    ok: true,
    format,
    song: { title, author, ccli, text: cleanText(text), arrangements: valid.length ? [{ name: ARRANGEMENT_NAME, order: valid }] : [] },
  };
}

// Seções [Rótulo] + linhas, na ordem em que aparecem. Seção sem linhas some.
function sectionsToText(sections) {
  return sections.filter((s) => s.lines.some((l) => l.trim())).map((s) => `[${s.label}]\n${s.lines.join('\n')}`).join('\n\n');
}

// ---------- OpenSong ----------
// Linha de acordes (". G    D") sobre a letra: cada acorde entra na letra, na coluna em que estava.
function mergeChords(chordLine, lyric) {
  if (chordLine.length > MAX_LINE_CHARS || lyric.length > MAX_LINE_CHARS) return lyric;
  const tokens = [...chordLine.matchAll(/\S+/g)].filter((m) => isChord(m[0]));
  if (!tokens.length) return lyric;
  const base = lyric.padEnd(tokens[tokens.length - 1].index, ' ');
  const parts = [];
  let cursor = 0;
  tokens.forEach((m) => {
    parts.push(base.slice(cursor, m.index), `[${m[0]}]`);
    cursor = m.index;
  });
  parts.push(base.slice(cursor));
  return parts.join('');
}

function parseOpenSongLyrics(body) {
  const sections = [];
  const byLabel = new Map();
  const get = (label) => {
    if (!byLabel.has(label)) {
      const s = { label, lines: [] };
      byLabel.set(label, s);
      sections.push(s);
    }
    return byLabel.get(label);
  };
  let current = null;
  let chords = null;
  for (const raw of body.split(/\r?\n/)) {
    const marker = /^\[([^\]]+)\]\s*$/.exec(raw);
    if (marker) {
      current = { label: labelOrName(marker[1]), lines: [] };
      sections.push(current);
      chords = null;
    } else if (raw.startsWith(';')) {
      continue;
    } else if (raw.startsWith('.')) {
      chords = raw.slice(1);
    } else if (raw.startsWith('---') || !raw.trim()) {
      if (current) current.lines.push('');
    } else if (current) {
      // Linha começando por número: faz parte do verso daquele número (um [V] com vários versos).
      const numbered = /^(\d)\s?(.*)$/.exec(raw);
      const target = numbered ? get(`Verso ${Number(numbered[1])}`) : current;
      const lyric = numbered ? numbered[2] : raw.replace(/^ /, '');
      target.lines.push(chords ? mergeChords(chords, lyric) : lyric);
      chords = null;
    }
  }
  return sections;
}

function importOpenSong(xml) {
  const lyricsRaw = firstTag(xml, 'lyrics');
  if (lyricsRaw === null) return null;
  const sections = parseOpenSongLyrics(decodeEntities(unCdata(lyricsRaw)));
  const text = sectionsToText(sections);
  if (!text) return null;
  const presentation = firstTag(xml, 'presentation');
  const order = presentation ? textOf(presentation).split(/\s+/).map((t) => labelForCode(t)).filter(Boolean) : [];
  const labels = new Set(sections.map((s) => s.label));
  return finish('opensong', { title: textOf(firstTag(xml, 'title') || ''), author: textOf(firstTag(xml, 'author') || ''), ccli: textOf(firstTag(xml, 'ccli') || '') },
    text, order, labels);
}

// ---------- OpenLyrics ----------
// <lines> do OpenLyrics: <br/> vira quebra, <chord name="Am"/> vira [Am], qualquer outra tag some. Uma passada.
function linesOfVerse(inner) {
  const html = allTags(inner, 'lines').join('<br/>').replace(/\s+/g, ' ');
  let out = '';
  let pos = 0;
  for (;;) {
    const open = html.indexOf('<', pos);
    const close = open < 0 ? -1 : html.indexOf('>', open + 1);
    if (close < 0) break;
    out += html.slice(pos, open);
    const tag = html.slice(open + 1, close).trim();
    if (/^br\b/i.test(tag)) {
      out += '\n';
    } else {
      const chord = /^chord\s+name\s*=\s*["']([^"']*)["']/i.exec(tag);
      if (chord && isChord(chord[1])) out += `[${chord[1]}]`;
    }
    pos = close + 1;
  }
  return decodeEntities(out + html.slice(pos)).split('\n').map((l) => l.trim());
}

function importOpenLyrics(xml) {
  const sections = [];
  for (const verse of elementsOf(xml, 'verse')) {
    const name = /name\s*=\s*["']([^"']*)["']/i.exec(verse.attrs);
    if (name) sections.push({ label: labelOrName(name[1]), lines: linesOfVerse(verse.inner) });
  }
  const text = sectionsToText(sections);
  if (!text) return null;
  const verseOrder = firstTag(xml, 'verseOrder');
  const order = verseOrder ? textOf(verseOrder).split(/\s+/).map((t) => labelForCode(t)).filter(Boolean) : [];
  const authors = allTags(xml, 'author').map(textOf).filter(Boolean).join(', ');
  return finish('openlyrics', { title: textOf(firstTag(xml, 'title') || ''), author: authors, ccli: textOf(firstTag(xml, 'ccliNo') || '') },
    text, order, new Set(sections.map((s) => s.label)));
}

// ---------- ChordPro ----------
// {nome} ou {nome: valor}; a linha já vem aparada. Sem expressão regular sobre o valor (sem retrocesso).
function parseDirective(line) {
  if (!line.startsWith('{') || !line.endsWith('}')) return null;
  const inner = line.slice(1, -1);
  const colon = inner.indexOf(':');
  const name = (colon < 0 ? inner : inner.slice(0, colon)).trim();
  if (!/^[a-z_]+$/i.test(name)) return null;
  return { name: name.toLowerCase(), value: colon < 0 ? '' : inner.slice(colon + 1).trim() };
}
const DIRECTIVE_SNIFF = /^\{\s*(?:title|t|subtitle|st|artist|ccli|soc|sov|start_of_\w+|comment|c)\b/i;
const AUTHOR_DIRECTIVES = ['artist', 'author', 'composer', 'lyricist', 'subtitle', 'st'];
const COMMENT_DIRECTIVES = ['comment', 'c', 'comment_italic', 'ci', 'comment_box', 'cb'];

function importChordPro(content) {
  const fields = { title: '', author: '', ccli: '' };
  const out = [];
  let verseNumber = 0;
  let nextLabel = null; // rótulo da próxima seção (de {comment}, {soc}…)
  let keepLabel = false; // dentro de {soc}…{eoc}: as linhas em branco não trocam o rótulo
  let open = false;
  let inTab = false;
  const labels = new Set();
  const emit = (label) => {
    labels.add(label);
    out.push(`[${label}]`);
    open = true;
  };

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    const directive = parseDirective(line);
    const name = directive ? directive.name : '';
    const value = directive ? directive.value : '';
    if (inTab) {
      if (['eot', 'end_of_tab'].includes(name)) inTab = false;
    } else if (line.startsWith('#')) {
      continue;
    } else if (directive) {
      if (['title', 't'].includes(name)) fields.title = value;
      else if (AUTHOR_DIRECTIVES.includes(name)) fields.author = fields.author || value;
      else if (name === 'ccli') fields.ccli = value;
      else if (['soc', 'start_of_chorus'].includes(name)) { nextLabel = 'Refrão'; keepLabel = true; open = false; }
      else if (['eoc', 'end_of_chorus'].includes(name)) { nextLabel = null; keepLabel = false; open = false; }
      else if (['sov', 'start_of_verse'].includes(name)) { verseNumber += 1; nextLabel = `Verso ${verseNumber}`; open = false; }
      else if (['sob', 'start_of_bridge'].includes(name)) { nextLabel = 'Ponte'; open = false; }
      else if (['sot', 'start_of_tab'].includes(name)) inTab = true;
      else if (COMMENT_DIRECTIVES.includes(name) && value) { nextLabel = value.slice(0, MAX_LABEL_CHARS); open = false; }
    } else if (!line) {
      open = false;
      out.push('');
    } else {
      if (!open) {
        if (nextLabel) emit(nextLabel);
        else { verseNumber += 1; emit(`Verso ${verseNumber}`); }
        if (!keepLabel) nextLabel = null;
      }
      out.push(line);
    }
  }
  const text = out.join('\n').trim();
  return text ? finish('chordpro', fields, text, [], labels) : null;
}

// ---------- Entrada ----------
const baseName = (fileName) => String(fileName).replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');

// Reconhece o formato pelo conteúdo. Devolve { ok, format, song } ou { ok: false, reason }.
function importSong(fileName, content) {
  if (typeof fileName !== 'string' || typeof content !== 'string') return { ok: false, reason: 'Arquivo inválido.' };
  if (content.length > MAX_FILE_CHARS) return { ok: false, reason: 'Arquivo grande demais para ser uma letra (máximo 300 KB).' };
  const trimmed = content.replace(/^﻿/, '').trim();
  if (!trimmed) return { ok: false, reason: 'Arquivo vazio.' };

  let result = null;
  if (trimmed.startsWith('<')) {
    if (!/<song[\s>]/i.test(trimmed)) return { ok: false, reason: 'XML que não é uma música (OpenLyrics ou OpenSong).' };
    const isOpenLyrics = /openlyrics/i.test(trimmed) || /<verse\b/i.test(trimmed);
    result = isOpenLyrics ? importOpenLyrics(trimmed) : importOpenSong(trimmed);
    if (!result) return { ok: false, reason: 'Não achei a letra neste arquivo.' };
  } else if (trimmed.split(/\r?\n/).some((l) => DIRECTIVE_SNIFF.test(l.trim()))) {
    result = importChordPro(trimmed);
    if (!result) return { ok: false, reason: 'Não achei a letra neste arquivo.' };
  } else {
    result = { ok: true, format: 'texto', song: { title: '', author: '', ccli: '', text: cleanText(trimmed), arrangements: [] } };
  }
  const title = result.song.title || baseName(fileName).trim().slice(0, MAX_TITLE_CHARS);
  if (!title) return { ok: false, reason: 'Arquivo sem título.' };
  return { ...result, song: { ...result.song, title } };
}

module.exports = { importSong, labelForCode, MAX_FILE_CHARS };

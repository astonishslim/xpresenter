// Edição rápida: troca o texto de um slide dentro da letra original da música.
// O trecho é achado pelas linhas já limpas (sem acordes); linhas que não mudaram mantêm os acordes.
const { classifyLine } = require('./songParser');
const { normalize } = require('../renderer/shared/sections');

const MAX_NEW_TEXT_CHARS = 2000;
const DEFAULT_LABEL = 'Letra'; // o mesmo rótulo que o parser dá à letra sem marcadores

const trimmedLines = (text) => {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim());
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
};

// Linhas de texto da letra, com o índice no arquivo, o bloco (marcador ou linha em branco abrem bloco novo)
// e o rótulo da seção em que estão (bloco sem marcador continua a seção anterior, como no parser).
function textEntries(rawLines) {
  const entries = [];
  let block = 0;
  let label = DEFAULT_LABEL;
  rawLines.forEach((raw, index) => {
    const line = classifyLine(raw);
    if (line.kind === 'marker') label = line.label;
    if (line.kind === 'marker' || line.kind === 'blank') block += 1;
    else if (line.kind === 'text') entries.push({ index, clean: line.clean, block, label: normalize(label) });
  });
  return entries;
}

// Primeira ocorrência das linhas num mesmo bloco; com `label`, só dentro da seção com esse rótulo.
function findRun(entries, oldLines, label) {
  const wanted = label == null ? null : normalize(label);
  for (let s = 0; s + oldLines.length <= entries.length; s += 1) {
    const sameSection = wanted === null || entries[s].label === wanted;
    const ok = sameSection && oldLines.every((line, j) => entries[s + j].clean === line && entries[s + j].block === entries[s].block);
    if (ok) return s;
  }
  return -1;
}

// Devolve a letra nova, ou null se o trecho não foi achado (ou o texto novo é vazio/grande demais).
// `label`: rótulo do slide editado, para não trocar um trecho igual em outra seção (Verso 1 x Verso 3).
function replaceSlideText(text, oldText, newText, { label } = {}) {
  const source = String(text ?? '');
  const oldLines = String(oldText ?? '').split(/\r?\n/);
  const newLines = trimmedLines(newText ?? '');
  if (!oldLines.join('').trim() || !newLines.length || String(newText).length > MAX_NEW_TEXT_CHARS) return null;

  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const raw = source.split(/\r?\n/);
  const entries = textEntries(raw);
  const s = findRun(entries, oldLines, label);
  if (s < 0) return null;

  const replacement = newLines.flatMap((line, j) => {
    if (j >= oldLines.length || line !== oldLines[j]) return [line];
    // Linha igual: mantém a original (com acordes) e as linhas só de acordes logo antes dela.
    const from = j === 0 ? entries[s].index : entries[s + j - 1].index + 1;
    return raw.slice(from, entries[s + j].index + 1);
  });
  const end = entries[s + oldLines.length - 1].index;
  return [...raw.slice(0, entries[s].index), ...replacement, ...raw.slice(end + 1)].join(eol);
}

module.exports = { replaceSlideText };

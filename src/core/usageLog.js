// Registro de uso das músicas, para o relatório da licença (CCLI): cada música que entra ao vivo é gravada uma vez
// por dia. Um arquivo de linhas JSON (usage.jsonl), só de acréscimo; o relatório sai em CSV para planilha.
const fs = require('node:fs');
const path = require('node:path');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CCLI_RE = /^\d{1,10}$/;
const MAX_TITLE_CHARS = 120;
const MAX_AUTHOR_CHARS = 80;
const CSV_HEADER = ['Data', 'Hora', 'Título', 'Autor', 'CCLI'];
const CSV_SEPARATOR = ';'; // o Excel em português usa ponto e vírgula
const CSV_BOM = '\uFEFF'; // para o Excel abrir os acentos certo

const pad = (n) => String(n).padStart(2, '0');
const dateOf = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const timeOf = (ms) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function readEntries(file) {
  let raw = '';
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[uso] não foi possível ler ${file}: ${err.message}`);
    return [];
  }
  const byKey = new Map();
  for (const line of raw.split(/\r?\n/)) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue; // linha quebrada (corte de energia no meio da gravação): ignora
    }
    const ok = e && typeof e.songId === 'string' && typeof e.title === 'string' && isValidDate(e.date) && typeof e.time === 'string';
    if (!ok) continue;
    const entry = { ...e, author: String(e.author || ''), ccli: String(e.ccli || '') };
    const key = `${entry.date}|${entry.songId}`;
    const before = byKey.get(key);
    // Linha de correção (autor/CCLI cadastrados depois): completa o registro do dia; o vazio nunca apaga.
    byKey.set(key, before ? { ...before, author: entry.author || before.author, ccli: entry.ccli || before.ccli } : entry);
  }
  return [...byKey.values()];
}

function createUsageLog(file, { now = Date.now } = {}) {
  const entries = readEntries(file);
  const append = (entry) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
  };

  return {
    // true se gravou um registro novo; false se a música já foi contada hoje (ou veio sem id/título).
    // Já contada hoje, mas sem autor/CCLI e agora com: completa o registro (linha de correção), sem contar de novo.
    record(song) {
      if (!song || typeof song.songId !== 'string' || !song.songId) return false;
      const title = typeof song.title === 'string' ? song.title.trim().slice(0, MAX_TITLE_CHARS) : '';
      if (!title) return false;
      const t = now();
      const date = dateOf(t);
      const ccli = typeof song.ccli === 'string' && CCLI_RE.test(song.ccli.trim()) ? song.ccli.trim() : '';
      const author = typeof song.author === 'string' ? song.author.trim().slice(0, MAX_AUTHOR_CHARS) : '';
      const at = entries.findIndex((e) => e.date === date && e.songId === song.songId);
      if (at >= 0) {
        const current = entries[at];
        const merged = { ...current, author: current.author || author, ccli: current.ccli || ccli };
        if (merged.author !== current.author || merged.ccli !== current.ccli) {
          append(merged);
          entries[at] = merged;
        }
        return false;
      }
      const entry = { date, time: timeOf(t), songId: song.songId, title, author, ccli };
      append(entry);
      entries.push(entry);
      return true;
    },
    // Período inclusivo; limite que não é uma data válida fica aberto.
    list({ from, to } = {}) {
      return entries
        .filter((e) => (!isValidDate(from) || e.date >= from) && (!isValidDate(to) || e.date <= to))
        .map((e) => ({ ...e }));
    },
  };
}

// Texto que começa com = + - @ vira fórmula na planilha: ganha um apóstrofo na frente.
const csvCell = (value) => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function toCsv(entries) {
  const rows = entries.map((e) => [e.date, e.time, e.title, e.author, e.ccli].map(csvCell).join(CSV_SEPARATOR));
  return `${CSV_BOM}${[CSV_HEADER.join(CSV_SEPARATOR), ...rows].map((r) => `${r}\r\n`).join('')}`;
}

// Observa o estado ao vivo: quando um item novo entra no ar e é uma música, grava o uso.
// Nunca derruba a projeção: erro de disco ou do resolvedor só vai para o log.
// Limite conhecido: uma música que fica no ar passando da meia-noite conta só no dia em que entrou.
function createUsageTracker({ log, resolveSong }) {
  let lastItem = null;
  return {
    observe(state) {
      const slide = state && state.layers && state.layers.content.slide;
      const key = slide && typeof slide.key === 'string' ? slide.key : null;
      const item = key ? key.replace(/:\d+$/, '') : null;
      if (!item || item === lastItem) return;
      lastItem = item;
      try {
        const song = resolveSong(item);
        if (song) log.record(song);
      } catch (err) {
        console.error(`[uso] não foi possível registrar o uso: ${err.message}`);
      }
    },
  };
}

module.exports = { createUsageLog, createUsageTracker, toCsv, dateOf, isValidDate };

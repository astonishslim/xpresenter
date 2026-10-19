// Busca de letras na internet pelo LRCLIB (https://lrclib.net): API aberta, gratuita e sem chave.
// Tudo o que chega é tratado como não confiável: campos conferidos, texto limpo e tamanhos limitados.
const { version } = require('../../package.json');

const API = 'https://lrclib.net/api/search';
const USER_AGENT = `Apresentador/${version} (projeção para igrejas)`;
const MAX_QUERY_CHARS = 200;
const MAX_RESULTS = 25;
const MAX_TITLE_CHARS = 120;
const MAX_LYRICS_CHARS = 20000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10000;
// Servidor ocupado ou limite de requisições: vale tentar a próxima forma de busca.
const RETRY_STATUS = new Set([429, 502, 503, 504]);
// Controle (C0/C1), largura zero e marcas de direção (bidi): invisíveis, só servem para disfarçar o texto.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g;
const TOO_BIG = 'Resposta grande demais do serviço de letras.';

// Lê o corpo contando bytes e para assim que passa do limite (não baixa tudo antes de conferir).
async function readLimited(res, maxBytes) {
  const declared = Number(res.headers && res.headers.get && res.headers.get('content-length'));
  if (declared > maxBytes) return null;
  if (!res.body || typeof res.body.getReader !== 'function') {
    const text = await res.text();
    return text.length > maxBytes ? null : text;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const clean = (value) => String(value).replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '');
const field = (value, max) => (typeof value === 'string' ? clean(value).trim().slice(0, max) : '');

function toSongText(plain) {
  return clean(plain).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Primeiro nome+artista (mais leve no servidor e mais preciso); por último a busca livre.
function buildSearchUrls(input) {
  const title = input && typeof input.title === 'string' ? input.title.trim() : '';
  const artist = input && typeof input.artist === 'string' ? input.artist.trim() : '';
  if (!title || title.length > MAX_QUERY_CHARS || artist.length > MAX_QUERY_CHARS) return [];
  const url = (params) => `${API}?${new URLSearchParams(params)}`;
  const urls = [url(artist ? { track_name: title, artist_name: artist } : { track_name: title })];
  urls.push(url({ q: artist ? `${title} ${artist}` : title }));
  return urls;
}

function parseResults(json) {
  if (!Array.isArray(json)) return [];
  const seen = new Set();
  const results = [];
  for (const raw of json) {
    if (!raw || typeof raw !== 'object' || raw.instrumental === true) continue;
    if (typeof raw.plainLyrics !== 'string' || raw.plainLyrics.length > MAX_LYRICS_CHARS) continue;
    const lyrics = toSongText(raw.plainLyrics);
    const title = field(raw.trackName, MAX_TITLE_CHARS);
    if (!lyrics || !title) continue;
    const artist = field(raw.artistName, MAX_TITLE_CHARS);
    const key = `${title.toLowerCase()}|${artist.toLowerCase()}|${lyrics}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      id: Number.isSafeInteger(raw.id) ? raw.id : results.length,
      title,
      artist,
      album: field(raw.albumName, MAX_TITLE_CHARS),
      preview: lyrics.split('\n')[0],
      lyrics,
    });
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}

async function fetchJson(fetchImpl, url, timeoutMs) {
  const res = await fetchImpl(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  });
  if (RETRY_STATUS.has(res.status)) return { retry: true, reason: 'O serviço de letras está ocupado. Tente de novo em instantes.' };
  if (!res.ok) return { retry: true, reason: `O serviço de letras respondeu com erro (${res.status}).` };
  const body = await readLimited(res, MAX_RESPONSE_BYTES);
  if (body === null) return { retry: true, reason: TOO_BIG };
  try {
    return { json: JSON.parse(body) };
  } catch {
    return { retry: true, reason: 'Resposta inválida do serviço de letras.' };
  }
}

function createLyricsClient({ fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  return {
    async search(input) {
      const urls = buildSearchUrls(input);
      if (!urls.length) return { ok: false, reason: 'Digite o nome da música (até 200 caracteres).' };
      let reason = '';
      let answered = false;
      for (const url of urls) {
        try {
          const res = await fetchJson(fetchImpl, url, timeoutMs);
          if (res.json !== undefined) {
            answered = true;
            const results = parseResults(res.json);
            if (results.length) return { ok: true, results };
          } else {
            reason = res.reason;
          }
        } catch (err) {
          reason = err && err.name === 'TimeoutError'
            ? 'O serviço de letras demorou demais para responder.'
            : 'Sem conexão com a internet (ou o serviço de letras está fora do ar).';
        }
      }
      return answered ? { ok: true, results: [] } : { ok: false, reason };
    },
  };
}

module.exports = { buildSearchUrls, parseResults, toSongText, createLyricsClient, MAX_RESULTS, USER_AGENT };

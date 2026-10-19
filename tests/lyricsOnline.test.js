const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSearchUrls, parseResults, toSongText, createLyricsClient, MAX_RESULTS } = require('../src/core/lyricsOnline');

const item = (over = {}) => ({
  id: 1, trackName: 'Grandes Coisas', artistName: 'Fernandinho', albumName: 'Uma Nova História', duration: 300,
  instrumental: false, plainLyrics: 'Tu és o Deus dessa terra\nTu és o rei desse povo\n\nGrandes coisas estão por vir', ...over,
});

test('buildSearchUrls usa nome+artista primeiro e cai para a busca livre', () => {
  const urls = buildSearchUrls({ title: 'Grandes coisas', artist: 'Fernandinho' });
  assert.equal(urls[0], 'https://lrclib.net/api/search?track_name=Grandes+coisas&artist_name=Fernandinho');
  assert.ok(urls.includes('https://lrclib.net/api/search?q=Grandes+coisas+Fernandinho'));
  assert.deepEqual(buildSearchUrls({ title: 'Oceanos' }), [
    'https://lrclib.net/api/search?track_name=Oceanos',
    'https://lrclib.net/api/search?q=Oceanos',
  ]);
});

test('buildSearchUrls recusa busca vazia ou longa demais', () => {
  assert.deepEqual(buildSearchUrls({ title: '  ' }), []);
  assert.deepEqual(buildSearchUrls({ title: 'x'.repeat(201) }), []);
  assert.deepEqual(buildSearchUrls(null), []);
});

test('parseResults extrai campos, descarta instrumentais/sem letra e junta duplicados', () => {
  const r = parseResults([
    item(),
    item({ id: 2 }), // duplicado (mesmo título, artista e letra)
    item({ id: 3, instrumental: true }),
    item({ id: 4, plainLyrics: '' }),
    item({ id: 5, plainLyrics: null }),
    item({ id: 6, trackName: 'Outra', plainLyrics: 'Linha' }),
    'lixo', null,
  ]);
  assert.deepEqual(r.map((x) => x.id), [1, 6]);
  assert.deepEqual(Object.keys(r[0]).sort(), ['album', 'artist', 'id', 'lyrics', 'preview', 'title']);
  assert.equal(r[0].preview, 'Tu és o Deus dessa terra');
});

test('parseResults limita quantidade e tamanho, e tolera resposta não-lista', () => {
  const many = Array.from({ length: 60 }, (_, i) => item({ id: i, trackName: `M${i}` }));
  assert.equal(parseResults(many).length, MAX_RESULTS);
  assert.deepEqual(parseResults({ message: 'erro' }), []);
  const huge = parseResults([item({ plainLyrics: 'a'.repeat(100000) })]);
  assert.deepEqual(huge, [], 'letra absurda é descartada');
});

test('parseResults remove caracteres de controle e limita título', () => {
  const [r] = parseResults([item({ trackName: `Ti\u0000tulo${'x'.repeat(300)}`, plainLyrics: 'A\u0007B\r\nC' })]);
  assert.equal(r.title.includes('\u0000'), false);
  assert.ok(r.title.length <= 120);
  assert.equal(r.lyrics, 'AB\nC');
});

test('parseResults remove caracteres invisíveis que enganam a leitura (bidi, largura zero, C1)', () => {
  const [r] = parseResults([item({ trackName: 'Gra‮ndes​ Coisas\u0085', plainLyrics: '﻿Tu és⁦ o Deus' })]);
  assert.equal(r.title, 'Grandes Coisas');
  assert.equal(r.lyrics, 'Tu és o Deus');
});

test('client.search não baixa resposta acima do limite (content-length ou stream)', async () => {
  const big = 3 * 1024 * 1024;
  let pulled = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulled += 1;
      if (pulled > 100) { controller.close(); return; }
      controller.enqueue(new Uint8Array(512 * 1024));
    },
  });
  const responses = [
    { ok: true, status: 200, headers: new Headers({ 'content-length': String(big) }), body: null, text: async () => { throw new Error('não devia ler'); } },
    { ok: true, status: 200, headers: new Headers(), body: stream, text: async () => { throw new Error('não devia usar text()'); } },
  ];
  const res = await createLyricsClient({ fetchImpl: async () => responses.shift() }).search({ title: 'X' });
  assert.equal(res.ok, false);
  assert.match(res.reason, /grande/i);
  assert.ok(pulled < 10, `parou cedo (leu ${pulled} pedaços)`);
});

test('client.search lê a resposta pelo stream quando há corpo', async () => {
  const body = new Blob([JSON.stringify([item()])]).stream();
  const fetchImpl = async () => ({ ok: true, status: 200, headers: new Headers(), body });
  const res = await createLyricsClient({ fetchImpl }).search({ title: 'Grandes coisas' });
  assert.equal(res.ok, true);
  assert.equal(res.results[0].artist, 'Fernandinho');
});

test('toSongText normaliza quebras e excesso de linhas em branco', () => {
  assert.equal(toSongText('A\r\nB\n\n\n\nC\n'), 'A\nB\n\nC');
});

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { ok: next.status === 200, status: next.status, text: async () => next.body };
  };
  return { impl, calls };
}

test('client.search devolve resultados e envia User-Agent do app', async () => {
  const { impl, calls } = fakeFetch([{ status: 200, body: JSON.stringify([item()]) }]);
  const res = await createLyricsClient({ fetchImpl: impl }).search({ title: 'Grandes coisas' });
  assert.equal(res.ok, true);
  assert.equal(res.results[0].title, 'Grandes Coisas');
  assert.match(calls[0].opts.headers['user-agent'], /^xpresenter\//);
  assert.ok(calls[0].opts.signal, 'tem timeout');
});

test('client.search tenta a próxima URL quando o servidor está ocupado ou não acha nada', async () => {
  const { impl, calls } = fakeFetch([{ status: 503, body: '{}' }, { status: 200, body: JSON.stringify([item()]) }]);
  const res = await createLyricsClient({ fetchImpl: impl }).search({ title: 'Grandes coisas' });
  assert.equal(res.ok, true);
  assert.equal(calls.length, 2);
  const empty = fakeFetch([{ status: 200, body: '[]' }, { status: 200, body: '[]' }]);
  const none = await createLyricsClient({ fetchImpl: empty.impl }).search({ title: 'Nada' });
  assert.deepEqual(none, { ok: true, results: [] });
  assert.equal(empty.calls.length, 2);
});

test('client.search explica falhas sem lançar', async () => {
  const busy = fakeFetch([{ status: 503, body: '' }, { status: 503, body: '' }]);
  const r1 = await createLyricsClient({ fetchImpl: busy.impl }).search({ title: 'X' });
  assert.equal(r1.ok, false);
  assert.match(r1.reason, /ocupado/i);

  const offline = fakeFetch([new Error('getaddrinfo ENOTFOUND'), new Error('getaddrinfo ENOTFOUND')]);
  const r2 = await createLyricsClient({ fetchImpl: offline.impl }).search({ title: 'X' });
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /internet/i);

  const bad = fakeFetch([{ status: 200, body: '<html>' }, { status: 200, body: 'x'.repeat(3 * 1024 * 1024) }]);
  const r3 = await createLyricsClient({ fetchImpl: bad.impl }).search({ title: 'X' });
  assert.equal(r3.ok, false);

  const r4 = await createLyricsClient({ fetchImpl: busy.impl }).search({ title: '' });
  assert.equal(r4.ok, false);
  assert.match(r4.reason, /nome/i);
});

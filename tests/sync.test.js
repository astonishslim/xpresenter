const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { initialState, reduce } = require('../src/core/state');
const { createStore } = require('../src/core/store');
const { createRemoteServer } = require('../src/core/remoteServer');
const { sanitizeSyncedState } = require('../src/core/syncState');
const { parseSyncUrl, createSseParser, createSyncClient } = require('../src/core/syncClient');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, timeoutMs = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('tempo esgotado esperando a condição');
    await wait(20);
  }
}

const logo = { id: 'p1', name: 'Logo', kind: 'image', value: 'file:///C:/igreja/logo.png', position: 'top-right', size: 20 };

function leaderState() {
  let s = initialState();
  s = reduce(s, { type: 'setBackground', background: { kind: 'image', value: 'file:///C:/fundo.png' } });
  s = reduce(s, { type: 'setBackgroundDim', value: 30 });
  s = reduce(s, { type: 'showSlide', slide: { label: 'Verso 1', text: 'a\nb', title: 'Hino', key: 'x:0', chords: [[{ at: 0, chord: 'G' }], []] }, next: { label: 'Refrão', text: 'c' } });
  s = reduce(s, { type: 'setAnnouncement', text: 'Aviso' });
  s = reduce(s, { type: 'showProp', prop: logo });
  s = reduce(s, { type: 'timerSet', mode: 'countdown', seconds: 600 });
  s = reduce(s, { type: 'timerToggle', now: 1000 });
  s = reduce(s, { type: 'setTextStyle', style: { uppercase: true, outline: 'thin', box: 40 } });
  s = reduce(s, { type: 'blackout' });
  return JSON.parse(JSON.stringify(s)); // como chega pela rede
}

// ---------- Estado recebido ----------
test('o estado do líder passa inteiro: camadas, estilo, tela preta, retorno e cronômetro', () => {
  const got = sanitizeSyncedState(leaderState());
  assert.equal(got.blackout, true);
  assert.deepEqual([got.layers.background.kind, got.layers.background.value, got.layers.background.dim], ['image', 'file:///C:/fundo.png', 30]);
  assert.equal(got.layers.content.slide.text, 'a\nb');
  assert.deepEqual(got.layers.content.slide.chords, [[{ at: 0, chord: 'G' }], []]);
  assert.equal(got.layers.announcement.text, 'Aviso');
  assert.deepEqual(got.layers.props.items.map((i) => i.id), ['p1']);
  assert.equal(got.textStyle.uppercase, true);
  assert.equal(got.textStyle.outline, 'thin');
  assert.deepEqual(got.stage.next, { label: 'Refrão', text: 'c' });
  assert.equal(got.timer.mode, 'countdown');
  assert.equal(got.timer.startedAt, 1000);
});

test('o relógio do líder é convertido para o deste computador (cronômetro e horário-alvo)', () => {
  const raw = leaderState();
  raw.timer = { ...raw.timer, startedAt: 1000, targetAt: 9000, mode: 'until' };
  const got = sanitizeSyncedState(raw, { offsetMs: 250 });
  assert.equal(got.timer.startedAt, 1250);
  assert.equal(got.timer.targetAt, 9250);
  const idle = sanitizeSyncedState({ ...leaderState(), timer: { mode: 'countdown', setMs: 1, baseMs: 1, startedAt: null, targetAt: null, visible: false } }, { offsetMs: 250 });
  assert.equal(idle.timer.startedAt, null);
  assert.equal(idle.timer.targetAt, null);
});

test('o que o líder manda e não é válido é descartado, não copiado', () => {
  const raw = leaderState();
  raw.layers.background = { kind: 'image', value: 'file://atacante/share/a.png' };
  raw.layers.media = { kind: 'video', value: 'http://x/y.mp4', title: 't' };
  raw.layers.content.slide = { text: 42 };
  raw.layers.props.items = [logo, { ...logo, id: 'x', value: 'javascript:alert(1)' }, 'lixo', { id: 'y', kind: 'html' }];
  raw.layers.announcement.text = 'a'.repeat(501);
  raw.textStyle = { font: 'comic', size: 7, color: 'red', uppercase: true };
  raw.stage = { next: { text: 42 }, message: { oi: 1 } };
  raw.timer = { mode: 'explodir', setMs: 'x', baseMs: Infinity, startedAt: 'ontem', targetAt: null, visible: 'sim' };
  const got = sanitizeSyncedState(raw);
  assert.deepEqual([got.layers.background.kind, got.layers.background.value], ['color', '#000000']);
  assert.equal(got.layers.media, null);
  assert.equal(got.layers.content.slide, null);
  assert.deepEqual(got.layers.props.items.map((i) => i.id), ['p1']);
  assert.equal(got.layers.announcement.text, null);
  assert.deepEqual([got.textStyle.font, got.textStyle.size, got.textStyle.color, got.textStyle.uppercase], ['sans', 100, '#ffffff', true]);
  assert.equal(got.stage.next, null);
  assert.equal(got.stage.message, null);
  assert.equal(got.timer.mode, 'countdown');
  assert.equal(got.timer.startedAt, null);
  assert.equal(got.timer.visible, false);
});

test('campos desconhecidos e __proto__ não entram; o resultado não divide objetos com o recebido', () => {
  const raw = JSON.parse('{"__proto__":{"admin":true},"extra":1,"layers":{"background":{"kind":"color","value":"#112233","evil":1},"content":{"slide":null},"props":{"items":[]},"outra":2}}');
  const got = sanitizeSyncedState(raw);
  assert.equal(({}).admin, undefined);
  assert.equal('extra' in got, false);
  assert.equal('outra' in got.layers, false);
  assert.equal('evil' in got.layers.background, false);
  assert.equal(got.layers.background.value, '#112233');
  const leader = leaderState();
  const copy = sanitizeSyncedState(leader);
  copy.layers.content.slide.text = 'mutado';
  assert.equal(leader.layers.content.slide.text, 'a\nb');
});

test('lixo no lugar do estado vira null', () => {
  for (const bad of [null, undefined, 42, 'x', [], {}, { layers: 'x' }]) assert.equal(sanitizeSyncedState(bad), null, String(bad));
});

test('estado vazio mas bem formado vira o estado inicial', () => {
  const got = sanitizeSyncedState({ layers: {} });
  assert.deepEqual(got.layers.props, { items: [] });
  assert.equal(got.layers.content.slide, null);
  assert.equal(got.blackout, false);
});

// ---------- Trava e troca de estado no store ----------
test('store travado ignora ações, desfazer e refazer, mas aceita replace', () => {
  let t = 0;
  const store = createStore(undefined, { now: () => t });
  t = 1000; store.dispatch({ type: 'blackout' });
  const seen = [];
  store.subscribe((s) => seen.push(s.blackout));
  store.lock(true);
  assert.equal(store.isLocked(), true);
  store.dispatch({ type: 'blackout' });
  store.undo();
  store.redo();
  assert.equal(store.getState().blackout, true);
  assert.deepEqual(seen, []);
  store.replace(initialState());
  assert.equal(store.getState().blackout, false);
  assert.deepEqual(seen, [false]);
  store.lock(false);
  store.dispatch({ type: 'blackout' });
  assert.equal(store.getState().blackout, true);
});

test('replace limpa o histórico (não dá para desfazer para um estado de antes de seguir)', () => {
  let t = 0;
  const store = createStore(undefined, { now: () => t });
  t = 1000; store.dispatch({ type: 'blackout' });
  assert.equal(store.history().canUndo, true);
  store.replace(initialState());
  assert.deepEqual(store.history(), { canUndo: false, canRedo: false });
});

// ---------- Endereço ----------
test('parseSyncUrl aceita o endereço do controle remoto e recusa o resto', () => {
  const ok = parseSyncUrl('http://192.168.0.10:5151/?t=0123456789abcdef0123456789abcdef');
  assert.deepEqual(ok, { ok: true, host: '192.168.0.10', port: 5151, token: '0123456789abcdef0123456789abcdef' });
  assert.equal(parseSyncUrl('  http://pc-culto.local:5151/index.html?t=abcdefgh12345678 ').ok, true);
  assert.equal(parseSyncUrl('http://192.168.0.10/?t=abcdefgh12345678').port, 80);
  for (const bad of ['', 'abc', 'https://x/?t=abcdefgh12345678', 'ftp://x:1/?t=abcdefgh12345678', 'http://x:5151/', 'http://x:5151/?t=',
    'http://x:5151/?t=curto', 'http://x:5151/?t=abc def ghi', 'http://x:99999/?t=abcdefgh12345678', 'http://[::1]:5151/?t=abcdefgh12345678',
    'file:///C:/a', 'javascript:alert(1)', null, 42]) {
    assert.equal(parseSyncUrl(bad).ok, false, String(bad));
  }
});

// ---------- Leitura do SSE ----------
test('createSseParser junta pedaços, ignora comentários/ping e entrega cada evento', () => {
  const got = [];
  const parser = createSseParser((data) => got.push(data));
  parser.feed('data: {"a"');
  parser.feed(':1}\n\n: ping\n\ndata: dois\n');
  parser.feed('\ndata: linha1\r\ndata: linha2\r\n\r\n');
  assert.deepEqual(got, ['{"a":1}', 'dois', 'linha1\nlinha2']);
});

test('createSseParser recusa um evento sem fim que passa de 1 MB', () => {
  const parser = createSseParser(() => {});
  assert.throws(() => parser.feed(`data: ${'x'.repeat(1_100_000)}`), /grande demais/i);
});

// ---------- Cliente de verdade, contra o servidor remoto ----------
async function startLeader() {
  const store = createStore();
  const token = 'tok0123456789abcdef0123456789abcd';
  const server = createRemoteServer({
    token, staticDir: path.join(__dirname), getState: store.getState, dispatch: store.dispatch, subscribe: store.subscribe, getPlaylist: () => [],
  });
  const port = await server.listen(0, '127.0.0.1');
  return { store, server, port, token, url: `http://127.0.0.1:${port}/?t=${token}` };
}

test('o seguidor recebe o estado inicial e cada mudança do líder', async (t) => {
  const leader = await startLeader();
  const states = [];
  const statuses = [];
  const client = createSyncClient({ onState: (raw, offsetMs) => states.push({ raw, offsetMs }), onStatus: (s) => statuses.push(s.state) });
  t.after(async () => { client.stop(); await leader.server.close(); });
  client.start(parseSyncUrl(leader.url));
  await until(() => states.length >= 1);
  assert.equal(states[0].raw.blackout, false);
  assert.ok(Number.isFinite(states[0].offsetMs));
  assert.ok(Math.abs(states[0].offsetMs) < 5000, 'mesmo computador: diferença de relógio pequena');
  leader.store.dispatch({ type: 'showSlide', slide: { label: 'V', text: 'Olá do líder' } });
  await until(() => states.some((s) => s.raw.layers.content.slide && s.raw.layers.content.slide.text === 'Olá do líder'));
  assert.ok(statuses.includes('connecting'));
  assert.ok(statuses.includes('connected'));
});

test('stop para de receber e informa "stopped"', async (t) => {
  const leader = await startLeader();
  const states = [];
  let last = null;
  const client = createSyncClient({ onState: (raw) => states.push(raw), onStatus: (s) => { last = s; } });
  t.after(async () => { client.stop(); await leader.server.close(); });
  client.start(parseSyncUrl(leader.url));
  await until(() => states.length >= 1);
  client.stop();
  assert.equal(last.state, 'stopped');
  const before = states.length;
  leader.store.dispatch({ type: 'blackout' });
  await wait(150);
  assert.equal(states.length, before);
});

test('token errado: para com mensagem clara, sem insistir', async (t) => {
  const leader = await startLeader();
  const statuses = [];
  const client = createSyncClient({ onState: () => {}, onStatus: (s) => statuses.push(s) });
  t.after(async () => { client.stop(); await leader.server.close(); });
  client.start(parseSyncUrl(`http://127.0.0.1:${leader.port}/?t=tokenerrado12345678`));
  await until(() => statuses.some((s) => s.state === 'stopped'));
  const stopped = statuses.find((s) => s.state === 'stopped');
  assert.match(stopped.reason, /token|endereço/i);
  assert.equal(statuses.some((s) => s.state === 'reconnecting'), false);
});

test('líder que cai: o seguidor fica "reconnecting" (e mantém o último estado) até parar', async (t) => {
  const leader = await startLeader();
  const statuses = [];
  const client = createSyncClient({ onState: () => {}, onStatus: (s) => statuses.push(s.state), delays: [30, 60] });
  t.after(() => client.stop());
  client.start(parseSyncUrl(leader.url));
  await until(() => statuses.includes('connected'));
  await leader.server.close();
  await until(() => statuses.includes('reconnecting'));
  client.stop();
  assert.equal(statuses[statuses.length - 1], 'stopped');
});

test('porta sem ninguém: tenta de novo em vez de desistir', async (t) => {
  const statuses = [];
  const client = createSyncClient({ onState: () => {}, onStatus: (s) => statuses.push(s.state), delays: [20, 40] });
  t.after(() => client.stop());
  client.start({ host: '127.0.0.1', port: 1, token: 'abcdefgh12345678' });
  await until(() => statuses.filter((s) => s === 'reconnecting').length >= 2);
  assert.equal(statuses.includes('stopped'), false);
});

test('mensagem que não é JSON é ignorada sem derrubar a conexão', async (t) => {
  const leader = await startLeader();
  const states = [];
  const origError = console.error;
  console.error = () => {};
  const client = createSyncClient({ onState: (raw) => states.push(raw), onStatus: () => {} });
  t.after(async () => { console.error = origError; client.stop(); await leader.server.close(); });
  client.start(parseSyncUrl(leader.url));
  await until(() => states.length >= 1);
  client.handleData('isto não é json');
  client.handleData('{"layers":{}}');
  assert.equal(states.length, 2);
});

// ---------- Revisão: laço entre seguidores, leitor SSE e relógio ----------
test('quem já está seguindo outro computador não serve de líder (evita o laço A segue B, B segue A)', async (t) => {
  const store = createStore();
  const token = 'tok0123456789abcdef0123456789abcd';
  const server = createRemoteServer({
    token, staticDir: path.join(__dirname), getState: store.getState, dispatch: store.dispatch, subscribe: store.subscribe,
    getPlaylist: () => [], isFollowing: () => true,
  });
  const port = await server.listen(0, '127.0.0.1');
  const statuses = [];
  const states = [];
  const client = createSyncClient({ onState: (raw) => states.push(raw), onStatus: (s) => statuses.push(s) });
  t.after(async () => { client.stop(); await server.close(); });
  client.start(parseSyncUrl(`http://127.0.0.1:${port}/?t=${token}`));
  await until(() => statuses.some((s) => s.state === 'stopped'));
  assert.match(statuses.find((s) => s.state === 'stopped').reason, /também está seguindo/i);
  assert.equal(statuses.some((s) => s.state === 'reconnecting'), false);
  assert.equal(states.length, 0);
});

test('createSseParser: um byte por vez, sem fim, passa de 1 MB e recusa em tempo razoável', () => {
  const parser = createSseParser(() => {});
  const t0 = Date.now();
  assert.throws(() => { for (let i = 0; i < 1_100_000; i += 1) parser.feed('x'); }, /grande demais/i);
  assert.ok(Date.now() - t0 < 3000, `levou ${Date.now() - t0} ms`);
});

test('createSseParser: CRLF e \r\n partidos entre pedaços continuam valendo', () => {
  const got = [];
  const parser = createSseParser((d) => got.push(d));
  parser.feed('data: a\r');
  parser.feed('\n\r');
  parser.feed('\ndata: b\r\n\r\n');
  assert.deepEqual(got, ['a', 'b']);
});

test('diferença de relógio absurda do líder vira 0', () => {
  const offsets = [];
  const client = createSyncClient({ onState: (_s, off) => offsets.push(off), onStatus: () => {}, now: () => 1_000_000 });
  client.handleData(JSON.stringify({ serverTime: 1e300 }));
  client.handleData(JSON.stringify({ serverTime: 999_000 }));
  client.handleData(JSON.stringify({ serverTime: 1_000_000 - 20 * 3600 * 1000 }));
  assert.deepEqual(offsets, [0, 1000, 0]);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createRemoteServer } = require('../src/core/remoteServer');
const { initialState, reduce } = require('../src/core/state');

function setup(goToCalls = []) {
  let state = initialState();
  const listeners = new Set();
  const server = createRemoteServer({
    goTo: (target) => { goToCalls.push(target); return target.itemId !== 'inexistente'; },
    token: 'segredo',
    staticDir: __dirname,
    getState: () => state,
    dispatch: (a) => { state = reduce(state, a); listeners.forEach((l) => l(state)); },
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
    getPlaylist: () => [{ id: '1', title: 'Hino', slides: [{ label: 'V', text: 'x' }] }],
  });
  return server;
}

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, host: '127.0.0.1', method, path, headers: { 'content-type': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

test('o estado enviado ao remoto leva o horário do servidor (cronômetro em aparelhos com relógio diferente)', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    const before = Date.now();
    const body = JSON.parse((await request(port, 'GET', '/api/state?t=segredo')).body);
    assert.ok(body.serverTime >= before && body.serverTime <= Date.now());
    assert.ok(body.timer, 'cronômetro no estado');
  } finally { await s.close(); }
});

test('rejeita requisições sem token', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    assert.equal((await request(port, 'GET', '/api/state')).status, 401);
    assert.equal((await request(port, 'GET', '/api/state?t=errado')).status, 401);
  } finally { await s.close(); }
});

test('GET /api/state com token devolve o estado', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    const r = await request(port, 'GET', '/api/state?t=segredo');
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(r.body).blackout, false);
  } finally { await s.close(); }
});

test('POST /api/action aplica ação válida', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    const r = await request(port, 'POST', '/api/action?t=segredo', { type: 'blackout' });
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(r.body).blackout, true);
  } finally { await s.close(); }
});

test('goTo: o celular só indica item e slide; o computador monta o slide (showSlide direto é recusado)', async () => {
  const calls = [];
  const s = setup(calls);
  const port = await s.listen(0);
  try {
    assert.equal((await request(port, 'POST', '/api/action?t=segredo', { type: 'goTo', itemId: 'p1', index: 2 })).status, 200);
    assert.deepEqual(calls, [{ itemId: 'p1', index: 2 }]);
    assert.equal((await request(port, 'POST', '/api/action?t=segredo', { type: 'goTo', itemId: 'inexistente', index: 0 })).status, 404);
    for (const bad of [{ type: 'goTo', itemId: 5, index: 0 }, { type: 'goTo', itemId: 'p1', index: -1 }, { type: 'goTo', itemId: 'x'.repeat(200), index: 0 }]) {
      assert.equal((await request(port, 'POST', '/api/action?t=segredo', bad)).status, 400, JSON.stringify(bad));
    }
    const direct = { type: 'showSlide', slide: { text: 'texto qualquer' } };
    assert.equal((await request(port, 'POST', '/api/action?t=segredo', direct)).status, 403);
  } finally { await s.close(); }
});

test('remoto completo: ocultar letra, cronômetro e controle do vídeo', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    for (const action of [{ type: 'toggleLayer', layer: 'content' }, { type: 'timerToggle' }, { type: 'timerReset' }, { type: 'mediaControl', command: 'pause' }]) {
      assert.equal((await request(port, 'POST', '/api/action?t=segredo', action)).status, 200, action.type);
    }
    assert.equal((await request(port, 'POST', '/api/action?t=segredo', { type: 'toggleLayer', layer: 'background' })).status, 403, 'fundo continua só no operador');
  } finally { await s.close(); }
});

test('POST /api/action rejeita ação inválida e JSON quebrado', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    assert.equal((await request(port, 'POST', '/api/action?t=segredo', { type: 'hack' })).status, 400);
    assert.equal((await request(port, 'POST', '/api/action?t=segredo', '{ruim')).status, 400);
  } finally { await s.close(); }
});

test('POST com corpo gigante é recusado', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    const r = await request(port, 'POST', '/api/action?t=segredo', JSON.stringify({ type: 'clear', pad: 'x'.repeat(300000) }));
    assert.equal(r.status, 413);
  } finally { await s.close(); }
});

test('GET /api/playlist devolve a playlist', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    const r = await request(port, 'GET', '/api/playlist?t=segredo');
    assert.equal(JSON.parse(r.body)[0].title, 'Hino');
  } finally { await s.close(); }
});

test('não permite sair do diretório estático (path traversal)', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    const r = await request(port, 'GET', '/..%2f..%2fpackage.json?t=segredo');
    assert.notEqual(r.status, 200);
  } finally { await s.close(); }
});

test('GET / serve arquivo estático com token, 404 para inexistente', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    assert.equal((await request(port, 'GET', '/remoteServer.test.js')).status, 200);
    assert.equal((await request(port, 'GET', '/nao-existe.js')).status, 404);
  } finally { await s.close(); }
});

test('/api/events envia o estado inicial e as mudanças (SSE)', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    const frames = await new Promise((resolve, reject) => {
      const seen = [];
      const req = http.get({ port, host: '127.0.0.1', path: '/api/events?t=segredo' }, (res) => {
        res.on('data', (chunk) => {
          seen.push(chunk.toString());
          if (seen.length === 1) request(port, 'POST', '/api/action?t=segredo', { type: 'blackout' });
          if (seen.length === 2) { req.destroy(); resolve(seen); }
        });
      });
      req.on('error', (e) => (seen.length >= 2 ? resolve(seen) : reject(e)));
    });
    assert.match(frames[0], /"blackout":false/);
    assert.match(frames[1], /"blackout":true/);
  } finally { await s.close(); }
});

test('rota de API desconhecida devolve 404', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    assert.equal((await request(port, 'GET', '/api/xyz?t=segredo')).status, 404);
  } finally { await s.close(); }
});

function raw(port, requestLine) {
  const net = require('node:net');
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1', () => sock.write(`${requestLine}\r\nHost: x\r\nConnection: close\r\n\r\n`));
    let data = '';
    sock.on('data', (c) => (data += c));
    sock.on('close', () => resolve(data));
    sock.on('error', () => resolve(data));
  });
}

test('URL malformada não derruba o servidor (400) e ele segue respondendo', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    assert.match(await raw(port, 'GET /%E0%A4%A HTTP/1.1'), /^HTTP\/1.1 400/);
    assert.match(await raw(port, 'GET /a%00b HTTP/1.1'), /^HTTP\/1.1 400/);
    assert.equal((await request(port, 'GET', '/api/state?t=segredo')).status, 200);
  } finally { await s.close(); }
});

test('remoto só aceita ações da whitelist (setBackground é recusado)', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    const bg = { type: 'setBackground', background: { kind: 'color', value: '#112233' } };
    assert.equal((await request(port, 'POST', '/api/action?t=segredo', bg)).status, 403);
    const style = { type: 'setTextStyle', style: { size: 150 } };
    assert.equal((await request(port, 'POST', '/api/action?t=segredo', style)).status, 403);
    assert.equal((await request(port, 'POST', '/api/action?t=segredo', { type: 'timerVisible' })).status, 403);
    const media = { type: 'showMedia', media: { kind: 'video', value: 'file:///C:/v.mp4' } };
    assert.equal((await request(port, 'POST', '/api/action?t=segredo', media)).status, 403);
    assert.equal((await request(port, 'POST', '/api/action?t=segredo', { type: 'setAnnouncement', text: 'x'.repeat(500) })).status, 400);
    assert.equal((await request(port, 'POST', '/api/action?t=segredo', { type: 'setAnnouncement', text: 'Oi' })).status, 200);
  } finally { await s.close(); }
});

test('muitas tentativas com token errado levam a 429', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    let last = 0;
    for (let i = 0; i < 12; i += 1) last = (await request(port, 'GET', '/api/state?t=x')).status;
    assert.equal(last, 429);
    assert.equal((await request(port, 'GET', '/api/state?t=segredo')).status, 429);
  } finally { await s.close(); }
});

test('remoto aceita setStageMessage curta e recusa a longa', async () => {
  const s = setup();
  const port = await s.listen(0);
  try {
    assert.equal((await request(port, 'POST', '/api/action?t=segredo', { type: 'setStageMessage', text: 'Bis' })).status, 200);
    assert.equal((await request(port, 'POST', '/api/action?t=segredo', { type: 'setStageMessage', text: 'x'.repeat(500) })).status, 400);
  } finally { await s.close(); }
});

test('serve o ícone do controle remoto como image/png', async () => {
  const path = require('node:path');
  const server = createRemoteServer({
    goTo: () => false,
    token: 'segredo',
    staticDir: path.join(__dirname, '..', 'src', 'remote'),
    getState: () => initialState(),
    dispatch: () => {},
    subscribe: () => () => {},
    getPlaylist: () => [],
  });
  const port = await server.listen(0);
  try {
    const res = await new Promise((resolve, reject) => {
      http.get({ port, host: '127.0.0.1', path: '/icon.png' }, (r) => { r.resume(); r.on('end', () => resolve(r)); }).on('error', reject);
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/png');
  } finally {
    await server.close();
  }
});

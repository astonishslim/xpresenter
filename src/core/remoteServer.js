const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { timingSafeEqual } = require('node:crypto');
const { isValidAction } = require('./state');

const MAX_BODY_BYTES = 64 * 1024;
const MAX_SSE_CLIENTS = 20;
const MAX_ANNOUNCEMENT_CHARS = 200;
const MAX_FAILURES = 10;
const BLOCK_MS = 60 * 1000;
const HEARTBEAT_MS = 25 * 1000;
// O celular só controla a projeção; fundo e outros ajustes ficam no operador.
const REMOTE_ACTIONS = new Set(['showSlide', 'clear', 'blackout', 'toggleCover', 'setAnnouncement', 'setStageMessage']);
const TEXT_ACTIONS = new Set(['setAnnouncement', 'setStageMessage']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooBig = false;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (tooBig) return;
      if (size > MAX_BODY_BYTES) {
        tooBig = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooBig) reject(Object.assign(new Error('corpo grande demais'), { status: 413 }));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function serveStatic(staticDir, pathname, res) {
  let rel;
  try {
    rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  } catch {
    return send(res, 400, { error: 'caminho inválido' });
  }
  if (rel.includes('\0')) return send(res, 400, { error: 'caminho inválido' });

  const file = path.resolve(staticDir, `.${rel}`);
  if (!file.startsWith(path.resolve(staticDir) + path.sep)) return send(res, 403, { error: 'proibido' });
  return fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'não encontrado' });
    return send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

function tokenMatches(given, token) {
  const a = Buffer.from(given || '');
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function createRemoteServer({ token, staticDir, getState, dispatch, subscribe, getPlaylist }) {
  const clients = new Set();
  const failures = new Map(); // ip -> { count, blockedUntil }
  let heartbeat = null;

  const isBlocked = (ip) => (failures.get(ip)?.blockedUntil || 0) > Date.now();
  const registerFailure = (ip) => {
    const entry = failures.get(ip) || { count: 0, blockedUntil: 0 };
    const count = entry.blockedUntil && entry.blockedUntil <= Date.now() ? 1 : entry.count + 1;
    failures.set(ip, { count, blockedUntil: count >= MAX_FAILURES ? Date.now() + BLOCK_MS : 0 });
  };

  const handleAction = async (req, res) => {
    let action;
    try {
      action = JSON.parse(await readBody(req));
    } catch (err) {
      return send(res, err.status || 400, { error: err.status ? err.message : 'JSON inválido' });
    }
    if (!isValidAction(action)) return send(res, 400, { error: 'ação inválida' });
    if (!REMOTE_ACTIONS.has(action.type)) return send(res, 403, { error: 'ação não permitida no remoto' });
    if (TEXT_ACTIONS.has(action.type)
      && (typeof action.text !== 'string' || action.text.length > MAX_ANNOUNCEMENT_CHARS)) {
      return send(res, 400, { error: 'aviso inválido' });
    }
    dispatch(action);
    return send(res, 200, getState());
  };

  const handleEvents = (req, res) => {
    if (clients.size >= MAX_SSE_CLIENTS) return send(res, 503, { error: 'clientes demais' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(getState())}\n\n`);
    clients.add(res);
    res.on('error', () => clients.delete(res));
    req.on('close', () => clients.delete(res));
    return undefined;
  };

  const handleApi = async (req, res, pathname) => {
    if (req.method === 'GET' && pathname === '/api/state') return send(res, 200, getState());
    if (req.method === 'GET' && pathname === '/api/playlist') return send(res, 200, getPlaylist());
    if (req.method === 'GET' && pathname === '/api/events') return handleEvents(req, res);
    if (req.method === 'POST' && pathname === '/api/action') return handleAction(req, res);
    return send(res, 404, { error: 'não encontrado' });
  };

  const route = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const isApi = url.pathname.startsWith('/api/');
    const needsToken = isApi || url.pathname === '/' || url.pathname === '/index.html';
    const ip = req.socket.remoteAddress;

    if (needsToken) {
      if (isBlocked(ip)) return send(res, 429, { error: 'muitas tentativas' });
      if (!tokenMatches(url.searchParams.get('t'), token)) {
        registerFailure(ip);
        return send(res, 401, { error: 'token inválido' });
      }
    }
    return isApi ? handleApi(req, res, url.pathname) : serveStatic(staticDir, url.pathname, res);
  };

  const server = http.createServer((req, res) => {
    route(req, res).catch((err) => {
      console.error(`[remote] erro em ${req.method} ${String(req.url).slice(0, 80)}: ${err.message}`);
      if (!res.headersSent) send(res, 500, { error: 'erro interno' });
      else res.end();
    });
  });
  server.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  const unsubscribe = subscribe((state) => {
    const frame = `data: ${JSON.stringify(state)}\n\n`;
    clients.forEach((c) => c.write(frame));
  });

  return {
    listen: (port, host = '127.0.0.1') => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        heartbeat = setInterval(() => clients.forEach((c) => c.write(': ping\n\n')), HEARTBEAT_MS);
        heartbeat.unref();
        resolve(server.address().port);
      });
    }),
    close: () => new Promise((resolve) => {
      unsubscribe();
      clearInterval(heartbeat);
      clients.forEach((c) => c.end());
      server.close(() => resolve());
      server.closeAllConnections();
    }),
  };
}

module.exports = { createRemoteServer };

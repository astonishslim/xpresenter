const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { initialState, reduce, isValidAction, isValidBackground, isLocalFileUrl } = require('../src/core/state');
const { missingFileOf } = require('../src/core/fileCheck');
const { isMediaPermissionAllowed } = require('../src/core/permissions');

const cam = { kind: 'camera', value: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' };

test('câmera como fundo: aceita o id do dispositivo (letras, números, + / = . _ -); recusa o resto', () => {
  const ok = (value) => isValidAction({ type: 'setBackground', background: { kind: 'camera', value } });
  assert.equal(ok(cam.value), true);
  assert.equal(ok('default'), true);
  assert.equal(ok('Ab+/=._-9'), true);
  assert.equal(ok(''), false);
  assert.equal(ok('a'.repeat(201)), false);
  assert.equal(ok('a b'), false);
  assert.equal(ok('a"b'), false);
  assert.equal(ok("a')b"), false);
  assert.equal(ok('file:///C:/a'), false);
  assert.equal(ok('a\\b'), false);
  assert.equal(ok(42), false);
  assert.equal(ok(null), false);
});

test('câmera em tela cheia (showMedia) usa a mesma regra e guarda o título', () => {
  const show = (media) => isValidAction({ type: 'showMedia', media });
  assert.equal(show({ ...cam, title: 'Câmera do fundo' }), true);
  assert.equal(show({ kind: 'camera', value: 'x y' }), false);
  const s = reduce(initialState(), { type: 'showMedia', media: { ...cam, title: 'Câmera do fundo' } });
  assert.equal(s.layers.media.kind, 'camera');
  assert.equal(s.layers.media.value, cam.value);
  assert.equal(s.layers.media.title, 'Câmera do fundo');
});

test('fundo de câmera entra no estado e mantém ocultar/escurecer ao trocar', () => {
  let s = reduce(initialState(), { type: 'setBackgroundDim', value: 30 });
  s = reduce(s, { type: 'setBackground', background: cam });
  assert.deepEqual([s.layers.background.kind, s.layers.background.value, s.layers.background.dim], ['camera', cam.value, 30]);
});

test('slide e prop continuam só imagem local (câmera não vale como imagem)', () => {
  assert.equal(isValidAction({ type: 'showSlide', slide: { text: 'a', image: cam.value } }), false);
  assert.equal(isValidBackground({ kind: 'image', value: cam.value }), false);
});

test('isLocalFileUrl: só file: sem host e sem caminho de rede', () => {
  assert.equal(isLocalFileUrl('file:///C:/musicas/a.mp3'), true);
  assert.equal(isLocalFileUrl('file://atacante/share/a.mp3'), false);
  assert.equal(isLocalFileUrl('file:////atacante/share/a.mp3'), false);
  assert.equal(isLocalFileUrl('http://x/a.mp3'), false);
  assert.equal(isLocalFileUrl('file:///C:/a".mp3'), false);
  assert.equal(isLocalFileUrl(42), false);
});

test('missingFileOf não confunde id de câmera com arquivo', () => {
  assert.equal(missingFileOf({ type: 'setBackground', background: cam }), null);
  assert.equal(missingFileOf({ type: 'showMedia', media: cam }), null);
});

// ---------- Permissão de mídia (só vídeo, só as janelas do app) ----------
const appDir = path.join(os.tmpdir(), 'xp-app', 'src');
const inApp = `${pathToFileURL(path.join(appDir, 'renderer', 'operator', 'index.html')).href}?x=1`;
const request = (extra) => isMediaPermissionAllowed({ kind: 'request', permission: 'media', url: inApp, mediaTypes: ['video'], appDir, ...extra });
const check = (extra) => isMediaPermissionAllowed({ kind: 'check', permission: 'media', url: inApp, mediaType: 'video', appDir, ...extra });

test('pedido de câmera: só vídeo, só de página do app', () => {
  assert.equal(request(), true);
  assert.equal(request({ mediaTypes: ['audio'] }), false);
  assert.equal(request({ mediaTypes: ['video', 'audio'] }), false);
  assert.equal(request({ mediaTypes: [] }), false);
  assert.equal(request({ mediaTypes: undefined }), false);
  assert.equal(request({ permission: 'geolocation' }), false);
  assert.equal(request({ permission: 'notifications' }), false);
  assert.equal(request({ permission: 'clipboard-read' }), false);
});

test('pedido de câmera de fora do app (site, outro arquivo, pasta de nome parecido) é negado', () => {
  assert.equal(request({ url: 'https://exemplo.com/x.html' }), false);
  assert.equal(request({ url: 'http://192.168.0.5:5151/stage.html' }), false);
  assert.equal(request({ url: 'about:blank' }), false);
  assert.equal(request({ url: '' }), false);
  assert.equal(request({ url: undefined }), false);
  assert.equal(request({ url: pathToFileURL(path.join(os.tmpdir(), 'outro', 'evil.html')).href }), false);
  assert.equal(request({ url: pathToFileURL(path.join(`${appDir}-evil`, 'x.html')).href }), false);
});

test('consulta de permissão: vídeo (ou tipo desconhecido, usado para listar dispositivos); nunca áudio', () => {
  assert.equal(check(), true);
  assert.equal(check({ mediaType: 'unknown' }), true);
  assert.equal(check({ mediaType: 'audio' }), false);
  assert.equal(check({ mediaType: undefined }), false);
  assert.equal(check({ permission: 'geolocation' }), false);
  assert.equal(check({ url: 'https://exemplo.com/' }), false);
});

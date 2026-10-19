// Permissões do navegador embutido: só a câmera (vídeo, nunca microfone) e só para as janelas do próprio app.
// Qualquer outro pedido (notificações, localização, área de transferência…) é negado.
const { pathToFileURL } = require('node:url');

// A página é do app se a URL é um arquivo dentro da pasta src (o "/" final evita pasta de nome parecido).
function isAppPage(url, appDir) {
  if (typeof url !== 'string' || !url) return false;
  return url.startsWith(`${pathToFileURL(appDir).href}/`);
}

// kind 'request': getUserMedia pedindo a câmera (mediaTypes tem de ser exatamente ['video']).
// kind 'check': consulta do navegador (ex.: listar dispositivos); aceita 'video' e 'unknown', nunca 'audio'.
function isMediaPermissionAllowed({ kind, permission, url, mediaTypes, mediaType, appDir }) {
  if (permission !== 'media' || !isAppPage(url, appDir)) return false;
  if (kind === 'request') return Array.isArray(mediaTypes) && mediaTypes.length === 1 && mediaTypes[0] === 'video';
  if (kind === 'check') return mediaType === 'video' || mediaType === 'unknown';
  return false;
}

module.exports = { isMediaPermissionAllowed, isAppPage };

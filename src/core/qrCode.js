// QR code dos endereços do controle remoto: a matriz de módulos (linhas de '0' e '1'); quem desenha é a tela.
const qrcode = require('qrcode-generator');

const MAX_TEXT_CHARS = 1000;
const TYPE_AUTO = 0;
const ERROR_LEVEL = 'M';

// Devolve as linhas da matriz ('1' = módulo escuro) ou null se o texto não serve.
function qrRows(text) {
  if (typeof text !== 'string' || !text || text.length > MAX_TEXT_CHARS) return null;
  const qr = qrcode(TYPE_AUTO, ERROR_LEVEL);
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_c, col) => (qr.isDark(row, col) ? '1' : '0')).join(''));
}

module.exports = { qrRows };

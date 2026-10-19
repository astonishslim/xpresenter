// Ação que põe no ar um arquivo local que não existe mais (movido, apagado, pendrive removido):
// melhor avisar o operador do que projetar uma tela vazia.
const fs = require('node:fs');
const { fileURLToPath } = require('node:url');

function fileUrlOf(action) {
  if (!action) return null;
  if (action.type === 'showMedia') return action.media && action.media.value;
  if (action.type === 'showSlide') return action.slide && action.slide.image;
  if (action.type === 'setBackground') return action.background && action.background.kind !== 'color' ? action.background.value : null;
  return null;
}

function missingFileOf(action) {
  const url = fileUrlOf(action);
  if (typeof url !== 'string' || !url.startsWith('file:')) return null;
  try {
    return fs.existsSync(fileURLToPath(url)) ? null : url;
  } catch {
    return url;
  }
}

module.exports = { missingFileOf };

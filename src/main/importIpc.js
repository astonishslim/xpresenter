const { ipcMain, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { extractPptxSlides, LIMITS } = require('../core/pptxText');

const MAX_PDF_BYTES = 100 * 1024 * 1024;

// Importar apresentação: PDF vira páginas-imagem (renderizadas no operador com pdf.js e gravadas aqui);
// PPTX vira slides de texto. Páginas de importações que saíram do culto são apagadas.
const IMPORT_ID_IN_URL = /\/imports\/([0-9a-f-]{36})\//;

// Só no "remover do culto" (ação explícita do operador), nunca na abertura: se o library.json não carregar,
// o culto viria vazio e todas as páginas seriam apagadas. Páginas no ar também ficam.
function registerImportIpc({ imports, library, store, getWindow }) {
  const pruneUnused = () => {
    const inUse = new Set(library.getPlaylist().map((i) => i.importId).filter(Boolean));
    const live = store.getState().layers.content.slide;
    const liveId = live && typeof live.image === 'string' && live.image.match(IMPORT_ID_IN_URL);
    if (liveId) inUse.add(liveId[1]);
    imports.prune(inUse);
  };

  ipcMain.handle('import:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getWindow(), {
      title: 'Importar apresentação',
      filters: [{ name: 'PDF ou PowerPoint', extensions: ['pdf', 'pptx'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return { ok: false, reason: 'cancelado' };
    const file = filePaths[0];
    const name = path.basename(file, path.extname(file)).slice(0, 120);
    try {
      const size = fs.statSync(file).size;
      if (path.extname(file).toLowerCase() === '.pptx') {
        if (size > LIMITS.MAX_FILE_BYTES) return { ok: false, reason: 'Arquivo grande demais (máximo 200 MB).' };
        const slides = extractPptxSlides(fs.readFileSync(file));
        return { ok: true, kind: 'pptx', name, slides };
      }
      if (size > MAX_PDF_BYTES) return { ok: false, reason: 'PDF grande demais (máximo 100 MB).' };
      return { ok: true, kind: 'pdf', name, importId: imports.create(), bytes: fs.readFileSync(file) };
    } catch (err) {
      console.error(`[importar] ${file}: ${err.message}`);
      return { ok: false, reason: err.message };
    }
  });

  ipcMain.handle('import:savePage', (_e, { importId, index, bytes } = {}) => {
    try {
      return { ok: true, url: imports.savePage(importId, index, bytes) };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  });

  ipcMain.handle('import:discard', (_e, importId) => imports.remove(importId));

  return { pruneUnused, settle: (importId) => imports.settle(importId) };
}

module.exports = { registerImportIpc };

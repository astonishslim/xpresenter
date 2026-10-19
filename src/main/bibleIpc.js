const { ipcMain, dialog } = require('electron');
const fs = require('node:fs');
const { lookup, searchText } = require('../core/bible');
const { MAX_FILE_BYTES } = require('../core/bibleFormats');

const MAX_QUERY_CHARS = 200;
const EMPTY_SEARCH = { results: [], truncated: false };

const text = (value, max) => (typeof value === 'string' && value.length <= max ? value : null);

function registerBibleIpc({ bibles, getWindow }) {
  const importResult = (content, fileName) => {
    try {
      const meta = bibles.importText(content, fileName);
      return { ok: true, meta };
    } catch (err) {
      console.error(`[bíblia] importação falhou: ${err.message}`);
      return { ok: false, reason: err.message };
    }
  };

  ipcMain.handle('bible:versions', () => bibles.list());

  ipcMain.handle('bible:lookup', (_e, { version, reference } = {}) => {
    const bible = bibles.get(version);
    const ref = text(reference, MAX_QUERY_CHARS);
    return bible && ref ? lookup(bible, ref) : null;
  });

  ipcMain.handle('bible:search', (_e, { version, query } = {}) => {
    const bible = bibles.get(version);
    const q = text(query, MAX_QUERY_CHARS);
    return bible && q ? searchText(bible, q) : EMPTY_SEARCH;
  });

  // Escolher o arquivo numa janela do sistema (JSON ou Zefania XML).
  ipcMain.handle('bible:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getWindow(), {
      title: 'Importar versão da Bíblia',
      filters: [{ name: 'Bíblia (JSON ou Zefania XML)', extensions: ['json', 'xml'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return { ok: false, reason: 'cancelado' };
    try {
      if (fs.statSync(filePaths[0]).size > MAX_FILE_BYTES) return { ok: false, reason: 'Arquivo grande demais (máximo 20 MB).' };
      return importResult(fs.readFileSync(filePaths[0], 'utf8'), filePaths[0]);
    } catch (err) {
      return { ok: false, reason: `Não foi possível ler o arquivo (${err.message}).` };
    }
  });

  // Arquivo solto sobre a seção Bíblia: o conteúdo chega já lido pela interface.
  ipcMain.handle('bible:importText', (_e, { content, fileName } = {}) => {
    const body = text(content, MAX_FILE_BYTES);
    return body === null ? { ok: false, reason: 'Arquivo inválido ou grande demais (máximo 20 MB).' } : importResult(body, String(fileName || ''));
  });

  ipcMain.handle('bible:remove', (_e, code) => ({ ok: bibles.remove(code) }));
}

module.exports = { registerBibleIpc };

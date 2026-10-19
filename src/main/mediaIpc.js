const { ipcMain, dialog } = require('electron');
const { KINDS } = require('../core/mediaLibrary');

const MAX_DROPPED = 50;
const EXTENSIONS = Object.values(KINDS).flat().map((e) => e.slice(1));

function registerMediaIpc({ media, getWindow }) {
  ipcMain.handle('media:list', () => media.list());

  ipcMain.handle('media:add', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getWindow(), {
      title: 'Adicionar imagens e vídeos',
      filters: [{ name: 'Imagens e vídeos', extensions: EXTENSIONS }],
      properties: ['openFile', 'multiSelections'],
    });
    return canceled ? { added: [], skipped: 0 } : media.addPaths(filePaths);
  });

  // Arquivos soltos sobre a seção Mídia: caminhos obtidos no preload (webUtils), validados aqui de novo.
  ipcMain.handle('media:addPaths', (_e, paths) => (
    Array.isArray(paths) ? media.addPaths(paths.slice(0, MAX_DROPPED)) : { added: [], skipped: 0 }));

  ipcMain.handle('media:remove', (_e, id) => media.remove(typeof id === 'string' ? id : ''));
}

module.exports = { registerMediaIpc };

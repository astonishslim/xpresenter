const { ipcMain, dialog } = require('electron');
const { EXTENSIONS } = require('../core/audioLibrary');

const MAX_DROPPED = 50;

function registerAudioIpc({ audio, getWindow }) {
  ipcMain.handle('audio:list', () => audio.list());

  ipcMain.handle('audio:add', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getWindow(), {
      title: 'Adicionar músicas de fundo',
      filters: [{ name: 'Áudio', extensions: EXTENSIONS.map((e) => e.slice(1)) }],
      properties: ['openFile', 'multiSelections'],
    });
    return canceled ? { added: [], skipped: 0 } : audio.addPaths(filePaths);
  });

  // Arquivos soltos sobre a seção Áudio: caminhos obtidos no preload (webUtils), validados aqui de novo.
  ipcMain.handle('audio:addPaths', (_e, paths) => (
    Array.isArray(paths) ? audio.addPaths(paths.slice(0, MAX_DROPPED)) : { added: [], skipped: 0 }));

  ipcMain.handle('audio:move', (_e, { id, index } = {}) => audio.move(typeof id === 'string' ? id : '', index));
  ipcMain.handle('audio:remove', (_e, id) => audio.remove(typeof id === 'string' ? id : ''));
}

module.exports = { registerAudioIpc };

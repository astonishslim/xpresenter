const { ipcMain, dialog } = require('electron');
const { pathToFileURL } = require('node:url');
const { isValidAction } = require('../core/state');
const { parseSong, toSlides } = require('../core/songParser');
const { listDisplays } = require('./windows');
const { registerBibleIpc } = require('./bibleIpc');

const IMAGE_FILTERS = [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }];

function registerIpc({ store, library, outputs, stageMonitor, remoteInfo, bibles, getWindow }) {
  const slidesFor = ({ title, text }) => toSlides(parseSong(title, text));

  ipcMain.handle('state:get', () => store.getState());
  ipcMain.handle('state:dispatch', (_e, action) => {
    if (!isValidAction(action)) throw new Error('Ação inválida.');
    return store.dispatch(action);
  });

  ipcMain.handle('songs:list', () => library.listSongs());
  ipcMain.handle('songs:save', (_e, song) => {
    const saved = library.saveSong(song);
    library.refreshSongSlides(saved.id, saved.title, slidesFor(saved));
    return saved;
  });
  ipcMain.handle('songs:remove', (_e, id) => library.deleteSong(id));
  ipcMain.handle('songs:slides', (_e, song) => slidesFor(song));

  ipcMain.handle('playlist:list', () => library.getPlaylist());
  ipcMain.handle('playlist:add', (_e, item) => library.addToPlaylist(item));
  ipcMain.handle('playlist:remove', (_e, id) => library.removeFromPlaylist(id));
  ipcMain.handle('playlist:move', (_e, { id, index }) => library.movePlaylistItem(id, index));

  registerBibleIpc({ bibles, getWindow });

  ipcMain.handle('outputs:toggle', () => outputs.toggle());
  ipcMain.handle('outputs:isOpen', () => outputs.isOpen());
  ipcMain.handle('remote:info', () => remoteInfo());
  ipcMain.handle('displays:list', () => listDisplays());
  ipcMain.handle('stage:toggle', (_e, displayId) => stageMonitor.toggle(Number.isInteger(displayId) ? displayId : undefined));
  ipcMain.handle('stage:isOpen', () => stageMonitor.isOpen());

  ipcMain.handle('background:pickImage', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getWindow(), {
      title: 'Escolher imagem de fundo',
      filters: IMAGE_FILTERS,
      properties: ['openFile'],
    });
    return canceled || !filePaths[0] ? null : pathToFileURL(filePaths[0]).href;
  });
}

module.exports = { registerIpc };

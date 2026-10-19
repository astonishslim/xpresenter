const { ipcMain, dialog } = require('electron');
const { pathToFileURL } = require('node:url');
const { isValidAction } = require('../core/state');
const { parseSong, toSlides } = require('../core/songParser');
const { listDisplays } = require('./windows');
const { registerBibleIpc } = require('./bibleIpc');

const { registerThemeIpc } = require('./themeIpc');

const BACKGROUND_PICKERS = {
  image: { title: 'Escolher imagem de fundo', filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] },
  video: { title: 'Escolher vídeo de fundo', filters: [{ name: 'Vídeos', extensions: ['mp4', 'webm', 'm4v', 'ogv'] }] },
};

function registerIpc({ store, library, outputs, stageMonitor, remoteInfo, bibles, themes, getWindow }) {
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
  registerThemeIpc({ store, themes });

  ipcMain.handle('outputs:toggle', () => outputs.toggle());
  ipcMain.handle('outputs:isOpen', () => outputs.isOpen());
  ipcMain.handle('remote:info', () => remoteInfo());
  ipcMain.handle('displays:list', () => listDisplays());
  ipcMain.handle('stage:toggle', (_e, displayId) => stageMonitor.toggle(Number.isInteger(displayId) ? displayId : undefined));
  ipcMain.handle('stage:isOpen', () => stageMonitor.isOpen());

  const pickBackground = async ({ title, filters }) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getWindow(), { title, filters, properties: ['openFile'] });
    return canceled || !filePaths[0] ? null : pathToFileURL(filePaths[0]).href;
  };
  ipcMain.handle('background:pickImage', () => pickBackground(BACKGROUND_PICKERS.image));
  ipcMain.handle('background:pickVideo', () => pickBackground(BACKGROUND_PICKERS.video));
}

module.exports = { registerIpc };

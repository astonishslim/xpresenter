const { ipcMain, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isValidAction } = require('../core/state');
const { parseSong, toSlides } = require('../core/songParser');
const { lookup } = require('../core/bible');
const { listDisplays } = require('./windows');

const MAX_BIBLE_BYTES = 20 * 1024 * 1024;
const IMAGE_FILTERS = [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }];

function isBible(data) {
  const isChapter = (c) => Array.isArray(c) && c.every((v) => typeof v === 'string');
  return Boolean(data) && typeof data.name === 'string' && Array.isArray(data.books)
    && data.books.every((b) => b && typeof b.name === 'string' && typeof b.abbrev === 'string'
      && Array.isArray(b.chapters) && b.chapters.every(isChapter));
}

function loadBible(userFile, sampleFile) {
  for (const file of [userFile, sampleFile]) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (isBible(data)) return data;
    } catch (err) {
      if (err.code !== 'ENOENT') console.error(`[bible] falha ao ler ${file}: ${err.message}`);
    }
  }
  return { name: 'vazia', books: [] };
}

function registerIpc({ store, library, outputs, stageMonitor, remoteInfo, userDataDir, sampleBible, getWindow }) {
  const userBibleFile = path.join(userDataDir, 'bible.json');
  let bible = loadBible(userBibleFile, sampleBible);

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

  ipcMain.handle('bible:lookup', (_e, reference) => lookup(bible, reference));
  ipcMain.handle('bible:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getWindow(), {
      title: 'Importar Bíblia (JSON)',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return { ok: false, reason: 'cancelado' };
    try {
      if (fs.statSync(filePaths[0]).size > MAX_BIBLE_BYTES) return { ok: false, reason: 'arquivo grande demais' };
      const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
      if (!isBible(data)) return { ok: false, reason: 'formato inválido: esperado { name, books: [{ name, abbrev, chapters: [[versos]] }] }' };
      fs.writeFileSync(`${userBibleFile}.tmp`, JSON.stringify(data));
      fs.renameSync(`${userBibleFile}.tmp`, userBibleFile);
      bible = data;
      return { ok: true, name: data.name };
    } catch (err) {
      console.error(`[bible] importação falhou: ${err.message}`);
      return { ok: false, reason: `não foi possível ler o arquivo (${err.message})` };
    }
  });

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

module.exports = { registerIpc, isBible };

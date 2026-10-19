const { ipcMain, dialog } = require('electron');
const { pathToFileURL } = require('node:url');
const { isValidAction, stampAction } = require('../core/state');
const { missingFileOf } = require('../core/fileCheck');
const { slidesForSong } = require('../core/songParser');
const { replaceSlideText } = require('../core/songEdit');
const { listDisplays } = require('./windows');
const { registerBibleIpc } = require('./bibleIpc');

const { registerThemeIpc } = require('./themeIpc');
const { registerMediaIpc } = require('./mediaIpc');
const { registerImportIpc } = require('./importIpc');
const { searchSongs } = require('../core/songSearch');
const { createLyricsClient } = require('../core/lyricsOnline');

const MAX_LYRICS_FIELD_CHARS = 200;
const lyricsClient = createLyricsClient();

const BACKGROUND_PICKERS = {
  image: { title: 'Escolher imagem de fundo', filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] },
  video: { title: 'Escolher vídeo de fundo', filters: [{ name: 'Vídeos', extensions: ['mp4', 'webm', 'm4v', 'ogv'] }] },
};

function registerIpc({ store, library, outputs, outputSettings, stageMonitor, remoteInfo, bibles, themes, media, imports, getWindow }) {
  const isRecord = (v) => Boolean(v) && typeof v === 'object';
  const songById = (id) => library.listSongs().find((s) => s.id === id);
  // Depois de salvar a música, os itens dela no culto seguem cada um no seu arranjo.
  const saveSongAndRefresh = (input) => {
    const saved = library.saveSong(input);
    const names = (saved.arrangements || []).map((a) => a.name);
    library.refreshSongSlides(saved.id, saved.title, (item) => slidesForSong(saved, item.arrangement), names);
    return saved;
  };

  ipcMain.handle('state:get', () => store.getState());
  // Desfazer/refazer o que foi ao ar (slide, camadas, fundo, estilo).
  ipcMain.handle('state:undo', () => store.undo());
  ipcMain.handle('state:redo', () => store.redo());
  ipcMain.handle('state:dispatch', (_e, action) => {
    if (!isValidAction(action)) throw new Error('Ação inválida.');
    const missing = missingFileOf(action);
    if (missing) throw new Error(`Arquivo não encontrado: ${decodeURIComponent(missing.replace(/^file:\/\/\//, ''))}`);
    return store.dispatch(stampAction(action, Date.now()));
  });

  ipcMain.handle('songs:list', () => library.listSongs());
  ipcMain.handle('songs:save', (_e, song) => saveSongAndRefresh(isRecord(song) ? song : {}));
  ipcMain.handle('songs:remove', (_e, id) => library.deleteSong(id));
  ipcMain.handle('songs:slides', (_e, song, arrangement) => (
    isRecord(song) ? slidesForSong(song, typeof arrangement === 'string' ? arrangement : '') : []));
  // Edição rápida de um slide de música: corrige o trecho na letra (vale para todas as repetições).
  ipcMain.handle('songs:editSlide', (_e, { songId, label, oldText, newText } = {}) => {
    const song = songById(songId);
    if (!song) throw new Error('Música não encontrada.');
    const valid = typeof oldText === 'string' && typeof newText === 'string' && (label == null || typeof label === 'string');
    const text = valid ? replaceSlideText(song.text, oldText, newText, { label }) : null;
    if (text === null) throw new Error('Não achei esse trecho na letra. Use o editor da música.');
    return saveSongAndRefresh({ ...song, text });
  });
  ipcMain.handle('songs:search', (_e, query) => searchSongs(library.listSongs(), query));

  // Busca na internet (LRCLIB). O resultado só vira música depois que o operador revisa e salva no editor.
  ipcMain.handle('lyrics:search', (_e, { title, artist } = {}) => {
    const fit = (v) => (typeof v === 'string' ? v.slice(0, MAX_LYRICS_FIELD_CHARS) : '');
    return lyricsClient.search({ title: fit(title), artist: fit(artist) });
  });

  ipcMain.handle('playlist:list', () => library.getPlaylist());
  ipcMain.handle('playlist:add', (_e, item) => {
    const entry = library.addToPlaylist(item);
    if (entry.importId) settle(entry.importId); // a importação terminou: agora vale a regra do prune
    return entry;
  });
  ipcMain.handle('playlist:remove', (_e, id) => {
    library.removeFromPlaylist(id);
    pruneUnused(); // páginas de PDF que ninguém mais usa
  });
  ipcMain.handle('playlist:move', (_e, { id, index }) => library.movePlaylistItem(id, index));
  // Arranjo de uma música no culto ('' = ordem da letra). Só vale arranjo que existe na música.
  ipcMain.handle('playlist:setArrangement', (_e, { id, arrangement } = {}) => {
    const item = library.getPlaylist().find((i) => i.id === id);
    const song = item && item.kind === 'song' ? songById(item.refId) : null;
    if (!song) throw new Error('Música do culto não encontrada.');
    const name = typeof arrangement === 'string' ? arrangement : '';
    if (name && !(song.arrangements || []).some((a) => a.name === name)) throw new Error('Arranjo não encontrado.');
    return library.setItemArrangement(id, name, slidesForSong(song, name));
  });
  // Edição rápida de um slide de texto do culto que não é música (versículo, PowerPoint).
  ipcMain.handle('playlist:editSlide', (_e, { id, index, text } = {}) => {
    const item = library.editPlaylistSlide(id, index, typeof text === 'string' ? text.trim() : text);
    if (!item) throw new Error('Não foi possível editar este slide.');
    return item;
  });

  registerBibleIpc({ bibles, getWindow });
  registerThemeIpc({ store, themes });
  registerMediaIpc({ media, getWindow });
  const { pruneUnused, settle } = registerImportIpc({ imports, library, store, getWindow });

  ipcMain.handle('outputs:toggle', () => outputs.toggle());
  ipcMain.handle('outputs:isOpen', () => outputs.isOpen());
  ipcMain.handle('outputs:getConfig', () => ({ config: outputSettings.get(), displays: listDisplays() }));
  ipcMain.handle('outputs:setConfig', (_e, config) => {
    const saved = outputSettings.set(config);
    outputs.reopen();
    return saved;
  });
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

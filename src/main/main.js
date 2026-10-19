const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createStore } = require('../core/store');
const { createLibrary } = require('../core/library');
const { createRemoteServer } = require('../core/remoteServer');
const { createOperatorWindow, createOutputWindows, createStageWindow, getDisplays } = require('./windows');
const { sanitizeConfig, planOutputs } = require('../core/outputConfig');
const { createBibleLibrary } = require('../core/bibleLibrary');
const { createThemeLibrary, persistCurrentLook, themeActions } = require('../core/themeLibrary');
const { slideActionFor, themeNameFor, findItem } = require('../core/playlistNav');
const { createMediaLibrary } = require('../core/mediaLibrary');
const { createImportStore } = require('../core/importStore');
const { initialState } = require('../core/state');
const { registerIpc } = require('./ipc');
const { registerAutomationIpc } = require('./automationIpc');

const REMOTE_PORT = 5151;

// Projeção não pode economizar energia: o Chromium pausa vídeo sem som e atrasa relógios em janela
// "em segundo plano" (operador minimizado, saída encoberta). Precisa vir antes do app ficar pronto.
app.commandLine.appendSwitch('disable-background-media-suspend');
const BUILTIN_BIBLES = path.join(__dirname, '..', '..', 'data', 'bibles');

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    const hit = (list || []).find((i) => i.family === 'IPv4' && !i.internal);
    if (hit) return hit.address;
  }
  return '127.0.0.1';
}

// Configuração das saídas (perfis, panorâmico). Validada de novo a cada uso, porque os monitores mudam.
function createOutputSettings(file) {
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[saídas] não foi possível ler ${file}: ${err.message}`);
  }
  return {
    get: () => sanitizeConfig(raw, getDisplays()),
    set(next) {
      raw = sanitizeConfig(next, getDisplays());
      fs.writeFileSync(file, JSON.stringify(raw, null, 2));
      return raw;
    },
  };
}

function createOutputManager(store, settings) {
  let windows = [];
  const broadcast = (state) => BrowserWindow.getAllWindows().forEach((w) => !w.isDestroyed() && w.webContents.send('state:changed', state));
  store.subscribe(broadcast);

  const close = () => {
    windows.forEach((w) => !w.isDestroyed() && w.close());
    windows = [];
  };
  const open = () => {
    const displays = getDisplays();
    windows = createOutputWindows(planOutputs(settings.get(), displays));
    windows.forEach((w) => w.on('closed', () => { windows = windows.filter((x) => x !== w); }));
  };

  return {
    isOpen: () => windows.length > 0,
    toggle() {
      if (windows.length) {
        close();
        return false;
      }
      open();
      return true;
    },
    // Configuração mudou com a projeção aberta: reabre as janelas no novo arranjo.
    reopen() {
      if (!windows.length) return;
      close();
      open();
    },
  };
}

function createStageManager() {
  let win = null;
  return {
    isOpen: () => Boolean(win) && !win.isDestroyed(),
    toggle(displayId) {
      if (win && !win.isDestroyed()) {
        win.close();
        win = null;
        return false;
      }
      win = createStageWindow(displayId);
      win.on('closed', () => { win = null; });
      return true;
    },
  };
}

// Pedido do controle remoto: aplica o tema do item quando ele muda (como o operador faz) e põe o slide no ar.
function goToPlaylistSlide({ store, library, themes }, { itemId, index }) {
  const playlist = library.getPlaylist();
  const action = slideActionFor(playlist, itemId, index);
  if (!action) return false;
  const live = store.getState().layers.content.slide;
  const liveItem = live && typeof live.key === 'string' ? live.key.replace(/:\d+$/, '') : null;
  if (liveItem !== itemId) {
    const name = themeNameFor(findItem(playlist, itemId), library.listSongs(), themes.getDefaults(), themes.list().map((t) => t.name));
    const theme = name && themes.get(name);
    if (theme) themeActions(theme).forEach((a) => store.dispatch(a));
  }
  store.dispatch(action);
  return true;
}

// A versão anterior guardava uma única Bíblia importada em userData/bible.json: passa a ser mais uma versão.
function migrateLegacyBible(bibles, userDataDir) {
  const legacy = path.join(userDataDir, 'bible.json');
  if (!fs.existsSync(legacy)) return;
  try {
    bibles.importText(fs.readFileSync(legacy, 'utf8'), 'importada-antes.json');
    fs.renameSync(legacy, `${legacy}.migrada`);
  } catch (err) {
    console.error(`[bíblia] não foi possível migrar ${legacy}: ${err.message}`);
  }
}

async function start() {
  const userDataDir = app.getPath('userData');
  const themes = createThemeLibrary(path.join(userDataDir, 'themes.json'));
  const store = createStore(initialState(themes.getCurrent()));
  const flushLook = persistCurrentLook({ store, themes });
  const library = createLibrary(path.join(userDataDir, 'library.json'));
  const bibles = createBibleLibrary({ builtinDir: BUILTIN_BIBLES, userDir: path.join(userDataDir, 'bibles') });
  migrateLegacyBible(bibles, userDataDir);
  const outputSettings = createOutputSettings(path.join(userDataDir, 'outputs.json'));
  const outputs = createOutputManager(store, outputSettings);
  const stageMonitor = createStageManager();

  const token = randomBytes(16).toString('hex');
  const remote = createRemoteServer({
    token,
    staticDir: path.join(__dirname, '..', 'remote'),
    getState: store.getState,
    dispatch: store.dispatch,
    subscribe: store.subscribe,
    getPlaylist: library.getPlaylist,
    goTo: (target) => goToPlaylistSlide({ store, library, themes }, target),
  });

  let port = REMOTE_PORT;
  try {
    port = await remote.listen(REMOTE_PORT, '0.0.0.0');
  } catch (err) {
    console.error(`[remote] porta ${REMOTE_PORT} indisponível (${err.code}); usando porta aleatória.`);
    port = await remote.listen(0, '0.0.0.0');
  }

  let operator = null;
  registerIpc({
    store,
    library,
    outputs,
    stageMonitor,
    bibles,
    themes,
    media: createMediaLibrary(path.join(userDataDir, 'media.json')),
    imports: createImportStore(path.join(userDataDir, 'imports')),
    outputSettings,
    getWindow: () => operator,
    remoteInfo: () => {
      const base = `http://${lanAddress()}:${port}`;
      return { url: `${base}/?t=${token}`, stageUrl: `${base}/stage.html?t=${token}`, liveUrl: `${base}/live.html?t=${token}` };
    },
  });
  const automation = registerAutomationIpc({ store, file: path.join(userDataDir, 'automation.json'), getWindow: () => operator });
  operator = createOperatorWindow();
  operator.on('closed', () => app.quit());
  app.on('before-quit', () => { flushLook(); automation.stop(); remote.close(); });
}

app.whenReady().then(start).catch((err) => {
  console.error('[main] falha ao iniciar:', err);
  app.exit(1);
});
app.on('window-all-closed', () => app.quit());

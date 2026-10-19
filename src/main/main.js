const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createStore } = require('../core/store');
const { createLibrary } = require('../core/library');
const { createRemoteServer } = require('../core/remoteServer');
const { qrRows } = require('../core/qrCode');
const { createOperatorWindow, createOutputWindows, createStageWindow, getDisplays } = require('./windows');
const { sanitizeConfig, planOutputs } = require('../core/outputConfig');
const { createBibleLibrary } = require('../core/bibleLibrary');
const { createThemeLibrary, persistCurrentLook, themeActions } = require('../core/themeLibrary');
const { slideActionFor, themeNameFor, findItem } = require('../core/playlistNav');
const { missingFileOf } = require('../core/fileCheck');
const { createMediaLibrary } = require('../core/mediaLibrary');
const { createImportStore } = require('../core/importStore');
const { initialState, liveKeyOf, isValidAction } = require('../core/state');
const { registerIpc } = require('./ipc');
const { registerAutomationIpc } = require('./automationIpc');
const { registerMessageIpc } = require('./messageIpc');
const { registerPropIpc } = require('./propIpc');
const { registerAudioIpc } = require('./audioIpc');
const { registerSyncIpc } = require('./syncIpc');
const { createAudioLibrary } = require('../core/audioLibrary');
const { isMediaPermissionAllowed } = require('../core/permissions');
const { registerMacroIpc } = require('./macroIpc');
const { createPropLibrary } = require('../core/propLibrary');
const { createMacroLibrary, createMacroRunner } = require('../core/macros');
const { registerUsageIpc } = require('./usageIpc');
const { createUsageLog, createUsageTracker } = require('../core/usageLog');
const { createMessageLibrary, createMessageRunner } = require('../core/messages');
const { setupUpdater } = require('./updater');
const { resolveUserDataDir } = require('./userDataDir');

// Antes de qualquer coisa tocar em userData. Não usa app.getPath('userData'): ele já cria a pasta nova vazia.
app.setPath('userData', resolveUserDataDir(path.join(app.getPath('appData'), app.getName())));

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
    toggle(displayId, layout) {
      if (win && !win.isDestroyed()) {
        win.close();
        win = null;
        return false;
      }
      win = createStageWindow(displayId, layout);
      win.on('closed', () => { win = null; });
      return true;
    },
  };
}

// Pedido do controle remoto: aplica o tema do item quando ele muda (como o operador faz) e põe o slide no ar.
function goToPlaylistSlide({ store, library, themes }, { itemId, index }) {
  const playlist = library.getPlaylist();
  const action = slideActionFor(playlist, itemId, index); // já validada (o culto vem de library.json)
  if (!action) return false;
  const missing = missingFileOf(action);
  if (missing) {
    console.error(`[remoto] arquivo não encontrado: ${missing}`);
    return false;
  }
  const liveKey = liveKeyOf(store.getState());
  if (!liveKey || liveKey.replace(/:\d+$/, '') !== itemId) {
    const name = themeNameFor(findItem(playlist, itemId), library.listSongs(), themes.getDefaults(), themes.list().map((t) => t.name));
    const theme = name && themes.get(name);
    if (theme) themeActions(theme).filter(isValidAction).forEach((a) => store.dispatch(a));
  }
  store.dispatch(action);
  return true;
}

// Próximo/anterior pelo que está no ar (OSC): se veio do culto, navega aqui mesmo; senão o operador decide.
function stepLive(ctx, delta) {
  const key = liveKeyOf(ctx.store.getState());
  const match = key && key.match(/^(.*):(\d+)$/);
  if (!match || !findItem(ctx.library.getPlaylist(), match[1])) return false;
  goToPlaylistSlide(ctx, { itemId: match[1], index: Number(match[2]) + delta });
  return true;
}

// Música por trás do item ao vivo: da biblioteca ("lib-<id>") ou de um item do culto. Versículo e mídia não contam.
function songOfLiveItem({ library }, itemId) {
  const item = itemId.startsWith('lib-') ? null : findItem(library.getPlaylist(), itemId);
  const songId = itemId.startsWith('lib-') ? itemId.slice('lib-'.length) : (item && item.kind === 'song' ? item.refId : null);
  const song = songId && library.listSongs().find((s) => s.id === songId);
  return song ? { songId: song.id, title: song.title, author: song.author, ccli: song.ccli } : null;
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

// Só a câmera (vídeo, sem microfone) e só para as janelas do app; todo o resto é negado.
function restrictPermissions() {
  const appDir = path.join(__dirname, '..');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isMediaPermissionAllowed({ kind: 'request', permission, url: webContents.getURL(), mediaTypes: details.mediaTypes, appDir }));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) => isMediaPermissionAllowed({
    kind: 'check', permission, url: webContents ? webContents.getURL() : '', mediaType: details.mediaType, appDir,
  }));
}

async function start() {
  restrictPermissions();
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
    isFollowing: store.isLocked,
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
      const url = `${base}/?t=${token}`;
      const stageUrl = `${base}/stage.html?t=${token}`;
      return { url, stageUrl, liveUrl: `${base}/live.html?t=${token}`, qr: qrRows(url), stageQr: qrRows(stageUrl) };
    },
  });
  const messages = createMessageLibrary(path.join(userDataDir, 'messages.json'));
  const messageRunner = createMessageRunner({ dispatch: store.dispatch, getState: store.getState });
  registerMessageIpc({ messages, runner: messageRunner });

  // Props (logo, QR, faixa) e macros (um botão que faz várias coisas).
  const props = createPropLibrary(path.join(userDataDir, 'props.json'));
  registerPropIpc({ props });
  registerAudioIpc({ audio: createAudioLibrary(path.join(userDataDir, 'audio.json')), getWindow: () => operator });
  const macros = createMacroLibrary(path.join(userDataDir, 'macros.json'));
  const macroRunner = createMacroRunner({
    dispatch: store.dispatch,
    getState: store.getState,
    themeActions: (name) => {
      const theme = themes.get(name);
      return theme ? themeActions(theme) : null;
    },
    getProp: props.findByName,
    getMessage: messages.findByName,
    messages: messageRunner,
  });
  registerMacroIpc({ macros, runner: macroRunner });
  const sync = registerSyncIpc({ store, ownToken: token });

  const automation = registerAutomationIpc({
    store,
    file: path.join(userDataDir, 'automation.json'),
    getWindow: () => operator,
    step: (delta) => stepLive({ store, library, themes }, delta),
    // OSC /xpresenter/macro/N: o N-ésimo macro da lista.
    runMacro: (n) => {
      const macro = macros.list()[n - 1];
      if (macro) macroRunner.run(macro);
    },
  });
  // Relatório de uso (CCLI): cada música que entra ao vivo é gravada uma vez por dia.
  const usageLog = createUsageLog(path.join(userDataDir, 'usage.jsonl'));
  registerUsageIpc({ log: usageLog, getWindow: () => operator });
  const usageTracker = createUsageTracker({ log: usageLog, resolveSong: (itemId) => songOfLiveItem({ library }, itemId) });
  store.subscribe(usageTracker.observe);
  setupUpdater({ getWindow: () => operator });
  operator = createOperatorWindow();
  operator.on('closed', () => app.quit());
  app.on('before-quit', () => { flushLook(); automation.stop(); messageRunner.stop(); sync.stop(); remote.close(); });
}

app.whenReady().then(start).catch((err) => {
  console.error('[main] falha ao iniciar:', err);
  app.exit(1);
});
app.on('window-all-closed', () => app.quit());

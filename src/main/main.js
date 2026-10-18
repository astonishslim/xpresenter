const { app, BrowserWindow } = require('electron');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createStore } = require('../core/store');
const { createLibrary } = require('../core/library');
const { createRemoteServer } = require('../core/remoteServer');
const { createOperatorWindow, createOutputWindows } = require('./windows');
const { registerIpc } = require('./ipc');

const REMOTE_PORT = 5151;
const SAMPLE_BIBLE = path.join(__dirname, '..', '..', 'data', 'bible-sample.json');

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    const hit = (list || []).find((i) => i.family === 'IPv4' && !i.internal);
    if (hit) return hit.address;
  }
  return '127.0.0.1';
}

function createOutputManager(store) {
  let windows = [];
  const broadcast = (state) => BrowserWindow.getAllWindows().forEach((w) => !w.isDestroyed() && w.webContents.send('state:changed', state));
  store.subscribe(broadcast);

  return {
    isOpen: () => windows.length > 0,
    toggle() {
      if (windows.length) {
        windows.forEach((w) => !w.isDestroyed() && w.close());
        windows = [];
        return false;
      }
      windows = createOutputWindows();
      windows.forEach((w) => w.on('closed', () => { windows = windows.filter((x) => x !== w); }));
      return true;
    },
  };
}

async function start() {
  const userDataDir = app.getPath('userData');
  const store = createStore();
  const library = createLibrary(path.join(userDataDir, 'library.json'));
  const outputs = createOutputManager(store);

  const token = randomBytes(16).toString('hex');
  const remote = createRemoteServer({
    token,
    staticDir: path.join(__dirname, '..', 'remote'),
    getState: store.getState,
    dispatch: store.dispatch,
    subscribe: store.subscribe,
    getPlaylist: library.getPlaylist,
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
    userDataDir,
    sampleBible: SAMPLE_BIBLE,
    getWindow: () => operator,
    remoteInfo: () => ({ url: `http://${lanAddress()}:${port}/?t=${token}` }),
  });
  operator = createOperatorWindow();
  operator.on('closed', () => app.quit());
  app.on('before-quit', () => remote.close());
}

app.whenReady().then(start).catch((err) => {
  console.error('[main] falha ao iniciar:', err);
  app.exit(1);
});
app.on('window-all-closed', () => app.quit());

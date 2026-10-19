// Atualização automática pelo GitHub Releases (astonishslim/xpresenter).
// Baixa em segundo plano e instala quando o app é fechado; nunca reinicia sozinho (pode estar no meio do culto).
const { app, ipcMain } = require('electron');

const CHECK_DELAY_MS = 15 * 1000; // não disputa rede/CPU com a abertura do app
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function setupUpdater({ getWindow }) {
  let updater = null;
  let readyVersion = null;

  // Só quando o operador clica em "Reiniciar e atualizar".
  ipcMain.handle('update:install', () => {
    if (!updater || !readyVersion) return false;
    updater.quitAndInstall(false, true);
    return true;
  });
  ipcMain.handle('update:status', () => ({ version: app.getVersion(), ready: readyVersion }));

  // Em desenvolvimento (npm start) não há instalador para atualizar.
  if (!app.isPackaged) return;
  // eslint-disable-next-line global-require
  ({ autoUpdater: updater } = require('electron-updater'));
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  updater.on('update-downloaded', (info) => {
    readyVersion = info.version;
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('update:ready', { version: info.version });
  });
  // Sem internet ou GitHub fora do ar: só registra; o app segue normal.
  updater.on('error', (err) => console.error(`[atualização] ${err.message}`));

  const check = () => updater.checkForUpdates().catch((err) => console.error(`[atualização] ${err.message}`));
  setTimeout(check, CHECK_DELAY_MS);
  setInterval(check, CHECK_INTERVAL_MS).unref();
}

module.exports = { setupUpdater };

const { ipcMain, BrowserWindow } = require('electron');
const { createSyncClient, parseSyncUrl } = require('../core/syncClient');
const { sanitizeSyncedState } = require('../core/syncState');

// Seguir outro computador: enquanto segue, o store fica travado (só o estado recebido de lá muda a projeção).
// O estado recebido é remontado e validado campo a campo (syncState.js) antes de entrar.
function registerSyncIpc({ store, ownToken }) {
  let status = { state: 'stopped', host: null };
  const broadcast = () => BrowserWindow.getAllWindows().forEach((w) => !w.isDestroyed() && w.webContents.send('sync:status', status));

  const client = createSyncClient({
    onState: (raw, offsetMs) => {
      const next = sanitizeSyncedState(raw, { offsetMs });
      if (next) store.replace(next);
    },
    onStatus: (next) => {
      status = next;
      if (next.state === 'stopped') store.lock(false); // desistiu (token errado) ou parou: o controle volta para cá
      broadcast();
    },
  });

  ipcMain.handle('sync:status', () => status);
  ipcMain.handle('sync:start', (_e, url) => {
    const target = parseSyncUrl(url);
    if (!target.ok) return target;
    // Seguir o próprio endereço faria o estado girar em círculo para sempre.
    if (target.token === ownToken) return { ok: false, reason: 'Esse é o endereço deste próprio computador. Cole o endereço do OUTRO computador.' };
    store.lock(true);
    client.start(target);
    return { ok: true };
  });
  ipcMain.handle('sync:stop', () => {
    client.stop();
    return { ok: true };
  });

  return { stop: () => client.stop() };
}

module.exports = { registerSyncIpc };
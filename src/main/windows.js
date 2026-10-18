const { BrowserWindow, screen } = require('electron');
const path = require('node:path');

const PRELOAD = path.join(__dirname, 'preload.js');
const RENDERER = path.join(__dirname, '..', 'renderer');
const WINDOW_PREFS = { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true };

function hardenWindow(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
}

function createOperatorWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    title: 'Apresentador',
    backgroundColor: '#14161a',
    webPreferences: WINDOW_PREFS,
  });
  hardenWindow(win);
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(RENDERER, 'operator', 'index.html'));
  return win;
}

// Uma janela de projeção por monitor externo; com um só monitor, abre em janela.
function createOutputWindows() {
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  const targets = displays.filter((d) => d.id !== primaryId);

  const open = (bounds, fullscreen) => {
    const win = new BrowserWindow({
      ...bounds,
      fullscreen,
      frame: !fullscreen,
      title: 'Apresentador - Saída',
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      webPreferences: WINDOW_PREFS,
    });
    hardenWindow(win);
    win.loadFile(path.join(RENDERER, 'output', 'output.html'));
    return win;
  };

  if (!targets.length) return [open({ width: 960, height: 540 }, false)];
  return targets.map((d) => open({ x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height }, true));
}

module.exports = { createOperatorWindow, createOutputWindows };

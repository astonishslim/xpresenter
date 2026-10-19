const { BrowserWindow, screen } = require('electron');
const path = require('node:path');

const PRELOAD = path.join(__dirname, 'preload.js');
const RENDERER = path.join(__dirname, '..', 'renderer');
const ICON = path.join(__dirname, '..', 'assets', 'icon.png');
// backgroundThrottling: false mantém cronômetro, legenda e vídeo em dia mesmo com a janela encoberta.
const WINDOW_PREFS = { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false };

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
    icon: ICON,
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

  // Só a primeira saída toca o som dos vídeos (várias janelas com áudio dariam eco).
  const open = (bounds, fullscreen, audio) => {
    const win = new BrowserWindow({
      ...bounds,
      fullscreen,
      frame: !fullscreen,
      title: 'Apresentador - Saída',
      icon: ICON,
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      webPreferences: WINDOW_PREFS,
    });
    hardenWindow(win);
    win.loadFile(path.join(RENDERER, 'output', 'output.html'), { query: { audio: audio ? '1' : '0' } });
    return win;
  };

  if (!targets.length) return [open({ width: 960, height: 540 }, false, true)];
  return targets.map((d, i) => open({ x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height }, true, i === 0));
}

function listDisplays() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    primary: d.id === primaryId,
    label: `Monitor ${i + 1} (${d.bounds.width}x${d.bounds.height})${d.id === primaryId ? ' - principal' : ''}`,
  }));
}

// Monitor de retorno: tela cheia no monitor escolhido, ou janela comum se não houver escolha.
function createStageWindow(displayId) {
  const display = screen.getAllDisplays().find((d) => d.id === displayId);
  const win = new BrowserWindow({
    ...(display
      ? { x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height, fullscreen: true, frame: false }
      : { width: 1024, height: 576 }),
    title: 'Apresentador - Retorno de palco',
    icon: ICON,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: WINDOW_PREFS,
  });
  hardenWindow(win);
  win.loadFile(path.join(__dirname, '..', 'remote', 'stage.html'));
  return win;
}

module.exports = { createOperatorWindow, createOutputWindows, createStageWindow, listDisplays };

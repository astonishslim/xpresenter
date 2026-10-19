const { BrowserWindow, screen } = require('electron');
const path = require('node:path');
const { LAYOUT_NAMES, DEFAULT_LAYOUT } = require('../renderer/shared/stageLayouts');

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
    title: 'xpresenter',
    icon: ICON,
    backgroundColor: '#14161a',
    webPreferences: WINDOW_PREFS,
  });
  hardenWindow(win);
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(RENDERER, 'operator', 'index.html'));
  return win;
}

const WINDOWED = { width: 960, height: 540 };

// Uma janela por item do plano (veja outputConfig.planOutputs): tela cheia no monitor, ou janela comum.
// Perfil, recorte do panorâmico, rampas de blending e som vão pela URL para a página de saída.
function createOutputWindows(plan) {
  return plan.map((p, i) => {
    const fullscreen = Boolean(p.bounds);
    const win = new BrowserWindow({
      ...(fullscreen ? { x: p.bounds.x, y: p.bounds.y, width: p.bounds.width, height: p.bounds.height } : WINDOWED),
      fullscreen,
      frame: !fullscreen,
      title: `xpresenter - Saída ${i + 1}`,
      icon: ICON,
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      webPreferences: WINDOW_PREFS,
    });
    hardenWindow(win);
    win.loadFile(path.join(RENDERER, 'output', 'output.html'), {
      query: {
        profile: p.profile,
        audio: p.audio ? '1' : '0',
        rx: String(p.region.x),
        rw: String(p.region.w),
        bl: String(p.blend.left),
        br: String(p.blend.right),
      },
    });
    return win;
  });
}

function getDisplays() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    primary: d.id === primaryId,
    bounds: { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height },
    label: `Monitor ${i + 1} (${d.bounds.width}x${d.bounds.height})${d.id === primaryId ? ' - principal' : ''}`,
  }));
}

const listDisplays = () => getDisplays().map(({ id, primary, label }) => ({ id, primary, label }));

// Monitor de retorno: tela cheia no monitor escolhido, ou janela comum se não houver escolha.
function createStageWindow(displayId, layout) {
  const display = screen.getAllDisplays().find((d) => d.id === displayId);
  const win = new BrowserWindow({
    ...(display
      ? { x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height, fullscreen: true, frame: false }
      : { width: 1024, height: 576 }),
    title: 'xpresenter - Retorno de palco',
    icon: ICON,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: WINDOW_PREFS,
  });
  hardenWindow(win);
  win.loadFile(path.join(__dirname, '..', 'remote', 'stage.html'), { query: { layout: LAYOUT_NAMES.includes(layout) ? layout : DEFAULT_LAYOUT } });
  return win;
}

module.exports = { createOperatorWindow, createOutputWindows, createStageWindow, listDisplays, getDisplays };

const { ipcMain } = require('electron');
const fs = require('node:fs');
const { createAutomationService } = require('../core/automationService');
const { sanitizeSettings, INPUT_COMMANDS, EVENT_LABELS } = require('../core/automation');

// Configuração da automação (OSC) em automation.json; aplicada ao abrir e a cada "Salvar".
function registerAutomationIpc({ store, file, getWindow, step, runMacro }) {
  let settings = sanitizeSettings(null);
  try {
    settings = sanitizeSettings(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[automação] não foi possível ler ${file}: ${err.message}`);
  }

  const service = createAutomationService({
    store,
    runMacro,
    sendToOperator: (command) => {
      // Se o que está no ar veio do culto, avança/volta por ele aqui; senão, o operador decide pelos Slides abertos.
      if (step(command === 'next' ? 1 : -1)) return;
      const win = getWindow();
      if (win && !win.isDestroyed()) win.webContents.send('automation:command', command);
    },
  });
  let status = { port: null, error: null };
  const apply = async () => { status = await service.apply(settings); return status; };
  apply();

  ipcMain.handle('automation:get', () => ({ settings, status, commands: INPUT_COMMANDS, events: EVENT_LABELS }));
  ipcMain.handle('automation:set', async (_e, raw) => {
    settings = sanitizeSettings(raw);
    fs.writeFileSync(file, JSON.stringify(settings, null, 2));
    return { settings, status: await apply() };
  });

  return { stop: () => service.stop() };
}

module.exports = { registerAutomationIpc };

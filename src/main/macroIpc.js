const { ipcMain } = require('electron');

function registerMacroIpc({ macros, runner }) {
  ipcMain.handle('macros:list', () => macros.list());
  ipcMain.handle('macros:save', (_e, macro) => macros.save(macro));
  ipcMain.handle('macros:remove', (_e, id) => macros.remove(id));
  // O macro vem sempre da biblioteca (pelo id): quem chama não manda passos.
  ipcMain.handle('macros:run', (_e, id) => {
    const macro = macros.get(id);
    return macro ? runner.run(macro) : { ok: false, reason: 'Macro não encontrado.', results: [] };
  });
}

module.exports = { registerMacroIpc };

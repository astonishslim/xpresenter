const { ipcMain } = require('electron');
const { lookOf } = require('../core/themeLibrary');

function registerThemeIpc({ store, themes }) {
  const result = (fn) => {
    try {
      return { ok: true, ...fn(), themes: themes.list() };
    } catch (err) {
      return { ok: false, reason: err.message, themes: themes.list() };
    }
  };

  ipcMain.handle('themes:list', () => themes.list());
  // Salva o que está na saída agora: o fundo e o estilo vêm do estado, não da interface.
  ipcMain.handle('themes:save', (_e, name) => result(() => ({ theme: themes.save(name, lookOf(store.getState())) })));
  ipcMain.handle('themes:remove', (_e, name) => result(() => { themes.remove(name); return {}; }));
  ipcMain.handle('themes:apply', (_e, name) => result(() => {
    const theme = themes.get(name);
    if (!theme) throw new Error('Tema não encontrado.');
    store.dispatch({ type: 'setBackground', background: theme.background });
    store.dispatch({ type: 'setTextStyle', style: theme.style });
    return { theme };
  }));
}

module.exports = { registerThemeIpc };

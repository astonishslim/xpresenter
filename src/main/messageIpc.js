const { ipcMain } = require('electron');
const { pickValues } = require('../core/messages');

function registerMessageIpc({ messages, runner }) {
  ipcMain.handle('messages:list', () => messages.list());
  ipcMain.handle('messages:save', (_e, template) => messages.save(template));
  ipcMain.handle('messages:remove', (_e, id) => messages.remove(id));
  ipcMain.handle('messages:show', (_e, { id, values } = {}) => {
    const template = messages.get(id);
    if (!template) return { ok: false, reason: 'Modelo não encontrado.' };
    return runner.show(template, pickValues(template.text, values));
  });
  ipcMain.handle('messages:clear', () => runner.clear());
}

module.exports = { registerMessageIpc };

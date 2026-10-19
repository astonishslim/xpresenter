const { ipcMain } = require('electron');

// Lista de props da biblioteca. Ligar e desligar no ar vai pelo state:dispatch (showProp/hideProp), que valida
// a ação e confere se o arquivo da imagem ainda existe.
function registerPropIpc({ props }) {
  ipcMain.handle('props:list', () => props.list());
  ipcMain.handle('props:save', (_e, prop) => props.save(prop));
  ipcMain.handle('props:remove', (_e, id) => props.remove(id));
}

module.exports = { registerPropIpc };

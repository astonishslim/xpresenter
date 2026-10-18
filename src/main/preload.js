const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('apresentador', {
  getState: () => invoke('state:get'),
  dispatch: (action) => invoke('state:dispatch', action),
  onState(callback) {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('state:changed', handler);
    return () => ipcRenderer.removeListener('state:changed', handler);
  },
  songs: {
    list: () => invoke('songs:list'),
    save: (song) => invoke('songs:save', song),
    remove: (id) => invoke('songs:remove', id),
    slides: (song) => invoke('songs:slides', song),
  },
  playlist: {
    list: () => invoke('playlist:list'),
    add: (item) => invoke('playlist:add', item),
    remove: (id) => invoke('playlist:remove', id),
    move: (id, index) => invoke('playlist:move', { id, index }),
  },
  bible: {
    lookup: (reference) => invoke('bible:lookup', reference),
    import: () => invoke('bible:import'),
  },
  outputs: { toggle: () => invoke('outputs:toggle'), isOpen: () => invoke('outputs:isOpen') },
  remote: { info: () => invoke('remote:info') },
  background: { pickImage: () => invoke('background:pickImage') },
});

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
    search: (query) => invoke('songs:search', query),
  },
  lyrics: { search: (title, artist) => invoke('lyrics:search', { title, artist }) },
  playlist: {
    list: () => invoke('playlist:list'),
    add: (item) => invoke('playlist:add', item),
    remove: (id) => invoke('playlist:remove', id),
    move: (id, index) => invoke('playlist:move', { id, index }),
  },
  bible: {
    versions: () => invoke('bible:versions'),
    lookup: (version, reference) => invoke('bible:lookup', { version, reference }),
    search: (version, query) => invoke('bible:search', { version, query }),
    import: () => invoke('bible:import'),
    importText: (content, fileName) => invoke('bible:importText', { content, fileName }),
    remove: (code) => invoke('bible:remove', code),
  },
  outputs: { toggle: () => invoke('outputs:toggle'), isOpen: () => invoke('outputs:isOpen') },
  remote: { info: () => invoke('remote:info') },
  displays: { list: () => invoke('displays:list') },
  stage: { toggle: (displayId) => invoke('stage:toggle', displayId), isOpen: () => invoke('stage:isOpen') },
  background: { pickImage: () => invoke('background:pickImage'), pickVideo: () => invoke('background:pickVideo') },
  themes: {
    list: () => invoke('themes:list'),
    save: (name) => invoke('themes:save', name),
    apply: (name) => invoke('themes:apply', name),
    remove: (name) => invoke('themes:remove', name),
  },
});

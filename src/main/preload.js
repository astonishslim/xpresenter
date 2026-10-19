const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
  outputs: {
    toggle: () => invoke('outputs:toggle'),
    isOpen: () => invoke('outputs:isOpen'),
    getConfig: () => invoke('outputs:getConfig'),
    setConfig: (config) => invoke('outputs:setConfig', config),
  },
  remote: { info: () => invoke('remote:info') },
  displays: { list: () => invoke('displays:list') },
  stage: { toggle: (displayId) => invoke('stage:toggle', displayId), isOpen: () => invoke('stage:isOpen') },
  automation: {
    get: () => invoke('automation:get'),
    set: (settings) => invoke('automation:set', settings),
    // Comandos OSC que precisam do operador (avançar/voltar slide).
    onCommand(callback) {
      const handler = (_event, command) => callback(command);
      ipcRenderer.on('automation:command', handler);
      return () => ipcRenderer.removeListener('automation:command', handler);
    },
  },
  imports: {
    pick: () => invoke('import:pick'),
    savePage: (importId, index, bytes) => invoke('import:savePage', { importId, index, bytes }),
    discard: (importId) => invoke('import:discard', importId),
  },
  media: {
    list: () => invoke('media:list'),
    add: () => invoke('media:add'),
    // Arquivos arrastados: o caminho só existe aqui no preload (webUtils); a validação é no processo principal.
    addFiles: (files) => invoke('media:addPaths', [...files].map((f) => webUtils.getPathForFile(f)).filter(Boolean)),
    remove: (id) => invoke('media:remove', id),
  },
  background: { pickImage: () => invoke('background:pickImage'), pickVideo: () => invoke('background:pickVideo') },
  themes: {
    list: () => invoke('themes:list'),
    save: (name) => invoke('themes:save', name),
    apply: (name) => invoke('themes:apply', name),
    remove: (name) => invoke('themes:remove', name),
    getDefaults: () => invoke('themes:getDefaults'),
    setDefaults: (patch) => invoke('themes:setDefaults', patch),
  },
});

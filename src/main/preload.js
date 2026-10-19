const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('apresentador', {
  getState: () => invoke('state:get'),
  dispatch: (action) => invoke('state:dispatch', action),
  undo: () => invoke('state:undo'),
  redo: () => invoke('state:redo'),
  onState(callback) {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('state:changed', handler);
    return () => ipcRenderer.removeListener('state:changed', handler);
  },
  songs: {
    list: () => invoke('songs:list'),
    save: (song) => invoke('songs:save', song),
    remove: (id) => invoke('songs:remove', id),
    slides: (song, arrangement) => invoke('songs:slides', song, arrangement || ''),
    search: (query) => invoke('songs:search', query),
    import: () => invoke('songs:import'),
    // Arquivos arrastados (lista de File: a ponte do preload não passa um FileList); o caminho só existe aqui (webUtils).
    importFiles: (files) => invoke('songs:importPaths', [...files].map((f) => webUtils.getPathForFile(f)).filter(Boolean)),
    editSlide: (songId, label, oldText, newText) => invoke('songs:editSlide', { songId, label, oldText, newText }),
  },
  sync: {
    status: () => invoke('sync:status'),
    start: (url) => invoke('sync:start', url),
    stop: () => invoke('sync:stop'),
    onStatus(callback) {
      const handler = (_event, status) => callback(status);
      ipcRenderer.on('sync:status', handler);
      return () => ipcRenderer.removeListener('sync:status', handler);
    },
  },
  props: {
    list: () => invoke('props:list'),
    save: (prop) => invoke('props:save', prop),
    remove: (id) => invoke('props:remove', id),
  },
  macros: {
    list: () => invoke('macros:list'),
    save: (macro) => invoke('macros:save', macro),
    remove: (id) => invoke('macros:remove', id),
    run: (id) => invoke('macros:run', id),
  },
  usage: {
    list: (period) => invoke('usage:list', period),
    export: (period) => invoke('usage:export', period),
  },
  messages: {
    list: () => invoke('messages:list'),
    save: (template) => invoke('messages:save', template),
    remove: (id) => invoke('messages:remove', id),
    show: (id, values) => invoke('messages:show', { id, values }),
    clear: () => invoke('messages:clear'),
  },
  lyrics: { search: (title, artist) => invoke('lyrics:search', { title, artist }) },
  playlist: {
    list: () => invoke('playlist:list'),
    add: (item) => invoke('playlist:add', item),
    remove: (id) => invoke('playlist:remove', id),
    move: (id, index) => invoke('playlist:move', { id, index }),
    setArrangement: (id, arrangement) => invoke('playlist:setArrangement', { id, arrangement }),
    editSlide: (id, index, text) => invoke('playlist:editSlide', { id, index, text }),
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
  stage: { toggle: (displayId, layout) => invoke('stage:toggle', displayId, layout), isOpen: () => invoke('stage:isOpen') },
  update: {
    status: () => invoke('update:status'),
    install: () => invoke('update:install'),
    onReady(callback) {
      const handler = (_event, info) => callback(info);
      ipcRenderer.on('update:ready', handler);
      return () => ipcRenderer.removeListener('update:ready', handler);
    },
  },
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
    // Arquivos arrastados (lista de File: a ponte do preload não passa um FileList); o caminho só existe aqui (webUtils).
    addFiles: (files) => invoke('media:addPaths', [...files].map((f) => webUtils.getPathForFile(f)).filter(Boolean)),
    remove: (id) => invoke('media:remove', id),
  },
  audio: {
    list: () => invoke('audio:list'),
    add: () => invoke('audio:add'),
    // Arquivos arrastados (lista de File: a ponte do preload não passa um FileList); o caminho só existe aqui (webUtils).
    addFiles: (files) => invoke('audio:addPaths', [...files].map((f) => webUtils.getPathForFile(f)).filter(Boolean)),
    move: (id, index) => invoke('audio:move', { id, index }),
    remove: (id) => invoke('audio:remove', id),
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

const { ipcRenderer } = require('electron');

const api = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getState: () => ipcRenderer.invoke('app:getState')
  },
  
  file: {
    openKai: () => ipcRenderer.invoke('file:openKai'),
    loadKaiFromPath: (filePath) => ipcRenderer.invoke('file:loadKaiFromPath', filePath)
  },
  
  audio: {
    getDevices: () => ipcRenderer.invoke('audio:getDevices'),
    enumerateDevices: () => ipcRenderer.invoke('audio:enumerateDevices'),
    setDevice: (deviceType, deviceId) => ipcRenderer.invoke('audio:setDevice', deviceType, deviceId),
    
    onXRun: (callback) => ipcRenderer.on('audio:xrun', callback),
    onLatencyUpdate: (callback) => ipcRenderer.on('audio:latency', callback),
    
    removeXRunListener: (callback) => ipcRenderer.removeListener('audio:xrun', callback),
    removeLatencyListener: (callback) => ipcRenderer.removeListener('audio:latency', callback)
  },
  
  mixer: {
    setMasterGain: (bus, gainDb) => ipcRenderer.invoke('mixer:setMasterGain', bus, gainDb),
    toggleMasterMute: (bus) => ipcRenderer.invoke('mixer:toggleMasterMute', bus),

    onStateChange: (callback) => ipcRenderer.on('mixer:state', callback),
    removeStateListener: (callback) => ipcRenderer.removeListener('mixer:state', callback),

    // Listen for commands from main process (for web admin)
    onSetMasterGain: (callback) => ipcRenderer.on('mixer:setMasterGain', callback),
    onToggleMasterMute: (callback) => ipcRenderer.on('mixer:toggleMasterMute', callback),
    onSetMasterMute: (callback) => ipcRenderer.on('mixer:setMasterMute', callback)
  },
  
  player: {
    play: () => ipcRenderer.invoke('player:play'),
    pause: () => ipcRenderer.invoke('player:pause'),
    seek: (positionSec) => ipcRenderer.invoke('player:seek', positionSec),
    restart: () => ipcRenderer.invoke('player:restart'),

    onPlaybackState: (callback) => ipcRenderer.on('playback:state', callback),
    removePlaybackListener: (callback) => ipcRenderer.removeListener('playback:state', callback)
  },
  
  autotune: {
    setEnabled: (enabled) => ipcRenderer.invoke('autotune:setEnabled', enabled),
    setSettings: (settings) => ipcRenderer.invoke('autotune:setSettings', settings)
  },
  
  song: {
    onLoaded: (callback) => ipcRenderer.on('song:loaded', callback),
    onData: (callback) => ipcRenderer.on('song:data', callback),
    onChanged: (callback) => ipcRenderer.on('song:changed', callback),
    removeSongListener: (callback) => ipcRenderer.removeListener('song:loaded', callback),
    removeDataListener: (callback) => ipcRenderer.removeListener('song:data', callback),
    removeChangedListener: (callback) => ipcRenderer.removeListener('song:changed', callback),
    getCurrentSong: () => ipcRenderer.invoke('song:getCurrentSong')
  },
  
  editor: {
    loadKai: (filePath) => ipcRenderer.invoke('editor:loadKai', filePath),
    saveKai: (kaiData, originalPath) => ipcRenderer.invoke('editor:saveKai', kaiData, originalPath),
    reloadKai: (filePath) => ipcRenderer.invoke('editor:reloadKai', filePath)
  },
  
  window: {
    openCanvas: () => ipcRenderer.invoke('window:openCanvas')
  },
  
  canvas: {
    startStreaming: () => ipcRenderer.invoke('canvas:startStreaming'),
    stopStreaming: () => ipcRenderer.invoke('canvas:stopStreaming'),
    sendImageData: (imageDataArray, width, height) => ipcRenderer.invoke('canvas:sendImageData', imageDataArray, width, height),
    sendICECandidate: (source, candidate) => ipcRenderer.invoke('canvas:sendICECandidate', source, candidate),
    toggleFullscreen: (shouldBeFullscreen) => ipcRenderer.invoke('canvas:toggleFullscreen', shouldBeFullscreen),
    sendFrame: (dataUrl) => ipcRenderer.invoke('canvas:sendFrame', dataUrl)
  },
  
  library: {
    getSongsFolder: () => ipcRenderer.invoke('library:getSongsFolder'),
    setSongsFolder: () => ipcRenderer.invoke('library:setSongsFolder'),
    scanFolder: () => ipcRenderer.invoke('library:scanFolder'),
    syncLibrary: () => ipcRenderer.invoke('library:syncLibrary'),
    getCachedSongs: () => ipcRenderer.invoke('library:getCachedSongs'),
    getSongInfo: (filePath) => ipcRenderer.invoke('library:getSongInfo', filePath),
    search: (query) => ipcRenderer.invoke('library:search', query),

    onFolderSet: (callback) => ipcRenderer.on('library:folderSet', callback),
    removeFolderSetListener: (callback) => ipcRenderer.removeListener('library:folderSet', callback)
  },

  webServer: {
    getPort: () => ipcRenderer.invoke('webServer:getPort'),
    getUrl: () => ipcRenderer.invoke('webServer:getUrl'),
    getSettings: () => ipcRenderer.invoke('webServer:getSettings'),
    updateSettings: (settings) => ipcRenderer.invoke('webServer:updateSettings', settings),
    getSongRequests: () => ipcRenderer.invoke('webServer:getSongRequests'),
    approveRequest: (requestId) => ipcRenderer.invoke('webServer:approveRequest', requestId),
    rejectRequest: (requestId) => ipcRenderer.invoke('webServer:rejectRequest', requestId),
    refreshCache: () => ipcRenderer.invoke('webServer:refreshCache')
  },

  settings: {
    get: (key, defaultValue) => ipcRenderer.invoke('settings:get', key, defaultValue),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    updateBatch: (updates) => ipcRenderer.invoke('settings:updateBatch', updates),
    onUpdate: (callback) => ipcRenderer.on('settings:update', callback),
    removeUpdateListener: (callback) => ipcRenderer.removeListener('settings:update', callback)
  },

  queue: {
    addSong: (queueItem) => ipcRenderer.invoke('queue:addSong', queueItem),
    removeSong: (itemId) => ipcRenderer.invoke('queue:removeSong', itemId),
    get: () => ipcRenderer.invoke('queue:get'),
    clear: () => ipcRenderer.invoke('queue:clear'),

    onUpdated: (callback) => ipcRenderer.on('queue:updated', callback),
    removeUpdatedListener: (callback) => ipcRenderer.removeListener('queue:updated', callback)
  },

  effect: {
    onNext: (callback) => ipcRenderer.on('effect:next', callback),
    onPrevious: (callback) => ipcRenderer.on('effect:previous', callback),
    removeNextListener: (callback) => ipcRenderer.removeListener('effect:next', callback),
    removePreviousListener: (callback) => ipcRenderer.removeListener('effect:previous', callback)
  },

  effects: {
    getList: () => ipcRenderer.invoke('effects:getList'),
    select: (effectName) => ipcRenderer.invoke('effects:select', effectName),
    toggle: (effectName, enabled) => ipcRenderer.invoke('effects:toggle', effectName, enabled),
    next: () => ipcRenderer.invoke('effects:next'),
    previous: () => ipcRenderer.invoke('effects:previous'),
    random: () => ipcRenderer.invoke('effects:random'),

    onChanged: (callback) => ipcRenderer.on('effects:changed', callback),
    removeChangedListener: (callback) => ipcRenderer.removeListener('effects:changed', callback)
  },

  preferences: {
    setAutoTune: (prefs) => ipcRenderer.invoke('preferences:setAutoTune', prefs),
    setMicrophone: (prefs) => ipcRenderer.invoke('preferences:setMicrophone', prefs),
    setEffects: (prefs) => ipcRenderer.invoke('preferences:setEffects', prefs),

    onUpdated: (callback) => ipcRenderer.on('preferences:updated', callback),
    removeUpdatedListener: (callback) => ipcRenderer.removeListener('preferences:updated', callback)
  },

  admin: {
    onPlay: (callback) => ipcRenderer.on('admin:play', callback),
    onNext: (callback) => ipcRenderer.on('admin:next', callback),
    onRestart: (callback) => ipcRenderer.on('admin:restart', callback),
    removePlayListener: (callback) => ipcRenderer.removeListener('admin:play', callback),
    removeNextListener: (callback) => ipcRenderer.removeListener('admin:next', callback),
    removeRestartListener: (callback) => ipcRenderer.removeListener('admin:restart', callback)
  },

  renderer: {
    sendPlaybackState: (state) => ipcRenderer.send('renderer:playbackState', state),
    updatePlaybackState: (updates) => ipcRenderer.send('renderer:updatePlaybackState', updates),
    songLoaded: (songData) => ipcRenderer.send('renderer:songLoaded', songData),
    updateMixerState: (mixerState) => ipcRenderer.send('renderer:updateMixerState', mixerState),
    updateEffectsState: (effectsState) => ipcRenderer.send('renderer:updateEffectsState', effectsState)
  },

  events: {
    on: (channel, callback) => ipcRenderer.on(channel, callback),
    removeListener: (channel, callback) => ipcRenderer.removeListener(channel, callback)
  },

  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  }
};

// Since contextIsolation is disabled, directly assign to window
window.kaiAPI = api;
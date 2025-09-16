const { ipcRenderer } = require('electron');

const api = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion')
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
    toggleMute: (stemId, bus) => ipcRenderer.invoke('mixer:toggleMute', stemId, bus),
    toggleSolo: (stemId) => ipcRenderer.invoke('mixer:toggleSolo', stemId),
    setGain: (stemId, gainDb) => ipcRenderer.invoke('mixer:setGain', stemId, gainDb),
    applyPreset: (presetId) => ipcRenderer.invoke('mixer:applyPreset', presetId),
    recallScene: (sceneId) => ipcRenderer.invoke('mixer:recallScene', sceneId),
    
    onStateChange: (callback) => ipcRenderer.on('mixer:state', callback),
    removeStateListener: (callback) => ipcRenderer.removeListener('mixer:state', callback)
  },
  
  player: {
    play: () => ipcRenderer.invoke('player:play'),
    pause: () => ipcRenderer.invoke('player:pause'),
    seek: (positionSec) => ipcRenderer.invoke('player:seek', positionSec)
  },
  
  autotune: {
    setEnabled: (enabled) => ipcRenderer.invoke('autotune:setEnabled', enabled),
    setSettings: (settings) => ipcRenderer.invoke('autotune:setSettings', settings)
  },
  
  song: {
    onLoaded: (callback) => ipcRenderer.on('song:loaded', callback),
    onData: (callback) => ipcRenderer.on('song:data', callback),
    removeSongListener: (callback) => ipcRenderer.removeListener('song:loaded', callback),
    removeDataListener: (callback) => ipcRenderer.removeListener('song:data', callback),
    getCurrentSong: () => ipcRenderer.invoke('song:getCurrentSong')
  },
  
  editor: {
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
    getSongInfo: (filePath) => ipcRenderer.invoke('library:getSongInfo', filePath),
    
    onFolderSet: (callback) => ipcRenderer.on('library:folderSet', callback),
    removeFolderSetListener: (callback) => ipcRenderer.removeListener('library:folderSet', callback)
  },

  webServer: {
    getPort: () => ipcRenderer.invoke('webServer:getPort'),
    getSettings: () => ipcRenderer.invoke('webServer:getSettings'),
    updateSettings: (settings) => ipcRenderer.invoke('webServer:updateSettings', settings),
    getSongRequests: () => ipcRenderer.invoke('webServer:getSongRequests'),
    approveRequest: (requestId) => ipcRenderer.invoke('webServer:approveRequest', requestId),
    rejectRequest: (requestId) => ipcRenderer.invoke('webServer:rejectRequest', requestId)
  },

  settings: {
    get: (key, defaultValue) => ipcRenderer.invoke('settings:get', key, defaultValue),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    updateBatch: (updates) => ipcRenderer.invoke('settings:updateBatch', updates)
  },

  queue: {
    addSong: (queueItem) => ipcRenderer.invoke('queue:addSong', queueItem),
    get: () => ipcRenderer.invoke('queue:get'),
    clear: () => ipcRenderer.invoke('queue:clear')
  },

  events: {
    on: (channel, callback) => ipcRenderer.on(channel, callback),
    removeListener: (channel, callback) => ipcRenderer.removeListener(channel, callback)
  }
};

// Since contextIsolation is disabled, directly assign to window
window.kaiAPI = api;
/**
 * Shared constants - usable in browser, Electron renderer, and Node.js
 */

// IPC Channel Names
export const IPC_CHANNELS = {
  // App
  APP_GET_VERSION: 'app:getVersion',
  APP_GET_STATE: 'app:getState',

  // File
  FILE_OPEN_KAI: 'file:openKai',
  FILE_LOAD_KAI_FROM_PATH: 'file:loadKaiFromPath',

  // Audio
  AUDIO_GET_DEVICES: 'audio:getDevices',
  AUDIO_ENUMERATE_DEVICES: 'audio:enumerateDevices',
  AUDIO_SET_DEVICE: 'audio:setDevice',

  // Mixer
  MIXER_SET_MASTER_GAIN: 'mixer:setMasterGain',
  MIXER_TOGGLE_MASTER_MUTE: 'mixer:toggleMasterMute',

  // Player
  PLAYER_PLAY: 'player:play',
  PLAYER_PAUSE: 'player:pause',
  PLAYER_SEEK: 'player:seek',

  // Editor
  EDITOR_SAVE_KAI: 'editor:saveKai',
  EDITOR_RELOAD_KAI: 'editor:reloadKai',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:getAll',
  SETTINGS_UPDATE_BATCH: 'settings:updateBatch',

  // Library
  LIBRARY_GET_SONGS_FOLDER: 'library:getSongsFolder',
  LIBRARY_SET_SONGS_FOLDER: 'library:setSongsFolder',
  LIBRARY_SCAN_FOLDER: 'library:scanFolder',
  LIBRARY_SYNC_LIBRARY: 'library:syncLibrary',
  LIBRARY_GET_CACHED_SONGS: 'library:getCachedSongs',
  LIBRARY_GET_SONG_INFO: 'library:getSongInfo',

  // Queue
  QUEUE_ADD_SONG: 'queue:addSong',
  QUEUE_REMOVE_SONG: 'queue:removeSong',
  QUEUE_GET: 'queue:get',
  QUEUE_CLEAR: 'queue:clear',

  // Web Server
  WEBSERVER_GET_PORT: 'webServer:getPort',
  WEBSERVER_GET_URL: 'webServer:getUrl',
  WEBSERVER_GET_SETTINGS: 'webServer:getSettings',
  WEBSERVER_UPDATE_SETTINGS: 'webServer:updateSettings',
  WEBSERVER_GET_SONG_REQUESTS: 'webServer:getSongRequests',
  WEBSERVER_APPROVE_REQUEST: 'webServer:approveRequest',
  WEBSERVER_REJECT_REQUEST: 'webServer:rejectRequest',
  WEBSERVER_REFRESH_CACHE: 'webServer:refreshCache',
};

// Default Values
export const DEFAULTS = {
  MIXER: {
    PA_GAIN: 0,
    IEM_GAIN: 0,
    MIC_GAIN: 0,
  },
  AUDIO: {
    SAMPLE_RATE: 48000,
    BUFFER_SIZE: 256,
  },
  WEBSERVER: {
    PORT: 3000,
    PASSWORD: '',
  },
};

// Stem Names
export const STEM_NAMES = {
  VOCALS: 'vocals',
  MUSIC: 'music',
  DRUMS: 'drums',
  BASS: 'bass',
  OTHER: 'other',
};

// Bus Types
export const BUS_TYPES = {
  PA: 'PA',
  IEM: 'IEM',
  MIC: 'mic',
};

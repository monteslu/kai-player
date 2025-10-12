/**
 * IPC Contracts - Central definition of all IPC channels
 *
 * This file defines all IPC communication channels between:
 * - Main process (Node.js)
 * - Renderer process (Electron UI)
 *
 * Benefits:
 * - Single source of truth for all IPC channels
 * - Easy to see all available APIs at a glance
 * - Prevents typos in channel names
 * - Makes refactoring safer
 */

// ============================================================================
// APP CHANNELS
// ============================================================================

export const APP_CHANNELS = {
  GET_VERSION: 'app:getVersion',
  GET_STATE: 'app:getState',
};

// ============================================================================
// FILE CHANNELS
// ============================================================================

export const FILE_CHANNELS = {
  OPEN_KAI: 'file:openKai',
  LOAD_KAI_FROM_PATH: 'file:loadKaiFromPath',
};

// ============================================================================
// AUDIO CHANNELS
// ============================================================================

export const AUDIO_CHANNELS = {
  GET_DEVICES: 'audio:getDevices',
  ENUMERATE_DEVICES: 'audio:enumerateDevices',
  SET_DEVICE: 'audio:setDevice',

  // Events (main → renderer)
  XRUN: 'audio:xrun',
  LATENCY: 'audio:latency',
};

// ============================================================================
// MIXER CHANNELS
// ============================================================================

export const MIXER_CHANNELS = {
  SET_MASTER_GAIN: 'mixer:setMasterGain',
  TOGGLE_MASTER_MUTE: 'mixer:toggleMasterMute',

  // Events (main → renderer)
  STATE_CHANGE: 'mixer:state',
  SET_MASTER_MUTE: 'mixer:setMasterMute',
};

// ============================================================================
// PLAYER CHANNELS
// ============================================================================

export const PLAYER_CHANNELS = {
  PLAY: 'player:play',
  PAUSE: 'player:pause',
  SEEK: 'player:seek',
  RESTART: 'player:restart',
  NEXT: 'player:next',
};

// ============================================================================
// AUTOTUNE CHANNELS
// ============================================================================

export const AUTOTUNE_CHANNELS = {
  SET_ENABLED: 'autotune:setEnabled',
  SET_SETTINGS: 'autotune:setSettings',
};

// ============================================================================
// SONG CHANNELS
// ============================================================================

export const SONG_CHANNELS = {
  GET_CURRENT_SONG: 'song:getCurrentSong',

  // Events (main → renderer)
  LOADED: 'song:loaded',
  DATA: 'song:data',
};

// ============================================================================
// EDITOR CHANNELS
// ============================================================================

export const EDITOR_CHANNELS = {
  SAVE_KAI: 'editor:saveKai',
  RELOAD_KAI: 'editor:reloadKai',
};

// ============================================================================
// WINDOW CHANNELS
// ============================================================================

export const WINDOW_CHANNELS = {
  OPEN_CANVAS: 'window:openCanvas',
};

// ============================================================================
// CANVAS CHANNELS
// ============================================================================

export const CANVAS_CHANNELS = {
  START_STREAMING: 'canvas:startStreaming',
  STOP_STREAMING: 'canvas:stopStreaming',
  SEND_IMAGE_DATA: 'canvas:sendImageData',
  SEND_ICE_CANDIDATE: 'canvas:sendICECandidate',
  TOGGLE_FULLSCREEN: 'canvas:toggleFullscreen',
  SEND_FRAME: 'canvas:sendFrame',
};

// ============================================================================
// LIBRARY CHANNELS
// ============================================================================

export const LIBRARY_CHANNELS = {
  GET_SONGS_FOLDER: 'library:getSongsFolder',
  SET_SONGS_FOLDER: 'library:setSongsFolder',
  SCAN_FOLDER: 'library:scanFolder',
  SYNC_LIBRARY: 'library:syncLibrary',
  GET_CACHED_SONGS: 'library:getCachedSongs',
  GET_SONG_INFO: 'library:getSongInfo',

  // Events (main → renderer)
  FOLDER_SET: 'library:folderSet',
};

// ============================================================================
// WEB SERVER CHANNELS
// ============================================================================

export const WEB_SERVER_CHANNELS = {
  GET_PORT: 'webServer:getPort',
  GET_URL: 'webServer:getUrl',
  GET_SETTINGS: 'webServer:getSettings',
  UPDATE_SETTINGS: 'webServer:updateSettings',
  GET_SONG_REQUESTS: 'webServer:getSongRequests',
  APPROVE_REQUEST: 'webServer:approveRequest',
  REJECT_REQUEST: 'webServer:rejectRequest',
  REFRESH_CACHE: 'webServer:refreshCache',
};

// ============================================================================
// SETTINGS CHANNELS
// ============================================================================

export const SETTINGS_CHANNELS = {
  GET: 'settings:get',
  SET: 'settings:set',
  GET_ALL: 'settings:getAll',
  UPDATE_BATCH: 'settings:updateBatch',

  // Events (main → renderer)
  UPDATE: 'settings:update',
};

// ============================================================================
// QUEUE CHANNELS
// ============================================================================

export const QUEUE_CHANNELS = {
  ADD_SONG: 'queue:addSong',
  REMOVE_SONG: 'queue:removeSong',
  GET: 'queue:get',
  CLEAR: 'queue:clear',
};

// ============================================================================
// EFFECT CHANNELS
// ============================================================================

export const EFFECT_CHANNELS = {
  // Events (main → renderer)
  NEXT: 'effect:next',
  PREVIOUS: 'effect:previous',
};

// ============================================================================
// ADMIN CHANNELS (web admin → renderer)
// ============================================================================

export const ADMIN_CHANNELS = {
  PLAY: 'admin:play',
  NEXT: 'admin:next',
  RESTART: 'admin:restart',
};

// ============================================================================
// RENDERER CHANNELS (renderer → main, one-way sends)
// ============================================================================

export const RENDERER_CHANNELS = {
  PLAYBACK_STATE: 'renderer:playbackState',
  UPDATE_PLAYBACK_STATE: 'renderer:updatePlaybackState',
  SONG_LOADED: 'renderer:songLoaded',
  UPDATE_MIXER_STATE: 'renderer:updateMixerState',
  UPDATE_EFFECTS_STATE: 'renderer:updateEffectsState',
};

// ============================================================================
// SHELL CHANNELS
// ============================================================================

export const SHELL_CHANNELS = {
  OPEN_EXTERNAL: 'shell:openExternal',
};

// ============================================================================
// ALL CHANNELS (for validation)
// ============================================================================

export const ALL_CHANNELS = {
  ...APP_CHANNELS,
  ...FILE_CHANNELS,
  ...AUDIO_CHANNELS,
  ...MIXER_CHANNELS,
  ...PLAYER_CHANNELS,
  ...AUTOTUNE_CHANNELS,
  ...SONG_CHANNELS,
  ...EDITOR_CHANNELS,
  ...WINDOW_CHANNELS,
  ...CANVAS_CHANNELS,
  ...LIBRARY_CHANNELS,
  ...WEB_SERVER_CHANNELS,
  ...SETTINGS_CHANNELS,
  ...QUEUE_CHANNELS,
  ...EFFECT_CHANNELS,
  ...ADMIN_CHANNELS,
  ...RENDERER_CHANNELS,
  ...SHELL_CHANNELS,
};

// ============================================================================
// CHANNEL GROUPS (for handler organization)
// ============================================================================

export const CHANNEL_GROUPS = {
  APP: Object.values(APP_CHANNELS),
  FILE: Object.values(FILE_CHANNELS),
  AUDIO: Object.values(AUDIO_CHANNELS),
  MIXER: Object.values(MIXER_CHANNELS),
  PLAYER: Object.values(PLAYER_CHANNELS),
  AUTOTUNE: Object.values(AUTOTUNE_CHANNELS),
  SONG: Object.values(SONG_CHANNELS),
  EDITOR: Object.values(EDITOR_CHANNELS),
  WINDOW: Object.values(WINDOW_CHANNELS),
  CANVAS: Object.values(CANVAS_CHANNELS),
  LIBRARY: Object.values(LIBRARY_CHANNELS),
  WEB_SERVER: Object.values(WEB_SERVER_CHANNELS),
  SETTINGS: Object.values(SETTINGS_CHANNELS),
  QUEUE: Object.values(QUEUE_CHANNELS),
  EFFECT: Object.values(EFFECT_CHANNELS),
  ADMIN: Object.values(ADMIN_CHANNELS),
  RENDERER: Object.values(RENDERER_CHANNELS),
  SHELL: Object.values(SHELL_CHANNELS),
};

/**
 * Renderer IPC Handlers
 * Handles renderer process state updates (playback, mixer, effects)
 */

import { ipcMain } from 'electron';

/**
 * Register all renderer state update IPC handlers
 * @param {Object} mainApp - Main application instance
 */
export function registerRendererHandlers(mainApp) {
  // Renderer playback state updates (legacy - keeping for compatibility)
  ipcMain.on('renderer:playbackState', (event, state) => {
    // Store the renderer playback state for position broadcasting
    mainApp.rendererPlaybackState = state;

    // Broadcast to web admin clients for real-time position updates
    if (mainApp.webServer) {
      mainApp.webServer.broadcastPlaybackState(state);
    }
  });

  // Renderer state updates to AppState
  ipcMain.on('renderer:updatePlaybackState', (event, updates) => {
    mainApp.appState.updatePlaybackState(updates);

    // Also broadcast immediately to web admin for responsive updates
    if (mainApp.webServer && updates) {
      // Broadcast the updates directly - they already contain position/duration
      mainApp.webServer.broadcastPlaybackState(updates);
    }
  });

  // Renderer song loaded event
  ipcMain.on('renderer:songLoaded', (event, songData) => {
    // Preserve queueItemId and format if they exist in current song (renderer doesn't know about them)
    const existingQueueItemId = mainApp.appState.state.currentSong?.queueItemId;
    const existingFormat = mainApp.appState.state.currentSong?.format;
    const updatedSongData = {
      ...songData,
      queueItemId: existingQueueItemId || songData.queueItemId || null,
      format: existingFormat || songData.format || 'kai',
    };

    mainApp.appState.setCurrentSong(updatedSongData);
    // Also update legacy currentSong for compatibility
    mainApp.currentSong = {
      metadata: songData,
      filePath: songData.path,
    };
  });

  // Renderer mixer state updates
  ipcMain.on('renderer:updateMixerState', (event, mixerState) => {
    mainApp.appState.updateMixerState(mixerState);
  });

  // Renderer effects state updates
  ipcMain.on('renderer:updateEffectsState', (event, effectsState) => {
    mainApp.appState.updateEffectsState(effectsState);
  });
}

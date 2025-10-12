/**
 * App IPC Handlers
 * Handles miscellaneous application operations (app info, song, shell, library, settings)
 */

import { ipcMain, app, shell } from 'electron';
import * as libraryService from '../../shared/services/libraryService.js';

/**
 * Register all app-related IPC handlers
 * @param {Object} mainApp - Main application instance
 */
export function registerAppHandlers(mainApp) {
  // Get application version
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  // Get current app state snapshot
  ipcMain.handle('app:getState', () => {
    return mainApp.appState.getSnapshot();
  });

  // Get currently loaded song
  ipcMain.handle('song:getCurrentSong', () => {
    if (mainApp.currentSong && mainApp.currentSong.metadata) {
      return {
        path: mainApp.currentSong.metadata.path || mainApp.currentSong.filePath,
        title: mainApp.currentSong.metadata.title,
        artist: mainApp.currentSong.metadata.artist,
      };
    }
    return null;
  });

  // Open external URL in default browser
  ipcMain.handle('shell:openExternal', async (event, url) => {
    await shell.openExternal(url);
  });

  // Search library for songs
  ipcMain.handle('library:search', (event, query) => {
    return libraryService.searchSongs(mainApp, query);
  });
}

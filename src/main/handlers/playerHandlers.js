/**
 * Player IPC Handlers
 * Handles playback control operations
 */

import { ipcMain } from 'electron';
import { PLAYER_CHANNELS } from '../../shared/ipcContracts.js';
import * as playerService from '../../shared/services/playerService.js';

/**
 * Register all player-related IPC handlers
 * @param {Object} mainApp - Main application instance
 */
export function registerPlayerHandlers(mainApp) {
  // Play
  ipcMain.handle(PLAYER_CHANNELS.PLAY, () => {
    return playerService.play(mainApp);
  });

  // Pause
  ipcMain.handle(PLAYER_CHANNELS.PAUSE, () => {
    return playerService.pause(mainApp);
  });

  // Seek
  ipcMain.handle(PLAYER_CHANNELS.SEEK, (event, positionSec) => {
    return playerService.seek(mainApp, positionSec);
  });
}

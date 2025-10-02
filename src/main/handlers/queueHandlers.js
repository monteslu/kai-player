/**
 * Queue IPC Handlers
 * Handles song queue management operations
 */

import { ipcMain } from 'electron';
import { QUEUE_CHANNELS } from '../../shared/ipcContracts.js';
import * as queueService from '../../shared/services/queueService.js';

/**
 * Register all queue-related IPC handlers
 * @param {Object} mainApp - Main application instance
 */
export function registerQueueHandlers(mainApp) {
  // Add song to queue
  ipcMain.handle(QUEUE_CHANNELS.ADD_SONG, (event, queueItem) => {
    return queueService.addSongToQueue(mainApp, queueItem);
  });

  // Remove song from queue
  ipcMain.handle(QUEUE_CHANNELS.REMOVE_SONG, (event, itemId) => {
    return queueService.removeSongFromQueue(mainApp, itemId);
  });

  // Get queue
  ipcMain.handle(QUEUE_CHANNELS.GET, () => {
    return queueService.getQueue(mainApp);
  });

  // Clear queue
  ipcMain.handle(QUEUE_CHANNELS.CLEAR, () => {
    return queueService.clearQueue(mainApp);
  });
}

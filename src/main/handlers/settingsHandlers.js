/**
 * Settings IPC Handlers
 * Handles application settings persistence
 */

import { ipcMain } from 'electron';
import { SETTINGS_CHANNELS } from '../../shared/ipcContracts.js';

/**
 * Register all settings-related IPC handlers
 * @param {Object} mainApp - Main application instance
 */
export function registerSettingsHandlers(mainApp) {
  // Get setting
  ipcMain.handle(SETTINGS_CHANNELS.GET, (event, key, defaultValue) => {
    // Return value directly for backward compatibility
    return mainApp.settings.get(key, defaultValue);
  });

  // Set setting - remains in main.js due to web socket broadcast logic

  // Get all settings
  ipcMain.handle(SETTINGS_CHANNELS.GET_ALL, () => {
    // Return settings directly for backward compatibility
    return mainApp.settings.store;
  });

  // Update batch
  ipcMain.handle(SETTINGS_CHANNELS.UPDATE_BATCH, (event, updates) => {
    try {
      for (const [key, value] of Object.entries(updates)) {
        mainApp.settings.set(key, value);
      }

      // Notify all windows
      if (mainApp.mainWindow) {
        mainApp.mainWindow.webContents.send(SETTINGS_CHANNELS.UPDATE, updates);
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating batch settings:', error);
      return { success: false, error: error.message };
    }
  });
}

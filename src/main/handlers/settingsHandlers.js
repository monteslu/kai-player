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
  console.log('📡 Registering settings handlers...');

  // Get setting
  ipcMain.handle(SETTINGS_CHANNELS.GET, (event, key, defaultValue) => {
    console.log(`🔍 settings:get called for key: ${key}`);
    const value = mainApp.settings.get(key, defaultValue);
    return value;
  });

  // Set setting (includes web socket broadcast logic)
  ipcMain.handle(SETTINGS_CHANNELS.SET, (event, key, value) => {
    mainApp.settings.set(key, value);

    // Update AppState for device preferences
    if (key === 'devicePreferences') {
      mainApp.appState.setAudioDevices(value);
    }

    // Broadcast settings changes to web admin clients AND renderer
    if (key === 'waveformPreferences') {
      // Broadcast to renderer
      if (mainApp.mainWindow) {
        mainApp.mainWindow.webContents.send('waveform:settingsChanged', value);
      }

      // Broadcast to web admin
      if (mainApp.webServer && mainApp.webServer.io) {
        mainApp.webServer.io.to('admin-clients').emit('settings:waveform', value);

        // If disabled effects changed, also emit effects update
        if (value.disabledEffects !== undefined) {
          mainApp.webServer.io.emit('effects-update', {
            disabled: value.disabledEffects,
          });
        }
      }
    } else if (key === 'autoTunePreferences') {
      // Broadcast to renderer
      if (mainApp.mainWindow) {
        mainApp.mainWindow.webContents.send('autotune:settingsChanged', value);
      }

      // Broadcast to web admin
      if (mainApp.webServer && mainApp.webServer.io) {
        mainApp.webServer.io.to('admin-clients').emit('settings:autotune', value);
      }
    }

    return { success: true };
  });

  // Get all settings
  ipcMain.handle(SETTINGS_CHANNELS.GET_ALL, () => {
    // Return settings directly for backward compatibility
    return mainApp.settings.settings;
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

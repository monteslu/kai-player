/**
 * Audio IPC Handlers
 * Handles all audio device enumeration and routing
 */

import { ipcMain } from 'electron';
import { AUDIO_CHANNELS } from '../../shared/ipcContracts.js';

/**
 * Register all audio-related IPC handlers
 * @param {Object} mainApp - Main application instance
 */
export function registerAudioHandlers(mainApp) {
  // Get audio devices
  ipcMain.handle(AUDIO_CHANNELS.GET_DEVICES, () => {
    return mainApp.audioEngine ? mainApp.audioEngine.getDevices() : [];
  });

  // Enumerate audio devices
  ipcMain.handle(AUDIO_CHANNELS.ENUMERATE_DEVICES, async () => {
    // This will be called from renderer to get real device list
    return [];
  });

  // Set audio device
  ipcMain.handle(AUDIO_CHANNELS.SET_DEVICE, (event, deviceType, deviceId) => {
    console.log(`🎧 IPC: Setting ${deviceType} device to ${deviceId}`);
    if (mainApp.audioEngine) {
      return mainApp.audioEngine.setDevice(deviceType, deviceId);
    }
    return false;
  });
}

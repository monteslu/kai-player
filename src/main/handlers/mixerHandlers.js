/**
 * Mixer IPC Handlers
 * Handles all mixer control operations
 */

import { ipcMain } from 'electron';
import { MIXER_CHANNELS } from '../../shared/ipcContracts.js';
import * as mixerService from '../../shared/services/mixerService.js';

/**
 * Register all mixer-related IPC handlers
 * @param {Object} mainApp - Main application instance
 */
export function registerMixerHandlers(mainApp) {
  // Set master gain
  ipcMain.handle(MIXER_CHANNELS.SET_MASTER_GAIN, (event, bus, gainDb) => {
    return mixerService.setMasterGain(mainApp, bus, gainDb);
  });

  // Toggle master mute
  ipcMain.handle(MIXER_CHANNELS.TOGGLE_MASTER_MUTE, (event, bus) => {
    return mixerService.toggleMasterMute(mainApp, bus);
  });
}

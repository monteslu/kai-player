/**
 * IPC Handler Registration
 * Central registration point for all IPC handlers
 */

import { registerAudioHandlers } from './audioHandlers.js';
import { registerMixerHandlers } from './mixerHandlers.js';
import { registerPlayerHandlers } from './playerHandlers.js';
import { registerLibraryHandlers } from './libraryHandlers.js';
import { registerSettingsHandlers } from './settingsHandlers.js';

/**
 * Register all IPC handlers
 * @param {Object} mainApp - Main application instance
 */
export function registerAllHandlers(mainApp) {
  console.log('📡 Registering IPC handlers...');

  registerAudioHandlers(mainApp);
  registerMixerHandlers(mainApp);
  registerPlayerHandlers(mainApp);
  registerLibraryHandlers(mainApp);
  registerSettingsHandlers(mainApp);
  // Note: Queue and Settings handlers remain in main.js for special logic

  console.log('✅ All IPC handlers registered');
}

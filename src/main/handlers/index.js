/**
 * IPC Handler Registration
 * Central registration point for all IPC handlers
 */

console.log('📦 Loading handler modules...');

import { registerAudioHandlers } from './audioHandlers.js';
console.log('✓ audioHandlers');
import { registerMixerHandlers } from './mixerHandlers.js';
console.log('✓ mixerHandlers');
import { registerPlayerHandlers } from './playerHandlers.js';
console.log('✓ playerHandlers');
import { registerLibraryHandlers } from './libraryHandlers.js';
console.log('✓ libraryHandlers');
import { registerSettingsHandlers } from './settingsHandlers.js';
console.log('✓ settingsHandlers');
import { registerQueueHandlers } from './queueHandlers.js';
console.log('✓ queueHandlers');
import { registerWebServerHandlers } from './webServerHandlers.js';
console.log('✓ webServerHandlers');
import { registerCanvasHandlers } from './canvasHandlers.js';
console.log('✓ canvasHandlers');
import { registerEffectsHandlers } from './effectsHandlers.js';
console.log('✓ effectsHandlers');
import { registerEditorHandlers } from './editorHandlers.js';
console.log('✓ editorHandlers');
import { registerPreferencesHandlers } from './preferencesHandlers.js';
console.log('✓ preferencesHandlers');
import { registerFileHandlers } from './fileHandlers.js';
console.log('✓ fileHandlers');
import { registerRendererHandlers } from './rendererHandlers.js';
console.log('✓ rendererHandlers');
import { registerAppHandlers } from './appHandlers.js';
console.log('✓ appHandlers');
import { registerAutotuneHandlers } from './autotuneHandlers.js';
console.log('✓ autotuneHandlers');
import { registerCreatorHandlers } from './creatorHandlers.js';
console.log('✓ creatorHandlers');

/**
 * Register all IPC handlers
 * @param {Object} mainApp - Main application instance
 */
export function registerAllHandlers(mainApp) {
  console.log('📡 Registering IPC handlers...');

  try {
    // Core handlers
    registerAudioHandlers(mainApp);
    registerMixerHandlers(mainApp);
    registerPlayerHandlers(mainApp);
    registerLibraryHandlers(mainApp);
    registerSettingsHandlers(mainApp);
    registerQueueHandlers(mainApp);

    // Feature handlers
    registerWebServerHandlers(mainApp);
    registerCanvasHandlers(mainApp);
    registerEffectsHandlers(mainApp);
    registerEditorHandlers(mainApp);
    registerPreferencesHandlers(mainApp);
    registerAutotuneHandlers(mainApp);

    // System handlers
    registerFileHandlers(mainApp);
    registerRendererHandlers(mainApp);
    registerAppHandlers(mainApp);

    // Creator handlers
    registerCreatorHandlers(mainApp);

    console.log('✅ All IPC handlers registered');
  } catch (error) {
    console.error('❌ Failed to register IPC handlers:', error);
    throw error;
  }
}

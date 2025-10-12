/**
 * Mixer Service - Shared business logic for mixer control
 *
 * Used by both IPC handlers (Electron) and REST endpoints (Web Server)
 * to ensure consistent mixer control across all interfaces.
 */

/**
 * Get current mixer state
 * @param {Object} appState - Application state instance
 * @returns {Object} Result with success status and mixer state
 */
export function getMixerState(appState) {
  try {
    const state = appState.getSnapshot();
    return {
      success: true,
      mixer: state.mixer,
    };
  } catch (error) {
    console.error('Error getting mixer state:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Set master gain for a bus
 * @param {Object} mainApp - Main application instance
 * @param {string} bus - Bus name (PA, IEM, or mic)
 * @param {number} gainDb - Gain in dB
 * @returns {Object} Result with success status
 */
export function setMasterGain(mainApp, bus, gainDb) {
  try {
    if (!bus || typeof gainDb !== 'number') {
      return {
        success: false,
        error: 'bus (PA/IEM/mic) and gainDb required',
      };
    }

    // Update AppState immediately
    const currentMixer = mainApp.appState.state.mixer;
    if (currentMixer[bus]) {
      // Create a new mixer state object with the updated bus
      const updatedMixer = {
        ...currentMixer,
        [bus]: {
          ...currentMixer[bus],
          gain: gainDb,
        },
      };
      mainApp.appState.updateMixerState(updatedMixer);
    }

    // Send to renderer to apply audio changes
    mainApp.sendToRenderer('mixer:setMasterGain', { bus, gainDb });

    return {
      success: true,
      bus,
      gainDb,
    };
  } catch (error) {
    console.error('Error setting master gain:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Toggle master mute for a bus
 * @param {Object} mainApp - Main application instance
 * @param {string} bus - Bus name (PA, IEM, or mic)
 * @returns {Object} Result with success status and new muted state
 */
export function toggleMasterMute(mainApp, bus) {
  try {
    if (!bus) {
      return {
        success: false,
        error: 'bus (PA/IEM/mic) required',
      };
    }

    // Update AppState immediately (toggle mute)
    const currentMixer = mainApp.appState.state.mixer;
    let newMuted = false;

    if (currentMixer[bus]) {
      const oldMuted = currentMixer[bus].muted;
      newMuted = !oldMuted;

      // Create a new mixer state object with the updated bus
      const updatedMixer = {
        ...currentMixer,
        [bus]: {
          ...currentMixer[bus],
          muted: newMuted,
        },
      };
      mainApp.appState.updateMixerState(updatedMixer);
    }

    // Send to renderer to apply audio changes
    mainApp.sendToRenderer('mixer:toggleMasterMute', { bus, muted: newMuted });

    return {
      success: true,
      bus,
      muted: newMuted,
    };
  } catch (error) {
    console.error('Error toggling master mute:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Set master mute for a bus (explicit mute/unmute)
 * @param {Object} mainApp - Main application instance
 * @param {string} bus - Bus name (PA, IEM, or mic)
 * @param {boolean} muted - Whether the bus should be muted
 * @returns {Object} Result with success status
 */
export function setMasterMute(mainApp, bus, muted) {
  try {
    if (!bus || typeof muted !== 'boolean') {
      return {
        success: false,
        error: 'bus (PA/IEM/mic) and muted status required',
      };
    }

    // Update AppState immediately
    const currentMixer = mainApp.appState.state.mixer;
    if (currentMixer[bus]) {
      // Create a new mixer state object with the updated bus
      const updatedMixer = {
        ...currentMixer,
        [bus]: {
          ...currentMixer[bus],
          muted,
        },
      };
      mainApp.appState.updateMixerState(updatedMixer);
    }

    // Send to renderer to apply audio changes
    mainApp.sendToRenderer('mixer:setMasterMute', { bus, muted });

    return {
      success: true,
      bus,
      muted,
    };
  } catch (error) {
    console.error('Error setting master mute:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

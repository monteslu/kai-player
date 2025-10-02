/**
 * Effects Service - Shared business logic for effects management
 *
 * Used by both IPC handlers (Electron) and REST endpoints (Web Server)
 * to ensure consistent effects control across all interfaces.
 */

/**
 * Get effects list and current state
 * @param {Object} mainApp - Main application instance
 * @returns {Promise<Object>} Result with success status, effects list, current effect, and disabled effects
 */
export async function getEffects(mainApp) {
  try {
    // Get effects list from renderer
    const effects = await mainApp.getEffectsList?.() || [];

    // Get current effect from AppState
    const state = mainApp.appState.getSnapshot();
    const currentEffect = state.effects?.current || null;

    // Get disabled effects from settings
    const waveformPrefs = mainApp.settings.get('waveformPreferences', {});
    const disabledEffects = waveformPrefs.disabledEffects || [];

    return {
      success: true,
      effects,
      currentEffect,
      disabledEffects
    };
  } catch (error) {
    console.error('Error getting effects:', error);
    return {
      success: false,
      error: error.message,
      effects: [],
      currentEffect: null,
      disabledEffects: []
    };
  }
}

/**
 * Set current effect
 * @param {Object} mainApp - Main application instance
 * @param {string} effectName - Name of effect to set
 * @returns {Promise<Object>} Result with success status
 */
export async function setEffect(mainApp, effectName) {
  try {
    if (!effectName) {
      return {
        success: false,
        error: 'Effect name is required'
      };
    }

    // Update AppState
    mainApp.appState.updateEffectsState({ current: effectName });

    // Send to renderer
    await mainApp.sendToRendererAndWait('effects:set', { effectName }, 2000);

    return {
      success: true,
      effectName
    };
  } catch (error) {
    console.error('Error setting effect:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Select an effect (legacy method - calls setEffect)
 * @param {Object} mainApp - Main application instance
 * @param {string} effectName - Name of effect to select
 * @returns {Promise<Object>} Result with success status
 */
export async function selectEffect(mainApp, effectName) {
  try {
    if (!effectName) {
      return {
        success: false,
        error: 'Effect name is required'
      };
    }

    await mainApp.selectEffect?.(effectName);

    return {
      success: true,
      message: `Selected effect: ${effectName}`
    };
  } catch (error) {
    console.error('Error selecting effect:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Toggle effect enabled/disabled
 * @param {Object} mainApp - Main application instance
 * @param {string} effectName - Name of effect to toggle
 * @param {boolean} enabled - Whether effect should be enabled
 * @returns {Promise<Object>} Result with success status
 */
export async function toggleEffect(mainApp, effectName, enabled) {
  try {
    if (!effectName || typeof enabled !== 'boolean') {
      return {
        success: false,
        error: 'Effect name and enabled status required'
      };
    }

    await mainApp.toggleEffect?.(effectName, enabled);

    return {
      success: true,
      message: `Effect ${effectName} ${enabled ? 'enabled' : 'disabled'}`
    };
  } catch (error) {
    console.error('Error toggling effect:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Cycle to next effect
 * @param {Object} mainApp - Main application instance
 * @returns {Object} Result with success status
 */
export function nextEffect(mainApp) {
  try {
    mainApp.sendToRenderer('effects:next');
    return { success: true };
  } catch (error) {
    console.error('Error changing to next effect:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Cycle to previous effect
 * @param {Object} mainApp - Main application instance
 * @returns {Object} Result with success status
 */
export function previousEffect(mainApp) {
  try {
    mainApp.sendToRenderer('effects:previous');
    return { success: true };
  } catch (error) {
    console.error('Error changing to previous effect:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Select random effect
 * @param {Object} mainApp - Main application instance
 * @returns {Object} Result with success status
 */
export function randomEffect(mainApp) {
  try {
    mainApp.sendToRenderer('effects:random');
    return { success: true };
  } catch (error) {
    console.error('Error selecting random effect:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Disable an effect permanently
 * @param {Object} mainApp - Main application instance
 * @param {string} effectName - Name of effect to disable
 * @returns {Promise<Object>} Result with success status and updated disabled list
 */
export async function disableEffect(mainApp, effectName) {
  try {
    if (!effectName) {
      return {
        success: false,
        error: 'Effect name is required'
      };
    }

    // Get current waveformPreferences from settings
    const waveformPrefs = mainApp.settings.get('waveformPreferences', {});
    const disabled = [...(waveformPrefs.disabledEffects || [])];

    if (!disabled.includes(effectName)) {
      disabled.push(effectName);
      waveformPrefs.disabledEffects = disabled;
      mainApp.settings.set('waveformPreferences', waveformPrefs);
      await mainApp.settings.save();

      // Notify renderer to update its disabled effects list
      mainApp.sendToRenderer('effects:disable', effectName);
    }

    return {
      success: true,
      disabled
    };
  } catch (error) {
    console.error('Error disabling effect:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Enable a previously disabled effect
 * @param {Object} mainApp - Main application instance
 * @param {string} effectName - Name of effect to enable
 * @returns {Promise<Object>} Result with success status and updated disabled list
 */
export async function enableEffect(mainApp, effectName) {
  try {
    if (!effectName) {
      return {
        success: false,
        error: 'Effect name is required'
      };
    }

    // Get current waveformPreferences from settings
    const waveformPrefs = mainApp.settings.get('waveformPreferences', {});
    const disabled = (waveformPrefs.disabledEffects || []).filter(e => e !== effectName);
    waveformPrefs.disabledEffects = disabled;
    mainApp.settings.set('waveformPreferences', waveformPrefs);
    await mainApp.settings.save();

    // Notify renderer to update its disabled effects list
    mainApp.sendToRenderer('effects:enable', effectName);

    return {
      success: true,
      disabled
    };
  } catch (error) {
    console.error('Error enabling effect:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

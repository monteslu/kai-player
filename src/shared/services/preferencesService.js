/**
 * Preferences Service - Shared business logic for runtime preferences
 *
 * Used by both IPC handlers (Electron) and REST endpoints (Web Server)
 * to ensure consistent preference management across all interfaces.
 *
 * Note: This handles runtime preferences in AppState.
 * For persistent settings (SettingsManager), use direct settings.get/set calls.
 */

/**
 * Get all current preferences from AppState
 * @param {Object} appState - Application state instance
 * @returns {Object} Result with success status and preferences
 */
export function getPreferences(appState) {
  try {
    const state = appState.getSnapshot();
    return {
      success: true,
      preferences: state.preferences
    };
  } catch (error) {
    console.error('Error getting preferences:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update auto-tune preferences
 * @param {Object} appState - Application state instance
 * @param {Object} updates - Auto-tune preference updates
 * @returns {Object} Result with success status and updated preferences
 */
export function updateAutoTunePreferences(appState, updates) {
  try {
    const validUpdates = {};

    if (typeof updates.enabled === 'boolean') validUpdates.enabled = updates.enabled;
    if (typeof updates.strength === 'number') validUpdates.strength = updates.strength;
    if (typeof updates.speed === 'number') validUpdates.speed = updates.speed;

    appState.setAutoTunePreferences(validUpdates);

    return {
      success: true,
      autoTune: appState.state.preferences.autoTune
    };
  } catch (error) {
    console.error('Error updating autotune preferences:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update microphone preferences
 * @param {Object} appState - Application state instance
 * @param {Object} updates - Microphone preference updates
 * @returns {Object} Result with success status and updated preferences
 */
export function updateMicrophonePreferences(appState, updates) {
  try {
    const validUpdates = {};

    if (typeof updates.enabled === 'boolean') validUpdates.enabled = updates.enabled;
    if (typeof updates.gain === 'number') validUpdates.gain = updates.gain;
    if (typeof updates.toSpeakers === 'boolean') validUpdates.toSpeakers = updates.toSpeakers;

    appState.setMicrophonePreferences(validUpdates);

    return {
      success: true,
      microphone: appState.state.preferences.microphone
    };
  } catch (error) {
    console.error('Error updating microphone preferences:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update effects preferences
 * @param {Object} appState - Application state instance
 * @param {Object} updates - Effects preference updates
 * @returns {Object} Result with success status and updated effects state
 */
export function updateEffectsPreferences(appState, updates) {
  try {
    const validUpdates = {};

    if (typeof updates.enableWaveforms === 'boolean') validUpdates.enableWaveforms = updates.enableWaveforms;
    if (typeof updates.enableEffects === 'boolean') validUpdates.enableEffects = updates.enableEffects;
    if (typeof updates.randomEffectOnSong === 'boolean') validUpdates.randomEffectOnSong = updates.randomEffectOnSong;
    if (typeof updates.overlayOpacity === 'number') validUpdates.overlayOpacity = updates.overlayOpacity;
    if (typeof updates.showUpcomingLyrics === 'boolean') validUpdates.showUpcomingLyrics = updates.showUpcomingLyrics;

    appState.updateEffectsState(validUpdates);

    return {
      success: true,
      effects: appState.state.effects
    };
  } catch (error) {
    console.error('Error updating effects preferences:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get waveform settings from persistent storage
 * @param {Object} settings - Settings manager instance
 * @returns {Object} Result with success status and settings
 */
export function getWaveformSettings(settings) {
  try {
    const waveformPrefs = settings.get('waveformPreferences', {});
    return {
      success: true,
      settings: waveformPrefs
    };
  } catch (error) {
    console.error('Error fetching waveform settings:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update waveform settings in persistent storage
 * @param {Object} settings - Settings manager instance
 * @param {Object} updates - Waveform setting updates
 * @returns {Promise<Object>} Result with success status and updated settings
 */
export async function updateWaveformSettings(settings, updates) {
  try {
    const waveformPrefs = settings.get('waveformPreferences', {});
    const updated = { ...waveformPrefs, ...updates };
    settings.set('waveformPreferences', updated);
    await settings.save();

    return {
      success: true,
      settings: updated
    };
  } catch (error) {
    console.error('Error updating waveform settings:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get auto-tune settings from persistent storage
 * @param {Object} settings - Settings manager instance
 * @returns {Object} Result with success status and settings
 */
export function getAutoTuneSettings(settings) {
  try {
    const autotunePrefs = settings.get('autoTunePreferences', {});
    return {
      success: true,
      settings: autotunePrefs
    };
  } catch (error) {
    console.error('Error fetching autotune settings:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update auto-tune settings in persistent storage
 * @param {Object} settings - Settings manager instance
 * @param {Object} updates - Auto-tune setting updates
 * @returns {Promise<Object>} Result with success status and updated settings
 */
export async function updateAutoTuneSettings(settings, updates) {
  try {
    const autotunePrefs = settings.get('autoTunePreferences', {});
    const updated = { ...autotunePrefs, ...updates };
    settings.set('autoTunePreferences', updated);
    await settings.save();

    return {
      success: true,
      settings: updated
    };
  } catch (error) {
    console.error('Error updating autotune settings:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

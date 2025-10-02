/**
 * Server Settings Service - Shared business logic for web server settings management
 *
 * Used by both IPC handlers (Electron) and REST endpoints (Web Server)
 * to ensure consistent server settings handling across all interfaces.
 */

/**
 * Get current server settings
 * @param {Object} webServer - Web server instance
 * @returns {Object} Result with success status and settings
 */
export function getServerSettings(webServer) {
  try {
    return {
      success: true,
      settings: webServer.settings
    };
  } catch (error) {
    console.error('Error getting server settings:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update server settings
 * @param {Object} webServer - Web server instance
 * @param {Object} newSettings - New settings to apply (partial update)
 * @returns {Object} Result with success status and updated settings
 */
export function updateServerSettings(webServer, newSettings) {
  try {
    // Merge new settings with existing ones
    webServer.settings = { ...webServer.settings, ...newSettings };

    // Save to persistent storage
    saveSettings(webServer);

    // Broadcast changes to all connected clients
    broadcastSettingsChange(webServer, webServer.settings);

    return {
      success: true,
      settings: webServer.settings
    };
  } catch (error) {
    console.error('Error updating server settings:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Load server settings from persistent storage
 * @param {Object} webServer - Web server instance
 * @returns {Object} Loaded settings
 */
export function loadSettings(webServer) {
  try {
    const savedSettings = {};

    if (webServer.mainApp && webServer.mainApp.settings) {
      savedSettings.serverName = webServer.mainApp.settings.get('server.serverName', webServer.defaultSettings.serverName);
      savedSettings.allowSongRequests = webServer.mainApp.settings.get('server.allowSongRequests', webServer.defaultSettings.allowSongRequests);
      savedSettings.requireKJApproval = webServer.mainApp.settings.get('server.requireKJApproval', webServer.defaultSettings.requireKJApproval);
      savedSettings.maxRequestsPerIP = webServer.mainApp.settings.get('server.maxRequestsPerIP', webServer.defaultSettings.maxRequestsPerIP);
    }

    const finalSettings = { ...webServer.defaultSettings, ...savedSettings };
    console.log('🔧 Final loaded settings:', finalSettings);
    return finalSettings;
  } catch (error) {
    console.error('Error loading settings:', error);
    return { ...webServer.defaultSettings };
  }
}

/**
 * Save server settings to persistent storage
 * @param {Object} webServer - Web server instance
 * @returns {boolean} Success status
 */
export function saveSettings(webServer) {
  try {
    if (webServer.mainApp && webServer.mainApp.settings) {
      console.log('🔧 Saving server settings:', webServer.settings);
      webServer.mainApp.settings.set('server.serverName', webServer.settings.serverName);
      webServer.mainApp.settings.set('server.allowSongRequests', webServer.settings.allowSongRequests);
      webServer.mainApp.settings.set('server.requireKJApproval', webServer.settings.requireKJApproval);
      webServer.mainApp.settings.set('server.maxRequestsPerIP', webServer.settings.maxRequestsPerIP);
      console.log('🔧 Server settings saved to persistent storage');
      return true;
    } else {
      console.error('🚨 Cannot save settings: mainApp or settings manager not available');
      return false;
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
}

/**
 * Broadcast settings changes to connected clients via Socket.IO
 * @param {Object} webServer - Web server instance
 * @param {Object} settings - Settings to broadcast
 */
export function broadcastSettingsChange(webServer, settings) {
  if (webServer.io) {
    // Broadcast to admin clients and electron apps
    webServer.io.to('admin-clients').emit('settings-update', settings);
    webServer.io.to('electron-apps').emit('settings-update', settings);
    console.log('📡 Settings changes broadcasted to clients');
  }
}

/**
 * Web Server IPC Handlers
 * Handles all web server management operations
 */

import { ipcMain } from 'electron';
import bcrypt from 'bcrypt';
import * as serverSettingsService from '../../shared/services/serverSettingsService.js';
import * as requestsService from '../../shared/services/requestsService.js';

/**
 * Register all web server-related IPC handlers
 * @param {Object} mainApp - Main application instance
 */
export function registerWebServerHandlers(mainApp) {
  console.log('📡 Registering web server handlers...');

  // Get web server port
  ipcMain.handle('webServer:getPort', () => {
    return mainApp.getWebServerPort();
  });

  // Get web server URL
  ipcMain.handle('webServer:getUrl', () => {
    console.log('🔍 webServer:getUrl called', { hasWebServer: Boolean(mainApp.webServer) });
    return mainApp.webServer?.getServerUrl() || null;
  });

  // Get web server settings
  ipcMain.handle('webServer:getSettings', () => {
    if (mainApp.webServer) {
      const result = serverSettingsService.getServerSettings(mainApp.webServer);
      return result.success ? result.settings : null;
    }
    return null;
  });

  // Update web server settings
  ipcMain.handle('webServer:updateSettings', (event, settings) => {
    if (mainApp.webServer) {
      return serverSettingsService.updateServerSettings(mainApp.webServer, settings);
    }
    return { success: false, error: 'Web server not available' };
  });

  // Get song requests
  ipcMain.handle('webServer:getSongRequests', () => {
    if (mainApp.webServer) {
      const result = requestsService.getRequests(mainApp.webServer);
      return result.success ? result.requests : [];
    }
    return [];
  });

  // Approve song request
  ipcMain.handle('webServer:approveRequest', async (event, requestId) => {
    if (mainApp.webServer) {
      return await requestsService.approveRequest(mainApp.webServer, requestId);
    }
    return { success: false, error: 'Web server not available' };
  });

  // Reject song request
  ipcMain.handle('webServer:rejectRequest', async (event, requestId) => {
    if (mainApp.webServer) {
      return await requestsService.rejectRequest(mainApp.webServer, requestId);
    }
    return { success: false, error: 'Web server not available' };
  });

  // Refresh web server songs cache
  ipcMain.handle('webServer:refreshCache', async () => {
    try {
      if (mainApp.webServer) {
        await mainApp.webServer.refreshSongsCache();
        return { success: true };
      } else {
        return { error: 'Web server not available' };
      }
    } catch (error) {
      return { error: error.message };
    }
  });

  // Set admin password (hashed with bcrypt)
  ipcMain.handle('webServer:setAdminPassword', async (event, password) => {
    try {
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      await mainApp.settings.set('server.adminPasswordHash', hashedPassword);
      return { success: true };
    } catch (error) {
      console.error('Failed to set admin password:', error);
      return { success: false, error: error.message };
    }
  });

  // Clear all song requests
  ipcMain.handle('webServer:clearAllRequests', () => {
    if (mainApp.webServer) {
      return requestsService.clearRequests(mainApp.webServer);
    }
    return { success: false, error: 'Web server not available' };
  });
}

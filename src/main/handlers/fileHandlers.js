/**
 * File IPC Handlers
 * Handles file operations like open dialogs and file loading
 */

import { ipcMain, dialog } from 'electron';

/**
 * Register all file-related IPC handlers
 * @param {Object} mainApp - Main application instance
 */
export function registerFileHandlers(mainApp) {
  // Open file dialog to select KAI file
  ipcMain.handle('file:openKai', async () => {
    const result = await dialog.showOpenDialog(mainApp.mainWindow, {
      filters: [{ name: 'KAI Files', extensions: ['kai'] }],
      properties: ['openFile'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return await mainApp.loadKaiFile(result.filePaths[0]);
    }
    return null;
  });

  // Load KAI file from path
  ipcMain.handle('file:loadKaiFromPath', async (event, filePath) => {
    return await mainApp.loadKaiFile(filePath);
  });
}

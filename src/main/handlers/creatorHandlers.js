/**
 * Creator IPC Handlers
 * Handles AI tool installation and karaoke file creation
 *
 * Uses shared creatorService for logic - same service is used by HTTP routes
 */

import { ipcMain, dialog } from 'electron';
import { CREATOR_CHANNELS } from '../../shared/ipcContracts.js';
import * as creatorService from '../../shared/services/creatorService.js';

/**
 * Register all creator-related IPC handlers
 * @param {Object} mainApp - Main application instance
 */
export function registerCreatorHandlers(mainApp) {
  // Check all components
  ipcMain.handle(CREATOR_CHANNELS.CHECK_COMPONENTS, async () => {
    return creatorService.checkComponents();
  });

  // Get installation status
  ipcMain.handle(CREATOR_CHANNELS.GET_STATUS, () => {
    return creatorService.getStatus();
  });

  // Install components
  ipcMain.handle(CREATOR_CHANNELS.INSTALL_COMPONENTS, async () => {
    const result = await creatorService.installComponents((progress) => {
      mainApp.sendToRenderer(CREATOR_CHANNELS.INSTALL_PROGRESS, progress);
    });

    if (!result.success) {
      mainApp.sendToRenderer(CREATOR_CHANNELS.INSTALL_ERROR, {
        error: result.error,
      });
    }

    return result;
  });

  // Cancel installation
  ipcMain.handle(CREATOR_CHANNELS.CANCEL_INSTALL, () => {
    return creatorService.cancelInstall();
  });

  // Search lyrics from LRCLIB
  ipcMain.handle(CREATOR_CHANNELS.SEARCH_LYRICS, async (_event, title, artist) => {
    return creatorService.findLyrics(title, artist);
  });

  // Prepare Whisper context with vocabulary hints
  ipcMain.handle(
    CREATOR_CHANNELS.PREPARE_WHISPER_CONTEXT,
    async (_event, title, artist, existingLyrics) => {
      return creatorService.getWhisperContext(title, artist, existingLyrics);
    }
  );

  // Select audio/video file (Electron-only - uses native dialog)
  ipcMain.handle(CREATOR_CHANNELS.SELECT_FILE, async () => {
    try {
      const result = await dialog.showOpenDialog(mainApp.mainWindow, {
        title: 'Select Audio or Video File',
        properties: ['openFile'],
        filters: [
          {
            name: 'Audio/Video Files',
            extensions: [
              'mp3',
              'wav',
              'flac',
              'ogg',
              'm4a',
              'aac',
              'mp4',
              'mkv',
              'avi',
              'mov',
              'webm',
            ],
          },
          { name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'] },
          { name: 'Video Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      // Use shared service to get file info
      return creatorService.getFileInfo(result.filePaths[0]);
    } catch (error) {
      console.error('File selection failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Start conversion
  ipcMain.handle(CREATOR_CHANNELS.START_CONVERSION, async (_event, options) => {
    const result = await creatorService.startConversion(options, (progress) => {
      mainApp.sendToRenderer(CREATOR_CHANNELS.CONVERSION_PROGRESS, progress);
    });

    if (result.success) {
      mainApp.sendToRenderer(CREATOR_CHANNELS.CONVERSION_COMPLETE, {
        outputPath: result.outputPath,
        duration: result.duration,
        stems: result.stems,
        hasLyrics: result.hasLyrics,
        hasPitch: result.hasPitch,
      });
    } else if (!result.cancelled) {
      mainApp.sendToRenderer(CREATOR_CHANNELS.CONVERSION_ERROR, {
        error: result.error,
      });
    }

    return result;
  });

  // Cancel conversion
  ipcMain.handle(CREATOR_CHANNELS.CANCEL_CONVERSION, () => {
    return creatorService.stopConversion();
  });

  console.log('✅ Creator handlers registered');
}

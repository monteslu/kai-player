/**
 * Canvas Window IPC Handlers
 * Handles canvas window management and WebRTC streaming operations
 */

import { ipcMain } from 'electron';

/**
 * Register all canvas-related IPC handlers
 * @param {Object} mainApp - Main application instance
 */
export function registerCanvasHandlers(mainApp) {
  // Open canvas window
  ipcMain.handle('window:openCanvas', () => {
    mainApp.createCanvasWindow();
    return { success: true };
  });

  // Start canvas streaming
  ipcMain.handle('canvas:startStreaming', () => {
    mainApp.startCanvasStreaming();
    return { success: true };
  });

  // Stop canvas streaming
  ipcMain.handle('canvas:stopStreaming', () => {
    mainApp.stopCanvasStreaming();
    return { success: true };
  });

  // Send image data to canvas window
  ipcMain.handle('canvas:sendImageData', (event, imageDataArray, width, height) => {
    if (mainApp.canvasWindow && !mainApp.canvasWindow.isDestroyed()) {
      mainApp.canvasWindow.webContents.send(
        'canvas:receiveImageData',
        imageDataArray,
        width,
        height
      );
    }
  });

  // Canvas window ready signal
  ipcMain.on('canvas:childReady', () => {
    console.log('Child window ready, starting canvas streaming');
    // Small delay to ensure everything is fully initialized
    setTimeout(() => {
      mainApp.startCanvasStreaming();
    }, 100);
  });

  // Relay ICE candidates between sender and receiver
  ipcMain.handle('canvas:sendICECandidate', (event, source, candidate) => {
    console.log('🧊 Relaying ICE candidate from', source);
    if (source === 'sender') {
      // Send to receiver via IPC
      if (mainApp.canvasWindow && !mainApp.canvasWindow.isDestroyed()) {
        mainApp.canvasWindow.webContents.send('webrtc:addReceiverICECandidate', candidate);
      }
    } else if (source === 'receiver') {
      // Send to sender via IPC
      if (mainApp.mainWindow && !mainApp.mainWindow.isDestroyed()) {
        mainApp.mainWindow.webContents.send('webrtc:addICECandidate', candidate);
      }
    }
  });

  // Toggle canvas window fullscreen
  ipcMain.handle('canvas:toggleFullscreen', (event, shouldBeFullscreen) => {
    if (mainApp.canvasWindow && !mainApp.canvasWindow.isDestroyed()) {
      console.log('🖥️ Toggling canvas window fullscreen:', shouldBeFullscreen);
      mainApp.canvasWindow.setFullScreen(shouldBeFullscreen);
      return { success: true, fullscreen: shouldBeFullscreen };
    }
    return { success: false, error: 'Canvas window not available' };
  });

  // Send frame to canvas window
  ipcMain.handle('canvas:sendFrame', (event, dataUrl) => {
    if (mainApp.canvasWindow && !mainApp.canvasWindow.isDestroyed()) {
      mainApp.canvasWindow.webContents.send('canvas:receiveFrame', dataUrl);
    }
  });
}

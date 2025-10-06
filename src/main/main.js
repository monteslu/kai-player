import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import yauzl from 'yauzl';
import { io } from 'socket.io-client';
import bcrypt from 'bcrypt';
import AudioEngine from './audioEngine.js';
import KaiLoader from '../utils/kaiLoader.js';
import CDGLoader from '../utils/cdgLoader.js';
import KaiWriter from '../utils/kaiWriter.js';
import SettingsManager from './settingsManager.js';
import WebServer from './webServer.js';
import AppState from './appState.js';
import StatePersistence from './statePersistence.js';
import * as queueService from '../shared/services/queueService.js';
import * as libraryService from '../shared/services/libraryService.js';
import * as playerService from '../shared/services/playerService.js';
import * as requestsService from '../shared/services/requestsService.js';
import * as serverSettingsService from '../shared/services/serverSettingsService.js';
import * as effectsService from '../shared/services/effectsService.js';
import { registerAllHandlers } from './handlers/index.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class KaiPlayerApp {
  constructor() {
    this.mainWindow = null;
    this.canvasWindow = null;
    this.audioEngine = null;
    this.currentSong = null;
    this.isDev = process.argv.includes('--dev');
    this.settings = new SettingsManager();
    this.webServer = null;
    this.socket = null;
    this.songQueue = [];
    this.positionTimer = null;
    this.libraryManager = null;
    this.cachedLibrary = null; // Store library cache independently
    this.canvasStreaming = {
      isStreaming: false,
      stream: null,
      reader: null,
      port: null,
      inflight: 0,
      MAX_INFLIGHT: 2
    };

    // Store renderer playback state for position broadcasting
    this.rendererPlaybackState = {
      isPlaying: false,
      currentTime: 0
    };

    // Canonical application state
    this.appState = new AppState();

    // State persistence
    this.statePersistence = new StatePersistence(this.appState);

    // Set up state change listeners
    this.setupStateListeners();
  }

  setupStateListeners() {
    // When playback state changes, broadcast to web clients AND renderer
    this.appState.on('playbackStateChanged', (playbackState, changes) => {
      if (this.webServer) {
        this.webServer.broadcastPlaybackState(playbackState);
      }
      // Send to renderer for React components
      this.sendToRenderer('playback:state', playbackState);
    });

    // When current song changes, broadcast to web clients AND renderer
    this.appState.on('currentSongChanged', (song) => {
      if (this.webServer && song) {
        // Pass the complete song object to preserve path and requester
        this.webServer.broadcastSongLoaded(song);
      }
      // Send to renderer for React components
      this.sendToRenderer('song:changed', song);
    });

    // When queue changes, broadcast to web clients and renderer
    this.appState.on('queueChanged', (queue) => {
      // Broadcast to web clients
      if (this.webServer) {
        this.webServer.io?.emit('queue-update', {
          queue,
          currentSong: this.appState.state.currentSong
        });
      }

      // Send to renderer
      this.sendToRenderer('queue:updated', queue);
    });

    // When mixer changes, broadcast to web clients AND renderer
    this.appState.on('mixerChanged', (mixer) => {
      if (this.webServer) {
        this.webServer.io?.emit('mixer-update', mixer);
      }
      // Send to renderer for React components
      this.sendToRenderer('mixer:state', mixer);
    });

    // When effects change, broadcast to web clients AND renderer
    this.appState.on('effectsChanged', (effects) => {
      // Get disabled effects from settings, not AppState
      const waveformPrefs = this.settings.get('waveformPreferences', {});
      const effectsWithCorrectDisabled = {
        ...effects,
        disabled: waveformPrefs.disabledEffects || []
      };

      if (this.webServer) {
        this.webServer.io?.emit('effects-update', effectsWithCorrectDisabled);
      }
      // Send to renderer for React components
      this.sendToRenderer('effects:changed', effectsWithCorrectDisabled);
    });

    // When preferences change, broadcast to web clients AND renderer
    this.appState.on('preferencesChanged', (preferences) => {
      if (this.webServer) {
        this.webServer.io?.emit('preferences-update', preferences);
      }

      // Send to renderer so it can sync
      this.sendToRenderer('preferences:updated', preferences);
    });
  }

  async initialize() {
    await app.whenReady();

    // Disable Electron's default error dialogs
    app.commandLine.appendSwitch('disable-dev-shm-usage');
    app.commandLine.appendSwitch('no-sandbox');

    await this.settings.load();

    // Load persisted state (queue, mixer, effects)
    await this.statePersistence.load();

    this.createMainWindow();
    this.createApplicationMenu();
    this.setupIPC();
    this.initializeAudioEngine();
    await this.initializeWebServer();

    // Start periodic state persistence
    this.statePersistence.startPeriodicSave();

    // Check if songs folder is set, prompt if not
    await this.checkSongsFolder();
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      icon: path.join(process.cwd(), 'static', 'images', 'logo.png'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        preload: path.join(__dirname, 'preload.js')
      },
      title: 'Loukai'
    });

    const rendererPath = path.join(__dirname, '../renderer/index.html');
    this.mainWindow.loadFile(rendererPath);
    
    // Set dock icon on macOS
    if (process.platform === 'darwin') {
      const iconPath = path.join(process.cwd(), 'static', 'images', 'logo.png');
      app.dock?.setIcon(iconPath);
    }

    // Handle renderer process errors without showing dialogs
    this.mainWindow.webContents.on('crashed', (event) => {
      console.error('🚨 Renderer process crashed:', event);
    });

    this.mainWindow.webContents.on('unresponsive', () => {
      console.error('🚨 Renderer process became unresponsive');
    });

    // Prevent JavaScript errors from showing as alert dialogs
    this.mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      if (level === 3) { // Error level
        console.error(`🚨 Renderer error at ${sourceId}:${line}:`, message);
        event.preventDefault();
      }
    });

    // Handle renderer process errors
    this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('🚨 Renderer failed to load:', errorCode, errorDescription);
    });

    if (this.isDev) {
      this.mainWindow.webContents.openDevTools();
    }

    // Add F12 key handler for DevTools
    this.mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown') {
        // F12 key
        if (input.key === 'F12') {
          event.preventDefault();
          console.log('F12 pressed, toggling DevTools...');
          try {
            if (this.mainWindow.webContents.isDevToolsOpened()) {
              this.mainWindow.webContents.closeDevTools();
            } else {
              this.mainWindow.webContents.openDevTools();
            }
          } catch (error) {
            console.error('Failed to toggle DevTools:', error);
          }
        }
        // Ctrl+Shift+I
        if ((input.control || input.meta) && input.shift && input.key === 'I') {
          event.preventDefault();
          console.log('Ctrl+Shift+I pressed, toggling DevTools...');
          try {
            if (this.mainWindow.webContents.isDevToolsOpened()) {
              this.mainWindow.webContents.closeDevTools();
            } else {
              this.mainWindow.webContents.openDevTools();
            }
          } catch (error) {
            console.error('Failed to toggle DevTools:', error);
          }
        }
      }
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
      if (this.canvasWindow) {
        this.canvasWindow.close();
      }
      if (this.audioEngine) {
        this.audioEngine.stop();
      }
    });
  }

  createCanvasWindow() {
    if (this.canvasWindow) {
      this.canvasWindow.focus();
      return;
    }

    this.canvasWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      minWidth: 640,
      minHeight: 360,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      title: 'Canvas Window',
      show: false
    });

    // Load canvas.html file instead of inline HTML
    const canvasHtmlPath = path.join(__dirname, '../renderer/canvas.html');
    this.canvasWindow.loadFile(canvasHtmlPath);

    this.canvasWindow.once('ready-to-show', () => {
      this.canvasWindow.show();
      // Don't start streaming immediately - wait for child to signal ready
    });

    this.canvasWindow.on('closed', () => {
      console.log('🔴 Child window closed, stopping streaming and cleanup');
      this.stopCanvasStreaming();
      
      // Stop painting to capture canvas (but keep canvas and stream alive)
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('webrtc:stopPainting');
      }
      
      this.canvasWindow = null;
    });

    if (this.isDev) {
      this.canvasWindow.webContents.openDevTools();
    }
  }

  /**
   * Helper: Send IPC command to main renderer and wait for response
   * Replaces executeJavaScript pattern with proper IPC messaging
   */
  async sendWebRTCCommand(command, ...args) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ipcMain.removeListener(`webrtc:${command}-response`, responseHandler);
        reject(new Error(`WebRTC command timeout: ${command}`));
      }, 10000); // 10 second timeout

      const responseHandler = (event, result) => {
        clearTimeout(timeout);
        ipcMain.removeListener(`webrtc:${command}-response`, responseHandler);
        resolve(result);
      };

      ipcMain.once(`webrtc:${command}-response`, responseHandler);
      this.mainWindow.webContents.send(`webrtc:${command}`, ...args);
    });
  }

  /**
   * Helper: Send IPC command to canvas window and wait for response
   * Replaces executeJavaScript pattern with proper IPC messaging for receiver
   */
  async sendCanvasWebRTCCommand(command, ...args) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ipcMain.removeListener(`webrtc:${command}-response`, responseHandler);
        reject(new Error(`Canvas WebRTC command timeout: ${command}`));
      }, 10000); // 10 second timeout

      const responseHandler = (event, result) => {
        clearTimeout(timeout);
        ipcMain.removeListener(`webrtc:${command}-response`, responseHandler);
        resolve(result);
      };

      ipcMain.once(`webrtc:${command}-response`, responseHandler);
      this.canvasWindow.webContents.send(`webrtc:${command}`, ...args);
    });
  }

  async startCanvasStreaming() {
    if (this.canvasStreaming.isStreaming || !this.canvasWindow || !this.mainWindow) {
      return;
    }
    
    // Only proceed if child window is still open and not destroyed
    if (this.canvasWindow.isDestroyed()) {
      console.log('❌ Child window destroyed, cannot start streaming');
      return;
    }

    try {
      console.log('Starting WebRTC canvas streaming...');

      // Set up WebRTC sender in main window via IPC
      const senderResult = await this.sendWebRTCCommand('setupSender');

      if (!senderResult.success) {
        throw new Error('Sender setup failed: ' + senderResult.error);
      }
      
      // Set up WebRTC receiver in child window via IPC
      const receiverResult = await this.sendCanvasWebRTCCommand('setupReceiver');
      
      if (!receiverResult.success) {
        throw new Error('Receiver setup failed: ' + receiverResult.error);
      }
      
      // Establish WebRTC connection
      await this.establishWebRTCConnection();
      
      this.canvasStreaming.isStreaming = true;
      console.log('✅ WebRTC canvas streaming started successfully');
      
    } catch (error) {
      console.error('Canvas streaming setup error:', error);
    }
  }

  async establishWebRTCConnection() {
    console.log('🤝 Starting WebRTC handshake...');
    
    let offer;
    try {
      // Create offer in sender (main window) via IPC
      console.log('📤 Creating offer in sender...');

      offer = await this.sendWebRTCCommand('createOffer');

      if (offer.error) {
        throw new Error('Sender error: ' + offer.error);
      }
      
      console.log('✅ Offer creation successful, moving to receiver...');
    } catch (error) {
      console.error('❌ Failed to create offer:', error);
      throw error;
    }
    
    try {
      console.log('📥 Setting offer in receiver and creating answer...');
      
      // First check if child window is ready
      if (!this.canvasWindow || this.canvasWindow.isDestroyed()) {
        throw new Error('Child window is not available');
      }
      
      // Check if receiver is ready via IPC
      console.log('🔍 Checking if child window is ready...');
      const childReady = await this.sendCanvasWebRTCCommand('checkReceiverReady');
      console.log('🏓 Child window status:', childReady);

      if (!childReady.hasReceiverPC) {
        throw new Error('Receiver PC not found in child window');
      }

      // Set offer in receiver and create answer via IPC
      const answer = await this.sendCanvasWebRTCCommand('setOfferAndCreateAnswer', offer);

      if (answer.error) {
        throw new Error('Receiver answer error: ' + answer.error);
      }
      
      // Set answer in sender via IPC
      console.log('📤 Setting answer in sender...');
      await this.sendWebRTCCommand('setAnswer', answer);
      
      console.log('✅ WebRTC peer connection handshake complete');
      
      // Wait a bit for ICE connection to establish
      setTimeout(() => {
        this.checkConnectionStatus();
      }, 2000);
      
    } catch (error) {
      console.error('❌ Failed to establish WebRTC connection:', error);
    }
  }

  async checkConnectionStatus() {
    try {
      const senderStatus = await this.sendWebRTCCommand('getSenderStatus');
      
      const receiverStatus = await this.sendCanvasWebRTCCommand('getReceiverStatus');
      
      console.log('📊 Connection Status:');
      console.log('  Sender:', senderStatus);
      console.log('  Receiver:', receiverStatus);
      
    } catch (error) {
      console.error('Error checking connection status:', error);
    }
  }

  async stopCanvasStreaming() {
    if (!this.canvasStreaming.isStreaming) return;

    try {
      console.log('Stopping canvas streaming...');
      
      // Cleanup sender (main window) via IPC
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('webrtc:cleanupSender');
      }
      
      // Cleanup receiver (child window) via IPC
      if (this.canvasWindow && !this.canvasWindow.isDestroyed()) {
        this.canvasWindow.webContents.send('webrtc:cleanupReceiver');
      }
      
      this.canvasStreaming.isStreaming = false;
      console.log('Canvas streaming stopped');
      
    } catch (error) {
      console.error('Error stopping canvas streaming:', error);
    }
  }

  createApplicationMenu() {
    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Open KAI File...',
            accelerator: 'CmdOrCtrl+O',
            click: async () => {
              const result = await dialog.showOpenDialog(this.mainWindow, {
                filters: [
                  { name: 'KAI Files', extensions: ['kai'] }
                ],
                properties: ['openFile']
              });

              if (!result.canceled && result.filePaths.length > 0) {
                await this.loadKaiFile(result.filePaths[0]);
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.quit();
            }
          }
        ]
      },
      {
        label: 'View',
        submenu: [
          {
            label: 'Reload',
            accelerator: 'CmdOrCtrl+R',
            click: (item, focusedWindow) => {
              if (focusedWindow) {
                focusedWindow.reload();
              }
            }
          },
          {
            label: 'Toggle Developer Tools',
            accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
            click: (item, focusedWindow) => {
              console.log('Menu: Toggle Developer Tools clicked', {
                hasFocusedWindow: !!focusedWindow,
                windowType: focusedWindow?.getTitle()
              });

              // Use mainWindow directly if no focused window
              const targetWindow = focusedWindow || this.mainWindow;

              if (targetWindow) {
                try {
                  if (targetWindow.webContents.isDevToolsOpened()) {
                    console.log('Closing DevTools...');
                    targetWindow.webContents.closeDevTools();
                  } else {
                    console.log('Opening DevTools...');
                    targetWindow.webContents.openDevTools();
                  }
                } catch (error) {
                  console.error('Failed to toggle DevTools:', error);
                }
              } else {
                console.error('No window available for DevTools toggle');
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Actual Size',
            accelerator: 'CmdOrCtrl+0',
            click: (item, focusedWindow) => {
              if (focusedWindow) {
                focusedWindow.webContents.setZoomLevel(0);
              }
            }
          },
          {
            label: 'Zoom In',
            accelerator: 'CmdOrCtrl+Plus',
            click: (item, focusedWindow) => {
              if (focusedWindow) {
                const currentZoom = focusedWindow.webContents.getZoomLevel();
                focusedWindow.webContents.setZoomLevel(currentZoom + 0.5);
              }
            }
          },
          {
            label: 'Zoom Out',
            accelerator: 'CmdOrCtrl+-',
            click: (item, focusedWindow) => {
              if (focusedWindow) {
                const currentZoom = focusedWindow.webContents.getZoomLevel();
                focusedWindow.webContents.setZoomLevel(currentZoom - 0.5);
              }
            }
          }
        ]
      }
    ];

    // macOS specific menu adjustments
    if (process.platform === 'darwin') {
      template.unshift({
        label: app.getName(),
        submenu: [
          {
            label: 'About ' + app.getName(),
            role: 'about'
          },
          { type: 'separator' },
          {
            label: 'Services',
            role: 'services',
            submenu: []
          },
          { type: 'separator' },
          {
            label: 'Hide ' + app.getName(),
            accelerator: 'Command+H',
            role: 'hide'
          },
          {
            label: 'Hide Others',
            accelerator: 'Command+Shift+H',
            role: 'hideothers'
          },
          {
            label: 'Show All',
            role: 'unhide'
          },
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: 'Command+Q',
            click: () => {
              app.quit();
            }
          }
        ]
      });

      // Window menu for macOS
      template.push({
        label: 'Window',
        submenu: [
          {
            label: 'Minimize',
            accelerator: 'CmdOrCtrl+M',
            role: 'minimize'
          },
          {
            label: 'Close',
            accelerator: 'CmdOrCtrl+W',
            role: 'close'
          }
        ]
      });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  initializeAudioEngine() {
    try {
      this.audioEngine = new AudioEngine();
      this.audioEngine.initialize();
      
      this.audioEngine.on('xrun', (count) => {
        this.sendToRenderer('audio:xrun', count);
      });

      this.audioEngine.on('latencyUpdate', (latency) => {
        this.sendToRenderer('audio:latency', latency);
      });

      this.audioEngine.on('mixChanged', (mixState) => {
        this.sendToRenderer('mixer:state', mixState);
      });

    } catch (error) {
      console.error('Failed to initialize audio engine:', error);
    }
  }

  setupIPC() {
    // Register organized IPC handlers
    registerAllHandlers(this);

    // Continue with remaining handlers that haven't been organized yet
    ipcMain.handle('app:getVersion', () => {
      return app.getVersion();
    });

    ipcMain.handle('file:openKai', async () => {
      const result = await dialog.showOpenDialog(this.mainWindow, {
        filters: [
          { name: 'KAI Files', extensions: ['kai'] }
        ],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return await this.loadKaiFile(result.filePaths[0]);
      }
      return null;
    });

    ipcMain.handle('file:loadKaiFromPath', async (event, filePath) => {
      return await this.loadKaiFile(filePath);
    });

    // Audio handlers moved to src/main/handlers/audioHandlers.js

    ipcMain.handle('mixer:toggleMute', (event, stemId, bus) => {
      if (this.audioEngine) {
        return this.audioEngine.toggleMute(stemId, bus);
      }
      return false;
    });

    ipcMain.handle('mixer:toggleSolo', (event, stemId) => {
      if (this.audioEngine) {
        return this.audioEngine.toggleSolo(stemId);
      }
      return false;
    });

    ipcMain.handle('mixer:setGain', (event, stemId, gainDb) => {
      if (this.audioEngine) {
        return this.audioEngine.setGain(stemId, gainDb);
      }
      return false;
    });

    ipcMain.handle('mixer:applyPreset', (event, presetId) => {
      if (this.audioEngine) {
        return this.audioEngine.applyPreset(presetId);
      }
      return false;
    });

    ipcMain.handle('mixer:recallScene', (event, sceneId) => {
      if (this.audioEngine) {
        return this.audioEngine.recallScene(sceneId);
      }
      return false;
    });

    // Player handlers moved to src/main/handlers/playerHandlers.js

    ipcMain.handle('autotune:setEnabled', (event, enabled) => {
      if (this.audioEngine) {
        return this.audioEngine.setAutotuneEnabled(enabled);
      }
      return false;
    });

    ipcMain.handle('autotune:setSettings', (event, settings) => {
      if (this.audioEngine) {
        return this.audioEngine.setAutotuneSettings(settings);
      }
      return false;
    });

    // Load KAI file for editing (without loading into player)
    ipcMain.handle('editor:loadKai', async (event, filePath) => {
      try {
        console.log('Load KAI file for editing:', filePath);

        const editorService = await import('../shared/services/editorService.js');
        const result = await editorService.loadSong(filePath);

        console.log('KAI file loaded for editing, has lyrics:', result.kaiData.lyrics?.length || 0);

        return {
          success: true,
          data: result.kaiData
        };
      } catch (error) {
        console.error('Failed to load KAI file for editing:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('editor:saveKai', async (event, kaiData, originalPath) => {
      try {
        console.log('Save KAI file request:', originalPath);
        console.log('Updated lyrics:', kaiData.lyrics.length, 'lines');

        const editorService = await import('../shared/services/editorService.js');
        const result = await editorService.saveSong(originalPath, {
          format: 'kai',
          metadata: kaiData.song || {},
          lyrics: kaiData.lyrics
        });

        console.log('KAI file saved successfully');
        return { success: true };
      } catch (error) {
        console.error('Failed to save KAI file:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('editor:reloadKai', async (event, filePath) => {
      try {
        console.log('Reload KAI file request:', filePath);
        
        // Reload the KAI file using the existing loadKaiFile method
        const result = await this.loadKaiFile(filePath);
        
        if (result && result.success) {
          console.log('KAI file reloaded successfully');
          return { success: true };
        } else {
          console.error('Failed to reload KAI file');
          return { success: false, error: 'Failed to reload file' };
        }
      } catch (error) {
        console.error('Failed to reload KAI file:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('window:openCanvas', () => {
      this.createCanvasWindow();
      return { success: true };
    });

    ipcMain.handle('canvas:startStreaming', () => {
      this.startCanvasStreaming();
      return { success: true };
    });

    ipcMain.handle('canvas:stopStreaming', () => {
      this.stopCanvasStreaming();
      return { success: true };
    });

    ipcMain.handle('canvas:sendImageData', (event, imageDataArray, width, height) => {
      if (this.canvasWindow && !this.canvasWindow.isDestroyed()) {
        this.canvasWindow.webContents.send('canvas:receiveImageData', imageDataArray, width, height);
      }
    });

    ipcMain.on('canvas:childReady', () => {
      console.log('Child window ready, starting canvas streaming');
      // Small delay to ensure everything is fully initialized
      setTimeout(() => {
        this.startCanvasStreaming();
      }, 100);
    });

    ipcMain.handle('canvas:sendICECandidate', (event, source, candidate) => {
      console.log('🧊 Relaying ICE candidate from', source);
      if (source === 'sender') {
        // Send to receiver via IPC
        if (this.canvasWindow && !this.canvasWindow.isDestroyed()) {
          this.canvasWindow.webContents.send('webrtc:addReceiverICECandidate', candidate);
        }
      } else if (source === 'receiver') {
        // Send to sender via IPC
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('webrtc:addICECandidate', candidate);
        }
      }
    });

    ipcMain.handle('canvas:toggleFullscreen', (event, shouldBeFullscreen) => {
      if (this.canvasWindow && !this.canvasWindow.isDestroyed()) {
        console.log('🖥️ Toggling canvas window fullscreen:', shouldBeFullscreen);
        this.canvasWindow.setFullScreen(shouldBeFullscreen);
        return { success: true, fullscreen: shouldBeFullscreen };
      }
      return { success: false, error: 'Canvas window not available' };
    });

    ipcMain.handle('canvas:sendFrame', (event, dataUrl) => {
      if (this.canvasWindow && !this.canvasWindow.isDestroyed()) {
        this.canvasWindow.webContents.send('canvas:receiveFrame', dataUrl);
      }
    });

    // Library handlers moved to src/main/handlers/libraryHandlers.js

    // Shell operations
    ipcMain.handle('shell:openExternal', async (event, url) => {
      const { shell } = await import('electron');
      await shell.openExternal(url);
    });

    // Web Server Management
    ipcMain.handle('webServer:getPort', () => {
      return this.getWebServerPort();
    });

    ipcMain.handle('webServer:getUrl', () => {
      return this.webServer?.getServerUrl() || null;
    });

    ipcMain.handle('webServer:getSettings', () => {
      if (this.webServer) {
        const result = serverSettingsService.getServerSettings(this.webServer);
        return result.success ? result.settings : null;
      }
      return null;
    });

    ipcMain.handle('webServer:updateSettings', (event, settings) => {
      if (this.webServer) {
        return serverSettingsService.updateServerSettings(this.webServer, settings);
      }
      return { success: false, error: 'Web server not available' };
    });

    ipcMain.handle('webServer:getSongRequests', () => {
      if (this.webServer) {
        const result = requestsService.getRequests(this.webServer);
        return result.success ? result.requests : [];
      }
      return [];
    });

    ipcMain.handle('webServer:approveRequest', async (event, requestId) => {
      if (this.webServer) {
        return await requestsService.approveRequest(this.webServer, requestId);
      }
      return { success: false, error: 'Web server not available' };
    });

    ipcMain.handle('webServer:rejectRequest', async (event, requestId) => {
      if (this.webServer) {
        return await requestsService.rejectRequest(this.webServer, requestId);
      }
      return { success: false, error: 'Web server not available' };
    });

    ipcMain.handle('webServer:refreshCache', async () => {
      try {
        if (this.webServer) {
          await this.webServer.refreshSongsCache();
          return { success: true };
        } else {
          return { error: 'Web server not available' };
        }
      } catch (error) {
        return { error: error.message };
      }
    });

    ipcMain.handle('webServer:setAdminPassword', async (event, password) => {
      try {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        await this.settings.set('server.adminPasswordHash', hashedPassword);
        return { success: true };
      } catch (error) {
        console.error('Failed to set admin password:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('webServer:clearAllRequests', async () => {
      if (this.webServer) {
        return requestsService.clearRequests(this.webServer);
      }
      return { success: false, error: 'Web server not available' };
    });

    // Library handlers
    ipcMain.handle('library:search', (event, query) => {
      return libraryService.searchSongs(this, query);
    });

    // Queue handlers - need to stay in main.js due to auto-load and legacy songQueue sync

    ipcMain.handle('queue:addSong', async (event, queueItem) => {
      const result = queueService.addSongToQueue(this.appState, queueItem);

      // Update legacy songQueue for compatibility
      this.songQueue = result.queue;

      // If queue was empty, automatically load and start playing the first song
      if (result.success && result.wasEmpty) {
        console.log(`🎵 Queue was empty, auto-loading "${result.queueItem.title}"`);
        try {
          // Use the returned queueItem which has the generated ID
          await this.loadKaiFile(result.queueItem.path, result.queueItem.id);
          console.log('✅ Successfully auto-loaded song from queue');
        } catch (error) {
          console.error('❌ Failed to auto-load song from queue:', error);
        }
      }

      return result;
    });

    ipcMain.handle('queue:removeSong', async (event, itemId) => {
      const result = queueService.removeSongFromQueue(this.appState, itemId);

      // Update legacy songQueue for compatibility
      if (result.success) {
        this.songQueue = result.queue;
      }

      return result;
    });

    ipcMain.handle('queue:get', () => {
      return queueService.getQueue(this.appState);
    });

    ipcMain.handle('queue:clear', async () => {
      const result = queueService.clearQueue(this.appState);

      // Update legacy songQueue for compatibility
      this.songQueue = [];

      return result;
    });

    ipcMain.handle('queue:reorderQueue', async (event, songId, newIndex) => {
      const result = queueService.reorderQueue(this.appState, songId, newIndex);

      // Update legacy songQueue for compatibility
      if (result.success) {
        this.songQueue = result.queue;
      }

      return result;
    });

    // Load song from queue by ID
    ipcMain.handle('queue:load', async (event, itemId) => {
      const result = await queueService.loadFromQueue(this, itemId);
      return result;
    });

    // Song management IPC handlers
    ipcMain.handle('song:getCurrentSong', () => {
      if (this.currentSong && this.currentSong.metadata) {
        return {
          path: this.currentSong.metadata.path || this.currentSong.filePath,
          title: this.currentSong.metadata.title,
          artist: this.currentSong.metadata.artist
        };
      }
      return null;
    });

    // Effects management IPC handlers
    ipcMain.handle('effects:getList', async () => {
      try {
        // Send message to renderer to get effects list
        return await this.sendToRendererAndWait('effects:getList');
      } catch (error) {
        console.error('Failed to get effects list:', error);
        return [];
      }
    });

    ipcMain.handle('effects:getCurrent', async () => {
      try {
        return await this.sendToRendererAndWait('effects:getCurrent');
      } catch (error) {
        console.error('Failed to get current effect:', error);
        return null;
      }
    });

    ipcMain.handle('effects:getDisabled', async () => {
      try {
        return await this.sendToRendererAndWait('effects:getDisabled');
      } catch (error) {
        console.error('Failed to get disabled effects:', error);
        return [];
      }
    });

    ipcMain.handle('effects:select', async (event, effectName) => {
      try {
        this.sendToRenderer('effects:select', effectName);
        return { success: true };
      } catch (error) {
        console.error('Failed to select effect:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('effects:toggle', async (event, effectName, enabled) => {
      try {
        this.sendToRenderer('effects:toggle', { effectName, enabled });
        return { success: true };
      } catch (error) {
        console.error('Failed to toggle effect:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('effects:next', async () => {
      try {
        const result = await effectsService.nextEffect(this);
        return result;
      } catch (error) {
        console.error('Failed to go to next effect:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('effects:previous', async () => {
      try {
        const result = await effectsService.previousEffect(this);
        return result;
      } catch (error) {
        console.error('Failed to go to previous effect:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('effects:random', async () => {
      try {
        const result = await effectsService.randomEffect(this);
        return result;
      } catch (error) {
        console.error('Failed to select random effect:', error);
        return { success: false, error: error.message };
      }
    });

    // Preferences handlers
    ipcMain.handle('preferences:setAutoTune', async (event, prefs) => {
      try {
        const result = await preferencesService.updateAutoTunePreferences(this.appState, prefs);
        return result;
      } catch (error) {
        console.error('Failed to update auto-tune preferences:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('preferences:setMicrophone', async (event, prefs) => {
      try {
        const result = await preferencesService.updateMicrophonePreferences(this.appState, prefs);
        return result;
      } catch (error) {
        console.error('Failed to update microphone preferences:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('preferences:setEffects', async (event, prefs) => {
      try {
        const result = await preferencesService.updateEffectsPreferences(this.appState, prefs);
        return result;
      } catch (error) {
        console.error('Failed to update effects preferences:', error);
        return { success: false, error: error.message };
      }
    });

    // Settings handlers moved to src/main/handlers/settingsHandlers.js (but need web socket broadcast logic)

    ipcMain.handle('settings:set', (event, key, value) => {
      this.settings.set(key, value);

      // Update AppState for device preferences
      if (key === 'devicePreferences') {
        this.appState.setAudioDevices(value);
      }

      // Broadcast settings changes to web admin clients
      if (this.webServer && this.webServer.io) {
        if (key === 'waveformPreferences') {
          this.webServer.io.to('admin-clients').emit('settings:waveform', value);

          // If disabled effects changed, also emit effects update
          if (value.disabledEffects !== undefined) {
            this.webServer.io.emit('effects-update', {
              disabled: value.disabledEffects
            });
          }
        } else if (key === 'autoTunePreferences') {
          this.webServer.io.to('admin-clients').emit('settings:autotune', value);
        }
      }

      return { success: true };
    });

    // Renderer playback state updates (legacy - keeping for compatibility)
    ipcMain.on('renderer:playbackState', (event, state) => {
      // Store the renderer playback state for position broadcasting
      this.rendererPlaybackState = state;

      // Broadcast to web admin clients for real-time position updates
      if (this.webServer) {
        this.webServer.broadcastPlaybackState(state);
      }
    });

    // NEW: Renderer state updates to AppState
    ipcMain.on('renderer:updatePlaybackState', (event, updates) => {
      this.appState.updatePlaybackState(updates);

      // Also broadcast immediately to web admin for responsive updates
      if (this.webServer && updates) {
        // Broadcast the updates directly - they already contain position/duration
        this.webServer.broadcastPlaybackState(updates);
      }
    });

    ipcMain.on('renderer:songLoaded', (event, songData) => {
      // Preserve queueItemId and format if they exist in current song (renderer doesn't know about them)
      const existingQueueItemId = this.appState.state.currentSong?.queueItemId;
      const existingFormat = this.appState.state.currentSong?.format;
      const updatedSongData = {
        ...songData,
        queueItemId: existingQueueItemId || songData.queueItemId || null,
        format: existingFormat || songData.format || 'kai'
      };

      this.appState.setCurrentSong(updatedSongData);
      // Also update legacy currentSong for compatibility
      this.currentSong = {
        metadata: songData,
        filePath: songData.path
      };
    });

    ipcMain.on('renderer:updateMixerState', (event, mixerState) => {
      this.appState.updateMixerState(mixerState);
    });

    ipcMain.on('renderer:updateEffectsState', (event, effectsState) => {
      this.appState.updateEffectsState(effectsState);
    });

    // Add handler to get current app state
    ipcMain.handle('app:getState', () => {
      return this.appState.getSnapshot();
    });
  }

  async scanForKaiFiles(folderPath) {
    // fs already imported
    const files = [];
    const cdgMap = new Map(); // Track CDG files found
    const mp3Map = new Map(); // Track MP3 files found

    try {
      const entries = await fsPromises.readdir(folderPath, { withFileTypes: true });

      // First pass: collect files and identify types
      for (const entry of entries) {
        const fullPath = path.join(folderPath, entry.name);
        const lowerName = entry.name.toLowerCase();
        const baseName = entry.name.substring(0, entry.name.lastIndexOf('.'));

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await this.scanForKaiFiles(fullPath);
          files.push(...subFiles);
        } else if (lowerName.endsWith('.kai')) {
          // KAI format
          const stats = await fsPromises.stat(fullPath);
          const metadata = await this.extractKaiMetadata(fullPath);

          files.push({
            name: fullPath,
            path: fullPath,
            size: stats.size,
            modified: stats.mtime,
            folder: path.relative(this.settings.getSongsFolder(), folderPath) || '.',
            format: 'kai',
            ...metadata
          });
        } else if (lowerName.endsWith('.kar') || (lowerName.endsWith('.zip') && !lowerName.endsWith('.kai.zip'))) {
          // CDG archive format (.kar or .zip)
          const metadata = await this.extractCDGArchiveMetadata(fullPath);
          if (metadata) {
            const stats = await fsPromises.stat(fullPath);
            files.push({
              name: fullPath,
              path: fullPath,
              size: stats.size,
              modified: stats.mtime,
              folder: path.relative(this.settings.getSongsFolder(), folderPath) || '.',
              format: 'cdg-archive',
              ...metadata
            });
          }
        } else if (lowerName.endsWith('.cdg')) {
          // Track CDG files for pairing
          cdgMap.set(baseName, fullPath);
        } else if (lowerName.endsWith('.mp3')) {
          // Track MP3 files for pairing
          mp3Map.set(baseName, fullPath);
        }
      }

      // Second pass: match MP3 + CDG pairs (only add if BOTH files exist)
      for (const [baseName, mp3Path] of mp3Map.entries()) {
        const cdgPath = cdgMap.get(baseName);
        if (cdgPath) {
          // Found matching pair - add as CDG song keyed by MP3 path
          const metadata = await this.extractCDGPairMetadata(mp3Path, cdgPath);
          const stats = await fsPromises.stat(mp3Path);
          files.push({
            name: mp3Path,
            path: mp3Path,
            cdgPath: cdgPath,
            size: stats.size,
            modified: stats.mtime,
            folder: path.relative(this.settings.getSongsFolder(), folderPath) || '.',
            format: 'cdg-pair',
            ...metadata
          });
        }
        // If no CDG file, don't add this MP3 to the library
      }
      // CDG files without matching MP3 are also not added
    } catch (error) {
      console.error('❌ Error scanning folder:', folderPath, error);
    }

    return files;
  }

  async extractKaiMetadata(kaiFilePath) {
    // yauzl already imported

    return new Promise((resolve) => {
      const metadata = {
        title: null,
        artist: null,
        album: null,
        genre: null,
        key: null,
        year: null,
        duration: null,
        stems: [],
        stemCount: 0
      };

      yauzl.open(kaiFilePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          console.warn('❌ Could not read KAI metadata from:', kaiFilePath, err.message);
          return resolve(metadata);
        }

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          if (entry.fileName === 'song.json') {
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                zipfile.readEntry();
                return;
              }

              let jsonData = '';
              readStream.on('data', (chunk) => {
                jsonData += chunk.toString();
              });

              readStream.on('end', () => {
                try {
                  const songData = JSON.parse(jsonData);

                  // Extract metadata from song.song object
                  if (songData.song) {
                    metadata.title = songData.song.title || null;
                    metadata.artist = songData.song.artist || null;
                    metadata.album = songData.song.album || null;
                    metadata.genre = songData.song.genre || null;
                    metadata.key = songData.song.key || null;
                    metadata.year = songData.song.year || null;
                    metadata.duration = songData.song.duration_sec || null;
                  }

                  // Extract stems info from audio.sources
                  if (songData.audio && songData.audio.sources) {
                    metadata.stems = songData.audio.sources.map(source => source.role || source.id);
                    metadata.stemCount = metadata.stems.length;
                  }

                } catch (parseErr) {
                  console.warn('❌ Could not parse song.json from:', kaiFilePath, parseErr.message);
                }

                zipfile.close();
                resolve(metadata);
              });
            });
          } else {
            zipfile.readEntry();
          }
        });

        zipfile.on('end', () => {
          resolve(metadata);
        });
      });
    });
  }

  async extractCDGArchiveMetadata(archivePath) {
    // yauzl already imported

    return new Promise((resolve) => {
      let hasCDG = false;
      let hasMp3 = false;
      let mp3FileName = null;

      yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          return resolve(null);
        }

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          const lowerName = entry.fileName.toLowerCase();
          if (lowerName.endsWith('.cdg')) {
            hasCDG = true;
          } else if (lowerName.endsWith('.mp3')) {
            hasMp3 = true;
            mp3FileName = entry.fileName;
          }
          zipfile.readEntry();
        });

        zipfile.on('end', async () => {
          if (hasCDG && hasMp3) {
            // Valid CDG archive - extract MP3 metadata
            const metadata = await this.extractMp3MetadataFromArchive(archivePath, mp3FileName);
            resolve(metadata);
          } else {
            resolve(null);
          }
        });
      });
    });
  }

  async extractMp3MetadataFromArchive(archivePath, mp3FileName) {
    // yauzl already imported
    const mm = await import('music-metadata');
    // fs already imported
    // os already imported
    // path already imported

    return new Promise((resolve) => {
      const metadata = {
        title: null,
        artist: null,
        album: null,
        genre: null,
        year: null,
        duration: null
      };

      yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          return resolve(metadata);
        }

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          if (entry.fileName === mp3FileName) {
            zipfile.openReadStream(entry, async (err, readStream) => {
              if (err) {
                zipfile.close();
                return resolve(metadata);
              }

              // Create temp file for MP3
              const tempPath = path.join(os.tmpdir(), `temp-${Date.now()}.mp3`);
              const writeStream = fs.createWriteStream(tempPath);

              readStream.pipe(writeStream);

              writeStream.on('finish', async () => {
                try {
                  const mmData = await mm.parseFile(tempPath);
                  if (mmData.common) {
                    metadata.title = mmData.common.title || null;
                    metadata.artist = mmData.common.artist || null;
                    metadata.album = mmData.common.album || null;
                    metadata.genre = mmData.common.genre ? mmData.common.genre[0] : null;
                    // Prefer full date (TDRC), fallback to year (TYER)
                    metadata.year = mmData.common.date || (mmData.common.year ? String(mmData.common.year) : null);
                  }
                  if (mmData.format && mmData.format.duration) {
                    metadata.duration = mmData.format.duration;
                  }

                  // Fallback to filename parsing if no tags
                  if (!metadata.title || !metadata.artist) {
                    const baseName = path.basename(archivePath, path.extname(archivePath));
                    const dashIndex = baseName.indexOf(' - ');
                    if (dashIndex > 0 && dashIndex < baseName.length - 3) {
                      if (!metadata.artist) metadata.artist = baseName.substring(0, dashIndex).trim();
                      if (!metadata.title) metadata.title = baseName.substring(dashIndex + 3).trim();
                    } else {
                      if (!metadata.title) metadata.title = baseName;
                      if (!metadata.artist) metadata.artist = '';
                    }
                  }

                  // Ensure artist is never null
                  if (!metadata.artist) metadata.artist = '';
                } catch (parseErr) {
                  console.warn('❌ Could not parse MP3 metadata:', parseErr.message);
                  // Fallback to filename parsing
                  const baseName = path.basename(archivePath, path.extname(archivePath));
                  const dashIndex = baseName.indexOf(' - ');
                  if (dashIndex > 0 && dashIndex < baseName.length - 3) {
                    metadata.artist = baseName.substring(0, dashIndex).trim();
                    metadata.title = baseName.substring(dashIndex + 3).trim();
                  } else {
                    metadata.title = baseName;
                    metadata.artist = '';
                  }
                } finally {
                  // Clean up temp file
                  fs.unlink(tempPath, () => {});
                  zipfile.close();
                  resolve(metadata);
                }
              });
            });
          } else {
            zipfile.readEntry();
          }
        });
      });
    });
  }

  async extractCDGPairMetadata(mp3Path, cdgPath) {
    const mm = await import('music-metadata');
    // path already imported

    const metadata = {
      title: null,
      artist: null,
      album: null,
      genre: null,
      year: null,
      duration: null
    };

    try {
      const mmData = await mm.parseFile(mp3Path);
      if (mmData.common) {
        metadata.title = mmData.common.title || null;
        metadata.artist = mmData.common.artist || null;
        metadata.album = mmData.common.album || null;
        metadata.genre = mmData.common.genre ? mmData.common.genre[0] : null;
        // Prefer full date (TDRC), fallback to year (TYER)
        metadata.year = mmData.common.date || (mmData.common.year ? String(mmData.common.year) : null);
      }
      if (mmData.format && mmData.format.duration) {
        metadata.duration = mmData.format.duration;
      }

      // Fallback to filename parsing if no tags
      if (!metadata.title || !metadata.artist) {
        const baseName = path.basename(mp3Path, path.extname(mp3Path));
        // Try to parse "Artist - Title" format (safely)
        const dashIndex = baseName.indexOf(' - ');
        if (dashIndex > 0 && dashIndex < baseName.length - 3) {
          if (!metadata.artist) metadata.artist = baseName.substring(0, dashIndex).trim();
          if (!metadata.title) metadata.title = baseName.substring(dashIndex + 3).trim();
        } else {
          // No dash found, use entire basename as title
          if (!metadata.title) metadata.title = baseName;
          if (!metadata.artist) metadata.artist = '';
        }
      }

      // Ensure artist is never null
      if (!metadata.artist) metadata.artist = '';
    } catch (err) {
      console.warn('❌ Could not parse MP3 metadata:', err.message);
      // Fallback to filename parsing
      const baseName = path.basename(mp3Path, path.extname(mp3Path));
      const dashIndex = baseName.indexOf(' - ');
      if (dashIndex > 0 && dashIndex < baseName.length - 3) {
        metadata.artist = baseName.substring(0, dashIndex).trim();
        metadata.title = baseName.substring(dashIndex + 3).trim();
      } else {
        metadata.title = baseName;
        metadata.artist = '';
      }
    }

    return metadata;
  }

  async readKaiSongJson(kaiFilePath) {
    // yauzl already imported
    
    return new Promise((resolve) => {
      yauzl.open(kaiFilePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          console.warn('❌ Could not read KAI file:', kaiFilePath, err.message);
          return resolve(null);
        }

        zipfile.readEntry();
        
        zipfile.on('entry', (entry) => {
          if (entry.fileName === 'song.json') {
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                zipfile.close();
                return resolve(null);
              }

              let jsonData = '';
              readStream.on('data', (chunk) => {
                jsonData += chunk.toString();
              });

              readStream.on('end', () => {
                try {
                  const songData = JSON.parse(jsonData);
                  zipfile.close();
                  resolve(songData);
                } catch (parseError) {
                  console.warn('❌ Could not parse song.json from:', kaiFilePath, parseError.message);
                  zipfile.close();
                  resolve(null);
                }
              });
            });
          } else {
            zipfile.readEntry();
          }
        });

        zipfile.on('end', () => {
          zipfile.close();
          resolve(null);
        });

        zipfile.on('error', (err) => {
          console.warn('❌ Error reading KAI file:', kaiFilePath, err.message);
          zipfile.close();
          resolve(null);
        });
      });
    });
  }

  async loadKaiFile(filePath, queueItemId = null) {
    // Detect format and load accordingly
    const format = await this.detectSongFormat(filePath);

    if (format.type === 'cdg') {
      return this.loadCDGFile(filePath, format.cdgPath, format.format, queueItemId);
    }

    // Default: KAI format
    try {
      const kaiData = await KaiLoader.load(filePath);

      // Add original file path to the song data
      kaiData.originalFilePath = filePath;

      if (this.audioEngine) {
        await this.audioEngine.loadSong(kaiData);
      }

      this.currentSong = kaiData;

      // Update AppState with new song (this resets position to 0)
      // Set isLoading: true initially, will be cleared when song fully loads
      const songData = {
        path: filePath,
        title: kaiData.metadata?.title || 'Unknown',
        artist: kaiData.metadata?.artist || 'Unknown',
        duration: kaiData.metadata?.duration || 0,
        requester: kaiData.requester || 'KJ',
        isLoading: true,  // Song is being loaded
        format: 'kai',  // Format for display icon
        queueItemId: queueItemId  // Track which queue item (for duplicate songs)
      };
      this.appState.setCurrentSong(songData);

      console.log('Sending to renderer:', {
        metadata: kaiData.metadata,
        hasMetadata: !!kaiData.metadata
      });
      this.sendToRenderer('song:loaded', kaiData.metadata || {});
      this.sendToRenderer('song:data', kaiData);

      // Broadcast song loaded to web clients via Socket.IO (use songData, not kaiData!)
      if (this.webServer) {
        this.webServer.broadcastSongLoaded(songData);
      }

      // Notify queue manager that this song is now current
      console.log('📡 Main: Sending queue:songStarted IPC event for:', filePath);

      // Add a small delay to ensure renderer is ready
      setTimeout(() => {
        console.log('📡 Main: Delayed sending of queue:songStarted after 100ms');
        this.sendToRenderer('queue:songStarted', filePath);
      }, 100);

      return {
        success: true,
        metadata: kaiData.metadata,
        meta: kaiData.meta,
        stems: kaiData.audio.sources
      };
    } catch (error) {
      console.error('Failed to load KAI file:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async detectSongFormat(filePath) {
    const lowerPath = filePath.toLowerCase();

    // Check for CDG archive (.kar or .zip but not .kai.zip)
    if (lowerPath.endsWith('.kar') || (lowerPath.endsWith('.zip') && !lowerPath.endsWith('.kai.zip'))) {
      return { type: 'cdg', format: 'cdg-archive', cdgPath: null };
    }

    // Check for CDG pair (MP3 with matching CDG file)
    if (lowerPath.endsWith('.mp3')) {
      const basePath = filePath.substring(0, filePath.length - 4);
      const cdgPath = basePath + '.cdg';

      if (fs.existsSync(cdgPath)) {
        return { type: 'cdg', format: 'cdg-pair', cdgPath };
      }
    }

    // Default: KAI format
    return { type: 'kai', format: 'kai', cdgPath: null };
  }

  async loadCDGFile(mp3Path, cdgPath, format, queueItemId = null) {
    try {
      console.log('💿 Loading CDG file:', { mp3Path, cdgPath, format, queueItemId });
      const cdgData = await CDGLoader.load(mp3Path, cdgPath, format);

      // TODO: Load CDG into audio engine (different path than KAI)
      // For now, just set current song and notify renderer

      this.currentSong = cdgData;

      // Update AppState with current song info
      // Set isLoading: true initially, will be cleared when song fully loads
      const songData = {
        path: mp3Path,
        title: cdgData.metadata?.title || 'Unknown',
        artist: cdgData.metadata?.artist || 'Unknown',
        duration: cdgData.metadata?.duration || 0,
        requester: cdgData.requester || 'KJ',
        isLoading: true,  // Song is being loaded
        format: format,  // Format for display icon (cdg-pair, cdg-archive, etc)
        queueItemId: queueItemId  // Track which queue item (for duplicate songs)
      };
      this.appState.setCurrentSong(songData);

      console.log('💿 CDG loaded, sending to renderer');
      this.sendToRenderer('song:loaded', cdgData.metadata || {});
      this.sendToRenderer('song:data', cdgData);

      // Broadcast song loaded to web clients (use songData, not cdgData!)
      if (this.webServer) {
        this.webServer.broadcastSongLoaded(songData);
      }

      // Notify queue manager
      setTimeout(() => {
        this.sendToRenderer('queue:songStarted', mp3Path);
      }, 100);

      return {
        success: true,
        metadata: cdgData.metadata,
        format: 'cdg'
      };
    } catch (error) {
      console.error('Failed to load CDG file:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async checkSongsFolder() {
    const songsFolder = this.settings.getSongsFolder();

    if (!songsFolder) {
      console.log('📁 No songs folder set, prompting user...');
      await this.promptForSongsFolder();
    } else {
      console.log('📁 Songs folder:', songsFolder);
      // Verify folder still exists
      if (!fs.existsSync(songsFolder)) {
        console.log('⚠️ Songs folder no longer exists, prompting for new one...');
        await this.promptForSongsFolder();
      } else {
        // Trigger library scan on startup in background
        console.log('📚 Starting library scan...');
        this.scanLibraryInBackground(songsFolder);
      }
    }
  }

  async scanLibraryInBackground(songsFolder) {
    try {
      // Try to load from cache first
      const cacheFile = path.join(app.getPath('userData'), 'library-cache.json');
      let useCache = false;

      try {
        const cacheData = JSON.parse(await fsPromises.readFile(cacheFile, 'utf8'));
        // Check if cache is for the same folder
        if (cacheData.songsFolder === songsFolder) {
          console.log(`📂 Found library cache with ${cacheData.files.length} songs`);

          // Load from cache
          const files = cacheData.files;

          // Store in main process
          this.cachedLibrary = files;

          // Update web server cache
          if (this.webServer) {
            this.webServer.cachedSongs = files;
            this.webServer.songsCacheTime = Date.now();
            this.webServer.fuse = null;
          }

          // Notify renderer
          this.sendToRenderer('library:scanComplete', { count: files.length });
          console.log(`✅ Library loaded from cache: ${files.length} songs`);
          useCache = true;
        }
      } catch (err) {
        // Cache doesn't exist or is invalid, will scan
        console.log('📚 No valid cache found, scanning library...');
      }

      if (useCache) return;

      // First, quickly count all files
      console.log('📊 Counting files...');
      const allFiles = await this.findAllKaiFiles(songsFolder);
      const totalFiles = allFiles.length;
      console.log(`📊 Found ${totalFiles} files to process`);

      // Notify renderer of total count
      this.sendToRenderer('library:scanProgress', { current: 0, total: totalFiles });

      // Now process files with metadata extraction and progress updates
      // Pass null for progressCallback since this.sendToRenderer() is called directly in the method
      const files = await this.scanForKaiFilesWithProgress(songsFolder, totalFiles, null);
      console.log(`✅ Library scan complete: ${files.length} songs found`);

      // Store in main process
      this.cachedLibrary = files;

      // Cache the results for web server
      if (this.webServer) {
        this.webServer.cachedSongs = files;
        this.webServer.songsCacheTime = Date.now();
        this.webServer.fuse = null; // Reset Fuse.js - will rebuild on next search
      }

      // Save to disk cache
      try {
        await fsPromises.writeFile(cacheFile, JSON.stringify({
          songsFolder,
          files,
          cachedAt: new Date().toISOString()
        }), 'utf8');
        console.log('💾 Library cache saved to disk');
      } catch (err) {
        console.error('Failed to save library cache:', err);
      }

      // Notify renderer that library is ready
      this.sendToRenderer('library:scanComplete', { count: files.length });
    } catch (error) {
      console.error('❌ Failed to scan library:', error);
    }
  }

  async scanFilesystemForSync(folderPath) {
    // Quickly scan filesystem and return file info without parsing metadata
    const fileInfos = [];
    const processedPairs = new Set();

    async function scan(dir) {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('._') || entry.name === '.DS_Store') {
          continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else {
          const lowerName = entry.name.toLowerCase();

          // KAI files
          if (lowerName.endsWith('.kai')) {
            fileInfos.push({ path: fullPath, type: 'kai' });
          }
          // CDG archives
          else if (lowerName.endsWith('.kar') || (lowerName.endsWith('.zip') && !processedPairs.has(fullPath))) {
            fileInfos.push({ path: fullPath, type: 'archive' });
          }
          // CDG+MP3 pairs - check if both exist
          else if (lowerName.endsWith('.cdg')) {
            const baseName = fullPath.slice(0, -4);
            const mp3Path = baseName + '.mp3';

            try {
              await fsPromises.access(mp3Path);
              // Only add if we haven't seen this pair
              if (!processedPairs.has(fullPath)) {
                // Use MP3 path as primary key to match scanForKaiFilesWithProgress
                fileInfos.push({ path: mp3Path, type: 'cdg-pair', cdgPath: fullPath });
                processedPairs.add(fullPath);
                processedPairs.add(mp3Path);
              }
            } catch {
              // No paired MP3, skip this CDG
            }
          }
        }
      }
    }

    await scan(folderPath);
    return fileInfos;
  }

  async parseMetadataWithProgress(fileInfos, totalFiles, progressOffset = 0) {
    // Parse metadata for new files
    const files = [];
    const newFilesCount = fileInfos.length;

    for (let i = 0; i < newFilesCount; i++) {
      const fileInfo = fileInfos[i];
      const fullPath = fileInfo.path;

      try {
        if (fileInfo.type === 'kai') {
          const metadata = await this.readKaiSongJson(fullPath);
          if (metadata) {
            const songData = {
              ...metadata.song,
              duration: metadata.song.duration_sec
            };
            files.push({
              name: fullPath,
              path: fullPath,
              file: fullPath,
              format: 'kai',
              ...songData
            });
          }
        }
        else if (fileInfo.type === 'archive') {
          const metadata = await this.extractCDGArchiveMetadata(fullPath);
          if (metadata) {
            files.push({
              name: fullPath,
              path: fullPath,
              file: fullPath,
              format: 'cdg-archive',
              title: metadata.title,
              artist: metadata.artist,
              album: metadata.album,
              genre: metadata.genre,
              year: metadata.year,
              duration: metadata.duration
            });
          }
        }
        else if (fileInfo.type === 'cdg-pair') {
          const metadata = await this.extractCDGPairMetadata(fullPath, fileInfo.cdgPath);
          if (metadata) {
            files.push({
              name: fullPath,
              path: fullPath,
              file: fullPath,
              format: 'cdg-pair',
              title: metadata.title,
              artist: metadata.artist,
              album: metadata.album,
              genre: metadata.genre,
              year: metadata.year,
              duration: metadata.duration,
              cdgPath: fileInfo.cdgPath
            });
          }
        }
      } catch (err) {
        console.error(`Error processing ${fullPath}:`, err);
      }

      // Calculate progress
      const fileProgress = (i + 1) / newFilesCount * (1 - progressOffset);
      const currentProgress = Math.floor((progressOffset + fileProgress) * totalFiles);
      this.sendToRenderer('library:scanProgress', {
        current: currentProgress,
        total: totalFiles
      });
    }

    return files;
  }

  async findAllKaiFiles(folderPath) {
    const allFiles = [];
    const processedPairs = new Set();

    async function scan(dir) {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip macOS resource fork files and .DS_Store
        if (entry.name.startsWith('._') || entry.name === '.DS_Store') {
          continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else {
          const lowerName = entry.name.toLowerCase();

          // KAI files
          if (lowerName.endsWith('.kai')) {
            allFiles.push(fullPath);
          }
          // CDG archives
          else if (lowerName.endsWith('.kar') ||
                   (lowerName.endsWith('.zip') && !processedPairs.has(fullPath))) {
            allFiles.push(fullPath);
          }
          // CDG+MP3 pairs - only count once, return MP3 path
          else if (lowerName.endsWith('.cdg')) {
            const baseName = fullPath.slice(0, -4);
            const mp3Path = baseName + '.mp3';

            // Check if paired MP3 exists
            try {
              await fsPromises.access(mp3Path);
              // Only add if we haven't seen this pair
              if (!processedPairs.has(fullPath)) {
                allFiles.push(mp3Path); // Return MP3 path to match cache format
                processedPairs.add(fullPath);
                processedPairs.add(mp3Path); // Mark MP3 as processed too
              }
            } catch {
              // No paired MP3, skip this CDG
            }
          }
        }
      }
    }

    await scan(folderPath);
    return allFiles;
  }

  async scanFilesWithProgress(filePaths, totalFiles, progressOffset = 0) {
    const files = [];
    const newFilesCount = filePaths.length;

    for (let i = 0; i < newFilesCount; i++) {
      const fullPath = filePaths[i];
      const lowerName = fullPath.toLowerCase();

      try {
        // KAI files
        if (lowerName.endsWith('.kai')) {
          const metadata = await this.readKaiSongJson(fullPath);
          if (metadata) {
            const songData = {
              ...metadata.song,
              duration: metadata.song.duration_sec
            };
            files.push({
              name: fullPath,
              path: fullPath,
              file: fullPath,
              format: 'kai',
              ...songData
            });
          }
        }
        // CDG archives
        else if (lowerName.endsWith('.kar') || lowerName.endsWith('.zip')) {
          const metadata = await this.extractCDGArchiveMetadata(fullPath);
          if (metadata) {
            files.push({
              name: fullPath,
              path: fullPath,
              file: fullPath,
              format: 'cdg-archive',
              title: metadata.title,
              artist: metadata.artist,
              album: metadata.album,
              genre: metadata.genre,
              year: metadata.year,
              duration: metadata.duration
            });
          }
        }
        // CDG+MP3 pairs
        else if (lowerName.endsWith('.cdg')) {
          const baseName = fullPath.slice(0, -4);
          const mp3Path = baseName + '.mp3';

          // Verify MP3 file exists
          try {
            await fsPromises.access(mp3Path);
            const metadata = await this.extractCDGPairMetadata(mp3Path, fullPath);
            if (metadata) {
              files.push({
                name: mp3Path,
                path: mp3Path,
                file: mp3Path,
                format: 'cdg-pair',
                title: metadata.title,
                artist: metadata.artist,
                album: metadata.album,
                genre: metadata.genre,
                year: metadata.year,
                duration: metadata.duration,
                cdgPath: fullPath
              });
            }
          } catch {
            // MP3 file doesn't exist, skip this CDG
            console.warn(`⚠️ Skipping CDG file without MP3: ${fullPath}`);
          }
        }
      } catch (err) {
        console.error(`Error processing ${fullPath}:`, err);
      }

      // Calculate progress: progressOffset (10%) + current file progress (0-90%)
      const fileProgress = (i + 1) / newFilesCount * (1 - progressOffset);
      const currentProgress = Math.floor((progressOffset + fileProgress) * totalFiles);
      this.sendToRenderer('library:scanProgress', {
        current: currentProgress,
        total: totalFiles
      });
    }

    return files;
  }

  async scanForKaiFilesWithProgress(folderPath, totalFiles, progressCallback) {
    let processedCount = 0;
    const files = [];
    const processedPaths = new Set();

    let lastProgressReport = Date.now();
    const reportProgress = (force = false) => {
      const now = Date.now();
      // Throttle to max once per second to avoid overwhelming the renderer
      if (force || now - lastProgressReport >= 1000) {
        const progressData = {
          current: processedCount,
          total: totalFiles
        };

        // Send to renderer
        this.sendToRenderer('library:scanProgress', progressData);

        // Call progress callback if provided (for libraryService)
        if (progressCallback) {
          progressCallback(progressData);
        }

        lastProgressReport = now;
      }
    };

    async function scanDir(dir, self) {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await scanDir(fullPath, self);
        } else {
          const lowerName = entry.name.toLowerCase();

          // KAI files
          if (lowerName.endsWith('.kai') && !processedPaths.has(fullPath)) {
            processedPaths.add(fullPath);
            const metadata = await self.readKaiSongJson(fullPath);
            if (metadata) {
              const songData = {
                ...metadata.song,
                duration: metadata.song.duration_sec
              };
              files.push({
                name: fullPath,
                path: fullPath,
                format: 'kai',
                ...songData
              });
            }
            processedCount++;
            reportProgress();
          }
          // CDG archives
          else if ((lowerName.endsWith('.kar') || lowerName.endsWith('.zip')) && !processedPaths.has(fullPath)) {
            processedPaths.add(fullPath);
            const metadata = await self.extractCDGArchiveMetadata(fullPath);
            if (metadata) {
              files.push({
                name: fullPath,
                path: fullPath,
                format: 'cdg-archive',
                title: metadata.title,
                artist: metadata.artist,
                album: metadata.album,
                genre: metadata.genre,
                year: metadata.year,
                duration: metadata.duration
              });
            }
            processedCount++;
            reportProgress();
          }
          // CDG+MP3 pairs
          else if (lowerName.endsWith('.cdg') && !processedPaths.has(fullPath)) {
            const baseName = fullPath.slice(0, -4);
            const mp3Path = baseName + '.mp3';

            if (await fsPromises.access(mp3Path).then(() => true).catch(() => false)) {
              processedPaths.add(fullPath);
              processedPaths.add(mp3Path);

              const metadata = await self.extractCDGPairMetadata(mp3Path);
              files.push({
                name: mp3Path,
                path: mp3Path,
                format: 'cdg-pair',
                title: metadata.title,
                artist: metadata.artist,
                album: metadata.album,
                genre: metadata.genre,
                year: metadata.year,
                duration: metadata.duration,
                cdgPath: fullPath
              });
              processedCount++;
              reportProgress();
            }
          }
        }
      }
    }

    await scanDir(folderPath, this);
    reportProgress(true); // Final progress update (force)
    return files;
  }

  async promptForSongsFolder() {
    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Set Songs Library Folder',
      message: 'Choose a folder where your KAI music files are stored',
      detail: 'This will be your songs library that appears in the app.',
      buttons: ['Choose Folder', 'Skip for Now']
    });

    if (result.response === 0) {
      const folderResult = await dialog.showOpenDialog(this.mainWindow, {
        title: 'Select Songs Library Folder',
        properties: ['openDirectory'],
        buttonLabel: 'Select Folder'
      });

      if (!folderResult.canceled && folderResult.filePaths.length > 0) {
        const selectedFolder = folderResult.filePaths[0];
        this.settings.setSongsFolder(selectedFolder);
        console.log('📁 Songs folder set to:', selectedFolder);
        
        // Notify renderer about the new library
        this.sendToRenderer('library:folderSet', selectedFolder);
      }
    }
  }

  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  sendToRendererAndWait(channel, ...args) {
    return new Promise((resolve) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        // Create a one-time listener for the response
        const responseChannel = `${channel}-response`;
        const listener = (event, data) => {
          ipcMain.removeListener(responseChannel, listener);
          resolve(data);
        };
        ipcMain.once(responseChannel, listener);

        // Send the request
        this.mainWindow.webContents.send(channel);

        // Timeout after 5 seconds
        setTimeout(() => {
          ipcMain.removeListener(responseChannel, listener);
          resolve(null);
        }, 5000);
      } else {
        resolve(null);
      }
    });
  }

  // Web Server Integration Methods
  async initializeWebServer() {
    try {
      this.webServer = new WebServer(this);
      const port = await this.webServer.start(3069);

      console.log(`🌐 Web server started at http://localhost:${port}`);
      console.log(`📱 Song requests available at: http://localhost:${port}`);

      // Connect to Socket.IO server
      await this.connectToSocketServer(port);

      // Start position broadcasting timer
      this.startPositionBroadcasting();

      // Notify renderer about web server
      this.sendToRenderer('webServer:started', { port });

    } catch (error) {
      console.error('Failed to start web server:', error);
      // Don't fail the entire app if web server fails
    }
  }

  async connectToSocketServer(port) {
    try {
      this.socket = io(`http://localhost:${port}`);

      this.socket.on('connect', () => {
        console.log('📡 Connected to Socket.IO server');

        // Identify as electron app
        this.socket.emit('identify', { type: 'electron-app' });
      });

      this.socket.on('disconnect', () => {
        console.log('📡 Disconnected from Socket.IO server');
      });

      this.socket.on('song-request', (request) => {
        console.log('🎵 Song request received:', request);

        // Notify renderer about new request
        this.sendToRenderer('songRequest:new', request);
      });

      this.socket.on('request-approved', (request) => {
        console.log('✅ Request approved:', request);

        // Notify renderer about approved request
        this.sendToRenderer('songRequest:approved', request);
      });

      this.socket.on('request-rejected', (request) => {
        console.log('❌ Request rejected:', request);

        // Notify renderer about rejected request
        this.sendToRenderer('songRequest:rejected', request);
      });

      this.socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
      });

      this.socket.on('effect-control', (data) => {
        console.log('🎨 Effect control received:', data.action);
        this.handleEffectControl(data.action);
      });

      this.socket.on('settings-update', (settings) => {
        console.log('🔧 Settings update received from server:', settings);
        this.handleSettingsUpdate(settings);
      });

    } catch (error) {
      console.error('Failed to connect to Socket.IO server:', error);
    }
  }

  // Socket.IO helper methods
  broadcastQueueUpdate() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('queue-updated', {
        queue: this.appState.getQueue(),
        currentSong: this.currentSong
      });
    }
  }

  broadcastPlayerState(state) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('player-state', state);
    }
  }

  broadcastSettingsChange(settings) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('settings-changed', settings);
    }
  }

  handleEffectControl(action) {
    // Send effect control command to renderer process
    if (action === 'previous') {
      this.sendToRenderer('effect:previous', {});
      console.log('🎨 Sent previous effect command to renderer');
    } else if (action === 'next') {
      this.sendToRenderer('effect:next', {});
      console.log('🎨 Sent next effect command to renderer');
    }
  }

  handleSettingsUpdate(settings) {
    // Update webServer settings
    if (this.webServer) {
      // Update without triggering another broadcast to avoid loops
      this.webServer.settings = { ...this.webServer.settings, ...settings };
    }

    // Send settings update to renderer to update UI
    this.sendToRenderer('settings:update', settings);
    console.log('🔧 Settings update sent to renderer');
  }

  // Methods called by WebServer
  async getLibrarySongs() {
    const result = await libraryService.getLibrarySongs(this);
    return result.songs || [];
  }

  getQueue() {
    return this.appState.getQueue();
  }

  getCurrentSong() {
    // Return from AppState for consistency
    if (this.appState.state.currentSong) {
      return this.appState.state.currentSong;
    }
    // Fallback to legacy for compatibility
    return this.currentSong;
  }

  async addSongToQueue(queueItem) {
    console.log('🎵 MAIN addSongToQueue called with:', queueItem);

    // Use shared queueService
    const result = queueService.addSongToQueue(this.appState, queueItem);

    if (!result.success) {
      console.error('❌ Failed to add song to queue:', result.error);
      throw new Error(result.error);
    }

    console.log('🎵 Created new queue item:', result.queueItem);

    // Update legacy songQueue for compatibility
    this.songQueue = result.queue;

    // If queue was empty, automatically load and start playing the first song
    if (result.wasEmpty) {
      console.log(`🎵 Queue was empty, auto-loading "${result.queueItem.title}"`);
      try {
        // Use the returned queueItem which has the generated ID
        await this.loadKaiFile(result.queueItem.path, result.queueItem.id);
        console.log('✅ Successfully auto-loaded song from queue');
      } catch (error) {
        console.error('❌ Failed to auto-load song from queue:', error);
      }
    }

    console.log(`➕ Added "${queueItem.title}" to queue (requested by ${queueItem.requester})`);
    return result;
  }

  onSongRequest(request) {
    // Notify renderer about new song request
    this.sendToRenderer('songRequest:new', request);
    console.log(`🎤 New song request: "${request.song.title}" by ${request.requesterName}`);
  }

  // Effects management methods for web server
  async getEffectsList() {
    try {
      return await this.sendToRendererAndWait('effects:getList');
    } catch (error) {
      console.error('Failed to get effects list:', error);
      return [];
    }
  }

  async getCurrentEffect() {
    try {
      return await this.sendToRendererAndWait('effects:getCurrent');
    } catch (error) {
      console.error('Failed to get current effect:', error);
      return null;
    }
  }

  async getDisabledEffects() {
    try {
      return await this.sendToRendererAndWait('effects:getDisabled');
    } catch (error) {
      console.error('Failed to get disabled effects:', error);
      return [];
    }
  }

  async selectEffect(effectName) {
    try {
      this.sendToRenderer('effects:select', effectName);
      return { success: true };
    } catch (error) {
      console.error('Failed to select effect:', error);
      throw error;
    }
  }

  async toggleEffect(effectName, enabled) {
    try {
      this.sendToRenderer('effects:toggle', { effectName, enabled });
      return { success: true };
    } catch (error) {
      console.error('Failed to toggle effect:', error);
      throw error;
    }
  }


  // Removed duplicate playerNext() - see below for correct implementation

  // clearQueue() moved below - uses AppState

  async getCurrentSong() {
    const result = playerService.getCurrentSong(this);
    return result.song;
  }

  // Web server management methods
  getWebServerPort() {
    return this.webServer ? this.webServer.getPort() : null;
  }

  getWebServerSettings() {
    if (this.webServer) {
      const result = serverSettingsService.getServerSettings(this.webServer);
      return result.success ? result.settings : null;
    }
    return null;
  }

  updateWebServerSettings(settings) {
    if (this.webServer) {
      return serverSettingsService.updateServerSettings(this.webServer, settings);
    }
    return { success: false, error: 'Web server not available' };
  }

  getSongRequests() {
    return this.webServer ? this.webServer.getSongRequests() : [];
  }

  // Player control methods for web server
  async playerPlay() {
    console.log('🎮 Admin play command - using playerService');
    return playerService.play(this);
  }

  async playerPause() {
    return playerService.pause(this);
  }

  async playerRestart() {
    return playerService.restart(this);
  }

  async playerSeek(position) {
    return playerService.seek(this, position);
  }

  async playerNext() {
    return playerService.playNext(this);
  }

  async clearQueue() {
    // Use shared queueService
    const result = queueService.clearQueue(this.appState);
    // Update legacy queue for compatibility
    this.songQueue = [];
    return result;
  }

  getCurrentSong() {
    return this.currentSong;
  }

  // Removed duplicate - using appState.getQueue() above

  // Position broadcasting timer
  startPositionBroadcasting() {
    if (this.positionTimer) {
      clearInterval(this.positionTimer);
    }

    this.positionTimer = setInterval(() => {
      const hasWebServer = !!this.webServer;
      const hasCurrentSong = !!this.appState.state.currentSong;

      if (hasWebServer && hasCurrentSong) {
        // Get interpolated position from AppState
        const currentTime = this.appState.getCurrentPosition();
        const isPlaying = this.appState.state.playback.isPlaying;

        const songId = this.appState.state.currentSong ?
          `${this.appState.state.currentSong.title} - ${this.appState.state.currentSong.artist}` :
          'Unknown Song';

        this.webServer.broadcastPlaybackPosition(currentTime, isPlaying, songId);
      }
    }, 1000); // Every second
  }

  // Clean up web server on app close
  async cleanup() {
    if (this.positionTimer) {
      clearInterval(this.positionTimer);
      this.positionTimer = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    if (this.webServer) {
      this.webServer.stop();
    }

    // Save settings immediately before exiting
    if (this.settings) {
      await this.settings.saveNow();
    }

    // Save state before exiting
    if (this.statePersistence) {
      await this.statePersistence.cleanup();
    }
  }
}

const kaiApp = new KaiPlayerApp();

// Handle uncaught exceptions and errors without showing alert dialogs
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

app.on('window-all-closed', async () => {
  // Clean up web server and save state
  await kaiApp.cleanup();

  // Quit the app when all windows are closed, even on macOS
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    kaiApp.createMainWindow();
  }
});

kaiApp.initialize().catch(console.error);
/**
 * Player Service - Shared business logic for playback control
 *
 * Used by both IPC handlers (Electron) and REST endpoints (Web Server)
 * to ensure consistent player control across all interfaces.
 */

/**
 * Send play command to renderer
 * @param {Object} mainApp - Main application instance
 * @returns {Object} Result with success status
 */
export function play(mainApp) {
  if (mainApp.mainWindow && !mainApp.mainWindow.isDestroyed()) {
    // Send IPC event to renderer
    mainApp.mainWindow.webContents.send('player:togglePlayback');
    return { success: true, message: 'Play command sent' };
  }

  return {
    success: false,
    error: 'Main window not available'
  };
}

/**
 * Send pause command to renderer
 * @param {Object} mainApp - Main application instance
 * @returns {Object} Result with success status
 */
export function pause(mainApp) {
  if (mainApp.mainWindow && !mainApp.mainWindow.isDestroyed()) {
    // Send IPC event to renderer
    mainApp.mainWindow.webContents.send('player:togglePlayback');
    return { success: true, message: 'Pause command sent' };
  }

  return {
    success: false,
    error: 'Main window not available'
  };
}

/**
 * Send restart command to renderer
 * @param {Object} mainApp - Main application instance
 * @returns {Object} Result with success status
 */
export function restart(mainApp) {
  if (mainApp.mainWindow && !mainApp.mainWindow.isDestroyed()) {
    // Send IPC event to renderer
    mainApp.mainWindow.webContents.send('player:restart');
    return { success: true, message: 'Restart command sent' };
  }

  return {
    success: false,
    error: 'Main window not available'
  };
}

/**
 * Send seek command to renderer
 * @param {Object} mainApp - Main application instance
 * @param {number} positionSec - Position in seconds to seek to
 * @returns {Object} Result with success status
 */
export function seek(mainApp, positionSec) {
  if (typeof positionSec !== 'number') {
    return {
      success: false,
      error: 'Position must be a number'
    };
  }

  if (mainApp.mainWindow && !mainApp.mainWindow.isDestroyed()) {
    // Send IPC event to renderer with position parameter
    mainApp.mainWindow.webContents.send('player:setPosition', positionSec);
    return { success: true, message: 'Seek command sent', position: positionSec };
  }

  return {
    success: false,
    error: 'Main window not available'
  };
}

/**
 * Load and play a song file
 * @param {Object} mainApp - Main application instance
 * @param {string} filePath - Path to the song file
 * @returns {Promise<Object>} Result with success status and song data
 */
export async function loadSong(mainApp, filePath) {
  try {
    if (!filePath) {
      return {
        success: false,
        error: 'File path is required'
      };
    }

    const result = await mainApp.loadKaiFile(filePath);

    if (result && result.success) {
      return {
        success: true,
        song: result.song || result,
        message: 'Song loaded successfully'
      };
    }

    return {
      success: false,
      error: 'Failed to load song'
    };
  } catch (error) {
    console.error('Error loading song:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Skip to next song in queue
 * @param {Object} mainApp - Main application instance
 * @returns {Promise<Object>} Result with success status and next song
 */
export async function playNext(mainApp) {
  try {
    const queue = mainApp.appState.getQueue();

    if (queue.length === 0) {
      return {
        success: false,
        error: 'Queue is empty'
      };
    }

    // Remove first song from queue
    const currentSong = queue[0];
    if (currentSong && currentSong.id) {
      mainApp.appState.removeFromQueue(currentSong.id);
    }

    // Update legacy queue
    mainApp.songQueue = mainApp.appState.getQueue();

    // Load next song if there is one
    const newQueue = mainApp.appState.getQueue();
    if (newQueue.length > 0) {
      const nextSong = newQueue[0];
      await mainApp.loadKaiFile(nextSong.path, nextSong.id);

      return {
        success: true,
        song: nextSong,
        message: 'Playing next song'
      };
    }

    return {
      success: true,
      song: null,
      message: 'No more songs in queue'
    };
  } catch (error) {
    console.error('Error playing next song:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get current playback state
 * @param {Object} mainApp - Main application instance
 * @returns {Object} Current playback state
 */
export function getPlaybackState(mainApp) {
  const state = mainApp.appState.state;

  return {
    success: true,
    playback: {
      isPlaying: state.playback.isPlaying,
      position: state.playback.position,
      duration: state.playback.duration,
      songPath: state.playback.songPath,
      lastUpdate: state.playback.lastUpdate
    },
    currentSong: state.currentSong
  };
}

/**
 * Get current song
 * @param {Object} mainApp - Main application instance
 * @returns {Object} Current song or null
 */
export function getCurrentSong(mainApp) {
  if (mainApp.currentSong && mainApp.currentSong.metadata) {
    return {
      success: true,
      song: {
        path: mainApp.currentSong.metadata.path || mainApp.currentSong.filePath,
        title: mainApp.currentSong.metadata.title,
        artist: mainApp.currentSong.metadata.artist,
        requester: mainApp.currentSong.requester || 'KJ'
      }
    };
  }

  return {
    success: true,
    song: null
  };
}

/**
 * Queue Service - Shared business logic for song queue management
 *
 * Used by both IPC handlers (Electron) and REST endpoints (Web Server)
 * to ensure consistent queue behavior across all interfaces.
 */

/**
 * Add a song to the queue
 * @param {AppState} appState - Application state instance
 * @param {Object} queueItem - Song to add to queue
 * @param {string} queueItem.path - File path to song
 * @param {string} queueItem.title - Song title
 * @param {string} queueItem.artist - Artist name
 * @param {number} [queueItem.duration] - Song duration in seconds
 * @param {string} [queueItem.requester] - Who requested the song
 * @param {string} [queueItem.addedVia] - How song was added (admin, web, etc)
 * @returns {Object} Result with success status and queue data
 */
export function addSongToQueue(appState, queueItem) {
  if (!queueItem || !queueItem.path) {
    return {
      success: false,
      error: 'Invalid queue item: path is required'
    };
  }

  // Check if queue was empty before adding (for auto-play logic)
  const wasEmpty = appState.state.queue.length === 0;

  // Add to queue via AppState (handles ID generation and validation)
  const newQueueItem = appState.addToQueue(queueItem);

  return {
    success: true,
    queueItem: newQueueItem,
    queue: appState.getQueue(),
    wasEmpty  // Caller can use this to trigger auto-play
  };
}

/**
 * Remove a song from the queue by ID
 * @param {AppState} appState - Application state instance
 * @param {string|number} itemId - Queue item ID to remove
 * @returns {Object} Result with success status and removed item
 */
export function removeSongFromQueue(appState, itemId) {
  const removed = appState.removeFromQueue(itemId);

  if (removed) {
    return {
      success: true,
      removed,
      queue: appState.getQueue()
    };
  }

  return {
    success: false,
    error: 'Song not found in queue'
  };
}

/**
 * Clear all songs from the queue
 * @param {AppState} appState - Application state instance
 * @returns {Object} Result with success status
 */
export function clearQueue(appState) {
  appState.clearQueue();

  return {
    success: true,
    queue: []
  };
}

/**
 * Get the current queue
 * @param {AppState} appState - Application state instance
 * @returns {Object} Result with success status and queue array
 */
export function getQueue(appState) {
  return {
    success: true,
    queue: appState.getQueue()
  };
}

/**
 * Get queue info for display (sanitized for web clients)
 * @param {AppState} appState - Application state instance
 * @returns {Object} Result with queue info including position and count
 */
export function getQueueInfo(appState) {
  const queue = appState.getQueue();
  const currentSong = appState.state.currentSong;

  // Map queue to display format
  const queueInfo = queue.map((item, index) => ({
    id: item.id,
    position: index + 1,
    title: item.title,
    artist: item.artist,
    duration: item.duration,
    requester: item.requester,
    addedAt: item.addedAt
  }));

  return {
    success: true,
    queue: queueInfo,
    currentSong: currentSong ? {
      title: currentSong.title,
      artist: currentSong.artist,
      requester: currentSong.requester
    } : null,
    total: queue.length
  };
}

/**
 * Reorder queue by moving an item from one position to another
 * @param {AppState} appState - Application state instance
 * @param {number} fromIndex - Source index
 * @param {number} toIndex - Target index
 * @returns {Object} Result with success status and updated queue
 */
export function reorderQueue(appState, fromIndex, toIndex) {
  const queue = appState.state.queue;

  if (fromIndex < 0 || fromIndex >= queue.length) {
    return {
      success: false,
      error: 'Invalid source index'
    };
  }

  if (toIndex < 0 || toIndex >= queue.length) {
    return {
      success: false,
      error: 'Invalid target index'
    };
  }

  // Move item
  const [item] = queue.splice(fromIndex, 1);
  queue.splice(toIndex, 0, item);

  // Trigger queue changed event
  appState.emit('queueChanged', queue);

  return {
    success: true,
    queue: appState.getQueue()
  };
}

/**
 * Load a song from the queue by ID
 * @param {Object} mainApp - Main app instance with loadKaiFile method
 * @param {string|number} itemId - Queue item ID to load
 * @returns {Object} Result with success status
 */
export async function loadFromQueue(mainApp, itemId) {
  const queue = mainApp.appState.getQueue();
  const item = queue.find(q => q.id === parseFloat(itemId));

  if (!item) {
    return {
      success: false,
      error: 'Song not found in queue'
    };
  }

  try {
    // Load and play the song using mainApp's loadKaiFile method
    await mainApp.loadKaiFile(item.path);

    return {
      success: true,
      song: item
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

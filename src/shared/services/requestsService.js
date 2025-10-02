/**
 * Requests Service - Shared business logic for song request management
 *
 * Used by both IPC handlers (Electron) and REST endpoints (Web Server)
 * to ensure consistent request handling across all interfaces.
 */

/**
 * Get all song requests
 * @param {Object} webServer - Web server instance
 * @returns {Object} Result with success status and requests list
 */
export function getRequests(webServer) {
  try {
    return {
      success: true,
      requests: webServer.songRequests,
      settings: webServer.settings
    };
  } catch (error) {
    console.error('Error getting requests:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Approve a song request and add it to the queue
 * @param {Object} webServer - Web server instance
 * @param {number} requestId - ID of the request to approve
 * @returns {Object} Result with success status
 */
export async function approveRequest(webServer, requestId) {
  try {
    const request = webServer.songRequests.find(r => r.id === requestId);

    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    if (request.status !== 'pending') {
      return { success: false, error: 'Request is not pending' };
    }

    request.status = 'approved';
    await webServer.addToQueue(request);
    request.status = 'queued';

    // Broadcast the approval via Socket.IO
    if (webServer.io) {
      webServer.io.to('admin-clients').emit('request-approved', request);
      webServer.io.to('electron-apps').emit('request-approved', request);
    }

    return { success: true, request };
  } catch (error) {
    console.error('Error approving request:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Reject a song request
 * @param {Object} webServer - Web server instance
 * @param {number} requestId - ID of the request to reject
 * @returns {Object} Result with success status
 */
export async function rejectRequest(webServer, requestId) {
  try {
    const request = webServer.songRequests.find(r => r.id === requestId);

    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    if (request.status !== 'pending') {
      return { success: false, error: 'Request is not pending' };
    }

    request.status = 'rejected';

    // Broadcast the rejection via Socket.IO
    if (webServer.io) {
      webServer.io.to('admin-clients').emit('request-rejected', request);
      webServer.io.to('electron-apps').emit('request-rejected', request);
    }

    return { success: true, request };
  } catch (error) {
    console.error('Error rejecting request:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Add a new song request
 * @param {Object} webServer - Web server instance
 * @param {Object} request - Request data (song, requesterName, etc.)
 * @returns {Object} Result with success status and request ID
 */
export function addRequest(webServer, request) {
  try {
    const newRequest = {
      ...request,
      id: Date.now(),
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    webServer.songRequests.push(newRequest);

    // Broadcast the new request via Socket.IO
    if (webServer.io) {
      webServer.io.to('admin-clients').emit('new-song-request', newRequest);
      webServer.io.to('electron-apps').emit('new-song-request', newRequest);
    }

    return {
      success: true,
      request: newRequest
    };
  } catch (error) {
    console.error('Error adding request:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Clear all song requests
 * @param {Object} webServer - Web server instance
 * @returns {Object} Result with success status
 */
export function clearRequests(webServer) {
  try {
    webServer.songRequests = [];
    return { success: true };
  } catch (error) {
    console.error('Error clearing requests:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

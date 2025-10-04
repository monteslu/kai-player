/**
 * RequestsListWrapper - State management wrapper for shared RequestsList
 * Loads requests from IPC and listens for updates
 */

import { useState, useEffect } from 'react';
import { RequestsList } from '../../shared/components/RequestsList.jsx';

export function RequestsListWrapper() {
  const [requests, setRequests] = useState([]);

  // Update badge when requests change
  useEffect(() => {
    const badge = document.getElementById('requestsBadge');
    if (badge) {
      const pendingCount = requests.filter(r => r.status === 'pending').length;
      if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }, [requests]);

  useEffect(() => {
    loadRequests();

    // Auto-refresh every 5 seconds
    const interval = setInterval(loadRequests, 5000);

    // Listen for real-time updates
    if (window.kaiAPI?.events) {
      const onNewRequest = (event, request) => {
        console.log('📨 New song request:', request);
        loadRequests();
      };

      const onApproved = (event, request) => {
        console.log('✅ Request approved:', request);
        loadRequests();
      };

      const onRejected = (event, request) => {
        console.log('❌ Request rejected:', request);
        loadRequests();
      };

      window.kaiAPI.events.on('songRequest:new', onNewRequest);
      window.kaiAPI.events.on('songRequest:approved', onApproved);
      window.kaiAPI.events.on('songRequest:rejected', onRejected);

      return () => {
        clearInterval(interval);
        window.kaiAPI.events.removeListener('songRequest:new', onNewRequest);
        window.kaiAPI.events.removeListener('songRequest:approved', onApproved);
        window.kaiAPI.events.removeListener('songRequest:rejected', onRejected);
      };
    }

    return () => clearInterval(interval);
  }, []);

  const loadRequests = async () => {
    try {
      const requestsList = await window.kaiAPI.webServer.getSongRequests();
      setRequests(requestsList || []);
    } catch (error) {
      console.error('Failed to load requests:', error);
    }
  };

  const handleApprove = async (requestId) => {
    try {
      await window.kaiAPI.webServer.approveRequest(requestId);
      await loadRequests();
    } catch (error) {
      console.error('Failed to approve request:', error);
    }
  };

  const handleReject = async (requestId) => {
    try {
      await window.kaiAPI.webServer.rejectRequest(requestId);
      await loadRequests();
    } catch (error) {
      console.error('Failed to reject request:', error);
    }
  };

  return (
    <RequestsList
      requests={requests}
      onApprove={handleApprove}
      onReject={handleReject}
    />
  );
}

class RequestsManager {
    constructor() {
        this.webServerPort = null;
        this.settings = {
            allowSongRequests: true,
            requireKJApproval: true
        };
        this.requests = [];
        this.refreshInterval = null;
        
        this.setupEventListeners();
        this.initialize();
    }

    async initialize() {
        try {
            // Get web server port and settings
            this.webServerPort = await window.kaiAPI.webServer.getPort();
            this.settings = await window.kaiAPI.webServer.getSettings() || this.settings;
            
            this.updateServerStatus();
            this.updateSettingsUI();
            await this.loadRequests();
            
            // Start auto-refresh
            this.startAutoRefresh();
            
        } catch (error) {
            console.error('Failed to initialize requests manager:', error);
        }
    }

    setupEventListeners() {
        // Copy URL button
        document.getElementById('copyUrlBtn')?.addEventListener('click', () => {
            this.copyServerUrl();
        });

        // Settings toggles
        document.getElementById('allowRequestsToggle')?.addEventListener('change', (e) => {
            this.updateSetting('allowSongRequests', e.target.checked);
        });

        document.getElementById('requireApprovalToggle')?.addEventListener('change', (e) => {
            this.updateSetting('requireKJApproval', e.target.checked);
        });

        // Refresh button
        document.getElementById('refreshRequestsBtn')?.addEventListener('click', () => {
            this.loadRequests();
        });

        // Clear history button
        document.getElementById('clearHistoryBtn')?.addEventListener('click', () => {
            this.clearHistory();
        });

        // Listen for new song requests from main process
        if (window.kaiAPI && window.kaiAPI.events) {
            window.kaiAPI.events.on('songRequest:new', (event, request) => {
                this.handleNewRequest(request);
            });

            window.kaiAPI.events.on('songRequest:approved', (event, request) => {
                this.handleRequestStatusChange(request, 'queued');
            });

            window.kaiAPI.events.on('songRequest:rejected', (event, request) => {
                this.handleRequestStatusChange(request, 'rejected');
            });
        }
    }

    updateServerStatus() {
        const urlElement = document.getElementById('serverUrl');
        const copyBtn = document.getElementById('copyUrlBtn');
        
        if (this.webServerPort) {
            const url = `http://localhost:${this.webServerPort}`;
            urlElement.textContent = `🟢 ${url}`;
            copyBtn.style.display = 'inline-block';
            copyBtn.onclick = () => this.copyToClipboard(url);
        } else {
            urlElement.textContent = '🔴 Server not started';
            copyBtn.style.display = 'none';
        }
    }

    updateSettingsUI() {
        const allowToggle = document.getElementById('allowRequestsToggle');
        const approvalToggle = document.getElementById('requireApprovalToggle');
        
        if (allowToggle) allowToggle.checked = this.settings.allowSongRequests;
        if (approvalToggle) approvalToggle.checked = this.settings.requireKJApproval;
    }

    async updateSetting(key, value) {
        try {
            this.settings[key] = value;
            await window.kaiAPI.webServer.updateSettings({ [key]: value });
            console.log(`Updated ${key} to ${value}`);
        } catch (error) {
            console.error(`Failed to update setting ${key}:`, error);
        }
    }

    async loadRequests() {
        try {
            this.requests = await window.kaiAPI.webServer.getSongRequests() || [];
            this.displayRequests();
        } catch (error) {
            console.error('Failed to load requests:', error);
        }
    }

    displayRequests() {
        const pendingList = document.getElementById('pendingRequestsList');
        const historyList = document.getElementById('requestHistoryList');

        const pendingRequests = this.requests.filter(r => r.status === 'pending');
        const completedRequests = this.requests.filter(r => r.status !== 'pending');

        // Update badge
        this.updateBadge(pendingRequests.length);
        
        // Display pending requests
        if (pendingRequests.length === 0) {
            pendingList.innerHTML = '<div class="no-requests">No pending requests</div>';
        } else {
            pendingList.innerHTML = pendingRequests.map(request => this.createRequestElement(request, true)).join('');
        }
        
        // Display completed requests (recent 20)
        const recentCompleted = completedRequests.slice(-20).reverse();
        if (recentCompleted.length === 0) {
            historyList.innerHTML = '<div class="no-requests">No recent activity</div>';
        } else {
            historyList.innerHTML = recentCompleted.map(request => this.createRequestElement(request, false)).join('');
        }
    }

    createRequestElement(request, showActions) {
        const timeAgo = this.getTimeAgo(new Date(request.timestamp));
        const statusClass = request.status;
        
        const actionsHtml = showActions ? `
            <div class="request-actions">
                <button class="request-action-btn approve" onclick="window.requestsManager.approveRequest(${request.id})">
                    ✅ Approve
                </button>
                <button class="request-action-btn reject" onclick="window.requestsManager.rejectRequest(${request.id})">
                    ❌ Reject
                </button>
            </div>
        ` : `<div class="request-status ${statusClass}">${request.status}</div>`;

        const messageHtml = request.message ? `
            <div class="request-message">"${this.escapeHtml(request.message)}"</div>
        ` : '';

        const title = request.song.title;
        const artist = request.song.artist;

        return `
            <div class="request-item ${statusClass}">
                <div class="request-header">
                    <div class="request-song">
                        <div class="request-song-title">${this.escapeHtml(title)}</div>
                        <div class="request-song-artist">by ${this.escapeHtml(artist)}</div>
                    </div>
                    ${actionsHtml}
                </div>
                ${messageHtml}
                <div class="request-meta">
                    <span class="request-requester">👤 ${this.escapeHtml(request.requesterName)}</span>
                    <span class="request-time">${timeAgo}</span>
                </div>
            </div>
        `;
    }

    async approveRequest(requestId) {
        try {
            const result = await window.kaiAPI.webServer.approveRequest(requestId);
            if (result.success) {
                console.log('Request approved successfully');
                await this.loadRequests(); // Refresh the list
            } else {
                console.error('Failed to approve request:', result.error);
            }
        } catch (error) {
            console.error('Error approving request:', error);
        }
    }

    async rejectRequest(requestId) {
        try {
            const result = await window.kaiAPI.webServer.rejectRequest(requestId);
            if (result.success) {
                console.log('Request rejected successfully');
                await this.loadRequests(); // Refresh the list
            } else {
                console.error('Failed to reject request:', result.error);
            }
        } catch (error) {
            console.error('Error rejecting request:', error);
        }
    }

    handleNewRequest(request) {
        // Check if request already exists (avoid duplicates)
        const existingIndex = this.requests.findIndex(r => r.id === request.id);
        if (existingIndex === -1) {
            // Add the new request to our local list and refresh display
            this.requests.push(request);
            this.displayRequests();

            // Show notification
            this.showNotification(`New song request: "${request.song.title}" by ${request.requesterName}`);
        }
    }

    handleRequestStatusChange(request, newStatus) {
        // Update the request status in our local list
        const index = this.requests.findIndex(r => r.id === request.id);
        if (index !== -1) {
            this.requests[index].status = newStatus;
            this.displayRequests();
        } else {
            // Request not in our list yet, add it
            this.requests.push(request);
            this.displayRequests();
        }
    }

    showNotification(message) {
        // Simple notification - you could enhance this with a toast system
        console.log('📣 ' + message);
        
        // Optional: Show desktop notification
        if (Notification.permission === 'granted') {
            new Notification('New Song Request', {
                body: message,
                icon: '/static/images/logo.png'
            });
        }
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            console.log('URL copied to clipboard');
            // Brief visual feedback
            const btn = document.getElementById('copyUrlBtn');
            const originalText = btn.textContent;
            btn.textContent = '✅ Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy URL:', err);
        });
    }

    clearHistory() {
        if (confirm('Clear all request history?')) {
            // Remove completed requests from the list
            this.requests = this.requests.filter(r => r.status === 'pending');
            this.displayRequests();
        }
    }

    startAutoRefresh() {
        // Refresh every 10 seconds
        this.refreshInterval = setInterval(() => {
            this.loadRequests();
        }, 10000);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateBadge(count) {
        const badge = document.getElementById('requestsBadge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    // Clean up when manager is destroyed
    destroy() {
        this.stopAutoRefresh();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.requestsManager = new RequestsManager();
});
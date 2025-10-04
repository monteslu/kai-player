/**
 * WebBridge - Web-specific implementation of BridgeInterface
 *
 * Uses fetch() for REST API calls and Socket.IO for real-time updates
 * This replaces the scattered fetch() calls in web admin components
 *
 * Components use this bridge and never directly call fetch() or socket.emit()
 */

import { BridgeInterface } from '../../shared/adapters/BridgeInterface.js';
import { io } from 'socket.io-client';

export class WebBridge extends BridgeInterface {
  constructor(baseUrl = '/admin') {
    super();
    this.baseUrl = baseUrl;
    this.socket = null;
    this.listeners = new Map(); // Track listeners for cleanup
  }

  // Helper: Make authenticated fetch request
  async _fetch(endpoint, options = {}) {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    return await res.json();
  }

  // ===== Player Controls =====

  async play() {
    return await this._fetch('/player/play', { method: 'POST' });
  }

  async pause() {
    return await this._fetch('/player/pause', { method: 'POST' });
  }

  async restart() {
    return await this._fetch('/player/restart', { method: 'POST' });
  }

  async seek(positionSec) {
    return await this._fetch('/player/seek', {
      method: 'POST',
      body: JSON.stringify({ position: positionSec })
    });
  }

  async getPlaybackState() {
    const state = await this._fetch('/state');
    return state.playback;
  }

  // ===== Queue Management =====

  async getQueue() {
    return await this._fetch('/queue');
  }

  async addToQueue(song) {
    return await this._fetch('/queue/add', {
      method: 'POST',
      body: JSON.stringify({ song })
    });
  }

  async removeFromQueue(id) {
    return await this._fetch(`/queue/remove/${id}`, { method: 'POST' });
  }

  async clearQueue() {
    return await this._fetch('/queue/clear', { method: 'POST' });
  }

  async reorderQueue(fromIndex, toIndex) {
    return await this._fetch('/queue/reorder', {
      method: 'POST',
      body: JSON.stringify({ fromIndex, toIndex })
    });
  }

  async playNext() {
    return await this._fetch('/queue/next', { method: 'POST' });
  }

  async playFromQueue(songId) {
    return await this._fetch('/queue/load', {
      method: 'POST',
      body: JSON.stringify({ songId })
    });
  }

  // ===== Mixer Controls =====

  async getMixerState() {
    const state = await this._fetch('/state');
    return state.mixer;
  }

  async setMasterGain(bus, gainDb) {
    return await this._fetch('/mixer/master-gain', {
      method: 'POST',
      body: JSON.stringify({ bus, gainDb })
    });
  }

  async toggleMasterMute(bus) {
    return await this._fetch('/mixer/master-mute', {
      method: 'POST',
      body: JSON.stringify({ bus })
    });
  }

  async setMasterMute(bus, muted) {
    return await this._fetch('/mixer/master-mute', {
      method: 'POST',
      body: JSON.stringify({ bus, muted })
    });
  }

  // ===== Effects Controls =====

  async getEffects() {
    return await this._fetch('/effects');
  }

  async selectEffect(effectName) {
    return await this._fetch('/effects/select', {
      method: 'POST',
      body: JSON.stringify({ effectName })
    });
  }

  async toggleEffect(effectName, enabled) {
    return await this._fetch('/effects/toggle', {
      method: 'POST',
      body: JSON.stringify({ effectName, enabled })
    });
  }

  async nextEffect() {
    return await this._fetch('/effects/next', { method: 'POST' });
  }

  async previousEffect() {
    return await this._fetch('/effects/previous', { method: 'POST' });
  }

  async randomEffect() {
    return await this._fetch('/effects/random', { method: 'POST' });
  }

  async enableEffect(effectName) {
    return await this._fetch('/effects/enable', {
      method: 'POST',
      body: JSON.stringify({ effectName })
    });
  }

  async disableEffect(effectName) {
    return await this._fetch('/effects/disable', {
      method: 'POST',
      body: JSON.stringify({ effectName })
    });
  }

  // ===== Library Management =====

  async getLibrary() {
    return await this._fetch('/library');
  }

  async scanLibrary() {
    return await this._fetch('/library/refresh', { method: 'POST' });
  }

  async searchSongs(query) {
    return await this._fetch(`/library/search?q=${encodeURIComponent(query)}`);
  }

  async loadSongForEditing(path) {
    return await this._fetch('/editor/load', {
      method: 'POST',
      body: JSON.stringify({ path })
    });
  }

  async saveSongEdits(updates) {
    return await this._fetch('/editor/save', {
      method: 'POST',
      body: JSON.stringify(updates)
    });
  }

  async getSongsFolder() {
    const data = await this._fetch('/library/folder');
    return data.folder;
  }

  async setSongsFolder() {
    return await this._fetch('/library/folder', { method: 'POST' });
  }

  async getCachedLibrary() {
    return await this._fetch('/library/songs');
  }

  async syncLibrary() {
    return await this._fetch('/library/sync', { method: 'POST' });
  }

  async loadSong(path) {
    return await this._fetch('/player/load', {
      method: 'POST',
      body: JSON.stringify({ path })
    });
  }

  // ===== Preferences =====

  async getPreferences() {
    return await this._fetch('/preferences');
  }

  async updateAutoTunePreferences(prefs) {
    return await this._fetch('/preferences/autotune', {
      method: 'POST',
      body: JSON.stringify(prefs)
    });
  }

  async updateMicrophonePreferences(prefs) {
    return await this._fetch('/preferences/microphone', {
      method: 'POST',
      body: JSON.stringify(prefs)
    });
  }

  async updateEffectsPreferences(prefs) {
    return await this._fetch('/preferences/effects', {
      method: 'POST',
      body: JSON.stringify(prefs)
    });
  }

  // ===== Song Requests =====

  async getRequests() {
    const data = await this._fetch('/requests');
    return data.requests || [];
  }

  async approveRequest(requestId) {
    return await this._fetch(`/requests/${requestId}/approve`, { method: 'POST' });
  }

  async rejectRequest(requestId) {
    return await this._fetch(`/requests/${requestId}/reject`, { method: 'POST' });
  }

  // ===== State Subscriptions =====

  onStateChange(domain, callback) {
    if (!this.socket) {
      console.warn('Socket not connected - call connect() first');
      return () => {};
    }

    // Map domain to Socket.IO event
    const eventMap = {
      'mixer': 'mixer-update',
      'queue': 'queue-update',
      'playback': 'playback-state-update',
      'effects': 'effects-update',
      'preferences': 'preferences-update',
      'requests': 'new-song-request'
    };

    const event = eventMap[domain];
    if (!event) {
      console.warn(`No socket event mapping for domain: ${domain}`);
      return () => {};
    }

    // Subscribe
    this.socket.on(event, callback);

    // Track for cleanup
    if (!this.listeners.has(domain)) {
      this.listeners.set(domain, []);
    }
    this.listeners.get(domain).push(callback);

    // Return unsubscribe function
    return () => this.offStateChange(domain, callback);
  }

  offStateChange(domain, callback) {
    if (!this.socket) return;

    const eventMap = {
      'mixer': 'mixer-update',
      'queue': 'queue-update',
      'playback': 'playback-state-update',
      'effects': 'effects-update',
      'preferences': 'preferences-update',
      'requests': 'new-song-request'
    };

    const event = eventMap[domain];
    if (event) {
      this.socket.off(event, callback);
    }

    // Remove from tracking
    const listeners = this.listeners.get(domain);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  // ===== Lifecycle =====

  async connect() {
    if (this.socket) {
      console.log('Socket already connected');
      return;
    }

    return new Promise((resolve) => {
      this.socket = io({
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity
      });

      this.socket.on('connect', () => {
        console.log('✅ WebBridge connected to Socket.IO');
        // Identify as admin client
        this.socket.emit('identify', { type: 'admin' });
        resolve();
      });

      this.socket.on('disconnect', () => {
        console.log('🔌 WebBridge disconnected from Socket.IO');
      });

      this.socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
      });
    });
  }

  async disconnect() {
    if (!this.socket) return;

    // Clean up all listeners
    for (const [domain, listeners] of this.listeners.entries()) {
      listeners.forEach(listener => this.offStateChange(domain, listener));
    }
    this.listeners.clear();

    // Disconnect socket
    this.socket.disconnect();
    this.socket = null;
    console.log('✅ WebBridge disconnected');
  }
}

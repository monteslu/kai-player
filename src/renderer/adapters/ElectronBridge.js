/**
 * ElectronBridge - Electron-specific implementation of BridgeInterface
 *
 * Wraps window.kaiAPI (IPC interface exposed by preload script)
 * This is the ONLY place in React code that touches window.kaiAPI
 *
 * Components use this bridge and never directly access window.*
 */

import { BridgeInterface } from '../../shared/adapters/BridgeInterface.js';

export class ElectronBridge extends BridgeInterface {
  constructor() {
    super();
    this.api = window.kaiAPI;
    this.listeners = new Map(); // Track listeners for cleanup
  }

  // ===== Player Controls =====

  async play() {
    return await this.api.player.play();
  }

  async pause() {
    return await this.api.player.pause();
  }

  async restart() {
    return await this.api.player.restart();
  }

  async seek(positionSec) {
    return await this.api.player.seek(positionSec);
  }

  async getPlaybackState() {
    const state = await this.api.app.getState();
    return state.playback;
  }

  // ===== Queue Management =====

  async getQueue() {
    const state = await this.api.app.getState();
    return { queue: state.queue, currentSong: state.currentSong };
  }

  async addToQueue(song) {
    return await this.api.queue.add(song);
  }

  async removeFromQueue(id) {
    return await this.api.queue.remove(id);
  }

  async clearQueue() {
    return await this.api.queue.clear();
  }

  async reorderQueue(fromIndex, toIndex) {
    return await this.api.queue.reorder(fromIndex, toIndex);
  }

  async playNext() {
    return await this.api.queue.playNext();
  }

  // ===== Mixer Controls =====

  async getMixerState() {
    const state = await this.api.app.getState();
    return state.mixer;
  }

  async setMasterGain(bus, gainDb) {
    return await this.api.mixer.setMasterGain(bus, gainDb);
  }

  async toggleMasterMute(bus) {
    return await this.api.mixer.toggleMasterMute(bus);
  }

  async setMasterMute(bus, muted) {
    // This method might not exist on kaiAPI yet - use toggleMasterMute for now
    // TODO: Add to preload.js if needed
    return await this.api.mixer.toggleMasterMute(bus);
  }

  // ===== Effects Controls =====

  async getEffects() {
    return await this.api.effects.getList();
  }

  async selectEffect(effectName) {
    return await this.api.effects.select(effectName);
  }

  async toggleEffect(effectName, enabled) {
    return await this.api.effects.toggle(effectName, enabled);
  }

  async nextEffect() {
    return await this.api.effects.next();
  }

  async previousEffect() {
    return await this.api.effects.previous();
  }

  async randomEffect() {
    return await this.api.effects.random();
  }

  // ===== Library Management =====

  async getLibrary() {
    return await this.api.library.getSongs();
  }

  async scanLibrary() {
    return await this.api.library.scanFolder();
  }

  async searchSongs(query) {
    return await this.api.library.search(query);
  }

  // ===== Preferences =====

  async getPreferences() {
    const state = await this.api.app.getState();
    return state.preferences;
  }

  async updateAutoTunePreferences(prefs) {
    return await this.api.preferences.setAutoTune(prefs);
  }

  async updateMicrophonePreferences(prefs) {
    return await this.api.preferences.setMicrophone(prefs);
  }

  async updateEffectsPreferences(prefs) {
    return await this.api.preferences.setEffects(prefs);
  }

  // ===== Song Requests =====

  async getRequests() {
    return await this.api.webServer.getSongRequests();
  }

  async approveRequest(requestId) {
    return await this.api.webServer.approveRequest(requestId);
  }

  async rejectRequest(requestId) {
    return await this.api.webServer.rejectRequest(requestId);
  }

  // ===== State Subscriptions =====

  onStateChange(domain, callback) {
    // Map domain to IPC channel
    const channelMap = {
      'mixer': 'mixer:state',
      'queue': 'queue:updated',
      'playback': 'playback:state',
      'effects': 'effects:changed',
      'preferences': 'preferences:updated'
    };

    const channel = channelMap[domain];
    if (!channel) {
      console.warn(`No IPC channel mapping for domain: ${domain}`);
      return () => {};
    }

    // Wrap callback to handle IPC event format
    const wrappedCallback = (event, data) => {
      callback(data);
    };

    // Subscribe via appropriate kaiAPI method
    if (domain === 'mixer' && this.api.mixer.onStateChange) {
      this.api.mixer.onStateChange(wrappedCallback);
    } else if (domain === 'queue' && this.api.queue.onChange) {
      this.api.queue.onChange(wrappedCallback);
    } else if (domain === 'effects' && this.api.effects.onChange) {
      this.api.effects.onChange(wrappedCallback);
    }

    // Track for cleanup
    if (!this.listeners.has(domain)) {
      this.listeners.set(domain, []);
    }
    this.listeners.get(domain).push(wrappedCallback);

    // Return unsubscribe function
    return () => this.offStateChange(domain, callback);
  }

  offStateChange(domain, callback) {
    const listeners = this.listeners.get(domain);
    if (!listeners) return;

    // Find and remove listener
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }

    // Clean up via kaiAPI if available
    if (domain === 'mixer' && this.api.mixer.removeStateListener) {
      this.api.mixer.removeStateListener(callback);
    } else if (domain === 'queue' && this.api.queue.offChange) {
      this.api.queue.offChange(callback);
    }
  }

  // ===== Lifecycle =====

  async connect() {
    // Already connected via IPC - nothing to do
    console.log('✅ ElectronBridge connected');
  }

  async disconnect() {
    // Clean up all listeners
    for (const [domain, listeners] of this.listeners.entries()) {
      listeners.forEach(listener => this.offStateChange(domain, listener));
    }
    this.listeners.clear();
    console.log('✅ ElectronBridge disconnected');
  }
}

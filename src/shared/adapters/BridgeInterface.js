/**
 * BridgeInterface - Abstract base class for platform-specific communication
 *
 * This defines the contract that both ElectronBridge and WebBridge must implement.
 * Components use this interface and don't care about the underlying transport.
 *
 * Platform-specific implementations:
 * - ElectronBridge: Uses window.kaiAPI (IPC to main process)
 * - WebBridge: Uses fetch() and Socket.IO (REST + WebSocket)
 */

export class BridgeInterface {
  // ===== Player Controls =====

  async play() {
    throw new Error('play() not implemented');
  }

  async pause() {
    throw new Error('pause() not implemented');
  }

  async restart() {
    throw new Error('restart() not implemented');
  }

  async seek(positionSec) {
    throw new Error('seek() not implemented');
  }

  async getPlaybackState() {
    throw new Error('getPlaybackState() not implemented');
  }

  // ===== Queue Management =====

  async getQueue() {
    throw new Error('getQueue() not implemented');
  }

  async addToQueue(song) {
    throw new Error('addToQueue() not implemented');
  }

  async removeFromQueue(id) {
    throw new Error('removeFromQueue() not implemented');
  }

  async clearQueue() {
    throw new Error('clearQueue() not implemented');
  }

  async reorderQueue(fromIndex, toIndex) {
    throw new Error('reorderQueue() not implemented');
  }

  async playNext() {
    throw new Error('playNext() not implemented');
  }

  // ===== Mixer Controls =====

  async getMixerState() {
    throw new Error('getMixerState() not implemented');
  }

  async setMasterGain(bus, gainDb) {
    throw new Error('setMasterGain() not implemented');
  }

  async toggleMasterMute(bus) {
    throw new Error('toggleMasterMute() not implemented');
  }

  async setMasterMute(bus, muted) {
    throw new Error('setMasterMute() not implemented');
  }

  // ===== Effects Controls =====

  async getEffects() {
    throw new Error('getEffects() not implemented');
  }

  async selectEffect(effectName) {
    throw new Error('selectEffect() not implemented');
  }

  async toggleEffect(effectName, enabled) {
    throw new Error('toggleEffect() not implemented');
  }

  async nextEffect() {
    throw new Error('nextEffect() not implemented');
  }

  async previousEffect() {
    throw new Error('previousEffect() not implemented');
  }

  async randomEffect() {
    throw new Error('randomEffect() not implemented');
  }

  // ===== Library Management =====

  async getLibrary() {
    throw new Error('getLibrary() not implemented');
  }

  async scanLibrary() {
    throw new Error('scanLibrary() not implemented');
  }

  async searchSongs(query) {
    throw new Error('searchSongs() not implemented');
  }

  // ===== Preferences =====

  async getPreferences() {
    throw new Error('getPreferences() not implemented');
  }

  async updateAutoTunePreferences(prefs) {
    throw new Error('updateAutoTunePreferences() not implemented');
  }

  async updateMicrophonePreferences(prefs) {
    throw new Error('updateMicrophonePreferences() not implemented');
  }

  async updateEffectsPreferences(prefs) {
    throw new Error('updateEffectsPreferences() not implemented');
  }

  // ===== Song Requests =====

  async getRequests() {
    throw new Error('getRequests() not implemented');
  }

  async approveRequest(requestId) {
    throw new Error('approveRequest() not implemented');
  }

  async rejectRequest(requestId) {
    throw new Error('rejectRequest() not implemented');
  }

  // ===== State Subscriptions =====

  /**
   * Subscribe to state changes for a specific domain
   * @param {string} domain - State domain (mixer, queue, playback, effects, etc.)
   * @param {Function} callback - Callback function (receives updated state)
   * @returns {Function} Unsubscribe function
   */
  onStateChange(domain, callback) {
    throw new Error('onStateChange() not implemented');
  }

  /**
   * Unsubscribe from state changes
   * @param {string} domain - State domain
   * @param {Function} callback - Callback to remove
   */
  offStateChange(domain, callback) {
    throw new Error('offStateChange() not implemented');
  }

  // ===== Lifecycle =====

  /**
   * Initialize the bridge (e.g., connect sockets)
   */
  async connect() {
    // Optional - override if needed
  }

  /**
   * Clean up resources (e.g., disconnect sockets)
   */
  async disconnect() {
    // Optional - override if needed
  }
}

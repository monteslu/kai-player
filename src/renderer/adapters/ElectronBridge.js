/**
 * ElectronBridge - Electron-specific implementation of BridgeInterface
 *
 * Wraps window.kaiAPI (IPC interface exposed by preload script)
 * This is the ONLY place in React code that touches window.kaiAPI
 *
 * Components use this bridge and never directly access window.*
 */

import { BridgeInterface } from '../../shared/adapters/BridgeInterface.js';

let _instance = null;

export class ElectronBridge extends BridgeInterface {
  constructor() {
    if (_instance) {
      return _instance;
    }
    super();
    this.api = window.kaiAPI;
    this.listeners = new Map(); // Track listeners for cleanup
    _instance = this;
  }

  static getInstance() {
    if (!_instance) {
      _instance = new ElectronBridge();
    }
    return _instance;
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
    return await this.api.queue.addSong(song);
  }

  async removeFromQueue(id) {
    return await this.api.queue.removeSong(id);
  }

  async clearQueue() {
    return await this.api.queue.clear();
  }

  async reorderQueue(fromIndex, toIndex) {
    // TODO: Not implemented in preload API yet
    console.warn('reorderQueue not implemented in preload API');
    return { success: false };
  }

  async playNext() {
    // TODO: Not implemented in preload API yet
    console.warn('playNext not implemented in preload API');
    return { success: false };
  }

  async playFromQueue(songId) {
    // Load song by path (songId is the file path)
    return await this.api.file.loadKaiFromPath(songId);
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

  async enableEffect(effectName) {
    return await this.api.effects.toggle(effectName, true);
  }

  async disableEffect(effectName) {
    return await this.api.effects.toggle(effectName, false);
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

  async getSongsFolder() {
    const result = await this.api.library.getSongsFolder();
    return result.folder;
  }

  async setSongsFolder() {
    const result = await this.api.library.setSongsFolder();
    return result.folder;
  }

  async getCachedLibrary() {
    const result = await this.api.library.getCachedSongs();
    return result;
  }

  async syncLibrary() {
    const result = await this.api.library.syncLibrary();
    return result;
  }

  async loadSong(path) {
    return await this.api.file.loadKaiFromPath(path);
  }

  // ===== Song Editor =====

  async loadSongForEditing(path) {
    // Load the KAI file for editing (using editor.loadKai which doesn't affect playback)
    const result = await this.api.editor.loadKai(path);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const songData = result.data;

    // Create blob URLs for audio files (for Audio element playback)
    const audioFiles = songData.audio?.sources?.map(source => {
      // Create blob URL from audioData buffer
      const blob = new Blob([source.audioData], { type: 'audio/mpeg' });
      const downloadUrl = URL.createObjectURL(blob);

      return {
        name: source.name,
        filename: source.filename,
        audioData: source.audioData, // Keep raw data for waveform analysis
        downloadUrl: downloadUrl // Blob URL for Audio element
      };
    }) || [];

    // Return in the format expected by SongEditor
    return {
      success: true,
      data: {
        format: 'kai',
        metadata: songData.metadata || {},
        lyrics: songData.lyrics || [],
        audioFiles: audioFiles,
        songJson: songData.originalSongJson || {}
      }
    };
  }

  async saveSongEdits(updates) {
    const { path, metadata, lyrics, format } = updates;

    if (format === 'kai') {
      // Build the song object for KaiWriter
      const songData = {
        song: {
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          year: metadata.year,
          genre: metadata.genre,
          key: metadata.key
        },
        lyrics: lyrics
      };

      // Include meta if rejections/suggestions were updated
      if (metadata.rejections !== undefined || metadata.suggestions !== undefined) {
        songData.meta = { corrections: {} };

        if (metadata.rejections !== undefined) {
          songData.meta.corrections.rejected = metadata.rejections.map(r => ({
            line: r.line_num,
            start: r.start_time,
            end: r.end_time,
            old: r.old_text,
            new: r.new_text,
            reason: r.reason,
            word_retention: r.retention_rate
          }));
        }

        if (metadata.suggestions !== undefined) {
          songData.meta.corrections.missing_lines_suggested = metadata.suggestions.map(s => ({
            suggested_text: s.suggested_text,
            start: s.start_time,
            end: s.end_time,
            confidence: s.confidence,
            reason: s.reason,
            pitch_activity: s.pitch_activity
          }));
        }
      }

      const result = await this.api.editor.saveKai(songData, path);
      return result;
    }

    return { success: false, error: 'Unsupported format' };
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

  onPlaybackStateChanged(callback) {
    // Use IPC event instead of polling
    const handler = (event, state) => callback(state);
    this.api.player.onPlaybackState(handler);

    // Return cleanup function
    return () => this.api.player.removePlaybackListener(handler);
  }

  onCurrentSongChanged(callback) {
    // Use IPC event instead of polling
    const handler = (event, song) => callback(song);
    this.api.song.onChanged(handler);

    // Return cleanup function
    return () => this.api.song.removeChangedListener(handler);
  }

  onQueueChanged(callback) {
    // Use IPC event instead of polling
    const handler = (event, queue) => {
      // Get current song from app state
      this.api.app.getState().then(state => {
        callback({ queue, currentSong: state.currentSong });
      });
    };
    this.api.queue.onUpdated(handler);

    // Return cleanup function
    return () => this.api.queue.removeUpdatedListener(handler);
  }

  onMixerChanged(callback) {
    // Use IPC event instead of polling
    const handler = (event, mixer) => callback(mixer);
    this.api.mixer.onStateChange(handler);

    // Return cleanup function
    return () => this.api.mixer.removeStateListener(handler);
  }

  onEffectChanged(callback) {
    // Use IPC event instead of polling
    const handler = (event, effects) => callback(effects);
    this.api.effects.onChanged(handler);

    // Return cleanup function
    return () => this.api.effects.removeChangedListener(handler);
  }

  onStateChange(domain, callback) {
    // Use the specific on* methods for each domain
    switch (domain) {
      case 'playback':
        return this.onPlaybackStateChanged(callback);
      case 'mixer':
        return this.onMixerChanged(callback);
      case 'queue':
        return this.onQueueChanged(callback);
      case 'effects':
        return this.onEffectChanged(callback);
      case 'preferences': {
        const handler = (event, prefs) => callback(prefs);
        this.api.preferences.onUpdated(handler);
        return () => this.api.preferences.removeUpdatedListener(handler);
      }
      default:
        console.warn(`No state change handler for domain: ${domain}`);
        return () => {};
    }
  }

  offStateChange(domain, callback) {
    // No longer needed - cleanup functions returned directly from onStateChange
    console.warn('offStateChange is deprecated - use the cleanup function returned from onStateChange instead');
  }

  // ===== Lifecycle =====

  async connect() {
    // Already connected via IPC - nothing to do
    console.log('✅ ElectronBridge connected');
  }

  async disconnect() {
    // Cleanup is now handled by the cleanup functions returned from each subscription
    // Components should call the cleanup functions when they unmount
    this.listeners.clear();
    console.log('✅ ElectronBridge disconnected');
  }
}

import StateManager from '../shared/state/StateManager.js';

/**
 * AppState - Canonical application state model
 *
 * This is the single source of truth for all application state.
 * Renderer reports changes via IPC, web clients query this state.
 *
 * Now extends the universal StateManager with app-specific methods
 * and maintains backward compatibility with existing code.
 */
class AppState extends StateManager {
  constructor() {
    // Initialize StateManager with app-specific initial state
    super({
      // Playback state (updated frequently from renderer)
      playback: {
        isPlaying: false,
        position: 0, // seconds
        duration: 0, // seconds
        songPath: null,
        lastUpdate: Date.now(),
      },

      // Current song metadata
      currentSong: null, // { path, title, artist, duration, requester }

      // Queue
      queue: [],

      // Mixer state (synced from renderer)
      mixer: {
        PA: {
          gain: 0, // dB
          muted: false,
        },
        IEM: {
          gain: 0, // dB
          muted: false,
          mono: true, // Always mono for single-ear monitoring
        },
        mic: {
          gain: 0, // dB
          muted: false,
        },
        stems: [], // For reference only: [{ id, name, gain, index }]
      },

      // Effects state (synced from renderer)
      effects: {
        current: null,
        disabled: [],
        enableWaveforms: true,
        enableEffects: true,
        randomEffectOnSong: false,
        overlayOpacity: 0.7,
        showUpcomingLyrics: true,
      },

      // User preferences (broadcasted to all clients)
      preferences: {
        autoTune: {
          enabled: false,
          strength: 50,
          speed: 20,
        },
        microphone: {
          enabled: false,
          gain: 1.0,
          toSpeakers: true,
        },
        iemMonoVocals: true,
        audio: {
          devices: {
            PA: { id: 'default', name: 'Default Output' },
            IEM: { id: 'default', name: 'Default Output' },
            input: { id: 'default', name: 'Default Input' },
          },
        },
      },
    });

    // Set up event forwarding for backward compatibility
    // StateManager emits domain-specific events (e.g., 'playbackChanged')
    // But old code expects 'playbackStateChanged', so we forward playback events
    this.on('playbackChanged', (state) => this.emit('playbackStateChanged', state, {}));

    // Note: currentSongChanged, queueChanged, mixerChanged, effectsChanged, preferencesChanged
    // are already emitted by the AppState methods directly for backward compatibility
  }

  /**
   * Update playback state from renderer
   * Called frequently (10x/sec) with position updates
   */
  updatePlaybackState(updates) {
    // Use StateManager's update method
    const updatesWithTimestamp = {
      ...updates,
      lastUpdate: Date.now(),
    };

    this.update('playback', updatesWithTimestamp);
  }

  /**
   * Set current song (called when song is loaded)
   */
  setCurrentSong(songData) {
    const newSong = songData
      ? {
          path: songData.path || songData.filePath,
          title: songData.title,
          artist: songData.artist,
          duration: songData.duration || 0,
          requester: songData.requester || 'KJ',
          isLoading: songData.isLoading || false, // Preserve loading state
          format: songData.format, // Preserve format (kai/cdg)
          queueItemId: songData.queueItemId || null, // Track which queue item is loaded (for duplicate songs)
        }
      : null;

    // Update currentSong domain
    this.state.currentSong = newSong;
    this.emit('currentSongChanged', newSong);

    // Update playback state with new song
    const playbackUpdates = songData
      ? {
          songPath: songData.path || songData.filePath,
          duration: songData.duration || 0,
          position: 0,
        }
      : {
          songPath: null,
          duration: 0,
          position: 0,
        };

    this.update('playback', playbackUpdates);
  }

  /**
   * Queue operations
   */
  addToQueue(item) {
    const queueItem = {
      id: item.id || Date.now() + Math.random(),
      path: item.path,
      title: item.title,
      artist: item.artist,
      duration: item.duration || 0,
      requester: item.requester || 'KJ',
      addedVia: item.addedVia || 'unknown',
      addedAt: item.addedAt || new Date(),
    };

    this.state.queue.push(queueItem);
    this.emit('queueChanged', this.state.queue);

    return queueItem;
  }

  removeFromQueue(id) {
    const index = this.state.queue.findIndex((item) => item.id === id);
    if (index !== -1) {
      const removed = this.state.queue.splice(index, 1)[0];
      this.emit('queueChanged', this.state.queue);
      return removed;
    }
    return null;
  }

  clearQueue() {
    this.state.queue = [];
    this.emit('queueChanged', this.state.queue);
  }

  getQueue() {
    return [...this.state.queue];
  }

  /**
   * Mixer state operations
   */
  updateMixerState(mixerState) {
    this.update('mixer', mixerState);
  }

  /**
   * Effects state operations
   */
  updateEffectsState(effectsState) {
    this.update('effects', effectsState);
  }

  /**
   * Preferences operations
   */
  updatePreferences(preferences) {
    this.update('preferences', preferences);
  }

  setAutoTunePreferences(autoTunePrefs) {
    this.update('preferences', (current) => ({
      ...current,
      autoTune: { ...current.autoTune, ...autoTunePrefs },
    }));
  }

  setMicrophonePreferences(micPrefs) {
    this.update('preferences', (current) => ({
      ...current,
      microphone: { ...current.microphone, ...micPrefs },
    }));
  }

  setAudioDevices(devices) {
    this.update('preferences', (current) => ({
      ...current,
      audio: {
        ...current.audio,
        devices: { ...current.audio.devices, ...devices },
      },
    }));
  }

  /**
   * Get a deep clone of current state for external consumers
   */
  getSnapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Get current playback position (with interpolation for smooth updates)
   */
  getCurrentPosition() {
    if (this.state.playback.isPlaying && this.state.playback.lastUpdate) {
      const elapsedMs = Date.now() - this.state.playback.lastUpdate;
      const estimatedPosition = this.state.playback.position + elapsedMs / 1000;

      // Don't exceed duration
      if (this.state.playback.duration > 0) {
        return Math.min(estimatedPosition, this.state.playback.duration);
      }

      return estimatedPosition;
    }

    return this.state.playback.position;
  }

  /**
   * Check if a song is currently in queue by path
   */
  findSongInQueue(songPath) {
    return this.state.queue.find((item) => item.path === songPath);
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    const totalDuration = this.state.queue.reduce((sum, item) => sum + (item.duration || 0), 0);
    return {
      count: this.state.queue.length,
      totalDuration,
      currentSongPath: this.state.playback.songPath,
    };
  }
}

export default AppState;

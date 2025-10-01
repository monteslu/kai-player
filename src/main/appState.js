import { EventEmitter } from 'events';

/**
 * AppState - Canonical application state model
 *
 * This is the single source of truth for all application state.
 * Renderer reports changes via IPC, web clients query this state.
 */
class AppState extends EventEmitter {
  constructor() {
    super();

    this.state = {
      // Playback state (updated frequently from renderer)
      playback: {
        isPlaying: false,
        position: 0,           // seconds
        duration: 0,           // seconds
        songPath: null,
        lastUpdate: Date.now()
      },

      // Current song metadata
      currentSong: null,  // { path, title, artist, duration, requester }

      // Queue
      queue: [],

      // Mixer state (synced from renderer)
      mixer: {
        PA: {
          gain: 0,        // dB
          muted: false
        },
        IEM: {
          gain: 0,        // dB
          muted: false,
          mono: true      // Always mono for single-ear monitoring
        },
        mic: {
          gain: 0,        // dB
          muted: false
        },
        stems: []         // For reference only: [{ id, name, gain, index }]
      },

      // Effects state (synced from renderer)
      effects: {
        current: null,
        disabled: [],
        enableWaveforms: true,
        enableEffects: true,
        randomEffectOnSong: false,
        overlayOpacity: 0.7,
        showUpcomingLyrics: true
      },

      // User preferences (broadcasted to all clients)
      preferences: {
        autoTune: {
          enabled: false,
          strength: 50,
          speed: 20
        },
        microphone: {
          enabled: false,
          gain: 1.0,
          toSpeakers: true
        },
        iemMonoVocals: true,
        audio: {
          devices: {
            PA: { id: 'default', name: 'Default Output' },
            IEM: { id: 'default', name: 'Default Output' },
            input: { id: 'default', name: 'Default Input' }
          }
        }
      }
    };
  }

  /**
   * Update playback state from renderer
   * Called frequently (10x/sec) with position updates
   */
  updatePlaybackState(updates) {
    const changed = {};

    for (const [key, value] of Object.entries(updates)) {
      if (this.state.playback[key] !== value) {
        changed[key] = { old: this.state.playback[key], new: value };
        this.state.playback[key] = value;
      }
    }

    this.state.playback.lastUpdate = Date.now();

    // Always emit playback state changes (including position updates)
    // This ensures web UI gets real-time position updates
    if (Object.keys(changed).length > 0) {
      this.emit('playbackStateChanged', this.state.playback, changed);
    }
  }

  /**
   * Set current song (called when song is loaded)
   */
  setCurrentSong(songData) {
    this.state.currentSong = songData ? {
      path: songData.path || songData.filePath,
      title: songData.title,
      artist: songData.artist,
      duration: songData.duration || 0,
      requester: songData.requester || 'KJ'
    } : null;

    // Update playback state with new song
    if (songData) {
      this.state.playback.songPath = songData.path || songData.filePath;
      this.state.playback.duration = songData.duration || 0;
      this.state.playback.position = 0;
    } else {
      this.state.playback.songPath = null;
      this.state.playback.duration = 0;
      this.state.playback.position = 0;
    }

    this.emit('currentSongChanged', this.state.currentSong);
  }

  /**
   * Queue operations
   */
  addToQueue(item) {
    const queueItem = {
      id: item.id || (Date.now() + Math.random()),
      path: item.path,
      title: item.title,
      artist: item.artist,
      duration: item.duration || 0,
      requester: item.requester || 'KJ',
      addedVia: item.addedVia || 'unknown',
      addedAt: item.addedAt || new Date()
    };

    this.state.queue.push(queueItem);
    this.emit('queueChanged', this.state.queue);

    return queueItem;
  }

  removeFromQueue(id) {
    const index = this.state.queue.findIndex(item => item.id === id);
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
    this.state.mixer = { ...this.state.mixer, ...mixerState };
    this.emit('mixerChanged', this.state.mixer);
  }

  /**
   * Effects state operations
   */
  updateEffectsState(effectsState) {
    this.state.effects = { ...this.state.effects, ...effectsState };
    this.emit('effectsChanged', this.state.effects);
  }

  /**
   * Preferences operations
   */
  updatePreferences(preferences) {
    this.state.preferences = { ...this.state.preferences, ...preferences };
    this.emit('preferencesChanged', this.state.preferences);
  }

  setAutoTunePreferences(autoTunePrefs) {
    this.state.preferences.autoTune = { ...this.state.preferences.autoTune, ...autoTunePrefs };
    this.emit('preferencesChanged', this.state.preferences);
  }

  setMicrophonePreferences(micPrefs) {
    this.state.preferences.microphone = { ...this.state.preferences.microphone, ...micPrefs };
    this.emit('preferencesChanged', this.state.preferences);
  }

  setAudioDevices(devices) {
    this.state.preferences.audio.devices = { ...this.state.preferences.audio.devices, ...devices };
    this.emit('preferencesChanged', this.state.preferences);
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
      const estimatedPosition = this.state.playback.position + (elapsedMs / 1000);

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
    return this.state.queue.find(item => item.path === songPath);
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    const totalDuration = this.state.queue.reduce((sum, item) => sum + (item.duration || 0), 0);
    return {
      count: this.state.queue.length,
      totalDuration,
      currentSongPath: this.state.playback.songPath
    };
  }
}

export default AppState;
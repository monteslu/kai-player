import { EventEmitter } from 'events';

/**
 * StateManager - Universal state management for both Node.js and Browser
 *
 * This class provides a single source of truth for application state that works
 * in both the Electron main process (Node.js) and renderer process (Browser).
 *
 * Features:
 * - Event-based subscriptions for reactive updates
 * - Granular events for different state domains
 * - State snapshots for persistence
 * - Type-safe state updates
 * - Works in both Node.js and browser environments
 */
class StateManager extends EventEmitter {
  constructor(initialState = {}) {
    super();

    // Initialize state with defaults
    this.state = {
      // Playback state
      playback: {
        isPlaying: false,
        position: 0,
        duration: 0,
        volume: 1.0,
        isPaused: false,
        isLoading: false,
      },

      // Current song
      currentSong: null,

      // Queue
      queue: [],

      // Mixer settings
      mixer: {
        vocalVolume: 1.0,
        musicVolume: 1.0,
        micVolume: 1.0,
        paVolume: 1.0,
        iemVolume: 1.0,
        micSolo: false,
        vocalSolo: false,
        musicSolo: false,
      },

      // Effects
      effects: {
        autotuneEnabled: false,
        autotuneKey: 'C',
        autotuneScale: 'major',
        reverbEnabled: false,
        reverbAmount: 0.3,
        delayEnabled: false,
        delayAmount: 0.3,
      },

      // User preferences
      preferences: {
        theme: 'dark',
        visualizer: 'milkdrop',
        defaultOutputDevice: null,
        defaultInputDevice: null,
      },

      // Web server state
      webServer: {
        enabled: false,
        port: 3000,
        requestsEnabled: true,
        adminPassword: null,
      },

      // Library metadata
      library: {
        totalSongs: 0,
        lastScan: null,
        scanInProgress: false,
      },

      // Override with any initial state
      ...initialState,
    };

    // Track last update timestamp for each domain
    this.lastUpdate = {
      playback: Date.now(),
      currentSong: Date.now(),
      queue: Date.now(),
      mixer: Date.now(),
      effects: Date.now(),
      preferences: Date.now(),
      webServer: Date.now(),
      library: Date.now(),
    };
  }

  /**
   * Get a snapshot of the current state
   * @returns {Object} Deep copy of current state
   */
  getSnapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Get a specific domain of state
   * @param {string} domain - State domain (playback, mixer, effects, etc.)
   * @returns {Object} Copy of domain state
   */
  getDomain(domain) {
    if (!this.state[domain]) {
      throw new Error(`Unknown state domain: ${domain}`);
    }
    return JSON.parse(JSON.stringify(this.state[domain]));
  }

  /**
   * Update state and emit appropriate events
   * @param {string} domain - State domain to update
   * @param {Object|Function} updates - Updates object or function that receives current state
   * @param {boolean} silent - If true, don't emit events
   * @returns {Object} Updated domain state
   */
  update(domain, updates, silent = false) {
    if (!this.state[domain]) {
      throw new Error(`Unknown state domain: ${domain}`);
    }

    // Handle function-based updates
    const actualUpdates = typeof updates === 'function' ? updates(this.state[domain]) : updates;

    // Apply updates
    this.state[domain] = {
      ...this.state[domain],
      ...actualUpdates,
    };

    // Update timestamp
    this.lastUpdate[domain] = Date.now();

    if (!silent) {
      // Emit domain-specific event
      this.emit(`${domain}Changed`, this.state[domain]);

      // Emit general state change event
      this.emit('stateChanged', {
        domain,
        state: this.state[domain],
        timestamp: this.lastUpdate[domain],
      });
    }

    return this.state[domain];
  }

  /**
   * Subscribe to state changes for a specific domain
   * @param {string} domain - State domain to watch
   * @param {Function} callback - Callback function (receives updated state)
   * @returns {Function} Unsubscribe function
   */
  subscribe(domain, callback) {
    const event = `${domain}Changed`;
    this.on(event, callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Subscribe to all state changes
   * @param {Function} callback - Callback function (receives {domain, state, timestamp})
   * @returns {Function} Unsubscribe function
   */
  subscribeAll(callback) {
    this.on('stateChanged', callback);
    return () => this.off('stateChanged', callback);
  }

  /**
   * Reset state to initial values
   * @param {boolean} silent - If true, don't emit events
   */
  reset(silent = false) {
    const domains = Object.keys(this.state);

    domains.forEach((domain) => {
      // Reset to default values based on domain
      switch (domain) {
        case 'playback':
          this.state.playback = {
            isPlaying: false,
            position: 0,
            duration: 0,
            volume: 1.0,
            isPaused: false,
            isLoading: false,
          };
          break;
        case 'currentSong':
          this.state.currentSong = null;
          break;
        case 'queue':
          this.state.queue = [];
          break;
        // Other domains keep their current values on reset
        default:
          break;
      }

      this.lastUpdate[domain] = Date.now();

      if (!silent) {
        this.emit(`${domain}Changed`, this.state[domain]);
      }
    });

    if (!silent) {
      this.emit('stateChanged', {
        domain: 'all',
        state: this.state,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Load state from a serialized snapshot
   * @param {Object} snapshot - State snapshot to load
   * @param {boolean} silent - If true, don't emit events
   */
  loadSnapshot(snapshot, silent = false) {
    this.state = JSON.parse(JSON.stringify(snapshot));

    const now = Date.now();
    Object.keys(this.lastUpdate).forEach((domain) => {
      this.lastUpdate[domain] = now;
    });

    if (!silent) {
      this.emit('stateChanged', {
        domain: 'all',
        state: this.state,
        timestamp: now,
      });
    }
  }

  /**
   * Get last update timestamp for a domain
   * @param {string} domain - State domain
   * @returns {number} Timestamp of last update
   */
  getLastUpdate(domain) {
    return this.lastUpdate[domain] || 0;
  }
}

export default StateManager;

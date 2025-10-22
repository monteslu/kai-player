import { KaraokeRenderer } from './karaokeRenderer.js';
import { CDGPlayer } from './cdgPlayer.js';

export class PlayerController {
  constructor(kaiPlayer = null) {
    this.kaiPlayer = kaiPlayer;
    // lyricsContainer removed - KaraokeRenderer handles canvas-based lyrics now

    // Initialize karaoke renderer for KAI format lyrics
    this.karaokeRenderer = new KaraokeRenderer('karaokeCanvas');

    // Initialize CDG player for CDG format (audio + graphics)
    this.cdgPlayer = new CDGPlayer('karaokeCanvas');

    // Track current format and active player
    this.currentFormat = null; // 'kai' or 'cdg'
    this.currentPlayer = null; // Reference to active PlayerInterface instance

    // Ensure canvas is properly sized after initialization
    setTimeout(() => {
      if (this.karaokeRenderer && this.karaokeRenderer.resizeHandler) {
        this.karaokeRenderer.resizeHandler();
      }
    }, 200);

    // DOM element references removed - React PlayerControls handles time/progress display now
    // Progress bar click-to-seek handled by React PlayerControls
    // Time display handled by React PlayerControls

    this.isPlaying = false;

    this.init();
  }

  init() {
    this.setupEventListeners();

    this.updateTimer = setInterval(() => {
      if (this.isPlaying) {
        this.updatePosition();
        // if (Math.random() < 0.05) { // Debug occasionally
        // }
      }
    }, 100);
  }

  setupEventListeners() {
    // Progress bar click-to-seek now handled by React PlayerControls component
    // Transport controls (play/pause/restart/next) handled by React TransportControlsWrapper
  }

  onSongLoaded(metadata) {
    // Store song metadata for display
    if (this.karaokeRenderer && metadata) {
      this.karaokeRenderer.setSongMetadata({
        title: metadata.title,
        artist: metadata.artist,
        requester: metadata.requester,
      });
    }

    // Get duration from player for karaokeRenderer
    let duration = this.currentPlayer?.getDuration() || metadata?.duration || 0;

    // If still zero, try to estimate from lyrics end time as fallback
    if (duration === 0 && metadata?.lyrics && Array.isArray(metadata.lyrics)) {
      let maxLyricTime = 0;
      for (const line of metadata.lyrics) {
        const endTime = line.end || line.end_time || (line.start || line.time || 0) + 3;
        maxLyricTime = Math.max(maxLyricTime, endTime);
      }
      if (maxLyricTime > 0) {
        duration = maxLyricTime + 10; // Add some padding
      }
    }

    // Load lyrics into karaoke renderer
    const lyrics = metadata?.lyrics || null;
    if (lyrics) {
      this.karaokeRenderer.loadLyrics(lyrics, duration);
      // Initial render at position 0 to show title
      this.karaokeRenderer.setCurrentTime(0);
    }

    // Load vocals audio data for waveform visualization
    if (metadata?.audio?.sources) {
      const vocalsSource = metadata.audio.sources.find(
        (source) => source.name === 'vocals' || source.filename?.includes('vocals')
      );

      if (vocalsSource && vocalsSource.audioData) {
        this.karaokeRenderer.setVocalsAudio(vocalsSource.audioData);
      } else {
        // No vocals track available - waveform disabled
      }

      // Note: Butterchurn visualization now uses PA analyser from kaiPlayer
      // Connected in songLoaders.js during song load
      // No need to decode mixdown buffer separately
    } else {
      // No audio sources available - waveforms disabled
    }

    // Display updates handled by React PlayerControls via IPC state

    // Ensure we're in stopped state
    this.pause();
  }

  // renderLyrics() method removed - KaraokeRenderer handles canvas-based lyrics now

  updatePosition() {
    // Update karaokeRenderer for lyrics sync ONLY
    // (PlayerInterface handles state broadcasting, song end detection, UI updates)
    if (this.currentPlayer && this.karaokeRenderer) {
      const position = this.currentPlayer.getCurrentPosition();
      this.karaokeRenderer.setCurrentTime(position);
    }
  }

  // updateTimeDisplay() method removed - React PlayerControls handles time display via IPC state
  // updateProgressBar() method removed - React PlayerControls handles progress bar via IPC state

  // updateActiveLyrics() method removed - KaraokeRenderer handles canvas-based lyrics now
  // seekToProgressPosition() method removed - React PlayerControls handles click-to-seek now

  async setPosition(positionSec) {
    if (!this.currentPlayer) return;

    // Bounds check using player's duration
    const duration = this.currentPlayer.getDuration();
    const boundedPosition = Math.max(0, Math.min(duration, positionSec));

    // Seek player
    try {
      await this.currentPlayer.seek(boundedPosition);
    } catch (error) {
      console.error('Seek error:', error);
    }

    // Update karaoke renderer immediately for lyrics sync
    if (this.karaokeRenderer) {
      this.karaokeRenderer.setCurrentTime(boundedPosition);
      // Reset the locked upcoming lyric so it recalculates based on new position
      this.karaokeRenderer.lockedUpcomingIndex = null;
    }

    // Player engine will broadcast new position via reportStateChange() for UI updates
  }

  async play() {
    this.isPlaying = true;

    // Update renderer's current time BEFORE starting playback
    // This ensures butterchurn starts from the correct position on resume
    if (this.currentPlayer && this.karaokeRenderer) {
      const position = this.currentPlayer.getCurrentPosition();
      this.karaokeRenderer.setCurrentTime(position);
    }

    if (this.karaokeRenderer) {
      this.karaokeRenderer.setPlaying(true);
    }

    // Play the actual audio
    if (this.currentPlayer) {
      await this.currentPlayer.play();
    }
  }

  async pause() {
    this.isPlaying = false;

    if (this.karaokeRenderer) {
      this.karaokeRenderer.setPlaying(false);
    }

    // Pause the actual audio
    if (this.currentPlayer) {
      await this.currentPlayer.pause();
    }
  }

  // Utility methods removed - no longer needed (formatTime handled by formatUtils.js)
  // debugLoadVocals removed - no longer needed

  applyWaveformSettings(settings) {
    // Apply settings to active renderer (KAI or CDG)
    if (this.currentFormat === 'kai' && this.karaokeRenderer) {
      // Update waveformPreferences object (used by renderer)
      if (settings.enableWaveforms !== undefined) {
        this.karaokeRenderer.waveformPreferences.enableWaveforms = settings.enableWaveforms;
      }
      if (settings.enableEffects !== undefined) {
        this.karaokeRenderer.waveformPreferences.enableEffects = settings.enableEffects;
      }
      if (settings.showUpcomingLyrics !== undefined) {
        this.karaokeRenderer.waveformPreferences.showUpcomingLyrics = settings.showUpcomingLyrics;
      }
      if (settings.overlayOpacity !== undefined) {
        this.karaokeRenderer.waveformPreferences.overlayOpacity = settings.overlayOpacity;
      }
    } else if (this.currentFormat === 'cdg' && this.cdgPlayer) {
      // CDG player settings
      if (settings.enableEffects !== undefined) {
        this.cdgPlayer.setEffectsEnabled(settings.enableEffects);
      }
      if (settings.overlayOpacity !== undefined) {
        this.cdgPlayer.overlayOpacity = settings.overlayOpacity;
      }
    }
  }

  destroy() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    if (this.karaokeRenderer) {
      this.karaokeRenderer.destroy();
    }
  }
}

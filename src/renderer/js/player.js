class PlayerController {
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
        }
        
        // Load vocals audio data for waveform visualization
        if (metadata?.audio?.sources) {
            
            const vocalsSource = metadata.audio.sources.find(source => 
                source.name === 'vocals' || 
                source.filename?.includes('vocals')
            );
            
            if (vocalsSource && vocalsSource.audioData) {
                this.karaokeRenderer.setVocalsAudio(vocalsSource.audioData);
            } else {
            }
            
            // Load music audio data for background effects analysis
            const musicSource = metadata.audio.sources.find(source => 
                source.name === 'music' || 
                source.name === 'instrumental' ||
                source.name === 'backing' ||
                source.filename?.includes('music') ||
                source.filename?.includes('instrumental')
            );
            
            if (musicSource && musicSource.audioData) {
                this.karaokeRenderer.setMusicAudio(musicSource.audioData);
            } else {
                // Fallback to any available source that's not vocals
                const fallbackSource = metadata.audio.sources.find(source => 
                    source.name !== 'vocals' && 
                    !source.filename?.includes('vocals') &&
                    source.audioData
                );
                if (fallbackSource && fallbackSource.audioData) {
                    this.karaokeRenderer.setMusicAudio(fallbackSource.audioData);
                }
            }
        } else {
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
        
        if (this.karaokeRenderer) {
            this.karaokeRenderer.setPlaying(true);
        }
        
        // Audio engine is already handled by main.js - don't call it again
    }

    async pause() {
        this.isPlaying = false;
        
        if (this.karaokeRenderer) {
            this.karaokeRenderer.setPlaying(false);
        }
        
        // Audio engine is already handled by main.js - don't call it again
    }

    // Utility methods removed - no longer needed (formatTime handled by formatUtils.js)
    // debugLoadVocals removed - no longer needed

    destroy() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }

        if (this.karaokeRenderer) {
            this.karaokeRenderer.destroy();
        }
    }
}
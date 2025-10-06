console.log('🎮 main.js loaded and executing');

import { setAppInstance } from './appInstance.js';
import { verifyButterchurn } from './butterchurnVerify.js';
import { loadCDGSong, loadKAISong } from './songLoaders.js';

class KaiPlayerApp {
    constructor() {
        console.log('🎮 KaiPlayerApp constructor called');
        this.currentSong = null;
        this.isPlaying = false;
        this.currentPosition = 0;
        this.devices = [];
        
        // Mixer UI moved to React (MixerPanel.jsx + AudioDeviceSettings.jsx)
        this.player = null;
        this.coaching = null;
        this.kaiPlayer = null;
        
        // Device preferences
        this.devicePreferences = {
            PA: null,
            IEM: null,
            input: null
        };
        
        // Waveform preferences
        this.waveformPreferences = {
            enableWaveforms: true,
            micToSpeakers: true,
            enableMic: true,
            enableEffects: true,
            randomEffectOnSong: false,
            disabledEffects: [],
            overlayOpacity: 0.7,
            showUpcomingLyrics: true
        };
        
        this.autoTunePreferences = {
            enabled: false,
            strength: 50,
            speed: 20
        };
        
        // Debounce timer for random effects
        this.randomEffectTimeout = null;

        // Effects data - will be populated by React EffectsPanelWrapper
        this.effectsData = null;

        this.init();
    }

    async init() {
        try {
            await this.setupEventListeners();
            // Audio device loading now handled by React MixerTab
            // await this.loadAudioDevices();
            // Tab navigation now handled by React TabNavigation
            // this.setupTabs();
            // Server tab now handled by React ServerTab
            // this.setupServerTab();
            // Keyboard shortcuts now handled by React useKeyboardShortcuts hook
            // this.setupKeyboardShortcuts();
            // Waveform controls now handled by React VisualizationSettings
            // this.setupWaveformControls();
            // this.loadWaveformPreferences(); // Load after controls are set up
            // this.loadAutoTunePreferences(); // Load auto-tune preferences
            
            this.kaiPlayer = new KAIPlayer();
            await this.kaiPlayer.initialize();
        } catch (error) {
            console.error('Error during KaiPlayerApp init:', error);
            return; // Don't continue if initialization failed
        }

        // Apply auto-tune settings after audio engine is initialized
        if (this.autoTunePreferences && this.kaiPlayer && this.kaiPlayer.setAutoTuneSettings) {
            this.kaiPlayer.setAutoTuneSettings(this.autoTunePreferences);
        }

        // Set up callback for when songs end
        if (this.kaiPlayer) {
            this.kaiPlayer.setOnSongEndedCallback(() => {
                this.handleSongEnded();
            });
        }
        
        // Device selection restoration now handled by React MixerTab
        // await this.restoreDeviceSelections();
        
        // Mixer UI now handled by React components
        this.player = new PlayerController(this.kaiPlayer);

        // Notify bridge that player is ready (no globals)
        window.dispatchEvent(new CustomEvent('player:initialized', {
            detail: { player: this.player }
        }));
        // this.coaching = new CoachingController(); // Disabled for now
        // this.editor = new LyricsEditorController(); // Replaced by React SongEditor

        // Initialize queue and effects managers (used to be window globals)
        // this.queueManager = new QueueManager(); // Replaced by React QueueTab
        // this.effectsManager = new EffectsManager(); // Replaced by React EffectsPanelWrapper



        // Load and apply audio settings
        await this.loadAndApplyAudioSettings();

        // Apply loaded waveform preferences immediately after player creation
        if (this.player.karaokeRenderer) {
            this.player.karaokeRenderer.waveformPreferences = { ...this.waveformPreferences };
        }

        this.updateStatus('Ready');

        // Setup IPC listeners for web admin commands
        this.setupAdminIPCListeners();
        
        const version = await kaiAPI.app.getVersion();
    }

    async setupEventListeners() {
        // Listen for preferences updates from main process (AppState changes)
        if (window.kaiAPI && window.kaiAPI.events) {
            window.kaiAPI.events.on('preferences:updated', (event, preferences) => {
                console.log('📥 Received preferences update from main:', preferences);
                this.syncPreferencesFromMain(preferences);
            });

            // Listen for waveform settings changes from web admin
            window.kaiAPI.events.on('waveform:settingsChanged', (event, settings) => {
                console.log('📥 Received waveform settings update from web admin:', settings);

                // Apply settings to active player
                const playerController = this.player;
                if (!playerController) return;

                const currentFormat = playerController.currentFormat;
                const karaokeRenderer = playerController.karaokeRenderer;
                const cdgPlayer = playerController.cdgPlayer;

                if (currentFormat === 'kai' && karaokeRenderer) {
                    if (settings.enableWaveforms !== undefined) {
                        karaokeRenderer.setWaveformsEnabled(settings.enableWaveforms);
                    }
                    if (settings.enableEffects !== undefined) {
                        karaokeRenderer.setEffectsEnabled(settings.enableEffects);
                    }
                    if (settings.showUpcomingLyrics !== undefined) {
                        karaokeRenderer.setShowUpcomingLyrics(settings.showUpcomingLyrics);
                    }
                    if (settings.overlayOpacity !== undefined) {
                        karaokeRenderer.waveformPreferences.overlayOpacity = settings.overlayOpacity;
                    }
                } else if (currentFormat === 'cdg' && cdgPlayer) {
                    if (settings.enableEffects !== undefined) {
                        cdgPlayer.setEffectsEnabled(settings.enableEffects);
                    }
                    if (settings.overlayOpacity !== undefined) {
                        cdgPlayer.setOverlayOpacity(settings.overlayOpacity);
                    }
                }
            });

            // Listen for autotune settings changes from web admin
            window.kaiAPI.events.on('autotune:settingsChanged', (event, settings) => {
                console.log('📥 Received autotune settings update from web admin:', settings);

                // Apply via IPC
                if (settings.enabled !== undefined) {
                    window.kaiAPI.autotune.setEnabled(settings.enabled);
                }
                if (settings.strength !== undefined || settings.speed !== undefined) {
                    window.kaiAPI.autotune.setSettings(settings);
                }
            });

            // player:seek removed - web admin now calls window.app.player.setPosition() directly via executeJavaScript
        }



        // this.initializeSidebarState();



        const karaokeCanvas = document.getElementById('karaokeCanvas');
        
        // Click handler for canvas
        karaokeCanvas.addEventListener('click', () => {
            this.toggleCanvasFullscreen();
        });
        
        // Fullscreen change events
        document.addEventListener('fullscreenchange', () => {
            const isCanvasFullscreen = !!document.fullscreenElement;
        });
        
        document.addEventListener('fullscreenerror', (error) => {
            console.error('❌ Canvas fullscreen error:', error);
        });



        //     console.log('💿 Restart button clicked');
        //     this.restartTrack();
        // });

        // document.getElementById('nextTrackBtn').addEventListener('click', () => {
        //     this.nextTrack();
        // });




        // if (iemDeviceSelect) {
        //     iemDeviceSelect.addEventListener('change', async (e) => {
        //     const deviceId = e.target.value;
        //     kaiAPI.audio.setDevice('IEM', parseInt(deviceId));

        //     // Save device preference
        //     this.saveDevicePreference('IEM', deviceId);






        //     const value = e.target.value;
        //     document.querySelector('#autotuneStrength + .slider-value').textContent = `${value}%`;
        //     this.updateAutotuneSettings();
        // });

        // XRun and latency updates now handled by React StatusBar
        // kaiAPI.audio.onXRun((event, count) => {
        //     document.getElementById('xrunDisplay').textContent = `XRuns: ${count}`;
        // });

        // kaiAPI.audio.onLatencyUpdate((event, latency) => {
        //     document.getElementById('latencyDisplay').textContent = `Latency: ${latency.toFixed(1)} ms`;
        // });

        kaiAPI.mixer.onStateChange((event, state) => {
            // Mixer state updates handled by React
        });

        // Effect control event listeners - REMOVED (now handled by React EffectsPanelWrapper)
        // kaiAPI.effect.onNext(() => { ... });
        // kaiAPI.effect.onPrevious(() => { ... });

        // Effects management handlers - read from React EffectsPanelWrapper's exposed data
        kaiAPI.events.on('effects:getList', (event) => {
            // Get effects from React component's exposed data
            if (this.effectsData?.effects) {
                const effects = this.effectsData.effects.map(effect => ({
                    name: effect.name,
                    displayName: effect.displayName || effect.name,
                    author: effect.author || 'Unknown',
                    category: effect.category || 'uncategorized'
                }));
                event.sender.send('effects:getList-response', effects);
            } else {
                event.sender.send('effects:getList-response', []);
            }
        });

        kaiAPI.events.on('effects:getCurrent', (event) => {
            // Get current effect from React component's exposed data
            const currentEffect = this.effectsData?.currentEffect || null;
            event.sender.send('effects:getCurrent-response', currentEffect);
        });

        kaiAPI.events.on('effects:getDisabled', (event) => {
            // Get disabled effects from React component's exposed data
            const disabledEffects = this.effectsData?.disabledEffects || [];
            event.sender.send('effects:getDisabled-response', disabledEffects);
        });

        // Admin control event listeners removed - web admin now calls window.app methods directly via executeJavaScript
        // ElectronBridge also calls window.app methods directly (no IPC roundtrip)

        // Mixer control event listeners from admin
        kaiAPI.mixer.onSetMasterGain((event, data) => {
            const { bus, gainDb } = data;
            console.log(`🎚️ Received setMasterGain from admin: ${bus} = ${gainDb} dB`);
            if (this.kaiPlayer) {
                this.kaiPlayer.setMasterGain(bus, gainDb);
                // Update UI
                // Mixer updates handled by React
            }
        });

        kaiAPI.mixer.onToggleMasterMute((event, data) => {
            const { bus, muted } = data;
            console.log(`🔇 Received toggleMasterMute from admin: ${bus} = ${muted}`);
            if (this.kaiPlayer) {
                // If muted is provided, use setMasterMute, otherwise toggle
                if (muted !== undefined) {
                    this.kaiPlayer.setMasterMute(bus, muted);
                } else {
                    this.kaiPlayer.toggleMasterMute(bus);
                }
                // Update UI
                // Mixer updates handled by React
            }
        });

        // Listen for setMasterMute command (with specific mute state)
        kaiAPI.mixer.onSetMasterMute((event, data) => {
            const { bus, muted } = data;
            console.log(`🔇 Received setMasterMute from admin: ${bus} = ${muted}`);
            if (this.kaiPlayer) {
                this.kaiPlayer.setMasterMute(bus, muted);
                // Update UI
                // Mixer updates handled by React
            }
        });

        // Listen for song:loaded event (sent BEFORE song:data)
        // This triggers the loading state display
        kaiAPI.song.onLoaded((event, metadata) => {
            console.log('💿 song:loaded event received:', metadata);
            this.onSongLoaded(metadata);
        });

        kaiAPI.song.onData(async (event, songData) => {
            // Check if this is the same song (avoid resetting state on duplicate events)
            const isSameSong = this.currentSong &&
                               this.currentSong.originalFilePath === songData.originalFilePath;

            console.log('💿 song:onData - isSameSong:', isSameSong, 'current:', this.currentSong?.originalFilePath, 'new:', songData.originalFilePath);

            this.currentSong = songData;

            // Reset play state when loading a new song - but not if it's the same song
            if (!isSameSong) {
                console.log('💿 Resetting play state and pausing old song');
                this.isPlaying = false;

                // CRITICAL: Actually pause the currently playing audio (don't call stop() - it destroys audio contexts!)
                if (this.kaiPlayer) {
                    await this.kaiPlayer.pause();
                }
                if (this.player?.cdgPlayer?.isPlaying) {
                    this.player.cdgPlayer.pause();
                }
                if (this.player?.currentPlayer?.isPlaying) {
                    await this.player.currentPlayer.pause();
                }

                // Broadcast state change to React
                if (this.player?.currentPlayer) {
                    this.player.currentPlayer.isPlaying = false;
                    this.player.currentPlayer.reportStateChange();
                }
            }

            // Notify queue manager that a song started
            // (Now handled by React QueueTab via bridge events)
            // if (this.queueManager && songData.originalFilePath) {
            //     this.queueManager.notifySongStarted(songData.originalFilePath);
            // }

            // Use pending metadata if available, otherwise use data from songData
            const metadata = this._pendingMetadata || songData.metadata || {};

            // Detect format: CDG or KAI
            const isCDG = songData.format === 'cdg';

            if (isCDG) {
                await loadCDGSong(this, songData, metadata);
            } else {
                await loadKAISong(this, songData, metadata);
            }

            // Clear pending metadata
            this._pendingMetadata = null;
        });
    }

    // Audio device loading now handled by React MixerTab component
    // Tab navigation now handled by React TabNavigation component
    // Server tab now handled by React ServerTab component
    // Keyboard shortcuts now handled by React useKeyboardShortcuts hook

    // Waveform controls now handled by React VisualizationSettings component
    async loadKaiFile() {
        try {
            // Pause current playback first
            console.log('💿 loadKaiFile: Pausing current playback');
            this.isPlaying = false;

            if (this.kaiPlayer) {
                await this.kaiPlayer.pause();
            }
            if (this.player?.cdgPlayer?.isPlaying) {
                this.player.cdgPlayer.pause();
            }
            if (this.player?.currentPlayer) {
                await this.player.currentPlayer.pause();
            }

            this.updateStatus('Loading KAI file...');
            const result = await kaiAPI.file.openKai();
            
            if (result && result.success) {
                this.currentSong = result;
                this.enableControls();
                this.updateStatus(`Loaded: ${result.metadata?.title || 'Unknown Song'}`);
            } else if (result) {
                this.updateStatus(`Error: ${result.error}`);
            }
        } catch (error) {
            console.error('Failed to load KAI file:', error);
            this.updateStatus('Error loading file');
        }
    }

    async onSongLoaded(metadata) {
        // Stop current playback
        if (this.kaiPlayer) {
            await this.kaiPlayer.pause();
        }
        if (this.player) {
            await this.player.pause();
            // Also stop CDG renderer if it's playing
            if (this.player.cdgPlayer && this.player.cdgPlayer.isPlaying) {
                this.player.cdgPlayer.pause();
            }
        }

        // DON'T send loading state via renderer.songLoaded() - that would overwrite
        // the currentSong that main process already set correctly.
        // Instead, just trigger a song:changed event with isLoading flag
        // Main process already called appState.setCurrentSong() with the correct path

        // Send a custom event to indicate loading started (optional - for future use)
        console.log('💿 Song loading started:', metadata);

        // Store metadata for later use when song data arrives
        this._pendingMetadata = metadata;
        
        const title = metadata?.title || 'Unknown Song';
        const artist = metadata?.artist || 'Unknown Artist';
        
        // Display as "Artist - Song" format
        const displayText = `${artist} - ${title}`;
        const songDisplay = document.querySelector('.song-display');
        if (songDisplay) {
            songDisplay.textContent = displayText;
        }
        
        // Enable song info button
    }


    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // Sidebar toggle now handled by React SongInfoBarWrapper

    enableControls() {
        // Controls now managed by React TransportControlsWrapper
        // document.getElementById('playPauseBtn').disabled = false;
    }

    async togglePlayback() {
        if (!this.currentSong) return;

        console.log('💿 togglePlayback called, format:', this.player?.currentFormat, 'isPlaying:', this.isPlaying);

        try {
            if (this.isPlaying) {
                // Use unified player interface - no format branching
                if (this.player?.currentPlayer) {
                    await this.player.currentPlayer.pause();
                }

                this.isPlaying = false;

                // Also pause the player controller
                if (this.player) {
                    await this.player.pause();
                }

                // Ensure state is broadcast to React
                if (this.player?.currentPlayer) {
                    this.player.currentPlayer.reportStateChange();
                }
            } else {
                // Set playing state first
                this.isPlaying = true;

                // Use unified player interface - no format branching
                if (this.player?.currentPlayer) {
                    await this.player.currentPlayer.play();
                }

                // Also play the player controller
                if (this.player) {
                    await this.player.play();
                }

                // Ensure state is broadcast to React
                if (this.player?.currentPlayer) {
                    this.player.currentPlayer.reportStateChange();
                }

                console.log('💿 After play, isPlaying:', this.isPlaying);
            }
        } catch (error) {
            console.error('Playback error:', error);
            this.updateStatus('Playback error');
        }
    }

    broadcastPlaybackState() {
        // Send current playback state to main process for position broadcasting
        const position = this.kaiPlayer ? this.kaiPlayer.getCurrentPosition() : 0;
        const duration = this.kaiPlayer ? this.kaiPlayer.getDuration() : 0;

        if (typeof kaiAPI !== 'undefined' && kaiAPI.renderer) {
            kaiAPI.renderer.sendPlaybackState({
                isPlaying: this.isPlaying,
                position: position,
                duration: duration
            });
        }
    }

    async handleSongEnded() {
        this.isPlaying = false;

        // Also update the player controller's state
        if (this.player) {
            this.player.isPlaying = false;
            // Update karaoke renderer
            if (this.player.karaokeRenderer) {
                this.player.karaokeRenderer.setPlaying(false);
            }
        }

        // Broadcast state change to React
        if (this.player?.currentPlayer) {
            this.player.currentPlayer.isPlaying = false;
            this.player.currentPlayer.reportStateChange();
        }

        // Update status
        this.updateStatus('Song ended');

        // Auto-load (but don't auto-play) next song from queue
        // This removes the finished song from queue and loads the next one
        try {
            const result = await kaiAPI.player.next();
            if (result.success && result.song) {
                console.log('🎵 Auto-loaded next song from queue:', result.song.title);
                this.updateStatus(`Loaded: ${result.song.title}`);
            } else {
                console.log('📭 No more songs in queue');
                this.updateStatus('Queue empty');
            }
        } catch (error) {
            console.error('Failed to auto-load next song:', error);
        }
    }

    async seekRelative(seconds) {
        if (!this.currentSong || !this.kaiPlayer) return;
        
        const newPosition = Math.max(0, this.kaiPlayer.getCurrentPosition() + seconds);
        await this.kaiPlayer.seek(newPosition);
    }

    async restartTrack() {
        if (!this.currentSong) return;

        // Use unified player interface - no format branching
        if (this.player?.currentPlayer) {
            await this.player.currentPlayer.seek(0);
        }
    }

    async nextTrack() {
        // Pause current playback first
        console.log('💿 nextTrack: Pausing current playback');
        this.isPlaying = false;

        if (this.kaiPlayer) {
            await this.kaiPlayer.pause();
        }
        if (this.player?.cdgPlayer?.isPlaying) {
            this.player.cdgPlayer.pause();
        }
        if (this.player?.currentPlayer) {
            await this.player.currentPlayer.pause();
            this.player.currentPlayer.isPlaying = false;
            this.player.currentPlayer.reportStateChange();
        }

        // Use IPC to trigger next track (handled by main process)
        try {
            const result = await kaiAPI.player.next();
            if (!result.success) {
                console.log('No more songs in queue');
            }
        } catch (error) {
            console.error('Failed to play next track:', error);
        }
    }

    // Position updates now handled by PlayerInterface.startStateReporting()
    // Vocal and stem toggles now handled by React useKeyboardShortcuts hook
    // Autotune settings now handled by React VisualizationSettings component
    // Status text now handled by React StatusBar - keeping method to avoid breaking existing code
    updateStatus(message) {
        console.log(`[Status] ${message}`);
    }
    
    // Device persistence methods
    async loadDevicePreferences() {
        try {
            const saved = await window.kaiAPI.settings.get('devicePreferences', null);
            if (saved) {
                this.devicePreferences = { ...this.devicePreferences, ...saved };
            }

            // IEM mono vocals now handled by React MixerTab
        } catch (error) {
            console.warn('Failed to load device preferences:', error);
        }
    }

    async saveDevicePreferences() {
        try {
            await window.kaiAPI.settings.set('devicePreferences', this.devicePreferences);
        } catch (error) {
            console.warn('Failed to save device preferences:', error);
        }
    }

    async loadAndApplyAudioSettings() {
        try {
            // Load audio settings from storage
            const micToSpeakers = await window.kaiAPI.settings.get('micToSpeakers', true);
            const enableMic = await window.kaiAPI.settings.get('enableMic', true);

            console.log('📥 Loaded audio settings for karaokeRenderer:', { micToSpeakers, enableMic });

            // Apply to karaokeRenderer for visualization purposes
            // (KAIPlayer loads its own settings for actual audio routing)
            if (this.player && this.player.karaokeRenderer) {
                this.player.karaokeRenderer.waveformPreferences.micToSpeakers = micToSpeakers;
                this.player.karaokeRenderer.waveformPreferences.enableMic = enableMic;
            }
        } catch (error) {
            console.error('Failed to load audio settings:', error);
        }
    }

    // Waveform preferences methods now handled by React VisualizationSettings component
    async saveWaveformPreferences() {
        try {
            await window.kaiAPI.settings.set('waveformPreferences', this.waveformPreferences);
        } catch (error) {
            console.warn('Failed to save waveform preferences:', error);
        }
    }
    
    syncPreferencesFromMain(preferences) {
        // Sync auto-tune preferences
        if (preferences.autoTune) {
            this.autoTunePreferences = { ...this.autoTunePreferences, ...preferences.autoTune };
            if (this.kaiPlayer) {
                this.kaiPlayer.setAutoTuneSettings(this.autoTunePreferences);
            }
        }

        // Sync effects preferences
        if (preferences.effects || preferences.enableWaveforms !== undefined) {
            const effectsPrefs = {
                enableWaveforms: preferences.enableWaveforms,
                enableEffects: preferences.enableEffects,
                randomEffectOnSong: preferences.randomEffectOnSong,
                overlayOpacity: preferences.overlayOpacity,
                showUpcomingLyrics: preferences.showUpcomingLyrics
            };

            // Merge with waveform preferences
            Object.assign(this.waveformPreferences, effectsPrefs);

            // Apply to karaoke renderer
            if (this.player && this.player.karaokeRenderer) {
                this.player.karaokeRenderer.waveformPreferences = { ...this.waveformPreferences };
            }
        }

        // Sync microphone preferences
        if (preferences.microphone) {
            if (preferences.microphone.enabled !== undefined && this.kaiPlayer) {
                if (preferences.microphone.enabled) {
                    // Use saved input device preference
                    const deviceId = this.devicePreferences?.input?.id || this.kaiPlayer.inputDevice || 'default';
                    console.log('🎤 Starting mic with saved device:', deviceId);
                    this.kaiPlayer.startMicrophoneInput(deviceId);
                } else {
                    this.kaiPlayer.stopMicrophoneInput();
                }
            }
            if (preferences.microphone.gain !== undefined && this.kaiPlayer) {
                this.kaiPlayer.setMicrophoneGain(preferences.microphone.gain);
            }
        }

        // Sync IEM mono vocals preference
        if (preferences.iemMonoVocals !== undefined && this.kaiPlayer) {
            this.kaiPlayer.setIEMMonoVocals(preferences.iemMonoVocals);
        }

        console.log('✅ Preferences synced from main process');
    }

    // Auto-tune preferences now handled by React VisualizationSettings component
    async saveAutoTunePreferences() {
        try {
            await window.kaiAPI.settings.set('autoTunePreferences', this.autoTunePreferences);
        } catch (error) {
            console.warn('Failed to save auto-tune preferences:', error);
        }
    }
    
    async saveDevicePreference(deviceType, deviceId) {
        try {
            // Store device info for better matching
            const device = this.devices.find(d => (d.id || d.deviceId) === deviceId);
            if (device) {
                this.devicePreferences[deviceType] = {
                    id: deviceId,
                    name: device.name || device.label,
                    deviceKind: device.deviceKind
                };
            } else {
                this.devicePreferences[deviceType] = { id: deviceId };
            }
            
            await window.kaiAPI.settings.set('devicePreferences', this.devicePreferences);
        } catch (error) {
            console.warn('Failed to save device preference:', error);
        }
    }
    
    // Device selection restoration now handled by React MixerTab
    updateEffectDisplay() {



        // }

        // Sync the effects manager UI - now handled by React EffectsPanelWrapper
        // if (this.effectsManager && typeof this.effectsManager.syncWithRenderer === 'function') {
        //     this.effectsManager.syncWithRenderer();
        // }
    }
    
    setupAdminIPCListeners() {
        // Listen for mixer commands from web admin
        if (window.kaiAPI?.mixer) {
            window.kaiAPI.mixer.onSetMasterGain((event, data) => {
                const { bus, gainDb } = data;
                if (this.kaiPlayer) {
                    this.kaiPlayer.setMasterGain(bus, gainDb);
                }
            });

            window.kaiAPI.mixer.onToggleMasterMute((event, data) => {
                const { bus, muted } = data;
                if (this.kaiPlayer) {
                    if (muted !== undefined) {
                        this.kaiPlayer.setMasterMute(bus, muted);
                    } else {
                        this.kaiPlayer.toggleMasterMute(bus);
                    }
                }
            });
        }
    }
}

// Initialize app when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    // Verify Butterchurn libraries loaded correctly
    verifyButterchurn();

    const app = new KaiPlayerApp();

    // Register app instance for cross-module access via appInstance.js singleton
    setAppInstance(app);

    // Expose on window for React components and IPC handlers
    window.app = app;

    // Also expose on window for debugging in dev tools
    if (process.env.NODE_ENV === 'development') {
        window.kaiApp = app;
    }
});
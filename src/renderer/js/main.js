console.log('🎮 main.js loaded and executing');

// import { LyricsEditorController } from './editor.js'; // Replaced by React SongEditor
import { QueueManager } from './queue.js';
// import { EffectsManager } from './effects.js'; // Replaced by React EffectsPanelWrapper
import { setAppInstance } from './appInstance.js';

class KaiPlayerApp {
    constructor() {
        console.log('🎮 KaiPlayerApp constructor called');
        this.currentSong = null;
        this.isPlaying = false;
        this.currentPosition = 0;
        this.devices = [];
        
        this.mixer = null;
        this.player = null;
        this.coaching = null;
        this.audioEngine = null;
        
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
            await this.loadAudioDevices();
            this.setupTabs();
            this.setupServerTab();
            this.setupKeyboardShortcuts();
            this.setupWaveformControls();
            this.loadWaveformPreferences(); // Load after controls are set up
            this.loadAutoTunePreferences(); // Load auto-tune preferences
            
            this.audioEngine = new RendererAudioEngine();
            await this.audioEngine.initialize();
        } catch (error) {
            console.error('Error during KaiPlayerApp init:', error);
        }
        
        // Apply auto-tune settings after audio engine is initialized
        if (this.autoTunePreferences && this.audioEngine && this.audioEngine.setAutoTuneSettings) {
            this.audioEngine.setAutoTuneSettings(this.autoTunePreferences);
        }
        
        // Set up callback for when songs end
        this.audioEngine.setOnSongEndedCallback(() => {
            this.handleSongEnded();
        });
        
        // Now that audio engine is ready, restore device selections
        await this.restoreDeviceSelections();
        
        this.mixer = new MixerController(this.audioEngine);
        this.player = new PlayerController(this.audioEngine);
        this.coaching = new CoachingController();
        // this.editor = new LyricsEditorController(); // Replaced by React SongEditor

        // Initialize queue and effects managers (used to be window globals)
        this.queueManager = new QueueManager();
        // this.effectsManager = new EffectsManager(); // Replaced by React EffectsPanelWrapper

        // Sync effects manager with renderer after initialization
        // (Now handled by React EffectsPanelWrapper)
        // setTimeout(() => {
        //     if (this.effectsManager) {
        //         this.effectsManager.syncWithRenderer();
        //         console.log('🎨 EffectsManager initialized. Disabled effects:', Array.from(this.effectsManager.disabledEffects));
        //     }
        // }, 500);

        // Update mixer UI with loaded state from audioEngine
        if (this.mixer) {
            console.log('🎚️ Updating mixer UI with loaded state');
            this.mixer.updateControlStates();
        }

        // Apply loaded waveform preferences immediately after player creation
        if (this.player.karaokeRenderer) {
            this.player.karaokeRenderer.waveformPreferences = { ...this.waveformPreferences };
        }

        this.updateStatus('Ready');

        // Set initial UI state (no song loaded)
        this.updateUIForSongState();

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
                this.waveformPreferences = { ...this.waveformPreferences, ...settings };
                this.loadWaveformPreferences();
            });

            // Listen for autotune settings changes from web admin
            window.kaiAPI.events.on('autotune:settingsChanged', (event, settings) => {
                console.log('📥 Received autotune settings update from web admin:', settings);
                this.autoTunePreferences = { ...this.autoTunePreferences, ...settings };
                this.loadAutoTunePreferences();
            });

            // Listen for seek commands from web admin
            window.kaiAPI.events.on('player:seek', (event, positionSec) => {
                console.log('📥 Received seek command from web admin:', positionSec);
                if (this.player && this.player.setPosition) {
                    this.player.setPosition(positionSec);
                } else {
                    console.error('❌ Player not available or seek not supported');
                }
            });
        }

        document.getElementById('refreshDevicesBtn').addEventListener('click', async () => {
            await this.loadAudioDevices();
        });

        // Hamburger menu toggle
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        if (hamburgerBtn) {
            hamburgerBtn.addEventListener('click', () => {
                this.toggleSidebar();
            });
            
            // Initialize sidebar state from saved preference
            this.initializeSidebarState();
        } else {
            console.error('Hamburger button not found');
        }


        document.getElementById('openCanvasWindowBtn').addEventListener('click', async () => {
            try {
                const result = await kaiAPI.window.openCanvas();
                if (result && result.success) {
                } else {
                    console.error('Failed to open canvas window:', result);
                }
            } catch (error) {
                console.error('Error opening canvas window:', error);
            }
        });

        // Karaoke canvas fullscreen functionality
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

        document.getElementById('closeSongInfoBtn').addEventListener('click', () => {
            document.getElementById('songInfoModal').style.display = 'none';
        });

        // Close modal when clicking outside
        document.getElementById('songInfoModal').addEventListener('click', (e) => {
            if (e.target.id === 'songInfoModal') {
                document.getElementById('songInfoModal').style.display = 'none';
            }
        });

        document.getElementById('playPauseBtn').addEventListener('click', (e) => {
            console.log('💿 Play button clicked');
            this.togglePlayback();
        });


        document.getElementById('restartBtn').addEventListener('click', () => {
            console.log('💿 Restart button clicked');
            this.restartTrack();
        });

        document.getElementById('nextTrackBtn').addEventListener('click', () => {
            this.nextTrack();
        });
        
        // Effect switching controls
        document.getElementById('prevEffectBtn').addEventListener('click', () => {
            if (this.player && this.player.karaokeRenderer) {
                this.player.karaokeRenderer.switchToPreviousPreset();
                this.updateEffectDisplay();
            }
        });
        
        document.getElementById('nextEffectBtn').addEventListener('click', () => {
            if (this.player && this.player.karaokeRenderer) {
                this.player.karaokeRenderer.switchToNextPreset();
                this.updateEffectDisplay();
            }
        });

        document.getElementById('paDeviceSelect').addEventListener('change', async (e) => {
            const deviceId = e.target.value;
            kaiAPI.audio.setDevice('PA', parseInt(deviceId));
            
            // Save device preference
            this.saveDevicePreference('PA', deviceId);
            
            // Also set device on renderer audio engine
            if (this.audioEngine && this.audioEngine.setOutputDevice) {
                await this.audioEngine.setOutputDevice('PA', deviceId);
            }
        });

        document.getElementById('iemDeviceSelect').addEventListener('change', async (e) => {
            const deviceId = e.target.value;
            kaiAPI.audio.setDevice('IEM', parseInt(deviceId));

            // Save device preference
            this.saveDevicePreference('IEM', deviceId);

            // Also set device on renderer audio engine
            if (this.audioEngine && this.audioEngine.setOutputDevice) {
                await this.audioEngine.setOutputDevice('IEM', deviceId);
            }
        });

        // IEM Mono Vocals toggle
        document.getElementById('iemMonoVocals').addEventListener('change', (e) => {
            const enabled = e.target.checked;
            if (this.audioEngine && this.audioEngine.setIEMMonoVocals) {
                this.audioEngine.setIEMMonoVocals(enabled);
                console.log(`IEM vocals set to ${enabled ? 'mono' : 'stereo'} mode`);
            }

            // Save preference
            if (window.kaiAPI.settings) {
                window.kaiAPI.settings.set('iemMonoVocals', enabled);
            }
        });

        document.getElementById('inputDeviceSelect').addEventListener('change', async (e) => {
            const deviceId = e.target.value;
            
            // Start microphone input with selected device
            if (this.audioEngine && deviceId !== '') {
                await this.audioEngine.startMicrophoneInput(deviceId);
            }
            
            // Save device preference
            this.saveDevicePreference('input', deviceId);
        });


        document.getElementById('autotuneEnabled').addEventListener('change', (e) => {
            const enabled = e.target.checked;
            
            // Update preferences
            this.autoTunePreferences.enabled = enabled;
            this.saveAutoTunePreferences();
            
            // Update audio engine directly
            if (this.audioEngine) {
                this.audioEngine.setAutoTuneSettings({ enabled: enabled });
            }
            
            // Also update via API
            kaiAPI.autotune.setEnabled(enabled);
        });

        document.getElementById('autotuneStrength').addEventListener('input', (e) => {
            const value = e.target.value;
            document.querySelector('#autotuneStrength + .slider-value').textContent = `${value}%`;
            this.updateAutotuneSettings();
        });

        document.getElementById('autotuneSpeed').addEventListener('input', (e) => {
            const value = e.target.value;
            document.querySelector('#autotuneSpeed + .slider-value').textContent = value;
            this.updateAutotuneSettings();
        });

        kaiAPI.song.onLoaded((event, metadata) => {
            this.onSongLoaded(metadata);
        });

        kaiAPI.audio.onXRun((event, count) => {
            document.getElementById('xrunDisplay').textContent = `XRuns: ${count}`;
        });

        kaiAPI.audio.onLatencyUpdate((event, latency) => {
            document.getElementById('latencyDisplay').textContent = `Latency: ${latency.toFixed(1)} ms`;
        });

        kaiAPI.mixer.onStateChange((event, state) => {
            if (this.mixer) {
                this.mixer.updateState(state);
            }
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

        // Admin control event listeners
        console.log('🎮 Setting up admin IPC listeners...');
        console.log('🎮 kaiAPI.admin exists:', !!kaiAPI.admin);
        console.log('🎮 kaiAPI.admin.onPlay exists:', !!(kaiAPI.admin && kaiAPI.admin.onPlay));

        kaiAPI.admin.onPlay(() => {
            console.log('🎮 Received play command from admin');
            this.togglePlayback();
        });

        kaiAPI.admin.onNext(() => {
            console.log('🎮 Received next command from admin');
            this.nextTrack();
        });

        kaiAPI.admin.onRestart(() => {
            console.log('🎮 Received restart command from admin');
            this.restartTrack();
        });

        // Mixer control event listeners from admin
        kaiAPI.mixer.onSetMasterGain((event, data) => {
            const { bus, gainDb } = data;
            console.log(`🎚️ Received setMasterGain from admin: ${bus} = ${gainDb} dB`);
            if (this.audioEngine) {
                this.audioEngine.setMasterGain(bus, gainDb);
                // Update UI
                this.mixer?.updateControlStates();
            }
        });

        kaiAPI.mixer.onToggleMasterMute((event, data) => {
            const { bus, muted } = data;
            console.log(`🔇 Received toggleMasterMute from admin: ${bus} = ${muted}`);
            if (this.audioEngine) {
                // If muted is provided, use setMasterMute, otherwise toggle
                if (muted !== undefined) {
                    this.audioEngine.setMasterMute(bus, muted);
                } else {
                    this.audioEngine.toggleMasterMute(bus);
                }
                // Update UI
                this.mixer?.updateControlStates();
            }
        });

        // Listen for setMasterMute command (with specific mute state)
        kaiAPI.mixer.onSetMasterMute((event, data) => {
            const { bus, muted } = data;
            console.log(`🔇 Received setMasterMute from admin: ${bus} = ${muted}`);
            if (this.audioEngine) {
                this.audioEngine.setMasterMute(bus, muted);
                // Update UI
                this.mixer?.updateControlStates();
            }
        });

        // Effects control event listeners - REMOVED (now handled by React EffectsPanelWrapper)
        // window.kaiAPI.events.on('effects:next', () => { ... });
        // window.kaiAPI.events.on('effects:previous', () => { ... });
        // window.kaiAPI.events.on('effects:random', () => { ... });
        // window.kaiAPI.events.on('effects:disable', (event, effectName) => { ... });
        // window.kaiAPI.events.on('effects:enable', (event, effectName) => { ... });

        // Settings update event listeners
        kaiAPI.settings.onUpdate((event, settings) => {
            console.log('🔧 Received settings update from server:', settings);
            this.updateServerSettingsUI(settings);
        });

        kaiAPI.song.onData(async (event, songData) => {
            // Check if this is the same song (avoid resetting state on duplicate events)
            const isSameSong = this.currentSong &&
                               this.currentSong.originalFilePath === songData.originalFilePath;

            console.log('💿 song:onData - isSameSong:', isSameSong, 'current:', this.currentSong?.originalFilePath, 'new:', songData.originalFilePath);

            this.currentSong = songData;

            // Reset play state when loading a new song - but not if it's the same song
            if (!isSameSong) {
                console.log('💿 Resetting play button because song changed');
                this.isPlaying = false;
                this.updatePlayButton('▶');
            }

            // Notify queue manager that a song started
            if (this.queueManager && songData.originalFilePath) {
                this.queueManager.notifySongStarted(songData.originalFilePath);
            }

            // Use pending metadata if available, otherwise use data from songData
            const metadata = this._pendingMetadata || songData.metadata || {};

            // Detect format: CDG or KAI
            const isCDG = songData.format === 'cdg';

            if (isCDG) {
                // CDG format - use CDG renderer
                console.log('💿 Loading CDG format');
                this.player.currentFormat = 'cdg';

                // Set up audio context for CDG renderer (PA output only)
                if (!this.audioEngine) {
                    console.error('💿 Audio engine not initialized');
                    this.updateStatus('Error: Audio engine not ready');
                    return;
                }

                // Get PA audio context for playback
                const paContext = this.audioEngine.audioContexts.PA;
                const paMasterGain = this.audioEngine.outputNodes.PA.masterGain;

                // Create gain node for CDG audio in PA context
                const cdgGainNode = paContext.createGain();
                cdgGainNode.connect(paMasterGain);

                // Create analyser in PA context
                const analyserNode = paContext.createAnalyser();
                analyserNode.fftSize = 2048;
                // Analyser taps the signal but doesn't affect routing
                cdgGainNode.connect(analyserNode);

                // Set audio context in CDG renderer (PA context for playback)
                this.player.cdgRenderer.setAudioContext(paContext, cdgGainNode, analyserNode);

                // Load CDG data
                await this.player.cdgRenderer.loadCDG(songData);

                // Set overlay opacity from karaoke renderer settings
                if (this.player.karaokeRenderer && this.player.karaokeRenderer.waveformPreferences) {
                    this.player.cdgRenderer.setOverlayOpacity(
                        this.player.karaokeRenderer.waveformPreferences.overlayOpacity
                    );
                }

                // Set Butterchurn effects canvas for CDG background
                if (this.player.karaokeRenderer.effectsCanvas && this.player.karaokeRenderer.butterchurn) {
                    this.player.cdgRenderer.setEffectsCanvas(
                        this.player.karaokeRenderer.effectsCanvas,
                        this.player.karaokeRenderer.butterchurn
                    );

                    // Feed CDG MP3 audio to Butterchurn for visualization
                    // This uses the same approach as KAI files - decode audio in Butterchurn's context
                    // and play it silently for analysis only
                    console.log('💿 Feeding CDG audio to Butterchurn...');
                    await this.player.karaokeRenderer.setMusicAudio(songData.audio.mp3);
                    console.log('💿 Butterchurn connected to CDG audio for visualization');
                }

                // CDG doesn't use audio engine or lyrics
                this.player.onSongLoaded(metadata);

                // Enable playback controls
                console.log('💿 Enabling controls for CDG');
                this.enableControls();
                console.log('💿 Updating status for CDG');
                this.updateStatus(`Loaded: ${metadata?.title || 'CDG Song'}`);

                // Update UI to show controls
                this.updateUIForSongState();

                console.log('💿 CDG loading complete');

                return;
            }

            // KAI format - use audio engine
            this.player.currentFormat = 'kai';

            // CLEAN SLATE APPROACH: Reinitialize audio engine
            if (this.audioEngine && this.currentSong) {
                // Create a backup copy of the song data BEFORE reinitialize
                const songDataBackup = {
                    ...this.currentSong,
                    audio: this.currentSong.audio ? {
                        ...this.currentSong.audio,
                        sources: this.currentSong.audio.sources ? [...this.currentSong.audio.sources] : []
                    } : null
                };
                
                await this.audioEngine.reinitialize();
                await this.audioEngine.loadSong(songDataBackup);
                
                // Restore the original song data if it was corrupted
                if (!this.currentSong.audio && songDataBackup.audio) {
                    this.currentSong.audio = songDataBackup.audio;
                }
                if (!this.currentSong.lyrics && songDataBackup.lyrics) {
                    this.currentSong.lyrics = songDataBackup.lyrics;
                }
            }
            
            // CLEAN SLATE APPROACH: Reinitialize karaoke renderer  
            if (this.player && this.currentSong) {
                if (this.player.karaokeRenderer) {
                    this.player.karaokeRenderer.reinitialize();
                }
                
                // Pass full song data which includes lyrics, audio sources, and updated duration from audio engine
                const fullMetadata = {
                    ...metadata,
                    lyrics: this.currentSong.lyrics,
                    duration: this.audioEngine ? this.audioEngine.getDuration() : (this.currentSong.metadata?.duration || 0),
                    audio: this.currentSong.audio // Include audio sources for vocals waveform
                };
                this.player.onSongLoaded(fullMetadata);
                
                // Apply waveform preferences to player
                if (this.player.karaokeRenderer) {
                    this.player.karaokeRenderer.waveformPreferences = { ...this.waveformPreferences };
                    
                    // Restart microphone capture if it was enabled
                    if (this.waveformPreferences.enableMic) {
                        setTimeout(() => {
                            this.player.karaokeRenderer.startMicrophoneCapture();
                        }, 100);
                    }
                    
                    // Update effect display with current preset
                    setTimeout(() => this.updateEffectDisplay(), 100);
                    
                    // Apply random effect if enabled (with debouncing)
                    if (this.waveformPreferences.randomEffectOnSong) {
                        // Clear any existing timeout
                        if (this.randomEffectTimeout) {
                            clearTimeout(this.randomEffectTimeout);
                        }
                        
                        // Random effect on song change - now handled by React EffectsPanelWrapper
                        // this.randomEffectTimeout = setTimeout(() => { ... }, 500);
                    }
                }
            }
            
            // Wait for all contexts and buffers to be ready
            await new Promise(resolve => setTimeout(resolve, 500));
            
            if (this.coaching) {
                this.coaching.onSongLoaded(metadata || {});
            }

            // Editor now handled by React SongEditor component
            // if (this.editor && this.currentSong) {
            //     this.editor.onSongLoaded(this.currentSong);
            // }

            if (this.mixer && this.audioEngine) {
                this.mixer.updateFromAudioEngine();
            }
            
            // Now that everything is fully loaded, update the UI
            this.updateUIForSongState();
            
            // Clear pending metadata
            this._pendingMetadata = null;
        });
    }

    async loadAudioDevices() {
        try {
            
            // Load saved device preferences first
            this.loadDevicePreferences();
            
            // First try to enumerate real devices from renderer process
            const realDevices = await this.enumerateRealDevices();
            if (realDevices.length > 0) {
                this.devices = realDevices;
            } else {
                // Fallback to main process devices
                this.devices = await kaiAPI.audio.getDevices();
            }
            this.populateDeviceSelectors();
            
            // Restore device selections after populating the selectors
            await this.restoreDeviceSelections();
            
        } catch (error) {
            console.error('Failed to load audio devices:', error);
            this.updateStatus('Error loading audio devices');
        }
    }

    async enumerateRealDevices() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                console.warn('MediaDevices API not available');
                return [];
            }

            // Request permission first
            await navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    stream.getTracks().forEach(track => track.stop());
                })
                .catch(err => {
                    console.warn('Microphone permission denied:', err);
                });

            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioDevices = [];
            
            devices.forEach((device, index) => {
                if (device.kind === 'audiooutput' || device.kind === 'audioinput') {
                    audioDevices.push({
                        id: device.deviceId,
                        name: device.label || `${device.kind === 'audiooutput' ? 'Speaker' : 'Microphone'} ${index + 1}`,
                        maxInputChannels: device.kind === 'audioinput' ? 2 : 0,
                        maxOutputChannels: device.kind === 'audiooutput' ? 2 : 0,
                        defaultSampleRate: 48000,
                        hostApi: 'Web Audio API',
                        deviceKind: device.kind,
                        groupId: device.groupId
                    });
                }
            });
            
            // Also update status to show device count
            this.updateStatus(`Found ${audioDevices.length} audio devices`);
            
            return audioDevices;
            
        } catch (error) {
            console.error('Failed to enumerate real audio devices:', error);
            return [];
        }
    }

    populateDeviceSelectors() {
        const selectors = [
            { id: 'paDeviceSelect', filter: 'output' },
            { id: 'iemDeviceSelect', filter: 'output' },
            { id: 'inputDeviceSelect', filter: 'input' }
        ];

        selectors.forEach(({ id, filter }) => {
            const select = document.getElementById(id);
            select.innerHTML = '<option value="">Select device...</option>';
            
            this.devices.forEach((device, index) => {
                let isCompatible = false;
                
                if (filter === 'output') {
                    isCompatible = (device.maxOutputChannels > 0) || (device.deviceKind === 'audiooutput');
                } else if (filter === 'input') {
                    isCompatible = (device.maxInputChannels > 0) || (device.deviceKind === 'audioinput');
                }
                
                if (isCompatible) {
                    const option = document.createElement('option');
                    option.value = device.id || index;
                    option.textContent = device.name;
                    const deviceId = device.deviceId || device.id || '';
                    option.dataset.deviceId = deviceId; // Add data-device-id for setSinkId()
                    console.log(`Populating ${id}: device=${device.name}, id=${device.id}, deviceId=${device.deviceId}, dataset.deviceId=${deviceId}`);
                    select.appendChild(option);
                }
            });
        });
    }

    setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabPanes = document.querySelectorAll('.tab-pane');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.dataset.tab;
                
                tabBtns.forEach(b => b.classList.remove('active'));
                tabPanes.forEach(p => p.classList.remove('active'));
                
                btn.classList.add('active');
                document.getElementById(`${targetTab}-tab`).classList.add('active');
                
                // Handle resize for player tab to update canvas styling
                if (targetTab === 'player' && this.player && this.player.karaokeRenderer && this.player.karaokeRenderer.resizeHandler) {
                    setTimeout(() => {
                        this.player.karaokeRenderer.resizeHandler();
                    }, 10);
                }
            });
        });
    }

    setupServerTab() {
        // Update server status
        this.updateServerStatus();

        // Set up event listeners for server tab
        document.getElementById('saveServerSettings')?.addEventListener('click', () => {
            this.saveServerSettings();
        });

        document.getElementById('setPasswordBtn')?.addEventListener('click', () => {
            this.setAdminPassword();
        });

        document.getElementById('openServerBtn')?.addEventListener('click', () => {
            this.openServerInBrowser();
        });

        document.getElementById('openAdminBtn')?.addEventListener('click', () => {
            this.openAdminPanel();
        });

        document.getElementById('clearRequestsBtn')?.addEventListener('click', () => {
            this.clearAllRequests();
        });

        // Load current settings
        this.loadServerSettings();

        // Update requests stats periodically
        setInterval(() => {
            this.updateRequestsStats();
        }, 5000);
    }

    async updateServerStatus() {
        try {
            const url = await window.kaiAPI.webServer.getUrl();
            const statusIndicator = document.getElementById('statusIndicator');
            const serverStatusText = document.getElementById('serverStatusText');
            const serverUrl = document.getElementById('serverUrl');
            const openServerBtn = document.getElementById('openServerBtn');
            const webUrlDisplay = document.getElementById('webUrlDisplay');

            if (url) {
                // Extract port from URL
                const port = new URL(url).port;
                statusIndicator.className = 'status-indicator online';
                serverStatusText.textContent = `Running on port ${port}`;
                serverUrl.textContent = url;
                openServerBtn.disabled = false;

                // Update status bar with LAN IP
                webUrlDisplay.textContent = `🌐 ${url}`;
                webUrlDisplay.style.display = 'inline';
                webUrlDisplay.onclick = () => {
                    window.kaiAPI.shell.openExternal(url);
                };
            } else {
                statusIndicator.className = 'status-indicator offline';
                serverStatusText.textContent = 'Not running';
                serverUrl.textContent = 'Not running';
                openServerBtn.disabled = true;

                // Hide status bar URL
                webUrlDisplay.style.display = 'none';
            }
        } catch (error) {
            console.error('Failed to get server status:', error);
        }
    }

    async loadServerSettings() {
        try {
            const settings = await window.kaiAPI.webServer.getSettings();
            if (settings) {
                document.getElementById('serverName').value = settings.serverName || '';
                document.getElementById('allowSongRequests').checked = settings.allowSongRequests !== false;
                document.getElementById('requireKJApproval').checked = settings.requireKJApproval !== false;
                document.getElementById('streamVocalsToClients').checked = settings.streamVocalsToClients === true;
            }

            // Check if admin password is set
            const hasPassword = await window.kaiAPI.settings.get('server.adminPasswordHash');
            const passwordStatus = document.getElementById('passwordStatus');
            if (hasPassword) {
                passwordStatus.textContent = 'Admin password is set';
                passwordStatus.className = 'password-status set';
            } else {
                passwordStatus.textContent = 'No admin password set';
                passwordStatus.className = 'password-status';
            }
        } catch (error) {
            console.error('Failed to load server settings:', error);
        }
    }

    async saveServerSettings() {
        try {
            const port = parseInt(document.getElementById('serverPort').value) || 3069;

            const settings = {
                serverName: document.getElementById('serverName').value || 'Loukai Karaoke',
                port: port,
                allowSongRequests: document.getElementById('allowSongRequests').checked,
                requireKJApproval: document.getElementById('requireKJApproval').checked,
                streamVocalsToClients: document.getElementById('streamVocalsToClients').checked
            };

            await window.kaiAPI.webServer.updateSettings(settings);
            this.showServerMessage('Settings saved successfully', 'success');
        } catch (error) {
            console.error('Failed to save server settings:', error);
            this.showServerMessage('Failed to save settings', 'error');
        }
    }

    updateServerSettingsUI(settings) {
        // Update the UI elements with new settings without triggering save
        try {
            if (settings.serverName !== undefined) {
                document.getElementById('serverName').value = settings.serverName;
            }
            if (settings.port !== undefined) {
                document.getElementById('serverPort').value = settings.port;
            }
            if (settings.allowSongRequests !== undefined) {
                document.getElementById('allowSongRequests').checked = settings.allowSongRequests;
            }
            if (settings.requireKJApproval !== undefined) {
                document.getElementById('requireKJApproval').checked = settings.requireKJApproval;
            }
            if (settings.streamVocalsToClients !== undefined) {
                document.getElementById('streamVocalsToClients').checked = settings.streamVocalsToClients;
            }
            console.log('🔧 Server settings UI updated');
        } catch (error) {
            console.error('Error updating server settings UI:', error);
        }
    }

    async setAdminPassword() {
        const passwordInput = document.getElementById('adminPassword');
        const password = passwordInput.value.trim();

        if (!password) {
            this.showServerMessage('Please enter a password', 'error');
            return;
        }

        if (password.length < 6) {
            this.showServerMessage('Password must be at least 6 characters', 'error');
            return;
        }

        try {
            // Hash the password using bcrypt via IPC (bcrypt is a native module, should run in main process)
            // TODO: Move password hashing to main process for better security
            const bcrypt = window.require('bcrypt');
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Save the hashed password
            await window.kaiAPI.settings.set('server.adminPasswordHash', hashedPassword);

            // Clear the input
            passwordInput.value = '';

            // Update status
            const passwordStatus = document.getElementById('passwordStatus');
            passwordStatus.textContent = 'Admin password is set';
            passwordStatus.className = 'password-status set';

            this.showServerMessage('Admin password set successfully', 'success');
        } catch (error) {
            console.error('Failed to set admin password:', error);
            this.showServerMessage('Failed to set admin password', 'error');
        }
    }

    async openServerInBrowser() {
        try {
            const port = await window.kaiAPI.webServer.getPort();
            if (port) {
                // Use window.require for Electron context bridge access
                window.require('electron').shell.openExternal(`http://localhost:${port}`);
            }
        } catch (error) {
            console.error('Failed to open server:', error);
        }
    }

    async openAdminPanel() {
        try {
            const port = await window.kaiAPI.webServer.getPort();
            if (port) {
                // Use window.require for Electron context bridge access
                window.require('electron').shell.openExternal(`http://localhost:${port}/admin`);
            }
        } catch (error) {
            console.error('Failed to open admin panel:', error);
        }
    }

    async clearAllRequests() {
        if (!confirm('Are you sure you want to clear all song requests? This cannot be undone.')) {
            return;
        }

        try {
            // This would need to be implemented in the web server
            this.showServerMessage('All requests cleared', 'success');
            this.updateRequestsStats();
        } catch (error) {
            console.error('Failed to clear requests:', error);
            this.showServerMessage('Failed to clear requests', 'error');
        }
    }

    async updateRequestsStats() {
        try {
            const requests = await window.kaiAPI.webServer.getSongRequests();
            const pending = requests.filter(r => r.status === 'pending').length;

            document.getElementById('pendingRequests').textContent = pending;
            document.getElementById('totalRequests').textContent = requests.length;
        } catch (error) {
            // Silently fail for now
        }
    }

    showServerMessage(message, type = 'info') {
        // Create a temporary message element
        const messageEl = document.createElement('div');
        messageEl.className = `server-message ${type}`;
        messageEl.textContent = message;
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 4px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;

        if (type === 'success') {
            messageEl.style.background = '#28a745';
        } else if (type === 'error') {
            messageEl.style.background = '#dc3545';
        } else {
            messageEl.style.background = '#007acc';
        }

        document.body.appendChild(messageEl);

        // Remove after 3 seconds
        setTimeout(() => {
            messageEl.remove();
        }, 3000);
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
                return;
            }

            switch (e.key) {
                case 'Escape':
                    // Close song info modal if open
                    const modal = document.getElementById('songInfoModal');
                    if (modal && modal.style.display === 'block') {
                        modal.style.display = 'none';
                        e.preventDefault();
                    }
                    break;
                    
                case ' ':
                    e.preventDefault();
                    this.togglePlayback();
                    break;
                
                case 'v':
                case 'V':
                    if (e.ctrlKey || e.metaKey) {
                        this.toggleVocalsPA();
                    } else {
                        this.toggleVocalsGlobal();
                    }
                    break;
                
                case 'a':
                case 'A':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                    } else {
                    }
                    break;
                
                case 'b':
                case 'B':
                    break;
                
                case 's':
                case 'S':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                    }
                    break;
                
                case 'f':
                case 'F':
                    e.preventDefault();
                    this.toggleCanvasFullscreen();
                    break;
                
                case 'Escape':
                    if (document.fullscreenElement) {
                        e.preventDefault();
                        this.toggleCanvasFullscreen();
                    }
                    break;
                
                default:
                    if (e.key >= '1' && e.key <= '9') {
                        const stemIndex = parseInt(e.key) - 1;
                        if (e.shiftKey) {
                            this.toggleStemSolo(stemIndex);
                        } else {
                            this.toggleStemMute(stemIndex);
                        }
                    }
                    break;
            }
        });
    }
    
    async toggleCanvasFullscreen() {
        try {
            const karaokeCanvas = document.getElementById('karaokeCanvas');
            if (!document.fullscreenElement) {
                // Enter fullscreen
                await karaokeCanvas.requestFullscreen();
            } else {
                // Exit fullscreen
                await document.exitFullscreen();
            }
        } catch (error) {
            console.error('❌ Canvas fullscreen toggle failed:', error);
        }
    }
    
    setupWaveformControls() {
        const enableWaveforms = document.getElementById('enableWaveforms');
        const micToSpeakers = document.getElementById('micToSpeakers');
        const enableMic = document.getElementById('enableMic');
        const enableEffects = document.getElementById('enableEffects');
        const randomEffectOnSong = document.getElementById('randomEffectOnSong');
        const enableUpcomingLyrics = document.getElementById('showUpcomingLyrics');
        
        enableWaveforms?.addEventListener('change', (e) => {
            this.waveformPreferences.enableWaveforms = e.target.checked;
            this.saveWaveformPreferences();
            
            // Update player if it exists
            if (this.player && this.player.karaokeRenderer) {
                this.player.karaokeRenderer.setWaveformsEnabled(e.target.checked);
            }
        });
        
        micToSpeakers?.addEventListener('change', (e) => {
            this.waveformPreferences.micToSpeakers = e.target.checked;
            this.saveWaveformPreferences();
            
            // Update audio routing through renderer
            if (this.player && this.player.karaokeRenderer) {
                this.player.karaokeRenderer.setMicToSpeakers(e.target.checked);
            }
        });
        
        enableMic?.addEventListener('change', (e) => {
            this.waveformPreferences.enableMic = e.target.checked;
            this.saveWaveformPreferences();
            
            // Update player if it exists
            if (this.player && this.player.karaokeRenderer) {
                if (e.target.checked) {
                    this.player.karaokeRenderer.startMicrophoneCapture();
                } else {
                    this.player.karaokeRenderer.stopMicrophoneCapture();
                }
            }
        });
        
        enableEffects?.addEventListener('change', (e) => {
            this.waveformPreferences.enableEffects = e.target.checked;
            this.saveWaveformPreferences();
            
            // Update player if it exists
            if (this.player && this.player.karaokeRenderer) {
                this.player.karaokeRenderer.setEffectsEnabled(e.target.checked);
            }
        });
        
        randomEffectOnSong?.addEventListener('change', (e) => {
            console.log('Random effect setting changed to:', e.target.checked);
            this.waveformPreferences.randomEffectOnSong = e.target.checked;
            this.saveWaveformPreferences();
            console.log('Saved random effect preference:', this.waveformPreferences.randomEffectOnSong);
        });
        
        enableUpcomingLyrics?.addEventListener('change', (e) => {
            this.waveformPreferences.showUpcomingLyrics = e.target.checked;
            this.saveWaveformPreferences();
            
            // Update karaoke renderer if it exists
            if (this.player && this.player.karaokeRenderer) {
                this.player.karaokeRenderer.setShowUpcomingLyrics(e.target.checked);
            }
        });
        
        // Overlay opacity slider
        const overlayOpacity = document.getElementById('overlayOpacity');
        const overlayOpacityValue = document.getElementById('overlayOpacityValue');
        
        overlayOpacity?.addEventListener('input', (e) => {
            const opacity = parseFloat(e.target.value);
            this.waveformPreferences.overlayOpacity = opacity;
            this.saveWaveformPreferences();

            // Update display value
            if (overlayOpacityValue) {
                overlayOpacityValue.textContent = opacity.toFixed(2);
            }

            // Update player if it exists - real-time update
            if (this.player && this.player.karaokeRenderer) {
                this.player.karaokeRenderer.waveformPreferences.overlayOpacity = opacity;
            }

            // Also update CDG renderer if it exists
            if (this.player && this.player.cdgRenderer) {
                this.player.cdgRenderer.setOverlayOpacity(opacity);
            }
        });
    }

    async loadKaiFile() {
        try {
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
        if (this.audioEngine) {
            await this.audioEngine.pause();
        }
        if (this.player) {
            await this.player.pause();
            // Also stop CDG renderer if it's playing
            if (this.player.cdgRenderer && this.player.cdgRenderer.isPlaying) {
                this.player.cdgRenderer.pause();
            }
        }

        // Show loading state immediately
        this.showLoadingState();
        
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

    async initializeSidebarState() {
        const savedState = await window.kaiAPI.settings.get('sidebarCollapsed', false);
        const sidebar = document.querySelector('.sidebar');
        const hamburgerIcon = document.querySelector('#hamburgerBtn .material-icons');
        
        // Default is open (savedState === true means collapsed)
        if (savedState) {
            sidebar?.classList.add('collapsed');
            if (hamburgerIcon) hamburgerIcon.textContent = 'menu_open';
        } else {
            sidebar?.classList.remove('collapsed');
            if (hamburgerIcon) hamburgerIcon.textContent = 'menu';
        }
    }

    async toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const hamburgerIcon = document.querySelector('#hamburgerBtn .material-icons');
        
        if (sidebar) {
            const isCollapsed = sidebar.classList.contains('collapsed');
            
            if (isCollapsed) {
                // Expand sidebar
                sidebar.classList.remove('collapsed');
                if (hamburgerIcon) hamburgerIcon.textContent = 'menu';
                await window.kaiAPI.settings.set('sidebarCollapsed', false);
            } else {
                // Collapse sidebar
                sidebar.classList.add('collapsed');
                if (hamburgerIcon) hamburgerIcon.textContent = 'menu_open';
                await window.kaiAPI.settings.set('sidebarCollapsed', true);
            }
        }
    }


    enableControls() {
        document.getElementById('playPauseBtn').disabled = false;
    }

    async togglePlayback() {
        if (!this.currentSong) return;

        // Check if this is CDG format
        const isCDG = this.player?.currentFormat === 'cdg';
        console.log('💿 togglePlayback called, isCDG:', isCDG, 'isPlaying:', this.isPlaying);

        try {
            if (this.isPlaying) {
                if (isCDG) {
                    // CDG format - use CDG renderer
                    this.player.cdgRenderer.pause();
                } else {
                    // KAI format - use audio engine
                    if (!this.audioEngine) return;
                    await this.audioEngine.pause();
                }

                this.isPlaying = false;
                this.updatePlayButton('▶');

                // Also pause the player controller
                if (this.player) {
                    await this.player.pause();
                }

                // AudioEngine handles state broadcasting via reportStateChange()
            } else {
                // Set playing state first
                this.isPlaying = true;
                this.updatePlayButton('⏸');
                this.startPositionUpdater();

                if (isCDG) {
                    // CDG format - use CDG renderer
                    this.player.cdgRenderer.play();
                } else {
                    // KAI format - use audio engine
                    if (!this.audioEngine) return;
                    await this.audioEngine.play();
                }

                // Also play the player controller
                if (this.player) {
                    await this.player.play();
                }

                console.log('💿 After play, isPlaying:', this.isPlaying);
            }

            // AudioEngine handles state broadcasting via reportStateChange()
        } catch (error) {
            console.error('Playback error:', error);
            this.updateStatus('Playback error');
        }
    }

    updatePlayButton(text) {
        const playButton = document.getElementById('playPauseBtn');
        if (playButton) {
            playButton.textContent = text;
        }
    }

    broadcastPlaybackState() {
        // Send current playback state to main process for position broadcasting
        const position = this.audioEngine ? this.audioEngine.getCurrentPosition() : 0;
        const duration = this.audioEngine ? this.audioEngine.getDuration() : 0;

        if (typeof kaiAPI !== 'undefined' && kaiAPI.renderer) {
            kaiAPI.renderer.sendPlaybackState({
                isPlaying: this.isPlaying,
                position: position,
                duration: duration
            });
        }
    }

    handleSongEnded() {
        this.isPlaying = false;
        this.updatePlayButton('▶');

        // Also update the player controller's state
        if (this.player) {
            this.player.isPlaying = false;
            // Update karaoke renderer
            if (this.player.karaokeRenderer) {
                this.player.karaokeRenderer.setPlaying(false);
            }
        }

        // AudioEngine handles state broadcasting via reportStateChange()

        // Update status
        this.updateStatus('Song ended');
        
        // Check for queue auto-advance
        if (this.queueManager) {
            this.queueManager.handleSongEnded();
        }
    }

    async seekRelative(seconds) {
        if (!this.currentSong || !this.audioEngine) return;
        
        const newPosition = Math.max(0, this.audioEngine.getCurrentPosition() + seconds);
        await this.audioEngine.seek(newPosition);
    }

    async restartTrack() {
        if (!this.currentSong) return;

        const isCDG = this.player?.currentFormat === 'cdg';
        if (isCDG) {
            this.player.cdgRenderer.seek(0);
        } else if (this.audioEngine) {
            await this.audioEngine.seek(0);
        }
    }

    async nextTrack() {
        // Check if queue manager exists and has next song
        if (this.queueManager) {
            const nextSong = this.queueManager.getNextSong();
            if (nextSong) {
                await this.queueManager.playNext();
                return;
            }
        }
        // Could show a toast message here if desired
    }

    startPositionUpdater() {
        if (this.positionTimer) return;

        this.positionTimer = setInterval(() => {
            const isCDG = this.player?.currentFormat === 'cdg';

            if (this.isPlaying) {
                // Get position based on format
                if (isCDG && this.player?.cdgRenderer) {
                    this.currentPosition = this.player.cdgRenderer.getCurrentTime();
                } else if (this.audioEngine) {
                    this.currentPosition = this.audioEngine.getCurrentPosition();
                }

                if (this.player) {
                    this.player.currentPosition = this.currentPosition;
                }

                if (this.coaching) {
                    this.coaching.setPosition(this.currentPosition);
                }

                // Check if song ended based on format
                let duration = 0;
                if (isCDG && this.player?.cdgRenderer) {
                    duration = this.player.cdgRenderer.getDuration();
                } else if (this.audioEngine) {
                    duration = this.audioEngine.getDuration();
                }

                if (duration > 0 && this.currentPosition >= duration) {
                    this.isPlaying = false;
                    this.updatePlayButton('▶');
                    if (this.positionTimer) {
                        clearInterval(this.positionTimer);
                        this.positionTimer = null;
                    }
                }

                // Broadcast updated position to main process every 5 updates (~500ms)
                if (!this.positionUpdateCounter) this.positionUpdateCounter = 0;
                // AudioEngine handles state broadcasting via reportStateChange()
            }
        }, 100);
    }


    async toggleVocalsGlobal() {
        await kaiAPI.mixer.toggleMute('vocals', 'PA');
        await kaiAPI.mixer.toggleMute('vocals', 'IEM');
    }

    async toggleVocalsPA() {
        await kaiAPI.mixer.toggleMute('vocals', 'PA');
    }

    async toggleStemMute(stemIndex) {
        if (this.mixer) {
            this.mixer.toggleStemMute(stemIndex);
        }
    }

    async toggleStemSolo(stemIndex) {
        if (this.mixer) {
            this.mixer.toggleStemSolo(stemIndex);
        }
    }

    updateAutotuneSettings() {
        const enabled = document.getElementById('autotuneEnabled').checked;
        const strength = document.getElementById('autotuneStrength').value;
        const speed = document.getElementById('autotuneSpeed').value;
        
        // Update preferences
        this.autoTunePreferences = {
            enabled: enabled,
            strength: parseInt(strength),
            speed: parseInt(speed)
        };
        this.saveAutoTunePreferences();
        
        // Update audio engine directly
        if (this.audioEngine) {
            this.audioEngine.setAutoTuneSettings(this.autoTunePreferences);
        }
        
        // Also update via API if needed
        kaiAPI.autotune.setSettings({
            strength: parseInt(strength),
            speed: parseInt(speed)
        });
    }

    updateStatus(message) {
        document.getElementById('statusText').textContent = message;
    }
    
    // Device persistence methods
    async loadDevicePreferences() {
        try {
            const saved = await window.kaiAPI.settings.get('devicePreferences', null);
            if (saved) {
                this.devicePreferences = { ...this.devicePreferences, ...saved };
            }

            // Load and set IEM mono vocals checkbox state
            const iemMonoVocals = await window.kaiAPI.settings.get('iemMonoVocals', true);
            const checkbox = document.getElementById('iemMonoVocals');
            if (checkbox) {
                checkbox.checked = iemMonoVocals;
            }
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

    // Waveform preferences methods
    async loadWaveformPreferences() {
        try {
            const saved = await window.kaiAPI.settings.get('waveformPreferences', null);
            if (saved) {
                this.waveformPreferences = { ...this.waveformPreferences, ...saved };
                
                // Apply saved preferences to checkboxes
                const enableWaveforms = document.getElementById('enableWaveforms');
                const micToSpeakers = document.getElementById('micToSpeakers');
                const enableMic = document.getElementById('enableMic');
                const enableEffects = document.getElementById('enableEffects');
                const randomEffectOnSong = document.getElementById('randomEffectOnSong');
                const showUpcomingLyrics = document.getElementById('showUpcomingLyrics');
                
                if (enableWaveforms) enableWaveforms.checked = this.waveformPreferences.enableWaveforms;
                if (micToSpeakers) micToSpeakers.checked = this.waveformPreferences.micToSpeakers;
                if (enableMic) enableMic.checked = this.waveformPreferences.enableMic;
                if (enableEffects) enableEffects.checked = this.waveformPreferences.enableEffects;
                if (randomEffectOnSong) {
                    randomEffectOnSong.checked = this.waveformPreferences.randomEffectOnSong;
                    console.log('Loaded random effect preference:', this.waveformPreferences.randomEffectOnSong, 'checkbox set to:', randomEffectOnSong.checked);
                }
                if (showUpcomingLyrics) showUpcomingLyrics.checked = this.waveformPreferences.showUpcomingLyrics;
                
                // Apply saved overlay opacity
                const overlayOpacity = document.getElementById('overlayOpacity');
                const overlayOpacityValue = document.getElementById('overlayOpacityValue');
                if (overlayOpacity && this.waveformPreferences.overlayOpacity !== undefined) {
                    overlayOpacity.value = this.waveformPreferences.overlayOpacity;
                    if (overlayOpacityValue) {
                        overlayOpacityValue.textContent = this.waveformPreferences.overlayOpacity.toFixed(2);
                    }

                    // Apply opacity to renderers
                    if (this.player && this.player.karaokeRenderer) {
                        this.player.karaokeRenderer.waveformPreferences.overlayOpacity = this.waveformPreferences.overlayOpacity;
                    }
                    if (this.player && this.player.cdgRenderer) {
                        this.player.cdgRenderer.setOverlayOpacity(this.waveformPreferences.overlayOpacity);
                    }
                }
            }
            
            // Reload disabled effects - now handled by React EffectsPanelWrapper
            // if (this.effectsManager && typeof this.effectsManager.reloadFromMainPreferences === 'function') {
            //     this.effectsManager.reloadFromMainPreferences();
            // }
        } catch (error) {
            console.warn('Failed to load waveform preferences:', error);
        }
    }
    
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
            if (this.audioEngine) {
                this.audioEngine.setAutoTuneSettings(this.autoTunePreferences);
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
            if (preferences.microphone.enabled !== undefined && this.audioEngine) {
                if (preferences.microphone.enabled) {
                    this.audioEngine.startMicrophoneInput();
                } else {
                    this.audioEngine.stopMicrophoneInput();
                }
            }
            if (preferences.microphone.gain !== undefined && this.audioEngine) {
                this.audioEngine.setMicrophoneGain(preferences.microphone.gain);
            }
        }

        // Sync IEM mono vocals preference
        if (preferences.iemMonoVocals !== undefined && this.audioEngine) {
            this.audioEngine.setIEMMonoVocals(preferences.iemMonoVocals);
        }

        console.log('✅ Preferences synced from main process');
    }

    async loadAutoTunePreferences() {
        try {
            const saved = await window.kaiAPI.settings.get('autoTunePreferences', null);
            if (saved) {
                this.autoTunePreferences = { ...this.autoTunePreferences, ...saved };
                
                // Apply saved preferences to controls
                const autotuneEnabled = document.getElementById('autotuneEnabled');
                const autotuneStrength = document.getElementById('autotuneStrength');
                const autotuneSpeed = document.getElementById('autotuneSpeed');
                
                if (autotuneEnabled) autotuneEnabled.checked = this.autoTunePreferences.enabled;
                if (autotuneStrength) {
                    autotuneStrength.value = this.autoTunePreferences.strength;
                    document.querySelector('#autotuneStrength + .slider-value').textContent = `${this.autoTunePreferences.strength}%`;
                }
                if (autotuneSpeed) {
                    autotuneSpeed.value = this.autoTunePreferences.speed;
                    document.querySelector('#autotuneSpeed + .slider-value').textContent = this.autoTunePreferences.speed;
                }
                
                // Apply settings to audio engine if it exists
                if (this.audioEngine) {
                    this.audioEngine.setAutoTuneSettings(this.autoTunePreferences);
                }
            }
        } catch (error) {
            console.warn('Failed to load auto-tune preferences:', error);
        }
    }
    
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
    
    async restoreDeviceSelections() {
        const deviceTypes = [
            { type: 'PA', selectId: 'paDeviceSelect' },
            { type: 'IEM', selectId: 'iemDeviceSelect' },
            { type: 'input', selectId: 'inputDeviceSelect' }
        ];
        
        for (const { type, selectId } of deviceTypes) {
            const savedDevice = this.devicePreferences[type];
            if (!savedDevice) continue;
            
            const select = document.getElementById(selectId);
            let matchedDevice = null;
            
            // First try exact ID match
            matchedDevice = this.devices.find(d => (d.id || d.deviceId) === savedDevice.id);
            
            // If no exact match, try name match (for when device IDs change)
            if (!matchedDevice && savedDevice.name) {
                matchedDevice = this.devices.find(d => 
                    (d.name || d.label) === savedDevice.name && 
                    (!savedDevice.deviceKind || d.deviceKind === savedDevice.deviceKind)
                );
            }
            
            if (matchedDevice) {
                const deviceId = matchedDevice.id || matchedDevice.deviceId;
                select.value = deviceId;
                
                // Apply the device selection
                if (type === 'PA') {
                    kaiAPI.audio.setDevice('PA', parseInt(deviceId));
                    if (this.audioEngine && this.audioEngine.setOutputDevice) {
                        await this.audioEngine.setOutputDevice('PA', deviceId);
                    }
                } else if (type === 'IEM') {
                    kaiAPI.audio.setDevice('IEM', parseInt(deviceId));
                    if (this.audioEngine && this.audioEngine.setOutputDevice) {
                        await this.audioEngine.setOutputDevice('IEM', deviceId);
                    }
                } else if (type === 'input') {
                    kaiAPI.audio.setDevice('input', parseInt(deviceId));
                }
                
            } else {
                // Clear invalid preference
                this.devicePreferences[type] = null;
                await this.saveDevicePreferences();
            }
        }
    }
    
    updateEffectDisplay() {
        const effectNameElement = document.getElementById('currentEffectName');
        if (effectNameElement && this.player && this.player.karaokeRenderer) {
            const renderer = this.player.karaokeRenderer;
            let displayName = 'Effect';

            if (renderer.effectType === 'butterchurn' && renderer.currentPreset) {
                // Parse preset name like effects manager does
                let presetDisplayName = renderer.currentPreset;
                if (presetDisplayName.includes(' - ')) {
                    const parts = presetDisplayName.split(' - ');
                    // Skip the author part (first part) and use the rest
                    presetDisplayName = parts.slice(1).join(' - ');
                }

                // Truncate if still too long
                displayName = presetDisplayName.length > 30 ?
                    presetDisplayName.substring(0, 30) + '...' :
                    presetDisplayName;
            } else {
                displayName = 'No Effect';
            }

            effectNameElement.textContent = displayName;
        }
        
        // Sync the effects manager UI - now handled by React EffectsPanelWrapper
        // if (this.effectsManager && typeof this.effectsManager.syncWithRenderer === 'function') {
        //     this.effectsManager.syncWithRenderer();
        // }
    }
    
    showLoadingState() {
        const playControls = document.getElementById('playControls');
        const transportContainer = playControls.parentElement;
        
        // Hide play controls
        playControls.style.display = 'none';
        
        // Create or update the loading message
        let noSongMessage = document.getElementById('noSongMessage');
        if (!noSongMessage) {
            noSongMessage = document.createElement('div');
            noSongMessage.id = 'noSongMessage';
            noSongMessage.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                color: #ccc;
                text-align: center;
                padding: 10px;
            `;
            // Insert before the effects controls
            transportContainer.insertBefore(noSongMessage, transportContainer.querySelector('.effects-controls'));
        }
        noSongMessage.innerHTML = '⏳ Loading...';
        noSongMessage.style.display = 'flex';
    }
    
    updateUIForSongState() {
        const playControls = document.getElementById('playControls');
        const transportContainer = playControls.parentElement;
        
        if (!this.currentSong) {
            // No song loaded - hide play controls and show "Load a Song" message
            playControls.style.display = 'none';
            
            // Create or update the no-song message in the transport controls area
            let noSongMessage = document.getElementById('noSongMessage');
            if (!noSongMessage) {
                noSongMessage = document.createElement('div');
                noSongMessage.id = 'noSongMessage';
                noSongMessage.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    color: #ccc;
                    text-align: center;
                    padding: 10px;
                `;
                // Insert before the effects controls
                transportContainer.insertBefore(noSongMessage, transportContainer.querySelector('.effects-controls'));
            }
            noSongMessage.innerHTML = '🎵 Load a Song to Begin';
            noSongMessage.style.display = 'flex';
        } else {
            // Song loaded - show normal controls
            playControls.style.display = 'flex';
            
            // Reset play button state when new song loads
            this.isPlaying = false;
            this.updatePlayButton('▶');
            
            // Hide the no-song message if it exists
            const noSongMessage = document.getElementById('noSongMessage');
            if (noSongMessage) {
                noSongMessage.style.display = 'none';
            }
        }
    }

    setupAdminIPCListeners() {
        // Listen for mixer commands from web admin
        if (window.kaiAPI?.mixer) {
            window.kaiAPI.mixer.onSetMasterGain((event, data) => {
                const { bus, gainDb } = data;
                if (this.audioEngine) {
                    this.audioEngine.setMasterGain(bus, gainDb);
                }
            });

            window.kaiAPI.mixer.onToggleMasterMute((event, data) => {
                const { bus, muted } = data;
                if (this.audioEngine) {
                    if (muted !== undefined) {
                        this.audioEngine.setMasterMute(bus, muted);
                    } else {
                        this.audioEngine.toggleMasterMute(bus);
                    }
                }
            });
        }
    }
}

// Initialize app when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
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
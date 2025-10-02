class RendererAudioEngine {
    constructor() {
        // Dual audio contexts for PA and IEM outputs
        this.audioContexts = {
            PA: null,
            IEM: null
        };

        // Device IDs for PA and IEM outputs
        this.outputDevices = {
            PA: 'default',
            IEM: 'default'
        };

        this.isPlaying = false;
        this.currentPosition = 0;
        this.songData = null;
        this.audioBuffers = new Map();

        // Separate gain nodes and sources for each output
        this.outputNodes = {
            PA: {
                sourceNodes: new Map(),
                gainNodes: new Map(),
                masterGain: null
            },
            IEM: {
                sourceNodes: new Map(),
                gainNodes: new Map(),
                masterGain: null
            }
        };

        this.startTime = 0;
        this.pauseTime = 0;

        // Event callbacks
        this.onSongEndedCallback = null;

        // Microphone input
        this.microphoneStream = null;
        this.microphoneSource = null;
        this.microphoneGain = null;

        // Auto-tune
        this.autoTuneNode = null;
        this.autoTuneWorkletLoaded = false;

        this.mixerState = {
            // Simple 3-fader mixer
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
            // Per-song data (for internal use)
            stems: [],
            autotuneSettings: {
                enabled: false,
                strength: 50,
                speed: 5
            }
        };

        // State reporting to main process
        this.stateReportInterval = null;
    }

    async initialize() {
        try {
            // Load saved device preferences first
            await this.loadDevicePreferences();
            
            // Initialize PA audio context with saved device
            const paContextOptions = {};
            if (this.outputDevices.PA !== 'default' && 'sinkId' in AudioContext.prototype) {
                paContextOptions.sinkId = this.outputDevices.PA;
            }
            this.audioContexts.PA = new (window.AudioContext || window.webkitAudioContext)(paContextOptions);
            this.outputNodes.PA.masterGain = this.audioContexts.PA.createGain();
            this.outputNodes.PA.masterGain.connect(this.audioContexts.PA.destination);
            // Apply saved PA gain (considering mute state)
            const paGain = this.mixerState.PA.muted ? 0 : this.dbToLinear(this.mixerState.PA.gain);
            this.outputNodes.PA.masterGain.gain.value = paGain;
            console.log(`🔊 Applied PA gain: ${this.mixerState.PA.gain} dB (linear: ${paGain}, muted: ${this.mixerState.PA.muted})`);

            // Initialize IEM audio context with saved device
            const iemContextOptions = {};
            if (this.outputDevices.IEM !== 'default' && 'sinkId' in AudioContext.prototype) {
                iemContextOptions.sinkId = this.outputDevices.IEM;
            }
            this.audioContexts.IEM = new (window.AudioContext || window.webkitAudioContext)(iemContextOptions);
            this.outputNodes.IEM.masterGain = this.audioContexts.IEM.createGain();
            this.outputNodes.IEM.masterGain.connect(this.audioContexts.IEM.destination);
            // Apply saved IEM gain (considering mute state)
            const iemGain = this.mixerState.IEM.muted ? 0 : this.dbToLinear(this.mixerState.IEM.gain);
            this.outputNodes.IEM.masterGain.gain.value = iemGain;
            console.log(`🔊 Applied IEM gain: ${this.mixerState.IEM.gain} dB (linear: ${iemGain}, muted: ${this.mixerState.IEM.muted})`);
            
            
            // Load auto-tune worklet
            await this.loadAutoTuneWorklet();
            return true;
        } catch (error) {
            console.error('Failed to initialize dual audio contexts:', error);
            return false;
        }
    }
    
    async loadDevicePreferences() {
        try {
            // Load device preferences from settingsAPI
            if (window.settingsAPI) {
                const devicePrefs = await window.settingsAPI.getDevicePreferences();
                console.log('📂 Loaded device preferences:', devicePrefs);

                if (devicePrefs?.PA?.id) {
                    this.outputDevices.PA = devicePrefs.PA.id;
                    console.log('📂 Set PA device:', devicePrefs.PA.id);
                }
                if (devicePrefs?.IEM?.id) {
                    this.outputDevices.IEM = devicePrefs.IEM.id;
                    console.log('📂 Set IEM device:', devicePrefs.IEM.id);
                }
            }

            // Load mixer state from AppState
            if (window.kaiAPI?.app) {
                const appState = await window.kaiAPI.app.getState();
                console.log('📂 Received AppState for mixer:', appState?.mixer ? 'found' : 'not found');

                // Load mixer state from AppState
                if (appState?.mixer) {

                    if (typeof appState.mixer.PA?.gain === 'number') {
                        this.mixerState.PA.gain = appState.mixer.PA.gain;
                        console.log('📂 Set PA gain to:', appState.mixer.PA.gain);
                    }
                    if (typeof appState.mixer.PA?.muted === 'boolean') {
                        this.mixerState.PA.muted = appState.mixer.PA.muted;
                        console.log('📂 Set PA muted to:', appState.mixer.PA.muted);
                    }
                    if (typeof appState.mixer.IEM?.gain === 'number') {
                        this.mixerState.IEM.gain = appState.mixer.IEM.gain;
                        console.log('📂 Set IEM gain to:', appState.mixer.IEM.gain);
                    }
                    if (typeof appState.mixer.IEM?.muted === 'boolean') {
                        this.mixerState.IEM.muted = appState.mixer.IEM.muted;
                        console.log('📂 Set IEM muted to:', appState.mixer.IEM.muted);
                    }
                    if (typeof appState.mixer.mic?.gain === 'number') {
                        this.mixerState.mic.gain = appState.mixer.mic.gain;
                        console.log('📂 Set mic gain to:', appState.mixer.mic.gain);
                    }
                    if (typeof appState.mixer.mic?.muted === 'boolean') {
                        this.mixerState.mic.muted = appState.mixer.mic.muted;
                        console.log('📂 Set mic muted to:', appState.mixer.mic.muted);
                    }
                    console.log('✅ Final mixer state after loading:', JSON.stringify(this.mixerState, null, 2));
                }
            }

            // Final summary of loaded devices
            console.log('🔊 Final device configuration:', {
                PA: this.outputDevices.PA,
                IEM: this.outputDevices.IEM
            });
        } catch (error) {
            console.error('Failed to load device preferences:', error);
        }
    }
    
    async setOutputDevice(busType, deviceId) {
        try {
            console.log(`🔊 setOutputDevice called: busType=${busType}, deviceId=${deviceId}`);

            if (!['PA', 'IEM'].includes(busType)) {
                console.error('Invalid bus type:', busType);
                return false;
            }

            const wasPlaying = this.isPlaying;
            const currentPos = this.currentPosition;

            // Stop current playback if running
            if (wasPlaying) {
                this.pause();
            }

            // Store the device preference
            this.outputDevices[busType] = deviceId;
            console.log(`🔊 Stored ${busType} device preference:`, deviceId);
            
            // Close existing context for this bus
            if (this.audioContexts[busType]) {
                await this.audioContexts[busType].close();
            }
            
            // Create new context with proper device
            const contextOptions = {};
            if (deviceId !== 'default' && 'sinkId' in AudioContext.prototype) {
                contextOptions.sinkId = deviceId;
                console.log(`🔊 Creating ${busType} AudioContext with sinkId:`, deviceId);
            } else {
                console.log(`🔊 Creating ${busType} AudioContext with default sink`);
            }

            this.audioContexts[busType] = new (window.AudioContext || window.webkitAudioContext)(contextOptions);
            console.log(`🔊 ${busType} AudioContext created successfully`);
            this.outputNodes[busType].masterGain = this.audioContexts[busType].createGain();
            this.outputNodes[busType].masterGain.connect(this.audioContexts[busType].destination);
            
            // Clear old audio nodes
            this.outputNodes[busType].sourceNodes.clear();
            this.outputNodes[busType].gainNodes.clear();
            
            
            // Reload audio buffers for the new context (audio buffers are context-specific)
            if (this.songData) {
                await this.reloadAudioBuffersForBus(busType);
            }
            
            // Resume playback if it was playing
            if (wasPlaying && this.songData) {
                this.currentPosition = currentPos;
                await this.play();
            }
            
            return true;
        } catch (error) {
            console.error(`Failed to set ${busType} output device:`, error);
            return false;
        }
    }

    async loadSong(songData) {
        this.songData = songData;

        // Reset all timing state for new song
        this.currentPosition = 0;
        this.startTime = 0;
        this.pauseTime = 0;
        this.monitoringStartTime = null;

        // Stop any existing song end monitoring
        this.stopSongEndMonitoring();


        // Keep stems array for tracking audio sources (for internal use only)
        // Routing is automatic: vocals → IEM (mono), instrumental → PA, mic → PA
        this.mixerState.stems = (songData.audio?.sources || []).map((source, index) => ({
            id: source.name || source.filename,
            name: source.name || source.filename,
            gain: source.gain || 0,  // Per-source gain (still useful for balancing)
            index
        }));


        await this.loadAudioBuffers(songData);

        // Report song loaded to main process
        this.reportSongLoaded();

        return true;
    }

    /**
     * Report state changes to main process
     */
    reportStateChange() {
        if (window.kaiAPI?.renderer) {
            window.kaiAPI.renderer.updatePlaybackState({
                isPlaying: this.isPlaying,
                position: this.getCurrentPosition(),
                duration: this.getDuration()
            });
        }
    }

    reportSongLoaded() {
        if (window.kaiAPI?.renderer && this.songData) {
            const duration = this.getDuration();
            window.kaiAPI.renderer.songLoaded({
                path: this.songData.originalFilePath || this.songData.filePath,
                title: this.songData.metadata?.title || 'Unknown',
                artist: this.songData.metadata?.artist || 'Unknown',
                duration: duration
            });

            // Report initial mixer state
            this.reportMixerState();
        }
    }

    reportMixerState() {
        if (window.kaiAPI?.renderer && this.mixerState) {
            window.kaiAPI.renderer.updateMixerState(this.mixerState);
        }
    }

    startStateReporting() {
        this.stopStateReporting();

        // Report state every 100ms (10x/sec)
        this.stateReportInterval = setInterval(() => {
            if (this.isPlaying) {
                this.reportStateChange();
            }
        }, 100);
    }

    stopStateReporting() {
        if (this.stateReportInterval) {
            clearInterval(this.stateReportInterval);
            this.stateReportInterval = null;
        }
    }

    async loadAudioBuffers(songData) {
        if (!songData.audio?.sources) {
            console.warn('No audio sources found in song data');
            return;
        }

        if (!this.audioContext) {
            await this.initialize();
        }
        
        
        for (const source of songData.audio.sources) {
            try {
                if (source.audioData && source.audioData.length > 0) {
                    
                    const arrayBuffer = source.audioData.buffer.slice(
                        source.audioData.byteOffset, 
                        source.audioData.byteOffset + source.audioData.byteLength
                    );
                    
                    const decodedBuffer = await this.audioContexts.PA.decodeAudioData(arrayBuffer);
                    this.audioBuffers.set(source.name, decodedBuffer);
                    
                } else {
                    console.warn(`No audio data for source: ${source.name}`);
                }
            } catch (error) {
                console.error(`Failed to decode audio for ${source.name}:`, error);
            }
        }
        
        
        // Calculate the actual duration from the longest audio buffer
        let maxDuration = 0;
        for (const [name, buffer] of this.audioBuffers) {
            if (buffer.duration > maxDuration) {
                maxDuration = buffer.duration;
            }
        }
        
        // Update the song metadata with the actual duration
        if (maxDuration > 0) {
            if (!this.songData.metadata) {
                this.songData.metadata = {};
            }
            this.songData.metadata.duration = maxDuration;
        } else {
            console.warn('No audio buffers loaded, duration remains 0');
        }
    }
    
    async reloadAudioBuffersForBus(busType) {
        if (!this.songData?.audio?.sources || !this.audioContexts[busType]) {
            return;
        }
        
        
        // Audio buffers are shared between contexts, but we need to re-decode for new context
        // The existing buffers in this.audioBuffers should still work, but let's make sure
        // the new context has access to them by re-decoding if needed
        
        for (const source of this.songData.audio.sources) {
            if (source.audioData && source.audioData.length > 0) {
                try {
                    // Check if we already have this buffer
                    if (!this.audioBuffers.has(source.name)) {
                        const arrayBuffer = source.audioData.buffer.slice(
                            source.audioData.byteOffset, 
                            source.audioData.byteOffset + source.audioData.byteLength
                        );
                        
                        const decodedBuffer = await this.audioContexts[busType].decodeAudioData(arrayBuffer);
                        this.audioBuffers.set(source.name, decodedBuffer);
                    }
                } catch (error) {
                    console.error(`Failed to reload audio buffer for ${busType} - ${source.name}:`, error);
                }
            }
        }
        
    }

    async play() {
        if (!this.songData) {
            console.error('No song loaded');
            return false;
        }

        if (!this.audioContexts.PA || !this.audioContexts.IEM) {
            console.error('Audio contexts not initialized');
            return false;
        }

        if (this.audioContexts.PA.state === 'suspended') {
            await this.audioContexts.PA.resume();
        }
        if (this.audioContexts.IEM.state === 'suspended') {
            await this.audioContexts.IEM.resume();
        }

        this.isPlaying = true;

        this.stopAllSources();
        this.createAudioGraph();
        this.startAudioSources();

        // Start song end monitoring
        this.startSongEndMonitoring();

        // Start state reporting
        this.startStateReporting();

        // Report immediate state change
        this.reportStateChange();

        return true;
    }

    async pause() {
        this.isPlaying = false;

        if (this.audioContexts.PA) {
            this.pauseTime = this.audioContexts.PA.currentTime;
        }

        this.stopAllSources();

        // Stop song end monitoring
        this.stopSongEndMonitoring();

        // Stop state reporting
        this.stopStateReporting();

        // Report immediate state change
        this.reportStateChange();

        return true;
    }

    async seek(positionSec) {
        this.currentPosition = positionSec;

        if (this.isPlaying) {
            this.stopAllSources();
            this.startAudioSources();
        }

        // Report immediate state change
        this.reportStateChange();

        return true;
    }

    stopAllSources() {
        let totalSources = this.outputNodes.PA.sourceNodes.size + this.outputNodes.IEM.sourceNodes.size;
        
        // Stop PA sources
        this.outputNodes.PA.sourceNodes.forEach((source, index) => {
            try {
                source.stop();
                source.disconnect(); // Disconnect all connections
            } catch (e) {
            }
        });
        this.outputNodes.PA.sourceNodes.clear();
        
        // Stop IEM sources  
        this.outputNodes.IEM.sourceNodes.forEach((source, index) => {
            try {
                source.stop();
                source.disconnect(); // Disconnect all connections
            } catch (e) {
            }
        });
        this.outputNodes.IEM.sourceNodes.clear();
        
    }

    createAudioGraph() {
        if (!this.audioContexts.PA || !this.audioContexts.IEM) return;

        // Clear existing gain nodes for both outputs
        this.outputNodes.PA.gainNodes.clear();
        this.outputNodes.IEM.gainNodes.clear();
        
        this.mixerState.stems.forEach(stem => {
            // Create gain node for PA output
            const paGainNode = this.audioContexts.PA.createGain();
            paGainNode.connect(this.outputNodes.PA.masterGain);
            this.outputNodes.PA.gainNodes.set(stem.name, paGainNode);
            
            // Create gain node for IEM output
            const iemGainNode = this.audioContexts.IEM.createGain();

            // For vocal stems, add mono conversion if enabled
            if (this.isVocalStem(stem.name) && this.mixerState.iemMonoVocals) {
                // Create channel merger to convert stereo to mono
                const channelMerger = this.audioContexts.IEM.createChannelMerger(1);
                iemGainNode.connect(channelMerger);
                channelMerger.connect(this.outputNodes.IEM.masterGain);
            } else {
                iemGainNode.connect(this.outputNodes.IEM.masterGain);
            }

            this.outputNodes.IEM.gainNodes.set(stem.name, iemGainNode);
            
            this.updateStemGain(stem);
        });
        
    }

    startAudioSources() {
        if (!this.audioContexts.PA || !this.audioContexts.IEM) return;

        // Sync start time for both outputs - add small delay to ensure synchronization
        const scheduleTime = Math.max(this.audioContexts.PA.currentTime, this.audioContexts.IEM.currentTime) + 0.1;
        this.startTime = scheduleTime;
        
        this.mixerState.stems.forEach(stem => {
            const audioBuffer = this.audioBuffers.get(stem.name);
            const paGainNode = this.outputNodes.PA.gainNodes.get(stem.name);
            const iemGainNode = this.outputNodes.IEM.gainNodes.get(stem.name);
            
            if (audioBuffer && paGainNode && iemGainNode) {
                try {
                    const offset = Math.min(this.currentPosition, audioBuffer.duration);
                    const isVocals = this.isVocalStem(stem.name);
                    
                    // Proper karaoke routing: vocals to IEM only, music/backing tracks to PA only
                    if (isVocals) {
                        console.log(`🎤 Routing VOCALS (${stem.name}) → IEM device (${this.outputDevices.IEM})`);
                        // Vocals go to IEM only (singer's ears)
                        const iemSource = this.audioContexts.IEM.createBufferSource();
                        iemSource.buffer = audioBuffer;
                        iemSource.connect(iemGainNode);
                        iemSource.start(scheduleTime, offset);
                        this.outputNodes.IEM.sourceNodes.set(stem.name, iemSource);
                        
                    } else {
                        console.log(`🎵 Routing MUSIC (${stem.name}) → PA device (${this.outputDevices.PA})`);
                        // Backing tracks go to PA only (audience)
                        const paSource = this.audioContexts.PA.createBufferSource();
                        paSource.buffer = audioBuffer;
                        paSource.connect(paGainNode);
                        paSource.start(scheduleTime, offset);
                        this.outputNodes.PA.sourceNodes.set(stem.name, paSource);
                        
                        // Add onended handler as backup to position monitoring
                        paSource.onended = () => {
                            if (this.isPlaying) {
                                // Let the position monitoring handle the cleanup
                                // This serves as a backup in case position monitoring misses it
                                setTimeout(() => this.checkForSongEnd(), 10);
                            }
                        };
                        
                    }
                } catch (error) {
                    console.error(`Failed to start source for ${stem.name}:`, error);
                }
            } else {
                console.warn(`No audio buffer or gain nodes for stem: ${stem.name}`);
            }
        });
        
        
        // Debug PA output routing
        this.outputNodes.PA.gainNodes.forEach((gainNode, stemName) => {
        });
    }
    
    isVocalStem(stemName) {
        const vocalsKeywords = ['vocals', 'vocal', 'voice', 'lead', 'singing', 'vox'];
        const lowerName = stemName.toLowerCase();
        return vocalsKeywords.some(keyword => lowerName.includes(keyword));
    }

    updateStemGain(stem) {
        const paGainNode = this.outputNodes.PA.gainNodes.get(stem.name);
        const iemGainNode = this.outputNodes.IEM.gainNodes.get(stem.name);
        const isVocals = this.isVocalStem(stem.name);

        if (!this.audioContexts.PA || !this.audioContexts.IEM) return;

        // Convert stem gain from dB to linear (per-stem balancing)
        const baseGain = Math.pow(10, stem.gain / 20);

        // Simple routing: vocals to IEM, backing tracks to PA
        // Master faders control overall output level
        if (isVocals && iemGainNode) {
            iemGainNode.gain.setValueAtTime(baseGain, this.audioContexts.IEM.currentTime);
        } else if (!isVocals && paGainNode) {
            paGainNode.gain.setValueAtTime(baseGain, this.audioContexts.PA.currentTime);
        }
    }

    // New simple mixer controls
    setMasterGain(bus, gainDb) {
        if (!['PA', 'IEM', 'mic'].includes(bus)) return false;

        this.mixerState[bus].gain = gainDb;

        // Apply to audio node
        if (bus === 'PA' && this.outputNodes.PA.masterGain) {
            const linearGain = this.dbToLinear(gainDb);
            this.outputNodes.PA.masterGain.gain.setValueAtTime(linearGain, this.audioContexts.PA.currentTime);
        } else if (bus === 'IEM' && this.outputNodes.IEM.masterGain) {
            const linearGain = this.dbToLinear(gainDb);
            this.outputNodes.IEM.masterGain.gain.setValueAtTime(linearGain, this.audioContexts.IEM.currentTime);
        }
        // Mic gain would be applied to microphone input node (when implemented)

        // Report to main process (which handles persistence via AppState)
        this.reportMixerState();
        return true;
    }

    toggleMasterMute(bus) {
        if (!['PA', 'IEM', 'mic'].includes(bus)) return false;

        this.mixerState[bus].muted = !this.mixerState[bus].muted;
        const muted = this.mixerState[bus].muted;

        // Apply mute (set gain to 0 or restore)
        if (bus === 'PA' && this.outputNodes.PA.masterGain) {
            const gain = muted ? 0 : this.dbToLinear(this.mixerState.PA.gain);
            this.outputNodes.PA.masterGain.gain.setValueAtTime(gain, this.audioContexts.PA.currentTime);
        } else if (bus === 'IEM' && this.outputNodes.IEM.masterGain) {
            const gain = muted ? 0 : this.dbToLinear(this.mixerState.IEM.gain);
            this.outputNodes.IEM.masterGain.gain.setValueAtTime(gain, this.audioContexts.IEM.currentTime);
        }

        // Report to main process (which handles persistence via AppState)
        this.reportMixerState();
        return true;
    }

    setMasterMute(bus, muted) {
        if (!['PA', 'IEM', 'mic'].includes(bus)) return false;

        this.mixerState[bus].muted = muted;
        console.log(`🔇 Setting ${bus} mute to: ${muted}`);

        // Apply mute (set gain to 0 or restore)
        if (bus === 'PA' && this.outputNodes.PA.masterGain) {
            const gain = muted ? 0 : this.dbToLinear(this.mixerState.PA.gain);
            this.outputNodes.PA.masterGain.gain.setValueAtTime(gain, this.audioContexts.PA.currentTime);
        } else if (bus === 'IEM' && this.outputNodes.IEM.masterGain) {
            const gain = muted ? 0 : this.dbToLinear(this.mixerState.IEM.gain);
            this.outputNodes.IEM.masterGain.gain.setValueAtTime(gain, this.audioContexts.IEM.currentTime);
        }

        // Don't report back to main - this was initiated by main/admin
        return true;
    }

    // Preset system removed - routing is now automatic with master faders
    // Vocals → IEM (mono), Instrumental → PA, Mic → PA

    getCurrentPosition() {
        if (this.isPlaying && this.audioContexts.PA && this.startTime > 0) {
            const elapsed = this.audioContexts.PA.currentTime - this.startTime;
            const calculatedPosition = this.currentPosition + elapsed;
            
            // Don't let position exceed song duration
            const duration = this.getDuration();
            const clampedPosition = duration > 0 ? Math.min(calculatedPosition, duration) : calculatedPosition;
            
            return clampedPosition;
        }
        return this.currentPosition;
    }

    getCurrentTime() {
        return this.getCurrentPosition();
    }

    getDuration() {
        return this.songData?.metadata?.duration || 0;
    }

    getMixerState() {
        return {
            PA: this.mixerState.PA,
            IEM: this.mixerState.IEM,
            mic: this.mixerState.mic,
            stems: this.mixerState.stems,  // For reference only
            isPlaying: this.isPlaying,
            position: this.getCurrentPosition(),
            duration: this.getDuration()
        };
    }

    async loadAutoTuneWorklet() {
        try {
            if (!this.audioContexts.PA) {
                return;
            }
            
            await this.audioContexts.PA.audioWorklet.addModule('js/autoTuneWorklet.js');
            this.autoTuneWorkletLoaded = true;
        } catch (error) {
            console.error('Failed to load auto-tune worklet:', error);
            this.autoTuneWorkletLoaded = false;
        }
    }
    
    async startMicrophoneInput(deviceId = 'default') {
        try {
            
            // Stop existing microphone if running
            this.stopMicrophoneInput();
            
            const constraints = {
                audio: {
                    deviceId: deviceId !== 'default' ? { exact: deviceId } : undefined,
                    channelCount: 1,
                    sampleRate: 44100,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            };
            
            // Get microphone stream
            this.microphoneStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Create audio source from microphone
            this.microphoneSource = this.audioContexts.PA.createMediaStreamSource(this.microphoneStream);
            
            // Create gain node for microphone volume control
            this.microphoneGain = this.audioContexts.PA.createGain();
            this.microphoneGain.gain.value = 1.0; // Full volume, can be adjusted
            
            // Connect microphone chain
            this.microphoneSource.connect(this.microphoneGain);
            
            // If auto-tune is available and enabled, route through it
            if (this.autoTuneWorkletLoaded && this.mixerState.autotuneSettings.enabled) {
                await this.enableAutoTune();
            } else {
                // Direct connection to PA output
                this.microphoneGain.connect(this.outputNodes.PA.masterGain);
            }
            
            
        } catch (error) {
            console.error('Failed to start microphone input:', error);
            this.stopMicrophoneInput();
        }
    }
    
    async enableAutoTune() {
        try {
            if (!this.autoTuneWorkletLoaded || !this.microphoneGain) return;
            
            // Create auto-tune node if it doesn't exist
            if (!this.autoTuneNode) {
                this.autoTuneNode = new AudioWorkletNode(this.audioContexts.PA, 'auto-tune-processor');
            }
            
            // Disconnect current connections
            this.microphoneGain.disconnect();
            
            // Route through auto-tune
            this.microphoneGain.connect(this.autoTuneNode);
            this.autoTuneNode.connect(this.outputNodes.PA.masterGain);
            
            // Always update all auto-tune settings to ensure they're current
            this.autoTuneNode.port.postMessage({
                type: 'setEnabled',
                value: this.mixerState.autotuneSettings.enabled
            });
            this.autoTuneNode.port.postMessage({
                type: 'setStrength',
                value: this.mixerState.autotuneSettings.strength
            });
            this.autoTuneNode.port.postMessage({
                type: 'setSpeed',
                value: this.mixerState.autotuneSettings.speed
            });
            
        } catch (error) {
            console.error('Failed to enable auto-tune:', error);
        }
    }
    
    async disableAutoTune() {
        try {
            if (!this.microphoneGain) return;
            
            // Disconnect current connections
            this.microphoneGain.disconnect();
            if (this.autoTuneNode) {
                this.autoTuneNode.disconnect();
                this.autoTuneNode.port.postMessage({
                    type: 'setEnabled',
                    value: false
                });
            }
            
            // Direct connection to PA output
            this.microphoneGain.connect(this.outputNodes.PA.masterGain);
            
        } catch (error) {
            console.error('Failed to disable auto-tune:', error);
        }
    }
    
    async setAutoTuneSettings(settings) {
        this.mixerState.autotuneSettings = { ...this.mixerState.autotuneSettings, ...settings };
        
        // Handle enable/disable
        if (settings.hasOwnProperty('enabled')) {
            if (settings.enabled) {
                await this.enableAutoTune();
            } else {
                await this.disableAutoTune();
            }
        }
        
        // Update parameters if auto-tune node exists
        // These will apply in real-time to the running audio
        if (this.autoTuneNode) {
            if (settings.hasOwnProperty('strength')) {
                this.autoTuneNode.port.postMessage({
                    type: 'setStrength',
                    value: settings.strength
                });
            }
            
            if (settings.hasOwnProperty('speed')) {
                this.autoTuneNode.port.postMessage({
                    type: 'setSpeed',
                    value: settings.speed
                });
            }
        } else if (settings.enabled && this.microphoneGain) {
            // If auto-tune should be enabled but node doesn't exist, create it
            await this.enableAutoTune();
        }
    }
    
    stopMicrophoneInput() {
        if (this.microphoneSource) {
            this.microphoneSource.disconnect();
            this.microphoneSource = null;
        }
        
        if (this.microphoneGain) {
            this.microphoneGain.disconnect();
            this.microphoneGain = null;
        }
        
        if (this.autoTuneNode) {
            this.autoTuneNode.disconnect();
            this.autoTuneNode = null;
        }
        
        if (this.microphoneStream) {
            this.microphoneStream.getTracks().forEach(track => track.stop());
            this.microphoneStream = null;
        }
        
    }
    
    setMicrophoneGain(gainValue) {
        if (this.microphoneGain) {
            this.microphoneGain.gain.value = gainValue;
        }
    }

    setIEMMonoVocals(enabled) {
        this.mixerState.iemMonoVocals = enabled;

        // If playing, recreate audio graph to apply the change
        if (this.isPlaying) {
            this.stopAllSources();
            this.createAudioGraph();
            this.startAudioSources();
        } else {
            // Just recreate the graph for next playback
            this.createAudioGraph();
        }

        return true;
    }

    stop() {
        this.isPlaying = false;
        this.stopAllSources();
        this.stopMicrophoneInput();
        this.stopSongEndMonitoring();
        
        if (this.audioContexts.PA) {
            this.audioContexts.PA.close();
            this.audioContexts.PA = null;
        }
        if (this.audioContexts.IEM) {
            this.audioContexts.IEM.close();
            this.audioContexts.IEM = null;
        }
        
        this.audioBuffers.clear();
        this.outputNodes.PA.gainNodes.clear();
        this.outputNodes.IEM.gainNodes.clear();
        
    }

    async reinitialize() {
        this.stop();
        
        // Wait for audio sources to fully stop and contexts to close
        await new Promise(resolve => setTimeout(resolve, 200));
        
        await this.initialize();
    }

    setOnSongEndedCallback(callback) {
        this.onSongEndedCallback = callback;
    }

    // Check if song has ended based on position
    checkForSongEnd() {
        const duration = this.getDuration();
        const currentPos = this.getCurrentPosition();
        const timeSinceMonitoringStarted = this.monitoringStartTime ? 
            (this.audioContexts.PA.currentTime - this.monitoringStartTime) : 0;
        
        // Only trigger if:
        // 1. We've been monitoring for at least 2 seconds (prevents seek issues)
        // 2. Song duration > 3 seconds 
        // 3. Current position is near the end
        if (this.isPlaying && 
            timeSinceMonitoringStarted > 2.0 && 
            duration > 3 && 
            currentPos >= duration - 0.2) {
            
            console.log('🎵 Song ended - position monitoring detected end');
            this.isPlaying = false;
            this.stopAllSources();
            this.stopSongEndMonitoring();
            
            if (this.onSongEndedCallback) {
                this.onSongEndedCallback();
            }
        }
    }

    // Start monitoring for song end
    startSongEndMonitoring() {
        if (this.songEndMonitor) {
            clearInterval(this.songEndMonitor);
        }
        
        // Track when monitoring actually started to prevent false positives
        this.monitoringStartTime = this.audioContexts.PA.currentTime;
        
        this.songEndMonitor = setInterval(() => {
            this.checkForSongEnd();
        }, 250); // Check every 250ms for more responsive detection
    }

    // Stop monitoring for song end
    stopSongEndMonitoring() {
        if (this.songEndMonitor) {
            clearInterval(this.songEndMonitor);
            this.songEndMonitor = null;
        }
    }

    // Utility: Convert dB to linear gain
    dbToLinear(db) {
        return Math.pow(10, db / 20);
    }

    // Utility: Convert linear gain to dB
    linearToDb(linear) {
        return 20 * Math.log10(linear);
    }
}

window.RendererAudioEngine = RendererAudioEngine;
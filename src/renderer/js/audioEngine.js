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
            stems: [],
            scenes: { A: null, B: null },
            autotuneSettings: {
                enabled: false,
                strength: 50,
                speed: 5
            },
            iemMonoVocals: true  // Default to mono for single-ear monitoring
        };
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
            
            // Initialize IEM audio context with saved device
            const iemContextOptions = {};
            if (this.outputDevices.IEM !== 'default' && 'sinkId' in AudioContext.prototype) {
                iemContextOptions.sinkId = this.outputDevices.IEM;
            }
            this.audioContexts.IEM = new (window.AudioContext || window.webkitAudioContext)(iemContextOptions);
            this.outputNodes.IEM.masterGain = this.audioContexts.IEM.createGain();
            this.outputNodes.IEM.masterGain.connect(this.audioContexts.IEM.destination);
            
            
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
            if (window.settingsAPI) {
                const prefs = await window.settingsAPI.getDevicePreferences();
                if (prefs) {
                    if (prefs.PA?.id) {
                        this.outputDevices.PA = prefs.PA.id;
                    }
                    if (prefs.IEM?.id) {
                        this.outputDevices.IEM = prefs.IEM.id;
                    }
                }

                // Load IEM mono vocals setting
                const iemMonoVocals = await window.settingsAPI.get('iemMonoVocals', true);
                this.mixerState.iemMonoVocals = iemMonoVocals;
            }
        } catch (error) {
            console.error('Failed to load device preferences:', error);
        }
    }
    
    async setOutputDevice(busType, deviceId) {
        try {
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
            
            // Close existing context for this bus
            if (this.audioContexts[busType]) {
                await this.audioContexts[busType].close();
            }
            
            // Create new context with proper device
            const contextOptions = {};
            if (deviceId !== 'default' && 'sinkId' in AudioContext.prototype) {
                contextOptions.sinkId = deviceId;
            }
            
            this.audioContexts[busType] = new (window.AudioContext || window.webkitAudioContext)(contextOptions);
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
        
        
        this.mixerState.stems = (songData.audio?.sources || []).map((source, index) => ({
            id: source.name || source.filename,
            name: source.name || source.filename,
            gain: source.gain || 0,
            muted: { PA: false, IEM: false },
            solo: false,
            index
        }));
        
        
        await this.loadAudioBuffers(songData);
        
        return true;
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
        
        return true;
    }

    async seek(positionSec) {
        this.currentPosition = positionSec;
        
        if (this.isPlaying) {
            this.stopAllSources();
            this.startAudioSources();
        }
        
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
                        // Vocals go to IEM only (singer's ears)
                        const iemSource = this.audioContexts.IEM.createBufferSource();
                        iemSource.buffer = audioBuffer;
                        iemSource.connect(iemGainNode);
                        iemSource.start(scheduleTime, offset);
                        this.outputNodes.IEM.sourceNodes.set(stem.name, iemSource);
                        
                    } else {
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

        const baseGain = Math.pow(10, stem.gain / 20);
        const hasSolo = this.mixerState.stems.some(s => s.solo);
        
        // Apply gain based on routing - vocals only to IEM, backing tracks only to PA
        if (isVocals && iemGainNode) {
            // Vocals stem - only exists on IEM
            let iemGain = baseGain;
            if (stem.muted.IEM || (hasSolo && !stem.solo)) {
                iemGain = 0;
            }
            iemGainNode.gain.setValueAtTime(iemGain, this.audioContexts.IEM.currentTime);
            
            if (Math.random() < 0.1) {
            }
        } else if (!isVocals && paGainNode) {
            // Backing track stem - only exists on PA
            let paGain = baseGain;
            if (stem.muted.PA || (hasSolo && !stem.solo)) {
                paGain = 0;
            }
            paGainNode.gain.setValueAtTime(paGain, this.audioContexts.PA.currentTime);
            
            if (Math.random() < 0.1) {
            }
        }
    }

    toggleMute(stemId, bus = 'PA') {
        const stem = this.mixerState.stems.find(s => s.name === stemId || s.id === stemId);
        if (stem) {
            stem.muted[bus] = !stem.muted[bus];
            this.updateStemGain(stem);
            return true;
        }
        return false;
    }

    toggleSolo(stemId) {
        const stem = this.mixerState.stems.find(s => s.name === stemId || s.id === stemId);
        if (stem) {
            stem.solo = !stem.solo;
            
            this.mixerState.stems.forEach(s => this.updateStemGain(s));
            return true;
        }
        return false;
    }

    setGain(stemId, gainDb) {
        const stem = this.mixerState.stems.find(s => s.name === stemId || s.id === stemId);
        if (stem) {
            stem.gain = gainDb;
            this.updateStemGain(stem);
            return true;
        }
        return false;
    }

    applyPreset(presetId) {
        
        const presets = {
            original: () => {
                this.mixerState.stems.forEach(stem => {
                    stem.muted.PA = false;
                    stem.muted.IEM = false;
                    stem.solo = false;
                    stem.gain = 0;
                });
            },
            karaoke: () => {
                this.mixerState.stems.forEach(stem => {
                    const isVocal = stem.name.toLowerCase().includes('vocal') || 
                                   stem.name.toLowerCase().includes('lead');
                    stem.muted.PA = isVocal;
                    stem.muted.IEM = false;
                });
            },
            band_only: () => {
                this.mixerState.stems.forEach(stem => {
                    const isVocal = stem.name.toLowerCase().includes('vocal');
                    stem.muted.PA = isVocal;
                    stem.muted.IEM = isVocal;
                });
            },
            acoustic: () => {
                this.mixerState.stems.forEach(stem => {
                    const isElectronic = stem.name.toLowerCase().includes('synth') ||
                                       stem.name.toLowerCase().includes('electronic');
                    stem.muted.PA = isElectronic;
                    stem.muted.IEM = isElectronic;
                });
            }
        };
        
        if (presets[presetId]) {
            presets[presetId]();
            this.mixerState.stems.forEach(stem => this.updateStemGain(stem));
            return true;
        }
        
        return false;
    }

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
            stems: this.mixerState.stems,
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
}

window.RendererAudioEngine = RendererAudioEngine;
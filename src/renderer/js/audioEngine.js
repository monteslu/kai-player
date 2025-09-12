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
        
        this.mixerState = {
            stems: [],
            scenes: { A: null, B: null },
            autotuneSettings: {
                enabled: false,
                strength: 50,
                speed: 5
            }
        };
    }

    async initialize() {
        try {
            // Load saved device preferences first
            this.loadDevicePreferences();
            
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
            
            console.log('Dual audio engine initialized - PA:', this.audioContexts.PA.sampleRate, 'Hz (device:', this.outputDevices.PA + '), IEM:', this.audioContexts.IEM.sampleRate, 'Hz (device:', this.outputDevices.IEM + ')');
            return true;
        } catch (error) {
            console.error('Failed to initialize dual audio contexts:', error);
            return false;
        }
    }
    
    loadDevicePreferences() {
        try {
            const saved = localStorage.getItem('kaiPlayerDevicePrefs');
            if (saved) {
                const prefs = JSON.parse(saved);
                if (prefs.PA?.id) {
                    this.outputDevices.PA = prefs.PA.id;
                    console.log('Loaded saved PA device preference:', this.outputDevices.PA);
                }
                if (prefs.IEM?.id) {
                    this.outputDevices.IEM = prefs.IEM.id;
                    console.log('Loaded saved IEM device preference:', this.outputDevices.IEM);
                }
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
            
            console.log(`${busType} audio context recreated for device:`, deviceId);
            
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
        console.log('Loading song into renderer audio engine:', songData.metadata?.title);
        console.log('AudioEngine.loadSong received songData audio info:', {
            hasAudio: !!songData.audio,
            hasSources: !!songData.audio?.sources,
            sourcesLength: songData.audio?.sources?.length || 0,
            sourceNames: songData.audio?.sources?.map(s => s.name) || [],
            audioPointer: songData.audio
        });
        this.songData = songData;
        
        this.mixerState.stems = (songData.audio?.sources || []).map((source, index) => ({
            id: source.name || source.filename,
            name: source.name || source.filename,
            gain: source.gain || 0,
            muted: { PA: false, IEM: false },
            solo: false,
            index
        }));
        
        console.log(`Loading ${this.mixerState.stems.length} stems:`, this.mixerState.stems.map(s => s.name));
        
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
        
        console.log('Loading audio buffers for stems...');
        
        for (const source of songData.audio.sources) {
            try {
                if (source.audioData && source.audioData.length > 0) {
                    console.log(`Decoding audio: ${source.name}, size: ${source.audioData.length} bytes`);
                    
                    const arrayBuffer = source.audioData.buffer.slice(
                        source.audioData.byteOffset, 
                        source.audioData.byteOffset + source.audioData.byteLength
                    );
                    
                    const decodedBuffer = await this.audioContexts.PA.decodeAudioData(arrayBuffer);
                    this.audioBuffers.set(source.name, decodedBuffer);
                    
                    console.log(`Successfully decoded ${source.name}: ${decodedBuffer.duration.toFixed(2)}s, ${decodedBuffer.numberOfChannels} channels`);
                } else {
                    console.warn(`No audio data for source: ${source.name}`);
                }
            } catch (error) {
                console.error(`Failed to decode audio for ${source.name}:`, error);
            }
        }
        
        console.log(`Loaded ${this.audioBuffers.size} audio buffers`);
        
        // Calculate the actual duration from the longest audio buffer
        let maxDuration = 0;
        for (const [name, buffer] of this.audioBuffers) {
            console.log(`Audio buffer ${name}: ${buffer.duration.toFixed(2)}s`);
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
            console.log(`Updated song duration to ${maxDuration.toFixed(2)}s from audio buffers`);
        } else {
            console.warn('No audio buffers loaded, duration remains 0');
        }
    }
    
    async reloadAudioBuffersForBus(busType) {
        if (!this.songData?.audio?.sources || !this.audioContexts[busType]) {
            return;
        }
        
        console.log(`Reloading audio buffers for ${busType} bus...`);
        
        // Audio buffers are shared between contexts, but we need to re-decode for new context
        // The existing buffers in this.audioBuffers should still work, but let's make sure
        // the new context has access to them by re-decoding if needed
        
        for (const source of this.songData.audio.sources) {
            if (source.audioData && source.audioData.length > 0) {
                try {
                    // Check if we already have this buffer
                    if (!this.audioBuffers.has(source.name)) {
                        console.log(`Re-decoding missing buffer for ${busType}: ${source.name}`);
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
        
        console.log(`Reloaded audio buffers for ${busType} bus`);
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
        
        console.log('Starting real audio playback...');
        this.isPlaying = true;
        
        this.stopAllSources();
        this.createAudioGraph();
        this.startAudioSources();
        
        return true;
    }

    async pause() {
        console.log('Pausing audio playback...');
        this.isPlaying = false;
        
        if (this.audioContexts.PA) {
            this.pauseTime = this.audioContexts.PA.currentTime;
        }
        
        this.stopAllSources();
        return true;
    }

    async seek(positionSec) {
        console.log(`Seeking to ${positionSec}s`);
        this.currentPosition = positionSec;
        
        if (this.isPlaying) {
            this.stopAllSources();
            this.startAudioSources();
        }
        
        return true;
    }

    stopAllSources() {
        console.log('🛑 Stopping all audio sources...');
        let totalSources = this.outputNodes.PA.sourceNodes.size + this.outputNodes.IEM.sourceNodes.size;
        console.log(`Found ${totalSources} sources to stop`);
        
        // Stop PA sources
        this.outputNodes.PA.sourceNodes.forEach((source, index) => {
            try {
                console.log(`Stopping PA source ${index}`);
                source.stop();
                source.disconnect(); // Disconnect all connections
            } catch (e) {
                console.log(`PA source ${index} already stopped:`, e.message);
            }
        });
        this.outputNodes.PA.sourceNodes.clear();
        
        // Stop IEM sources  
        this.outputNodes.IEM.sourceNodes.forEach((source, index) => {
            try {
                console.log(`Stopping IEM source ${index}`);
                source.stop();
                source.disconnect(); // Disconnect all connections
            } catch (e) {
                console.log(`IEM source ${index} already stopped:`, e.message);
            }
        });
        this.outputNodes.IEM.sourceNodes.clear();
        
        console.log('✅ All sources stopped and disconnected');
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
            iemGainNode.connect(this.outputNodes.IEM.masterGain);
            this.outputNodes.IEM.gainNodes.set(stem.name, iemGainNode);
            
            this.updateStemGain(stem);
        });
        
        console.log(`Created dual audio graph for ${this.mixerState.stems.length} stems`);
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
                        
                        console.log(`Routed vocals "${stem.name}" to IEM only`);
                    } else {
                        // Backing tracks go to PA only (audience)
                        const paSource = this.audioContexts.PA.createBufferSource();
                        paSource.buffer = audioBuffer;
                        paSource.connect(paGainNode);
                        paSource.start(scheduleTime, offset);
                        this.outputNodes.PA.sourceNodes.set(stem.name, paSource);
                        
                        // Use backing track source for end detection
                        paSource.onended = () => {
                            if (this.isPlaying && this.currentPosition >= audioBuffer.duration) {
                                console.log('Playback ended');
                                this.pause();
                                // Notify the main app that the song has ended
                                if (this.onSongEndedCallback) {
                                    this.onSongEndedCallback();
                                }
                            }
                        };
                        
                        console.log(`Routed backing track "${stem.name}" to PA only`);
                    }
                } catch (error) {
                    console.error(`Failed to start source for ${stem.name}:`, error);
                }
            } else {
                console.warn(`No audio buffer or gain nodes for stem: ${stem.name}`);
            }
        });
        
        console.log(`Started stems with proper karaoke routing - vocals to IEM only, backing tracks to PA only`);
        
        // Debug PA output routing
        console.log('🔊 PA Output Debug:');
        console.log('PA gain nodes:', Array.from(this.outputNodes.PA.gainNodes.keys()));
        this.outputNodes.PA.gainNodes.forEach((gainNode, stemName) => {
            console.log(`PA ${stemName} gain: ${gainNode.gain.value}`);
        });
        console.log('PA master gain:', this.outputNodes.PA.masterGain.gain.value);
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
                console.log(`${stem.name} (vocals): IEM=${iemGain.toFixed(2)} (muted: ${stem.muted.IEM})`);
            }
        } else if (!isVocals && paGainNode) {
            // Backing track stem - only exists on PA
            let paGain = baseGain;
            if (stem.muted.PA || (hasSolo && !stem.solo)) {
                paGain = 0;
            }
            paGainNode.gain.setValueAtTime(paGain, this.audioContexts.PA.currentTime);
            
            if (Math.random() < 0.1) {
                console.log(`${stem.name} (backing): PA=${paGain.toFixed(2)} (muted: ${stem.muted.PA})`);
            }
        }
    }

    toggleMute(stemId, bus = 'PA') {
        const stem = this.mixerState.stems.find(s => s.name === stemId || s.id === stemId);
        if (stem) {
            stem.muted[bus] = !stem.muted[bus];
            console.log(`${stem.name} ${bus} mute: ${stem.muted[bus]}`);
            this.updateStemGain(stem);
            return true;
        }
        return false;
    }

    toggleSolo(stemId) {
        const stem = this.mixerState.stems.find(s => s.name === stemId || s.id === stemId);
        if (stem) {
            stem.solo = !stem.solo;
            console.log(`${stem.name} solo: ${stem.solo}`);
            
            this.mixerState.stems.forEach(s => this.updateStemGain(s));
            return true;
        }
        return false;
    }

    setGain(stemId, gainDb) {
        const stem = this.mixerState.stems.find(s => s.name === stemId || s.id === stemId);
        if (stem) {
            stem.gain = gainDb;
            console.log(`${stem.name} gain: ${gainDb}dB`);
            this.updateStemGain(stem);
            return true;
        }
        return false;
    }

    applyPreset(presetId) {
        console.log(`Applying preset: ${presetId}`);
        
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
        if (this.isPlaying && this.audioContexts.PA) {
            const elapsed = this.audioContexts.PA.currentTime - this.startTime;
            const calculatedPosition = this.currentPosition + elapsed;
            
            // Don't let position exceed song duration
            const duration = this.getDuration();
            const clampedPosition = duration > 0 ? Math.min(calculatedPosition, duration) : calculatedPosition;
            
            // if (Math.random() < 0.01) { // Debug occasionally
            //     console.log('AudioEngine timing - startTime:', this.startTime.toFixed(2), 
            //                'currentTime:', this.audioContexts.PA.currentTime.toFixed(2),
            //                'elapsed:', elapsed.toFixed(2), 
            //                'basePosition:', this.currentPosition.toFixed(2),
            //                'calculated:', calculatedPosition.toFixed(2),
            //                'clamped:', clampedPosition.toFixed(2));
            // }
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

    async startMicrophoneInput(deviceId = 'default') {
        try {
            console.log('Starting microphone input with device:', deviceId);
            
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
            
            // Connect microphone to PA output
            this.microphoneSource.connect(this.microphoneGain);
            this.microphoneGain.connect(this.outputNodes.PA.masterGain);
            
            console.log('Microphone input connected to PA output');
            
        } catch (error) {
            console.error('Failed to start microphone input:', error);
            this.stopMicrophoneInput();
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
        
        if (this.microphoneStream) {
            this.microphoneStream.getTracks().forEach(track => track.stop());
            this.microphoneStream = null;
        }
        
        console.log('Microphone input stopped');
    }
    
    setMicrophoneGain(gainValue) {
        if (this.microphoneGain) {
            this.microphoneGain.gain.value = gainValue;
            console.log('Microphone gain set to:', gainValue);
        }
    }

    stop() {
        this.isPlaying = false;
        this.stopAllSources();
        this.stopMicrophoneInput();
        
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
        
        console.log('Renderer audio engine stopped');
    }

    async reinitialize() {
        console.log('🔄 Reinitializing audio engine with clean slate...');
        this.stop();
        
        // Wait for audio sources to fully stop and contexts to close
        console.log('⏳ Waiting for audio cleanup to complete...');
        await new Promise(resolve => setTimeout(resolve, 200));
        
        await this.initialize();
        console.log('✅ Audio engine reinitialized successfully');
    }

    setOnSongEndedCallback(callback) {
        this.onSongEndedCallback = callback;
    }
}

window.RendererAudioEngine = RendererAudioEngine;
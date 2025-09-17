const EventEmitter = require('events');

class AudioEngine extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.isPlaying = false;
    this.sampleRate = 48000;
    this.bufferSize = 256;
    
    this.stems = new Map();
    this.mixerState = {
      gains: {},
      mutes: { PA: {}, IEM: {} },
      solos: {},
      scenes: { A: {}, B: {} },
      activeScene: 'A'
    };
    
    this.devices = {
      PA: null,
      IEM: null,
      input: null
    };
    
    this.audioStreams = {
      PA: null,
      IEM: null,
      input: null
    };
    
    this.currentPosition = 0;
    this.songData = null;
    this.xrunCount = 0;
    this.latencyMs = 0;
    this.playStartTime = 0;
    this.playStartPosition = 0;
    this.positionTimer = null;
  }

  initialize() {
    try {
      this.initialized = true;
      this.scanDevices();
      console.log('Audio engine initialized');
    } catch (error) {
      console.error('Failed to initialize audio engine:', error);
      throw error;
    }
  }

  scanDevices() {
    try {
      // Default fallback devices - real enumeration happens in renderer
      this.availableDevices = [
        {
          id: 'default-output',
          name: 'Default Audio Output',
          maxInputChannels: 0,
          maxOutputChannels: 2,
          defaultSampleRate: 48000,
          hostApi: 'System Default',
          deviceKind: 'audiooutput'
        },
        {
          id: 'default-input',
          name: 'Default Audio Input',
          maxInputChannels: 2,
          maxOutputChannels: 0,
          defaultSampleRate: 48000,
          hostApi: 'System Default',
          deviceKind: 'audioinput'
        }
      ];
      
      this.devices.PA = 'default-output';
      this.devices.IEM = 'default-output';
      this.devices.input = 'default-input';
      
      console.log(`Audio engine initialized with ${this.availableDevices.length} fallback devices`);
    } catch (error) {
      console.error('Failed to scan audio devices:', error);
      this.availableDevices = [];
    }
  }

  getDevices() {
    return this.availableDevices || [];
  }

  setDevice(deviceType, deviceId) {
    try {
      if (deviceType === 'PA' || deviceType === 'IEM' || deviceType === 'input') {
        this.devices[deviceType] = deviceId;
        
        if (this.audioStreams[deviceType]) {
          this.audioStreams[deviceType].stop();
          this.audioStreams[deviceType] = null;
        }
        
        if (deviceType !== 'input') {
          this.createOutputStream(deviceType);
        } else {
          this.createInputStream();
        }
        
        return true;
      }
    } catch (error) {
      console.error(`Failed to set ${deviceType} device:`, error);
    }
    return false;
  }

  createOutputStream(busType) {
    if (!this.initialized || this.devices[busType] === null) return;

    try {
      this.audioStreams[busType] = {
        deviceId: this.devices[busType],
        active: false,
        start: () => { this.audioStreams[busType].active = true; },
        stop: () => { this.audioStreams[busType].active = false; },
        quit: () => { this.audioStreams[busType] = null; }
      };
      
      console.log(`${busType} output stream created`);
    } catch (error) {
      console.error(`Failed to create ${busType} output stream:`, error);
    }
  }

  createInputStream() {
    if (!this.initialized || this.devices.input === null) return;

    try {
      this.audioStreams.input = {
        deviceId: this.devices.input,
        active: false,
        start: () => { this.audioStreams.input.active = true; },
        stop: () => { this.audioStreams.input.active = false; },
        quit: () => { this.audioStreams.input = null; }
      };
      
      console.log('Input stream created');
    } catch (error) {
      console.error('Failed to create input stream:', error);
    }
  }

  processAudioOutput(outputBuffer, busType) {
    if (!this.songData || !this.isPlaying) {
      outputBuffer.fill(0);
      return;
    }

    const frameCount = outputBuffer.length / 2;
    const samplesPerFrame = Math.floor(this.sampleRate / 60);
    
    try {
      for (let frame = 0; frame < frameCount; frame++) {
        let leftSample = 0;
        let rightSample = 0;
        
        for (const [stemId, stemData] of this.stems) {
          if (this.isStemAudible(stemId, busType)) {
            const gain = this.getEffectiveGain(stemId);
            const stemSamples = this.getStemSamples(stemId, this.currentPosition + frame);
            
            leftSample += stemSamples.left * gain;
            rightSample += stemSamples.right * gain;
          }
        }
        
        leftSample = Math.max(-1, Math.min(1, leftSample));
        rightSample = Math.max(-1, Math.min(1, rightSample));
        
        outputBuffer[frame * 2] = leftSample;
        outputBuffer[frame * 2 + 1] = rightSample;
      }
      
      this.currentPosition += frameCount;
    } catch (error) {
      console.error('Audio processing error:', error);
      this.xrunCount++;
      this.emit('xrun', this.xrunCount);
      outputBuffer.fill(0);
    }
  }

  processAudioInput(inputBuffer) {
  }

  isStemAudible(stemId, busType) {
    const isMuted = this.mixerState.mutes[busType][stemId] || false;
    const isSoloed = Object.values(this.mixerState.solos).some(solo => solo);
    const thisStemSolo = this.mixerState.solos[stemId] || false;
    
    if (isMuted) return false;
    if (isSoloed && !thisStemSolo) return false;
    
    return true;
  }

  getEffectiveGain(stemId) {
    return Math.pow(10, (this.mixerState.gains[stemId] || 0) / 20);
  }

  getStemSamples(stemId, position) {
    const stemData = this.stems.get(stemId);
    if (!stemData || !stemData.audioBuffer) {
      return { left: 0, right: 0 };
    }
    
    const bufferIndex = Math.floor(position) % stemData.audioBuffer.length;
    const sample = stemData.audioBuffer[bufferIndex] || 0;
    
    return {
      left: sample,
      right: sample
    };
  }

  async loadSong(kaiData) {
    try {
      this.songData = kaiData;
      this.stems.clear();
      this.currentPosition = 0;
      
      for (const source of kaiData.audio.sources) {
        const stemId = source.name || source.filename.replace('.mp3', '');
        
        const stemData = {
          id: stemId,
          filename: source.filename,
          audioBuffer: new Float32Array(0)
        };
        
        this.stems.set(stemId, stemData);
        
        this.mixerState.gains[stemId] = 0;
        this.mixerState.mutes.PA[stemId] = false;
        this.mixerState.mutes.IEM[stemId] = false;
        this.mixerState.solos[stemId] = false;
      }
      
      if (kaiData.audio.presets && kaiData.audio.presets.length > 0) {
        this.applyPreset(kaiData.audio.presets[0].id);
      }
      
      this.emit('mixChanged', this.getMixerState());
      console.log(`Loaded song with ${this.stems.size} stems`);
      
    } catch (error) {
      console.error('Failed to load song:', error);
      throw error;
    }
  }

  play() {
    console.log('🎵 MAIN AudioEngine.play() called');
    if (!this.initialized || !this.songData) return false;

    try {
      this.isPlaying = true;

      // Start timer-based position tracking as backup
      this.playStartTime = Date.now();
      this.playStartPosition = this.currentPosition;
      this.startPositionTimer();

      console.log('🎵 MAIN AudioEngine.play() - started timer, isPlaying =', this.isPlaying);

      if (this.audioStreams.PA) this.audioStreams.PA.start();
      if (this.audioStreams.IEM) this.audioStreams.IEM.start();
      if (this.audioStreams.input) this.audioStreams.input.start();

      return true;
    } catch (error) {
      console.error('Failed to start playback:', error);
      return false;
    }
  }

  pause() {
    try {
      this.isPlaying = false;
      this.stopPositionTimer();
      
      if (this.audioStreams.PA) this.audioStreams.PA.stop();
      if (this.audioStreams.IEM) this.audioStreams.IEM.stop();
      if (this.audioStreams.input) this.audioStreams.input.stop();
      
      return true;
    } catch (error) {
      console.error('Failed to pause playback:', error);
      return false;
    }
  }

  seek(positionSec) {
    try {
      this.currentPosition = Math.floor(positionSec * this.sampleRate);
      return true;
    } catch (error) {
      console.error('Failed to seek:', error);
      return false;
    }
  }

  getCurrentTime() {
    // Return current position in seconds, using timer-based tracking if playing
    if (this.isPlaying && this.playStartTime > 0) {
      const elapsedMs = Date.now() - this.playStartTime;
      const elapsedSamples = Math.floor((elapsedMs / 1000) * this.sampleRate);
      return (this.playStartPosition + elapsedSamples) / this.sampleRate;
    }
    return this.currentPosition / this.sampleRate;
  }

  startPositionTimer() {
    this.stopPositionTimer();
    this.positionTimer = setInterval(() => {
      if (this.isPlaying && this.playStartTime > 0) {
        const elapsedMs = Date.now() - this.playStartTime;
        const elapsedSamples = Math.floor((elapsedMs / 1000) * this.sampleRate);
        this.currentPosition = this.playStartPosition + elapsedSamples;
      }
    }, 100); // Update every 100ms
  }

  stopPositionTimer() {
    if (this.positionTimer) {
      clearInterval(this.positionTimer);
      this.positionTimer = null;
    }
  }

  toggleMute(stemId, bus = 'PA') {
    if (!this.stems.has(stemId)) return false;
    
    const currentMute = this.mixerState.mutes[bus][stemId] || false;
    this.mixerState.mutes[bus][stemId] = !currentMute;
    
    this.emit('mixChanged', this.getMixerState());
    return true;
  }

  toggleSolo(stemId) {
    if (!this.stems.has(stemId)) return false;
    
    const currentSolo = this.mixerState.solos[stemId] || false;
    this.mixerState.solos[stemId] = !currentSolo;
    
    this.emit('mixChanged', this.getMixerState());
    return true;
  }

  setGain(stemId, gainDb) {
    if (!this.stems.has(stemId)) return false;
    
    this.mixerState.gains[stemId] = Math.max(-60, Math.min(12, gainDb));
    
    this.emit('mixChanged', this.getMixerState());
    return true;
  }

  applyPreset(presetId) {
    if (!this.songData || !this.songData.audio.presets) return false;
    
    const preset = this.songData.audio.presets.find(p => p.id === presetId);
    if (!preset) return false;
    
    try {
      if (presetId === 'karaoke') {
        this.mixerState.mutes.PA.vocals = true;
        this.mixerState.mutes.IEM.vocals = false;
      } else if (presetId === 'band_only') {
        this.mixerState.mutes.PA.vocals = true;
        this.mixerState.mutes.IEM.vocals = true;
      }
      
      this.emit('mixChanged', this.getMixerState());
      return true;
    } catch (error) {
      console.error('Failed to apply preset:', error);
      return false;
    }
  }

  recallScene(sceneId) {
    if (!['A', 'B'].includes(sceneId)) return false;
    
    try {
      const scene = this.mixerState.scenes[sceneId];
      if (Object.keys(scene).length === 0) return false;
      
      this.mixerState.gains = { ...scene.gains };
      this.mixerState.mutes = { 
        PA: { ...scene.mutes.PA }, 
        IEM: { ...scene.mutes.IEM } 
      };
      this.mixerState.solos = { ...scene.solos };
      this.mixerState.activeScene = sceneId;
      
      this.emit('mixChanged', this.getMixerState());
      return true;
    } catch (error) {
      console.error('Failed to recall scene:', error);
      return false;
    }
  }

  getMixerState() {
    return {
      stems: Array.from(this.stems.keys()),
      gains: { ...this.mixerState.gains },
      mutes: {
        PA: { ...this.mixerState.mutes.PA },
        IEM: { ...this.mixerState.mutes.IEM }
      },
      solos: { ...this.mixerState.solos },
      activeScene: this.mixerState.activeScene,
      isPlaying: this.isPlaying,
      position: this.currentPosition / this.sampleRate
    };
  }

  setAutotuneEnabled(enabled) {
    console.log('Auto-tune enabled set to:', enabled);
    // TODO: Implement actual auto-tune processing
    return true;
  }

  setAutotuneSettings(settings) {
    console.log('Auto-tune settings updated:', settings);
    // TODO: Implement actual settings application
    return true;
  }

  stop() {
    try {
      this.pause();
      
      if (this.audioStreams.PA) {
        this.audioStreams.PA.quit();
        this.audioStreams.PA = null;
      }
      
      if (this.audioStreams.IEM) {
        this.audioStreams.IEM.quit();
        this.audioStreams.IEM = null;
      }
      
      if (this.audioStreams.input) {
        this.audioStreams.input.quit();
        this.audioStreams.input = null;
      }
      
      this.initialized = false;
      console.log('Audio engine stopped');
    } catch (error) {
      console.error('Error stopping audio engine:', error);
    }
  }
}

module.exports = AudioEngine;
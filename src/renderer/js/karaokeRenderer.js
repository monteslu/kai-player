// TODO: State should be passed to renderer instead of accessing globals

export class KaraokeRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);

    if (!this.canvas) {
      return;
    }

    this.ctx = this.canvas.getContext('2d');
    this.lyrics = null;
    this.songDuration = 0;
    this.currentTime = 0;
    this.animationFrame = null;
    this.isPlaying = false;

    // Time interpolation for smooth progress bar (60fps)
    this.lastReportedTime = 0;
    this.lastReportedTimestamp = performance.now();

    // Animation tracking for backup singers
    this.backupAnimations = new Map(); // lineIndex -> { alpha, fadeDirection, lastStateChange }

    // Lyric transition animations
    this.lyricTransitions = new Map(); // Track lyrics moving from upcoming to active
    this.hiddenDuringTransition = new Set(); // Track lines that should be hidden during transitions

    // Performance optimization - cache expensive calculations
    this.cachedCurrentLine = -1;
    this.lastTimeForLineCalculation = -1;
    this.lineCalculationTolerance = 0.1; // Only recalculate if time changed by 0.1s

    // Track upcoming lyric positioning
    this.lockedUpcomingIndex = null;
    this.lastActiveLyricsBottom = null; // Save the Y position after drawing active lyrics

    // Frame rate optimization
    this.frameCount = 0;
    this.maxFPS = 30; // Reduce from 60fps to 30fps for better performance
    this.frameSkip = 2; // Skip every other frame

    // Microphone input for waveform
    this.micStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.micDataArray = null;
    this.waveformData = new Uint8Array(1440).fill(128); // 6 seconds at 240Hz (1440 pixels) - mic rolling buffer (128 = silence)
    this.micGainNode = null; // For routing mic to speakers
    this.inputDevice = 'default'; // Stored input device ID from preferences

    // Waveform preferences (will be set from main app)
    this.waveformPreferences = {
      enableWaveforms: false,
      micToSpeakers: true,
      enableMic: true,
      enableEffects: true,
      overlayOpacity: 0.7,
      showUpcomingLyrics: true,
    };

    // FPS and performance tracking
    this.fpsHistory = [];
    this.lastFrameTime = performance.now();
    this.frameUpdateTime = 0;

    // WebGL effects system
    this.effectsCanvas = null;
    this.effectsGL = null;
    this.musicAnalyser = null;
    this.musicFrequencyData = null;

    // Advanced visualization libraries
    this.butterchurn = null;
    this.currentPreset = null;
    this.presetList = [];
    this.effectType = 'butterchurn';
    // Note: Butterchurn now uses PA analyser from kaiPlayer, no separate context needed

    // AudioWorklet for efficient analysis
    this.musicWorkletNode = null;
    this.cachedAnalysis = { energy: 0, bass: 0, mid: 0, treble: 0, centroid: 0 };
    this.workletAvailable = false;
    this.musicAudioBuffer = null;
    this.musicSourceNode = null;
    this.vocalsWaveformData = new Uint8Array(1920).fill(128); // 8 seconds at 240Hz (1920 pixels) - vocals rendering array (128 = silence)
    this.zeroPadding = new Uint8Array(1920).fill(128); // Center value array for concatenation (128 = silence)
    this.waveformDataIndex = 0;

    // Vocals track waveform
    this.vocalsAudioBuffer = null;
    this.vocalsWaveformMaxLength = 480; // 8 seconds at 60fps
    this.vocalsAnalyser = null;
    this.vocalsSource = null;
    this.preCalculatedVocalsWaveform = null;

    // Debug audio level monitoring
    this.lastAudioDebugTime = 0;
    this.audioDebugInterval = 1000; // Log every 1 second for testing
    this.lastConditionsDebugTime = 0;

    // Karaoke visual settings scaled for 1080p
    this.settings = {
      fontSize: 80, // Scaled up for 1080p (was 40 for ~800px)
      fontFamily: 'bold Arial, sans-serif',
      lineHeight: 140, // Increased spacing between lines
      textColor: '#ffffff',
      activeColor: '#00BFFF', // Light blue for active lines (easier to read)
      upcomingColor: '#888888', // Gray for upcoming lines
      backupColor: '#DAA520', // Golden color for backup singer lines
      lyricTransitionDuration: 0.3, // Animation duration in seconds (300ms)
      lyricTransitionStartBefore: 0.3, // Start animation this many seconds before active (300ms)
      backupActiveColor: '#FFD700', // Brighter gold when active
      backgroundColor: '#1a1a1a',
      shadowColor: '#000000',
      linesVisible: 1, // Show only current line
      maxWidth: 0.9, // 90% of canvas width for text
      progressBarHeight: 30, // Taller progress bar
      progressBarColor: '#007acc',
      progressBarBg: '#333333',
      progressBarMargin: 100, // More space between progress bar and lyrics

      // Backup singer animation settings
      backupFadeDuration: 0.8, // seconds to fade in/out
      backupMaxAlpha: 0.6, // maximum opacity for backup singers (60%)
      backupMinAlpha: 0.0, // minimum opacity (fully transparent)
      backupAnimationEasing: 'ease-out', // animation curve

      // Microphone waveform settings
      waveformHeight: 80, // Height of the waveform area
      waveformColor: '#00ff00', // Green waveform
      waveformBackgroundColor: '#333333',
      waveformCurrentPosition: 0.75, // Position of current time (75% from left)

      // Vocals waveform settings
      vocalsWaveformHeight: 60, // Slightly smaller than mic waveform
      vocalsWaveformColor: '#00bfff', // Blue waveform for vocals to match lyrics
      vocalsWaveformGap: 10, // Gap between vocals and mic waveforms
    };

    this.setupCanvas();
    this.setupAdvancedVisualizations();
    this.setupResponsiveCanvas();
    this.startAnimation();
  }

  setupAdvancedVisualizations() {
    // Create offscreen canvas for effects
    this.effectsCanvas = document.createElement('canvas');
    this.effectsCanvas.width = 1920;
    this.effectsCanvas.height = 1080;

    try {
      // Try to load Butterchurn (Milkdrop visualizations) from global variables
      if (typeof window !== 'undefined' && window.butterchurn && window.butterchurnPresets) {
        this.effectsGL =
          this.effectsCanvas.getContext('webgl2') || this.effectsCanvas.getContext('webgl');
        if (this.effectsGL) {
          // Try different API patterns for Butterchurn
          let butterchurnAPI = null;
          if (typeof window.butterchurn.createVisualizer === 'function') {
            butterchurnAPI = window.butterchurn;
          } else if (
            window.butterchurn.default &&
            typeof window.butterchurn.default.createVisualizer === 'function'
          ) {
            butterchurnAPI = window.butterchurn.default;
          } else if (typeof window.butterchurn === 'function') {
            // Maybe it's a constructor function
            butterchurnAPI = window.butterchurn;
          }

          if (!butterchurnAPI || typeof butterchurnAPI.createVisualizer !== 'function') {
            console.error(
              'Butterchurn createVisualizer not found. Available methods:',
              butterchurnAPI ? Object.keys(butterchurnAPI) : 'none'
            );
            throw new Error('Butterchurn API not compatible');
          }

          // Create waveform audio context if needed (used as dummy for butterchurn)
          if (!this.waveformAudioContext) {
            this.waveformAudioContext = new (window.AudioContext || window.webkitAudioContext)();
          }

          // Initialize Butterchurn with the correct API: createVisualizer(audioContext, canvas, options)
          // Note: Audio comes from PA analyser via setVisualizationAnalyser(), not from this context
          this.butterchurn = butterchurnAPI.createVisualizer(
            this.waveformAudioContext,
            this.effectsCanvas,
            {
              width: 1920,
              height: 1080,
              mesh_width: 128, // Lower for performance
              mesh_height: 72, // Lower for performance
              fps: 30, // Match our target framerate
            }
          );

          // If we already have music loaded, decode it for Butterchurn
          this.tryDecodeStoredAudioForButterchurn();

          // Get available presets
          this.presetList = Object.keys(window.butterchurnPresets.getPresets());

          // Load highly reactive presets that respond strongly to audio
          const defaultPresets = [
            'Rovastar - Fractopia', // Very reactive to bass/drums
            'Rovastar - Altars Of Madness (Krash Mix)', // High energy response
            'Rovastar - Tunnel Runner', // Fast visual response
            'martin - disco ball', // Classic reactive preset
            'Krash - The Neverending Explosion', // Explosive audio response
            'flexi - mindblob mix', // Good bass response
            'Rovastar - Crystal High', // Sharp audio reactions
            'martin - being & time', // Dynamic movement
          ];

          // Only load a default preset if no preset is currently selected
          // This prevents auto-resetting effects when new songs start
          if (!this.currentPreset) {
            const startPreset =
              defaultPresets.find((p) => this.presetList.includes(p)) || this.presetList[0];
            if (startPreset) {
              const presetData = window.butterchurnPresets.getPresets()[startPreset];
              this.butterchurn.loadPreset(presetData, 0.0); // 0 second transition
              this.currentPreset = startPreset;
            }
          } else {
            // If we already have a current preset, reload it to maintain continuity
            if (this.presetList.includes(this.currentPreset)) {
              const presetData = window.butterchurnPresets.getPresets()[this.currentPreset];
              this.butterchurn.loadPreset(presetData, 0.0);
            }
          }

          this.effectType = 'butterchurn';

          // Check if we have music loaded but no Butterchurn buffer yet
          if (this.musicAudioBuffer && !this.butterchurnAudioBuffer) {
            // We need to get the original audio data, but AudioBuffer doesn't give us access
            // This is a complex issue that requires storing the original ArrayBuffer
            // For now, let's add a flag to trigger re-loading
            this.needsButterchurnAudioDecode = true;
          }
        }
      } else {
        console.warn('Butterchurn libraries not available, effects disabled');
        throw new Error('Butterchurn not available');
      }
    } catch (error) {
      console.error('Butterchurn failed to load, effects disabled:', error);
      this.effectType = 'disabled';
    }

    if (!this.effectsGL) {
      console.warn('WebGL not available, effects disabled');
    }
  }

  setupCanvas() {
    // Canvas size is ALWAYS 1920x1080 (1080p)
    // CSS controls how it stretches to fit the container
    this.canvas.width = 1920;
    this.canvas.height = 1080;

    // Set default font
    this.ctx.font = `${this.settings.fontSize}px ${this.settings.fontFamily}`;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
  }

  setupResponsiveCanvas() {
    // Function to maintain 16:9 aspect ratio (1920:1080) while scaling to fit container
    const resizeCanvas = () => {
      const container = this.canvas.parentElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

      // Skip if container has no dimensions yet
      if (containerWidth === 0 || containerHeight === 0) {
        // Schedule another attempt after DOM settles
        setTimeout(() => resizeCanvas(), 100);
        return;
      }

      // 16:9 aspect ratio (1920/1080 = 1.7777...)
      const aspectRatio = 16 / 9;

      let displayWidth, displayHeight;

      // Calculate size that fits container while maintaining aspect ratio
      if (containerWidth / containerHeight > aspectRatio) {
        // Container is wider than 16:9, fit by height
        displayHeight = containerHeight;
        displayWidth = displayHeight * aspectRatio;
      } else {
        // Container is taller than 16:9, fit by width
        displayWidth = containerWidth;
        displayHeight = displayWidth / aspectRatio;
      }

      // Set CSS size to maintain proportions
      this.canvas.style.width = displayWidth + 'px';
      this.canvas.style.height = displayHeight + 'px';
    };

    // Initial resize
    resizeCanvas();

    // Double-check sizing after DOM fully settles
    setTimeout(() => resizeCanvas(), 100);
    requestAnimationFrame(() => resizeCanvas());

    // Resize on window resize
    window.addEventListener('resize', resizeCanvas);

    // Store reference to remove listener on destroy
    this.resizeHandler = resizeCanvas;
  }

  setSongMetadata(metadata) {
    // Store song metadata for display when not playing
    this.songMetadata = metadata || {};
  }

  loadLyrics(lyricsData, songDuration = 0) {
    // Store original lyrics data for outro detection
    this.originalLyricsData = lyricsData || [];
    // Store filtered lyrics for display
    this.lyrics = this.parseLyricsData(lyricsData);
    this.songDuration = songDuration;
  }

  parseLyricsData(data) {
    if (!data || !Array.isArray(data)) return [];

    // Filter out disabled lines for playback (backup lines are still included)
    const enabledData = data.filter((line) => line.disabled !== true);

    return enabledData
      .map((line, index) => {
        if (typeof line === 'object' && line !== null) {
          const words = this.parseWordsFromLine(line);
          const text = line.text || line.lyrics || line.content || line.lyric || '';
          return {
            id: index,
            startTime: line.start || line.time || line.start_time || index * 3,
            endTime: line.end || line.end_time || (line.start || line.time || index * 3) + 3,
            text: text,
            words: words,
            isBackup: line.backup === true,
          };
        } else {
          // Simple string - create word timing estimates
          const text = line || '';
          const words = this.estimateWordTiming(text, index * 3);
          return {
            id: index,
            startTime: index * 3,
            endTime: index * 3 + 3,
            text: text,
            words: words,
            isBackup: false,
          };
        }
      })
      .filter((line) => line.text.trim().length > 0);
  }

  parseWordsFromLine(line) {
    // If the line has word-level timing data, use it
    if (line.words && Array.isArray(line.words)) {
      return line.words.map((word) => ({
        text: word.t || word.text || '',
        startTime: word.s || word.start || word.startTime || 0,
        endTime: word.e || word.end || word.endTime || 0,
      }));
    }

    // Otherwise estimate word timing
    const text = line.text || line.lyrics || line.content || line.lyric || '';
    const startTime = line.start || line.time || line.start_time || 0;
    const endTime = line.end || line.end_time || startTime + 3;
    const duration = endTime - startTime;

    return this.estimateWordTiming(text, startTime, duration);
  }

  estimateWordTiming(text, startTime, duration = 3) {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return [];

    const wordDuration = duration / words.length;

    return words.map((word, index) => ({
      text: word,
      startTime: startTime + index * wordDuration,
      endTime: startTime + (index + 1) * wordDuration,
    }));
  }

  setCurrentTime(time) {
    const oldTime = this.currentTime;
    this.currentTime = time;

    // Track for interpolation
    this.lastReportedTime = time;
    this.lastReportedTimestamp = performance.now();

    // If time jumped significantly and we're playing, restart music analysis from new position
    if (this.isPlaying && Math.abs(time - oldTime) > 1.0) {
      // 1 second threshold - restart butterchurn analysis to stay in sync
      // Stop first, then delay restart slightly to ensure it happens after PA sources restart
      this.stopMusicAnalysis();

      // Delay restart by a small amount to allow PA audio sources to stabilize first
      setTimeout(() => {
        if (this.isPlaying) {
          this.startMusicAnalysis();
        }
      }, 50); // 50ms delay
    }
  }

  /**
   * Get interpolated current time for smooth 60fps progress bars
   * When playing, calculates time based on elapsed time since last update
   */
  getInterpolatedTime() {
    if (!this.isPlaying) {
      return this.currentTime;
    }

    // Calculate elapsed time since last report
    const now = performance.now();
    const elapsed = (now - this.lastReportedTimestamp) / 1000; // Convert to seconds
    const interpolated = this.lastReportedTime + elapsed;

    // Don't exceed song duration
    return Math.min(interpolated, this.songDuration || Infinity);
  }

  /**
   * Set the analyser node for butterchurn visualization
   * This is provided by the PA audio context from kaiPlayer
   * @param {AnalyserNode} analyserNode - The PA analyser node
   */
  setVisualizationAnalyser(analyserNode) {
    if (!analyserNode) return;

    try {
      console.log('🎨 Connecting butterchurn to PA analyser');

      // Check if butterchurn was created with a different context
      // If so, recreate it with the PA context from the analyser
      const paContext = analyserNode.context;

      if (this.butterchurn && this.butterchurn.audioContext !== paContext) {
        console.log('⚠️  Butterchurn context mismatch - recreating with PA context');

        // Destroy old butterchurn
        if (this.butterchurn.destroy) {
          this.butterchurn.destroy();
        }

        // Get butterchurn API
        let butterchurnAPI = null;
        if (typeof window.butterchurn.createVisualizer === 'function') {
          butterchurnAPI = window.butterchurn;
        } else if (
          window.butterchurn.default &&
          typeof window.butterchurn.default.createVisualizer === 'function'
        ) {
          butterchurnAPI = window.butterchurn.default;
        }

        if (butterchurnAPI) {
          // Recreate with PA context
          this.butterchurn = butterchurnAPI.createVisualizer(paContext, this.effectsCanvas, {
            width: 1920,
            height: 1080,
            mesh_width: 128,
            mesh_height: 72,
            fps: 30,
          });

          // Reload current preset if available
          if (this.currentPreset && window.butterchurnPresets) {
            const presets = window.butterchurnPresets.getPresets();
            if (presets[this.currentPreset]) {
              this.butterchurn.loadPreset(presets[this.currentPreset], 0.0);
            }
          }
        }
      }

      // Connect analyser to butterchurn
      if (this.butterchurn) {
        this.butterchurn.connectAudio(analyserNode);
        console.log('✅ Butterchurn connected to PA analyser successfully');
      }
    } catch (error) {
      console.error('❌ Failed to connect butterchurn to analyser:', error);
      console.error('   Error type:', error.name);
      console.error('   Error message:', error.message);
    }
  }

  // setMusicAudio() removed - butterchurn now uses PA analyser from kaiPlayer
  // Connected via setVisualizationAnalyser() during song load

  reinitializeButterchurn() {
    try {
      // Destroy the old Butterchurn instance if it exists
      if (this.butterchurn && this.butterchurn.destroy) {
        this.butterchurn.destroy();
      }

      // Clear old references
      this.butterchurn = null;

      // Get the Butterchurn API
      let butterchurnAPI = null;
      if (typeof window.butterchurn.createVisualizer === 'function') {
        butterchurnAPI = window.butterchurn;
      } else if (
        window.butterchurn.default &&
        typeof window.butterchurn.default.createVisualizer === 'function'
      ) {
        butterchurnAPI = window.butterchurn.default;
      } else if (typeof window.butterchurn === 'function') {
        butterchurnAPI = window.butterchurn;
      }

      if (!butterchurnAPI || typeof butterchurnAPI.createVisualizer !== 'function') {
        console.error('Butterchurn createVisualizer not found during reinit');
        return;
      }

      // Create fresh Butterchurn instance (uses waveformAudioContext as dummy)
      // Note: Audio comes from PA analyser via setVisualizationAnalyser(), not from this context
      if (!this.waveformAudioContext) {
        this.waveformAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      this.butterchurn = butterchurnAPI.createVisualizer(
        this.waveformAudioContext,
        this.effectsCanvas,
        {
          width: 1920,
          height: 1080,
          mesh_width: 128,
          mesh_height: 72,
          fps: 30,
        }
      );

      // Reload presets
      if (window.butterchurnPresets && window.butterchurnPresets.getPresets) {
        this.presetList = Object.keys(window.butterchurnPresets.getPresets());

        // Restore the current preset if it exists, otherwise load a reactive preset
        if (this.currentPreset && this.presetList.includes(this.currentPreset)) {
          const presetData = window.butterchurnPresets.getPresets()[this.currentPreset];
          this.butterchurn.loadPreset(presetData, 0.0);
        } else {
          // Only load a reactive preset if no current preset exists
          const reactivePresets = [
            'Geiss - Pulse Vertex v1.02',
            'Rovastar & Geiss - Dynamic Noise v2.0',
            'martin - volume bar spectrogram v1.0',
          ];

          for (const preset of reactivePresets) {
            if (this.presetList.includes(preset)) {
              this.butterchurn.loadPreset(window.butterchurnPresets.getPresets()[preset], 0.0);
              this.currentPreset = preset;
              break;
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to reinitialize Butterchurn:', error);
    }
  }

  async setVocalsAudio(audioData) {
    try {
      if (!this.waveformAudioContext) {
        this.waveformAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Ensure audioData is an ArrayBuffer
      let arrayBuffer;
      if (audioData instanceof ArrayBuffer) {
        arrayBuffer = audioData;
      } else if (audioData && audioData.buffer instanceof ArrayBuffer) {
        // Handle Node.js Buffer-like objects (which have a .buffer property)
        arrayBuffer = audioData.buffer.slice(
          audioData.byteOffset,
          audioData.byteOffset + audioData.byteLength
        );
      } else if (audioData instanceof Uint8Array) {
        // Handle Uint8Array
        arrayBuffer = audioData.buffer.slice(
          audioData.byteOffset,
          audioData.byteOffset + audioData.byteLength
        );
      } else {
        return; // Unexpected audio data type
      }

      // Decode the audio data
      this.vocalsAudioBuffer = await this.waveformAudioContext.decodeAudioData(arrayBuffer);

      // Pre-calculate waveform for smooth animation
      this.preCalculateVocalsWaveform();
    } catch {
      // Failed to load vocals audio for waveform
    }
  }

  async setupMusicAnalysis(waveformBuffer, arrayBuffer) {
    if (!this.effectsGL) return;

    try {
      // Use Butterchurn's AudioContext for live music analysis (for sync with playback)
      const analysisContext = this.butterchurnAudioContext || this.waveformAudioContext;

      // Store waveform buffer for UI visualization
      this.musicAudioBuffer = waveformBuffer;

      // If we have the shared Butterchurn context, decode audio for it too (if not already done)
      if (this.butterchurnAudioContext && !this.butterchurnAudioBuffer && arrayBuffer) {
        try {
          this.butterchurnAudioBuffer = await this.butterchurnAudioContext.decodeAudioData(
            arrayBuffer.slice(0)
          );
        } catch (error) {
          console.warn('Failed to decode audio for Butterchurn context:', error);
        }
      }

      // Try to use AudioWorklet for better performance (use the analysis context)
      try {
        await analysisContext.audioWorklet.addModule('./js/musicAnalysisWorklet.js');
        this.workletAvailable = true;
      } catch {
        console.warn('AudioWorklet not available, falling back to AnalyserNode');
        this.workletAvailable = false;
      }

      if (this.workletAvailable) {
        // Create the worklet node but don't connect it yet
        this.musicWorkletNode = new AudioWorkletNode(analysisContext, 'music-analysis-processor');

        // Listen for analysis results
        this.musicWorkletNode.port.onmessage = (event) => {
          if (event.data.type === 'analysis') {
            this.cachedAnalysis = event.data.data;
          }
        };
      } else {
        // Create analyser but don't connect it yet
        this.musicAnalyser = analysisContext.createAnalyser();
        this.musicAnalyser.fftSize = 512;
        this.musicAnalyser.smoothingTimeConstant = 0.8;
        this.musicFrequencyData = new Uint8Array(this.musicAnalyser.frequencyBinCount);
      }
    } catch (error) {
      console.warn('Failed to setup music analysis:', error);
    }
  }

  async tryDecodeStoredAudioForButterchurn() {
    // If we already have music loaded but Butterchurn doesn't have the audio buffer
    if (
      this.butterchurn &&
      this.butterchurnAudioContext &&
      this.originalAudioArrayBuffer &&
      !this.butterchurnAudioBuffer
    ) {
      try {
        this.butterchurnAudioBuffer = await this.butterchurnAudioContext.decodeAudioData(
          this.originalAudioArrayBuffer.slice(0)
        );

        // Also update the music buffer reference for UI if we don't have it yet
        if (!this.musicAudioBuffer && this.waveformAudioContext) {
          try {
            this.musicAudioBuffer = await this.waveformAudioContext.decodeAudioData(
              this.originalAudioArrayBuffer.slice(0)
            );
          } catch (error) {
            console.warn('Failed to decode audio for waveform:', error);
          }
        }
      } catch (error) {
        console.warn('Failed to decode stored audio for Butterchurn context:', error);
      }
    }
  }

  analyzeMusicFrequencies() {
    // Use cached results from AudioWorklet if available
    if (this.workletAvailable && this.musicWorkletNode) {
      return this.cachedAnalysis;
    }

    // Fallback to traditional analysis
    if (!this.musicAnalyser || !this.musicFrequencyData) {
      return { energy: 0, bass: 0, mid: 0, treble: 0, centroid: 0 };
    }

    // Get frequency data (expensive operation on main thread)
    this.musicAnalyser.getByteFrequencyData(this.musicFrequencyData);

    const binCount = this.musicFrequencyData.length;
    const bassEnd = Math.floor(binCount * 0.1); // 0-10% (bass)
    const midEnd = Math.floor(binCount * 0.4); // 10-40% (mids)
    // 40-100% is treble

    let bassSum = 0,
      midSum = 0,
      trebleSum = 0,
      totalEnergy = 0;
    let weightedSum = 0; // for spectral centroid

    for (let i = 0; i < binCount; i++) {
      const value = this.musicFrequencyData[i] / 255.0; // Normalize to 0-1
      totalEnergy += value;
      weightedSum += value * i;

      if (i < bassEnd) {
        bassSum += value;
      } else if (i < midEnd) {
        midSum += value;
      } else {
        trebleSum += value;
      }
    }

    // Calculate averages
    const bassAvg = bassEnd > 0 ? bassSum / bassEnd : 0;
    const midAvg = midEnd - bassEnd > 0 ? midSum / (midEnd - bassEnd) : 0;
    const trebleAvg = binCount - midEnd > 0 ? trebleSum / (binCount - midEnd) : 0;
    const energyAvg = binCount > 0 ? totalEnergy / binCount : 0;

    // Calculate spectral centroid (normalized)
    const centroid = totalEnergy > 0 ? weightedSum / totalEnergy / binCount : 0;

    return {
      energy: Math.min(energyAvg * 20, 1.0), // Scale for visual effects
      bass: Math.min(bassAvg * 30, 1.0),
      mid: Math.min(midAvg * 25, 1.0),
      treble: Math.min(trebleAvg * 20, 1.0),
      centroid: centroid,
    };
  }

  renderWebGLEffects() {
    if (!this.effectsGL) {
      return;
    }

    // Clear effects canvas if disabled
    if (!this.waveformPreferences.enableEffects) {
      const gl = this.effectsGL;
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    const _gl = this.effectsGL;
    const analysis = this.analyzeMusicFrequencies();

    // if (Math.random() < 0.01) { // Debug occasionally
    // }

    // Use Butterchurn for background effects
    if (this.effectType === 'butterchurn' && this.butterchurn) {
      try {
        // Convert our analysis data to Butterchurn's expected format
        const audioData = {
          timeArray: new Uint8Array(1024), // Time domain data (not used much)
          freqArray: new Uint8Array(1024), // Frequency domain data
        };

        // Fill frequency data based on our analysis
        // Butterchurn expects 0-255 values
        const bassLevel = Math.floor(analysis.bass * 255);
        const midLevel = Math.floor(analysis.mid * 255);
        const trebleLevel = Math.floor(analysis.treble * 255);

        // Distribute frequency data across the array
        for (let i = 0; i < 1024; i++) {
          if (i < 341) {
            // Bass frequencies (0-33% of spectrum)
            audioData.freqArray[i] = bassLevel;
          } else if (i < 682) {
            // Mid frequencies (33-66% of spectrum)
            audioData.freqArray[i] = midLevel;
          } else {
            // Treble frequencies (66-100% of spectrum)
            audioData.freqArray[i] = trebleLevel;
          }
        }

        // Render Butterchurn frame
        this.butterchurn.render();

        // Debug audio levels periodically
        this.debugAudioLevels();

        // Ensure Butterchurn source is running if we're playing but source is missing
        if (
          this.isPlaying &&
          this.butterchurnAnalyser &&
          !this.butterchurnSourceNode &&
          this.butterchurnAudioBuffer
        ) {
          this.startMusicAnalysis();
        } else if (
          this.isPlaying &&
          !this.butterchurnSourceNode &&
          this.musicAudioBuffer &&
          !this.butterchurnAudioBuffer
        ) {
          // Fix missing Butterchurn audio buffer - decode the music for Butterchurn
          try {
            // Get the original audio data from musicAudioBuffer
            // We need to re-decode since AudioBuffer can't be transferred between contexts
            // This is a limitation - we'd need the original ArrayBuffer, but for now let's skip this complex case
          } catch (error) {
            console.warn('Failed to decode audio for Butterchurn:', error);
          }
        } else if (this.isPlaying && !this.butterchurnSourceNode) {
          // Debug why auto-fix isn't triggering (limit frequency)
          const now = performance.now();
          if (now - this.lastConditionsDebugTime > 2000) {
            this.lastConditionsDebugTime = now;
          }
        }
      } catch (error) {
        console.error('Butterchurn render failed:', error);
      }
    }
  }

  // Preset management methods
  switchToNextPreset() {
    if (this.effectType === 'butterchurn' && this.butterchurn && this.presetList.length) {
      const currentIndex = this.presetList.indexOf(this.currentPreset);
      let nextIndex = (currentIndex + 1) % this.presetList.length;

      // Skip disabled effects
      const maxAttempts = this.presetList.length;
      let attempts = 0;
      while (attempts < maxAttempts && this.isEffectDisabled(this.presetList[nextIndex])) {
        nextIndex = (nextIndex + 1) % this.presetList.length;
        attempts++;
      }

      // Only switch if we found an enabled effect
      if (!this.isEffectDisabled(this.presetList[nextIndex])) {
        this.switchToPreset(this.presetList[nextIndex]);
      }
    }
  }

  switchToPreviousPreset() {
    if (this.effectType === 'butterchurn' && this.butterchurn && this.presetList.length) {
      const currentIndex = this.presetList.indexOf(this.currentPreset);
      let prevIndex = currentIndex <= 0 ? this.presetList.length - 1 : currentIndex - 1;

      // Skip disabled effects
      const maxAttempts = this.presetList.length;
      let attempts = 0;
      while (attempts < maxAttempts && this.isEffectDisabled(this.presetList[prevIndex])) {
        prevIndex = prevIndex <= 0 ? this.presetList.length - 1 : prevIndex - 1;
        attempts++;
      }

      // Only switch if we found an enabled effect
      if (!this.isEffectDisabled(this.presetList[prevIndex])) {
        this.switchToPreset(this.presetList[prevIndex]);
      }
    }
  }

  switchToPreset(presetName, transitionTime = 2.0) {
    if (
      this.effectType !== 'butterchurn' ||
      !this.butterchurn ||
      !this.presetList.includes(presetName)
    ) {
      console.warn('Cannot switch to preset:', presetName);
      return;
    }

    try {
      const presetData = window.butterchurnPresets.getPresets()[presetName];
      this.butterchurn.loadPreset(presetData, transitionTime);
      this.currentPreset = presetName;
    } catch (error) {
      console.error('Failed to switch preset:', error);
    }
  }

  isEffectDisabled(_effectName) {
    // TODO: Get disabled effects from Context/props instead
    return false;
  }

  setButterchurnPreset(presetData, transitionTime = 1.0) {
    if (this.effectType !== 'butterchurn' || !this.butterchurn) {
      console.warn('Cannot set butterchurn preset - butterchurn not active');
      return false;
    }

    try {
      this.butterchurn.loadPreset(presetData, transitionTime);
      // Find the preset name for tracking
      if (window.butterchurnPresets) {
        const allPresets = window.butterchurnPresets.getPresets();
        for (const [name, preset] of Object.entries(allPresets)) {
          if (preset === presetData) {
            this.currentPreset = name;
            break;
          }
        }
      }
      return true;
    } catch (error) {
      console.error('Failed to set butterchurn preset:', error);
      return false;
    }
  }

  getAvailablePresets() {
    return this.presetList;
  }

  getCurrentPreset() {
    return this.currentPreset;
  }

  switchEffectType(type) {
    if (type === 'butterchurn') {
      this.effectType = type;
    }
  }

  setPlaying(playing) {
    this.isPlaying = playing;

    // Start/stop microphone capture based on playing state
    if (playing) {
      this.startMicrophoneCapture();
      this.startMusicAnalysis();
    } else {
      this.stopMicrophoneCapture();
      this.stopMusicAnalysis();
    }
  }

  startMusicAnalysis() {
    if (!this.musicAudioBuffer) {
      return;
    }
    if (!this.effectsGL && !this.butterchurn) {
      return;
    }

    // NOTE: We only use Butterchurn context for actual audio playback.
    // The waveform context is used only for UI visualization (no playback).

    try {
      // Stop any existing analysis
      this.stopMusicAnalysis();

      // Start offline audio analysis for Butterchurn (NO PLAYBACK)
      if (this.butterchurn && this.butterchurnAudioBuffer && this.butterchurnAudioContext) {
        try {
          // Stop any existing Butterchurn source
          if (this.butterchurnSourceNode) {
            this.butterchurnSourceNode.disconnect();
            this.butterchurnSourceNode = null;
          }

          // Create new Butterchurn source node for ANALYSIS ONLY
          this.butterchurnSourceNode = this.butterchurnAudioContext.createBufferSource();
          this.butterchurnSourceNode.buffer = this.butterchurnAudioBuffer;

          // IMPORTANT: DO NOT connect to destination - this eliminates audio playback!
          // Connect only to analysers for frequency analysis (no audio output)

          // Connect to debug analyser for monitoring
          if (this.butterchurnAnalyser) {
            this.butterchurnSourceNode.connect(this.butterchurnAnalyser);
          }

          // Connect to Butterchurn's internal audio processing
          // Butterchurn should have its own analyser that we can connect to
          if (this.butterchurn && this.butterchurn.connectAudio) {
            // Create dedicated analyser for Butterchurn visualization
            this.butterchurnVisualAnalyser = this.butterchurnAudioContext.createAnalyser();
            this.butterchurnVisualAnalyser.fftSize = 2048;
            this.butterchurnVisualAnalyser.smoothingTimeConstant = 0.8;

            // Connect audio source to Butterchurn's analyser
            this.butterchurnSourceNode.connect(this.butterchurnVisualAnalyser);

            // Give Butterchurn the analyser for visualization
            this.butterchurn.connectAudio(this.butterchurnVisualAnalyser);
          }

          // Start from current time position (analysis only, no audio output)
          // Ensure offset is never negative to avoid RangeError
          const startOffset = Math.max(0, this.currentTime);

          // Track when we started and from what offset for drift detection
          this.butterchurnStartTime = this.butterchurnAudioContext.currentTime;
          this.butterchurnStartOffset = startOffset;

          this.butterchurnSourceNode.start(0, startOffset);
        } catch (error) {
          console.warn('Failed to start Butterchurn offline analysis:', error);
        }
      }
    } catch (error) {
      console.error('Failed to start music analysis:', error);
    }
  }

  stopMusicAnalysis() {
    // Note: We no longer create musicSourceNode from waveform context.
    // Only Butterchurn context is used for analysis.

    // Stop Butterchurn source (AudioBufferSourceNode can only be used once)
    if (this.butterchurnSourceNode) {
      try {
        this.butterchurnSourceNode.stop();
        this.butterchurnSourceNode.disconnect();
      } catch {
        // Source may already be stopped
      }
      this.butterchurnSourceNode = null;
    }

    // Reset tracking variables
    this.butterchurnStartTime = 0;
    this.butterchurnStartOffset = 0;

    // Clear any stored analyser references that Butterchurn might be holding
    if (this.butterchurnVisualAnalyser) {
      this.butterchurnVisualAnalyser = null;
    }

    // Clear cached analysis when stopped
    this.cachedAnalysis = { energy: 0, bass: 0, mid: 0, treble: 0, centroid: 0 };
  }

  debugAudioLevels() {
    const now = performance.now();
    if (now - this.lastAudioDebugTime < this.audioDebugInterval) return;
    this.lastAudioDebugTime = now;

    if (this.butterchurnAnalyser && this.butterchurnFrequencyData) {
      this.butterchurnAnalyser.getByteFrequencyData(this.butterchurnFrequencyData);
      const sum = this.butterchurnFrequencyData.reduce((a, b) => a + b, 0);
      const average = sum / this.butterchurnFrequencyData.length;
      const max = Math.max(...this.butterchurnFrequencyData);

      //            `Source: ${this.butterchurnSourceNode ? 'active' : 'none'}`);

      // Also update status bar for visual feedback
      const statusText = document.getElementById('statusText');
      if (statusText) {
        statusText.textContent = `Audio: Avg=${average.toFixed(0)} Max=${max} State=${this.butterchurnAudioContext ? this.butterchurnAudioContext.state : 'none'}`;
      }
    }
  }

  async startMicrophoneCapture() {
    if (!this.waveformPreferences.enableMic) return;

    try {
      // Use stored input device from preferences
      const constraints = {
        audio: this.inputDevice
          ? {
              deviceId: { exact: this.inputDevice },
            }
          : true,
      };

      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();

      const source = this.audioContext.createMediaStreamSource(this.micStream);
      source.connect(this.analyser);

      // Create gain node for analysis only - NEVER route to speakers
      // (kaiPlayer handles actual microphone audio routing to PA/IEM outputs)
      this.micGainNode = this.audioContext.createGain();
      this.micGainNode.gain.setValueAtTime(0.5, this.audioContext.currentTime);
      source.connect(this.micGainNode);

      // DO NOT connect to speakers - this audioContext uses default output device
      // and would bypass PA routing. kaiPlayer handles all mic-to-speaker routing.

      this.analyser.fftSize = 256;
      this.micDataArray = new Uint8Array(this.analyser.frequencyBinCount);

      // Give the microphone a moment to stabilize before processing
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Microphone capture started
    } catch {
      // Could not start microphone capture
    }
  }

  stopMicrophoneCapture() {
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.micGainNode) {
      this.micGainNode.disconnect();
      this.micGainNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.micDataArray = null;
    this.waveformData.fill(128); // Fill with center value to avoid flatline
  }

  preCalculateVocalsWaveform() {
    if (!this.vocalsAudioBuffer) return;

    const channelData = this.vocalsAudioBuffer.getChannelData(0);
    const sampleRate = this.vocalsAudioBuffer.sampleRate;
    const duration = this.vocalsAudioBuffer.duration;

    // Create waveform data at 240 samples per second (pixel resolution)
    const samplesPerWaveformPoint = sampleRate / 240; // 240Hz
    const totalPoints = Math.floor(duration * 240);
    this.preCalculatedVocalsWaveform = new Uint8Array(totalPoints);

    for (let i = 0; i < duration * 240; i++) {
      const startSample = Math.floor(i * samplesPerWaveformPoint);
      const endSample = Math.min(Math.floor((i + 1) * samplesPerWaveformPoint), channelData.length);

      // Get peak value for this time segment (preserves waveform shape better than RMS)
      let maxVal = 0;
      let minVal = 0;
      for (let j = startSample; j < endSample; j++) {
        maxVal = Math.max(maxVal, channelData[j]);
        minVal = Math.min(minVal, channelData[j]);
      }

      // Use the larger absolute value to preserve the waveform peaks
      const peak = Math.max(Math.abs(maxVal), Math.abs(minVal));

      // Store as signed value: 128 is center, >128 is positive, <128 is negative
      // Determine sign based on which peak was larger
      const signedValue =
        Math.abs(maxVal) > Math.abs(minVal)
          ? 128 + Math.floor(peak * 127) // Positive peak
          : 128 - Math.floor(peak * 127); // Negative peak

      this.preCalculatedVocalsWaveform[i] = Math.max(0, Math.min(255, signedValue));
    }
  }

  updateWaveformData() {
    if (!this.analyser || !this.micDataArray) return;

    // Get time domain data from microphone (actual waveform)
    this.analyser.getByteTimeDomainData(this.micDataArray);

    // Calculate how many samples to shift based on time elapsed
    if (!this.lastMicTime) {
      this.lastMicTime = this.currentTime;
    }
    const timeElapsed = this.currentTime - this.lastMicTime;
    const samplesToShift = Math.floor(timeElapsed * 240);

    if (samplesToShift > 0) {
      // Shift array left by the number of samples elapsed
      for (let i = 0; i < 1440 - samplesToShift; i++) {
        this.waveformData[i] = this.waveformData[i + samplesToShift];
      }

      // Fill the right side with actual waveform data
      // Sample multiple points from the audio buffer to create smooth waveform
      const samplesPerPoint = Math.floor(this.micDataArray.length / samplesToShift);
      for (let i = 0; i < samplesToShift; i++) {
        const bufferIndex = Math.min(i * samplesPerPoint, this.micDataArray.length - 1);
        // Use actual waveform value (already 0-255)
        this.waveformData[1440 - samplesToShift + i] = this.micDataArray[bufferIndex];
      }

      this.lastMicTime = this.currentTime;
    }
  }

  updateVocalsWaveformData() {
    // Update vocals rendering array by slicing from source and padding with zeros
    if (this.preCalculatedVocalsWaveform) {
      const startIndex = Math.floor((this.currentTime - 6) * 240); // 6 seconds back
      const endIndex = startIndex + 1920; // 8 seconds total

      if (startIndex >= 0 && endIndex <= this.preCalculatedVocalsWaveform.length) {
        // Simple case: copy directly
        for (let i = 0; i < 1920; i++) {
          this.vocalsWaveformData[i] = this.preCalculatedVocalsWaveform[startIndex + i];
        }
      } else {
        // Edge cases: slice and concatenate with zero padding
        const validStart = Math.max(0, startIndex);
        const validEnd = Math.min(this.preCalculatedVocalsWaveform.length, endIndex);
        const leftPadding = validStart - startIndex;
        const rightPadding = endIndex - validEnd;

        let destIndex = 0;

        // Left padding (zeros)
        for (let i = 0; i < leftPadding; i++) {
          this.vocalsWaveformData[destIndex++] = 128;
        }

        // Valid source data
        for (let i = validStart; i < validEnd; i++) {
          this.vocalsWaveformData[destIndex++] = this.preCalculatedVocalsWaveform[i];
        }

        // Right padding (zeros)
        for (let i = 0; i < rightPadding; i++) {
          this.vocalsWaveformData[destIndex++] = 128;
        }
      }
    }
  }

  updateWaveformDataAtFixedRate() {
    const now = Date.now();

    // Initialize timing if needed
    if (!this.lastMicUpdateTime) {
      this.lastMicUpdateTime = now;
      this.micUpdateInterval = 1000 / 240; // 240Hz = 4.17ms intervals
      return;
    }

    // Only update if enough time has passed for exactly 60Hz
    if (now - this.lastMicUpdateTime >= this.micUpdateInterval) {
      this.updateWaveformData();
      this.updateVocalsWaveformData();
      this.lastMicUpdateTime = now;
    }
  }

  drawVocalsWaveform(width, height) {
    if (!this.isPlaying || !this.waveformPreferences.enableWaveforms) return;

    // If mic is disabled but waveforms are enabled, only show vocals
    if (!this.waveformPreferences.enableMic && this.waveformPreferences.enableWaveforms) {
      // Draw vocals waveform but show it where mic would be
    }

    const vocalsHeight = this.settings.vocalsWaveformHeight;
    const micHeight = this.settings.waveformHeight;
    const gap = this.settings.vocalsWaveformGap;
    const vocalsY = height - micHeight - gap - vocalsHeight - 20;
    const currentPositionX = width * this.settings.waveformCurrentPosition;

    // Direct pixel-to-data mapping for vocals (1920 pixels = 1920 data points)
    this.ctx.strokeStyle = this.settings.vocalsWaveformColor;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    const centerY = vocalsY + vocalsHeight / 2;
    let firstPoint = true;

    // Direct pixel-to-data mapping, left to right
    for (let x = 0; x < width; x++) {
      // Convert byte data (0-255) to waveform position (-1 to 1), centered at 128
      const normalized = (this.vocalsWaveformData[x] - 128) / 128;
      const y = centerY + normalized * vocalsHeight * 1.5; // Increased amplitude

      if (firstPoint) {
        this.ctx.moveTo(x, y);
        firstPoint = false;
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.stroke();

    // Draw current position indicator
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(currentPositionX, vocalsY);
    this.ctx.lineTo(currentPositionX, vocalsY + vocalsHeight);
    this.ctx.stroke();

    // Draw center line
    this.ctx.strokeStyle = '#666666';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, centerY);
    this.ctx.lineTo(width, centerY);
    this.ctx.stroke();
  }

  // Control methods for preferences
  setWaveformsEnabled(enabled) {
    this.waveformPreferences.enableWaveforms = enabled;
  }

  setMicToSpeakers(enabled) {
    this.waveformPreferences.micToSpeakers = enabled;

    // karaokeRenderer mic is ONLY for waveform visualization, NOT audio routing
    // kaiPlayer handles all microphone-to-speaker routing to PA/IEM outputs
    // This setting is stored for preferences sync but not used by karaokeRenderer
  }

  setMicEnabled(enabled) {
    this.waveformPreferences.enableMic = enabled;

    if (enabled && this.isPlaying) {
      this.startMicrophoneCapture();
    } else if (!enabled) {
      this.stopMicrophoneCapture();
      // Clear the waveform buffer so we don't render a flatline
      this.waveformData.fill(128); // Fill with center value (128 = silence)
    }
  }

  setEffectsEnabled(enabled) {
    this.waveformPreferences.enableEffects = enabled;

    // Clear effects canvas when disabled
    if (!enabled && this.effectsGL) {
      this.effectsGL.clearColor(0, 0, 0, 1);
      this.effectsGL.clear(this.effectsGL.COLOR_BUFFER_BIT);
    }
  }

  drawMicrophoneWaveform(width, height) {
    if (!this.isPlaying || !this.waveformPreferences.enableWaveforms) return;

    // Only draw mic waveform if mic is enabled AND we have actual mic data
    if (!this.waveformPreferences.enableMic || !this.micStream || !this.analyser) return;

    const waveformHeight = this.settings.waveformHeight;
    const waveformY = height - waveformHeight - 20;
    const currentPositionX = width * this.settings.waveformCurrentPosition;

    // Direct pixel-to-data mapping for mic (1440 pixels for 6 seconds, scaled to 1920 width)
    this.ctx.strokeStyle = this.settings.waveformColor;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    const centerY = waveformY + waveformHeight / 2;
    let firstPoint = true;

    // Direct pixel-to-data mapping for mic, left to right
    for (let x = 0; x < 1440; x++) {
      // Convert byte data (0-255) to waveform position (-1 to 1)
      const normalized = (this.waveformData[x] - 128) / 128;
      const y = centerY + normalized * waveformHeight * 1.5; // Increased amplitude

      if (firstPoint) {
        this.ctx.moveTo(x, y);
        firstPoint = false;
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.stroke();

    // Draw current position indicator
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(currentPositionX, waveformY);
    this.ctx.lineTo(currentPositionX, waveformY + waveformHeight);
    this.ctx.stroke();

    // Draw center line
    this.ctx.strokeStyle = '#666666';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, centerY);
    this.ctx.lineTo(width, centerY);
    this.ctx.stroke();
  }

  startAnimation() {
    const animate = (currentTime) => {
      // Track actual FPS by measuring time between frames
      const deltaTime = currentTime - this.lastFrameTime;
      this.lastFrameTime = currentTime;

      // Add to FPS history (keep last 60 samples for 1-second average)
      this.fpsHistory.push(1000 / deltaTime);
      if (this.fpsHistory.length > 60) {
        this.fpsHistory.shift();
      }

      // Time the full frame including updates
      const frameStart = performance.now();

      this.draw();

      // Track time spent in updates vs rendering
      this.frameUpdateTime = performance.now() - frameStart;

      this.animationFrame = requestAnimationFrame(animate);
    };
    this.animationFrame = requestAnimationFrame(animate);
  }

  stopAnimation() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  draw() {
    const width = this.canvas.width; // Always 1920
    const height = this.canvas.height; // Always 1080

    this.frameCount++;

    // Performance profiling - sample every 2 seconds
    const shouldProfile = this.frameCount % 120 === 0;
    const frameStart = shouldProfile ? performance.now() : 0;

    // Update microphone waveform data at consistent 60Hz rate
    this.updateWaveformDataAtFixedRate();

    // Clear canvas with dark background
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, width, height);

    // Render WebGL effects to offscreen canvas
    const effectsStart = shouldProfile ? performance.now() : 0;
    this.renderWebGLEffects();
    const effectsEnd = shouldProfile ? performance.now() : 0;

    // Composite WebGL effects onto main canvas at full opacity
    if (this.effectsCanvas) {
      this.ctx.save();
      this.ctx.globalAlpha = 1.0;
      this.ctx.drawImage(this.effectsCanvas, 0, 0);
      this.ctx.restore();
    }

    // Add dark overlay for text contrast (let effects show through)
    this.ctx.save();
    this.ctx.globalAlpha = this.waveformPreferences.overlayOpacity; // Configurable opacity dark overlay for better text readability
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, width, height);
    this.ctx.restore();

    // Draw waveforms at the bottom
    const waveformsStart = shouldProfile ? performance.now() : 0;
    this.drawVocalsWaveform(width, height);
    const vocalsEnd = shouldProfile ? performance.now() : 0;
    this.drawMicrophoneWaveform(width, height);
    const micEnd = shouldProfile ? performance.now() : 0;

    // Show song info when loaded but not playing
    if (!this.isPlaying && this.songMetadata) {
      this.drawSongInfo(width, height, this.songMetadata);
      return;
    }

    if (!this.lyrics || this.lyrics.length === 0) {
      return;
    }

    // Check for instrumental intro first
    if (this.isInInstrumentalIntro()) {
      this.drawInstrumentalIntro(width, height);
      return;
    }

    // Check for instrumental outro (just show clean ending, no progress bar)
    if (this.isInInstrumentalOutro()) {
      this.drawInstrumentalOutro(width, height);
      return;
    }

    // Find current line
    const currentLineIndex = this.findCurrentLine();

    if (currentLineIndex >= 0 && currentLineIndex < this.lyrics.length) {
      // Check if we're in an instrumental gap first
      const isInInstrumentalGap = this.isInInstrumentalGap(currentLineIndex);

      if (isInInstrumentalGap) {
        // During instrumental sections, only show the progress bar and upcoming lyrics
        this.drawInstrumentalProgressBar(currentLineIndex, width, height);
      } else {
        // Normal lyric display - show all active lines (main + backup)
        this.drawActiveLines(width, height);
      }
    } else {
      // No current main line found - check if we should show progress bar during backup-only periods
      this.drawBackupOnlyProgressBar(width, height);
    }

    // Performance profiling output with real FPS tracking
    if (shouldProfile) {
      const frameEnd = performance.now();
      const _clearTime = effectsStart - frameStart;
      const _effectsTime = effectsEnd - effectsStart;
      const _vocalsTime = vocalsEnd - waveformsStart;
      const _micTime = micEnd - vocalsEnd;
      const _lyricsTime = frameEnd - micEnd;
      const _renderTime = frameEnd - frameStart;

      // Calculate actual FPS average
      const _avgFPS =
        this.fpsHistory.length > 0
          ? this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length
          : 0;

      // Calculate frame budget utilization
      const targetFrameTime = 1000 / 60; // 16.67ms for 60fps
      const _budgetUsed = (this.frameUpdateTime / targetFrameTime) * 100;

      // Log as separate lines to avoid console truncation
    }
  }

  findCurrentLine() {
    // Use cached result if time hasn't changed much
    if (
      Math.abs(this.currentTime - this.lastTimeForLineCalculation) < this.lineCalculationTolerance
    ) {
      return this.cachedCurrentLine;
    }

    // Find current main singer line (exclude backup singers for progress tracking)
    this.cachedCurrentLine = this.findCurrentMainLine();
    this.lastTimeForLineCalculation = this.currentTime;
    return this.cachedCurrentLine;
  }

  findCurrentMainLine() {
    if (!this.lyrics) return -1;

    for (let i = 0; i < this.lyrics.length; i++) {
      const line = this.lyrics[i];
      // Only consider main singer lines for progress tracking
      if (
        !line.isBackup &&
        this.currentTime >= line.startTime &&
        this.currentTime <= line.endTime
      ) {
        return i;
      }
    }

    // Find the closest upcoming main singer line
    for (let i = 0; i < this.lyrics.length; i++) {
      if (!this.lyrics[i].isBackup && this.currentTime < this.lyrics[i].startTime) {
        // Find the previous main singer line (not backup)
        for (let j = i - 1; j >= 0; j--) {
          if (!this.lyrics[j].isBackup) {
            return j;
          }
        }
        // No previous main singer line found, return -1 to trigger progress bar
        return -1;
      }
    }

    // Find the last main singer line
    for (let i = this.lyrics.length - 1; i >= 0; i--) {
      if (!this.lyrics[i].isBackup) {
        return i;
      }
    }

    return -1;
  }

  drawCurrentLyricLine(currentLineIndex, canvasWidth, canvasHeight) {
    if (currentLineIndex < 0 || currentLineIndex >= this.lyrics.length) return;

    const line = this.lyrics[currentLineIndex];

    // Set up font
    this.ctx.font = `${this.settings.fontSize}px ${this.settings.fontFamily}`;
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = this.settings.activeColor; // Light blue for current line

    // Get text from line (KAI format may have different text fields)
    let text = '';
    if (line.text) {
      text = line.text;
    } else if (line.words && line.words.length > 0) {
      // If we have words array, join them
      text = line.words.map((w) => w.text || w.word || w).join(' ');
    }

    if (text && text.trim() !== '') {
      // Handle long text with proper wrapping
      const maxWidth = canvasWidth * 0.9;
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        const testWidth = this.ctx.measureText(testLine).width;

        if (testWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            // Single word is too long, just add it anyway
            lines.push(word);
          }
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      // Draw each line centered vertically
      const lineSpacing = this.settings.lineHeight * 0.9;
      const totalHeight = lines.length * lineSpacing;
      let currentY = canvasHeight / 2 - totalHeight / 2 + lineSpacing;

      lines.forEach((line) => {
        this.drawTextWithBackground(line, canvasWidth / 2, currentY);
        currentY += lineSpacing;
      });
    }
  }

  drawActiveLines(canvasWidth, canvasHeight, skipUpcoming = false) {
    if (!this.lyrics) return;

    // Update backup singer animations first
    this.updateBackupAnimations();

    // Find all active lines at current time (both main and backup singers)
    const activeLines = [];
    // Use interpolated time for precise 60fps lyric timing
    const now = this.getInterpolatedTime();

    // First pass: Check if there are any active main singers (BEFORE filtering transitions)
    // This prevents upcoming lyrics from showing when a main singer just became active
    let hasActiveMainSinger = false;
    for (let i = 0; i < this.lyrics.length; i++) {
      const line = this.lyrics[i];
      if (!line.isDisabled && !line.isBackup && now >= line.startTime && now <= line.endTime) {
        hasActiveMainSinger = true;
        break;
      }
    }

    for (let i = 0; i < this.lyrics.length; i++) {
      const line = this.lyrics[i];

      // Skip lines that are currently transitioning (prevents double rendering)
      if (this.lyricTransitions.has(i)) {
        continue;
      }

      // Skip lines that are hidden during transitions (prevents overlap)
      if (this.hiddenDuringTransition.has(i)) {
        continue;
      }

      if (!line.isDisabled && now >= line.startTime && now <= line.endTime) {
        activeLines.push({ ...line, index: i });
      }
    }

    // Separate main and backup singers
    const mainLines = activeLines.filter((line) => !line.isBackup);
    const backupLines = activeLines.filter((line) => line.isBackup);

    // Calculate vertical positioning - stack multiple lines if needed
    const totalLines = Math.max(1, mainLines.length + backupLines.length); // At least 1 for spacing calculation
    const lineSpacing = this.settings.lineHeight * 1.2;
    const totalHeight = totalLines * lineSpacing;
    let currentY = canvasHeight / 2 - totalHeight / 2 + lineSpacing - 180; // Move up by 180 pixels for more room below

    // Draw main singer lines
    mainLines.forEach((line) => {
      const nextY = this.drawSingleLine(line, canvasWidth, currentY, false); // false = main singer
      currentY = nextY || currentY + lineSpacing; // Use returned Y or fallback to old spacing
    });

    // Draw backup singer lines below main singers with animation
    backupLines.forEach((line) => {
      const animation = this.backupAnimations.get(line.index);
      const alpha = animation ? animation.alpha : this.settings.backupMaxAlpha;
      const nextY = this.drawSingleLine(line, canvasWidth, currentY, true, alpha); // true = backup singer
      currentY = nextY || currentY + lineSpacing; // Use returned Y or fallback to old spacing
    });

    // Save the bottom position after drawing active lyrics (only if there were active lyrics)
    const hasActiveLyrics = activeLines.length > 0;
    if (hasActiveLyrics) {
      this.lastActiveLyricsBottom = currentY;
    }

    // Calculate upcoming position for both animations and drawing
    // If there are transitioning lyrics but no active lyrics, estimate position based on transitions
    let upcomingY = (this.lastActiveLyricsBottom || currentY) + 10;

    // If we have transitioning lyrics but no active lyrics (e.g., intro just ended),
    // position upcoming below the transitioning lyric's current position
    if (!hasActiveLyrics && this.lyricTransitions.size > 0) {
      // Find the lowest transitioning lyric position
      let lowestTransitionY = 0;
      for (const [_lineIndex, transition] of this.lyricTransitions.entries()) {
        const transitionY =
          transition.startY + (transition.endY - transition.startY) * transition.progress;
        lowestTransitionY = Math.max(lowestTransitionY, transitionY);
      }
      if (lowestTransitionY > 0) {
        upcomingY = lowestTransitionY + this.settings.lineHeight * 1.5; // Position below with spacing
      }
    }

    // Check for lyrics transitioning from upcoming to active and start animations
    this.startTransitionAnimations(activeLines, upcomingY);

    // Draw transitioning lyrics (animating from upcoming to active)
    for (const [lineIndex, transition] of this.lyricTransitions.entries()) {
      const lyricLine = this.lyrics[lineIndex];
      if (lyricLine) {
        this.drawTransitioningLine(lyricLine, canvasWidth, transition);
      }
    }

    // Draw upcoming lyrics if enabled and not skipped (positioned dynamically after current lyrics)
    // BUT don't draw upcoming lyrics if:
    // 1. There are active transitions (prevents flash during intro->first lyric)
    // 2. There are active main singer lyrics (only show upcoming during intro/outro/gaps)
    if (
      !skipUpcoming &&
      this.waveformPreferences.showUpcomingLyrics &&
      this.lyricTransitions.size === 0 &&
      !hasActiveMainSinger
    ) {
      this.drawUpcomingLyrics(canvasWidth, canvasHeight, upcomingY);
    }
  }

  drawSingleLine(line, canvasWidth, yPosition, isBackup, alpha = 1.0) {
    // Set up font (italic for backup singers)
    if (isBackup) {
      this.ctx.font = `italic ${this.settings.fontSize}px ${this.settings.fontFamily}`;
    } else {
      this.ctx.font = `${this.settings.fontSize}px ${this.settings.fontFamily}`;
    }
    this.ctx.textAlign = 'center';

    // Save context for alpha manipulation
    this.ctx.save();

    // Apply alpha for backup singers
    if (isBackup) {
      this.ctx.globalAlpha = alpha;
    }

    // Choose colors based on singer type
    this.ctx.fillStyle = isBackup ? this.settings.backupActiveColor : this.settings.activeColor;

    // Get text from line
    let text = '';
    if (line.text) {
      text = line.text;
    } else if (line.words && line.words.length > 0) {
      text = line.words.map((w) => w.text || w.word || w).join(' ');
    }

    if (text && text.trim() !== '') {
      // Handle long text with proper wrapping
      const maxWidth = canvasWidth * 0.9;
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        const testWidth = this.ctx.measureText(testLine).width;

        if (testWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            lines.push(word);
          }
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      // Draw each wrapped line
      let finalY = yPosition;
      lines.forEach((textLine, index) => {
        const adjustedY = yPosition + index * this.settings.lineHeight * 0.8;
        finalY = adjustedY + this.settings.lineHeight * 0.8; // Bottom of this line

        // Add visual indicator for backup singers (prefix)
        if (isBackup) {
          const prefixedText = `♪ ${textLine}`;
          this.drawTextWithBackground(prefixedText, canvasWidth / 2, adjustedY);
        } else {
          this.drawTextWithBackground(textLine, canvasWidth / 2, adjustedY);
        }
      });

      // Restore context (removes alpha changes)
      this.ctx.restore();

      // Return the bottom Y position after all wrapped lines
      return finalY;
    }

    // Restore context (removes alpha changes)
    this.ctx.restore();

    // Return null if no text was drawn (fallback to old spacing)
    return null;
  }

  updateBackupAnimations() {
    if (!this.lyrics) return;

    // Use interpolated time for smooth 60fps backup singer fade animations
    const now = this.getInterpolatedTime();
    const _frameDelta = 16; // Assuming 60fps (16ms per frame)

    for (let i = 0; i < this.lyrics.length; i++) {
      const line = this.lyrics[i];

      // Skip non-backup or disabled lines
      if (!line.isBackup || line.isDisabled) {
        this.backupAnimations.delete(i);
        continue;
      }

      const isActive = now >= line.startTime && now <= line.endTime;
      const animation = this.backupAnimations.get(i) || {
        alpha: this.settings.backupMinAlpha,
        fadeDirection: 0, // 0 = stable, 1 = fading in, -1 = fading out
        lastStateChange: now,
      };

      // Determine if we need to change fade direction
      const targetAlpha = isActive ? this.settings.backupMaxAlpha : this.settings.backupMinAlpha;
      let newFadeDirection = 0;

      if (isActive && animation.alpha < this.settings.backupMaxAlpha) {
        newFadeDirection = 1; // Fade in
      } else if (!isActive && animation.alpha > this.settings.backupMinAlpha) {
        newFadeDirection = -1; // Fade out
      }

      // Update fade direction if it changed
      if (newFadeDirection !== animation.fadeDirection) {
        animation.fadeDirection = newFadeDirection;
        animation.lastStateChange = now;
      }

      // Calculate alpha based on fade direction
      if (animation.fadeDirection !== 0) {
        const elapsed = now - animation.lastStateChange;
        const progress = Math.min(elapsed / this.settings.backupFadeDuration, 1.0);

        // Apply easing (simple ease-out)
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        if (animation.fadeDirection === 1) {
          // Fading in
          animation.alpha =
            this.settings.backupMinAlpha +
            (this.settings.backupMaxAlpha - this.settings.backupMinAlpha) * easedProgress;
        } else {
          // Fading out
          animation.alpha =
            this.settings.backupMaxAlpha -
            (this.settings.backupMaxAlpha - this.settings.backupMinAlpha) * easedProgress;
        }

        // Stop fading when complete
        if (progress >= 1.0) {
          animation.fadeDirection = 0;
          animation.alpha = targetAlpha;
        }
      }

      // Store the updated animation
      this.backupAnimations.set(i, animation);
    }

    // Clean up animations for lines that no longer exist
    for (const [lineIndex] of this.backupAnimations) {
      if (lineIndex >= this.lyrics.length) {
        this.backupAnimations.delete(lineIndex);
      }
    }
  }

  wrapWordsToLines(words, maxWidth) {
    const lines = [];
    let currentLine = [];
    let currentWidth = 0;

    words.forEach((word, index) => {
      const wordWidth = this.ctx.measureText(word.text).width;
      const spaceWidth = index > 0 ? this.settings.wordSpacing : 0;
      const totalWidth = currentWidth + spaceWidth + wordWidth;

      if (totalWidth <= maxWidth || currentLine.length === 0) {
        // Add word to current line
        currentLine.push(word);
        currentWidth = totalWidth;
      } else {
        // Start new line
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = [word];
        currentWidth = wordWidth;
      }
    });

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return lines;
  }

  drawWordLine(words, centerX, y, maxWidth, isCurrentLine) {
    // Calculate total width of this line
    const totalWidth = words.reduce((width, word, index) => {
      const wordWidth = this.ctx.measureText(word.text).width;
      const spacing = index < words.length - 1 ? this.settings.wordSpacing : 0;
      return width + wordWidth + spacing;
    }, 0);

    // Start position for centering
    let x = centerX - totalWidth / 2;

    words.forEach((word, _index) => {
      const isActiveWord =
        isCurrentLine && this.currentTime >= word.startTime && this.currentTime <= word.endTime;

      // Set color
      this.ctx.fillStyle = isActiveWord
        ? this.settings.activeColor
        : isCurrentLine
          ? '#CCCCCC'
          : this.settings.textColor;

      // Draw word
      this.ctx.textAlign = 'left';
      this.drawTextWithBackground(word.text, x, y);

      // Draw bouncing ball for active word
      if (isActiveWord && isCurrentLine) {
        this.drawBouncingBall(x, word, y);
      }

      // Move to next word position
      const wordWidth = this.ctx.measureText(word.text).width;
      x += wordWidth + this.settings.wordSpacing;
    });
  }

  isInInstrumentalIntro() {
    if (!this.lyrics || this.lyrics.length === 0) return false;

    const now = this.getInterpolatedTime();
    const firstLine = this.lyrics[0];

    if (!firstLine) return false;

    // Check if we're before the first lyric starts
    return now < firstLine.startTime;
  }

  isInInstrumentalOutro() {
    if (!this.lyrics || this.lyrics.length === 0 || !this.songDuration) return false;

    const now = this.getInterpolatedTime();
    // Find the last enabled main singer line (not backup, not disabled)
    let lastMainLine = null;
    for (let i = this.lyrics.length - 1; i >= 0; i--) {
      const line = this.lyrics[i];
      if (!line.isBackup && !line.isDisabled) {
        lastMainLine = line;
        break;
      }
    }

    if (!lastMainLine) return false;

    // Check if we're after the last main singer line and there's enough outro time
    const outroLength = this.songDuration - lastMainLine.endTime;
    return now > lastMainLine.endTime && outroLength > 0;
  }

  getLastMainSingerLine() {
    if (!this.lyrics) return null;

    // Find the last enabled main singer line (not backup, not disabled)
    for (let i = this.lyrics.length - 1; i >= 0; i--) {
      const line = this.lyrics[i];
      if (!line.isBackup && !line.isDisabled) {
        return line;
      }
    }
    return null;
  }

  isInInstrumentalGap(currentLineIndex) {
    if (!this.lyrics || currentLineIndex < 0) return false;

    const now = this.getInterpolatedTime();
    const currentLine = this.lyrics[currentLineIndex];

    // Find the NEXT MAIN SINGER line (skip backup singers)
    let nextMainLine = null;
    for (let i = currentLineIndex + 1; i < this.lyrics.length; i++) {
      if (!this.lyrics[i].isBackup && !this.lyrics[i].isDisabled) {
        nextMainLine = this.lyrics[i];
        break;
      }
    }

    if (!currentLine || !nextMainLine) return false;

    const currentLineEnd = currentLine.endTime;
    const nextLineStart = nextMainLine.startTime;
    const gapDuration = nextLineStart - currentLineEnd;

    // Only consider it an instrumental gap if it's longer than 5 seconds
    if (gapDuration <= 5) return false;

    // Check if we're currently in the gap between main singers
    return now >= currentLineEnd && now <= nextLineStart;
  }

  isInMainSingerInstrumentalGap() {
    if (!this.lyrics) return { isInGap: false };

    const now = this.getInterpolatedTime();

    // Find the last main singer line that has ended
    let lastMainLine = null;
    let lastMainLineIndex = -1;
    for (let i = 0; i < this.lyrics.length; i++) {
      const line = this.lyrics[i];
      if (!line.isBackup && !line.isDisabled && now >= line.endTime) {
        lastMainLine = line;
        lastMainLineIndex = i;
      }
    }

    if (!lastMainLine) return { isInGap: false };

    // Find the next main singer line that hasn't started yet
    let nextMainLine = null;
    for (let i = lastMainLineIndex + 1; i < this.lyrics.length; i++) {
      const line = this.lyrics[i];
      if (!line.isBackup && !line.isDisabled && now < line.startTime) {
        nextMainLine = line;
        break;
      }
    }

    if (!nextMainLine) return { isInGap: false };

    const gapDuration = nextMainLine.startTime - lastMainLine.endTime;

    // Only consider it an instrumental gap if it's longer than 5 seconds
    if (gapDuration <= 5) return { isInGap: false };

    // Check if we're currently in the gap between main singers
    const isInGap = now >= lastMainLine.endTime && now <= nextMainLine.startTime;

    return {
      isInGap,
      lastMainLineIndex,
      nextMainLine,
      gapProgress: isInGap ? (now - lastMainLine.endTime) / gapDuration : 0,
    };
  }

  drawInstrumentalProgressBar(currentLineIndex, canvasWidth, canvasHeight) {
    if (!this.lyrics || currentLineIndex < 0) return;

    // Use interpolated time for smooth 60fps progress bar
    const now = this.getInterpolatedTime();
    const currentLine = this.lyrics[currentLineIndex];

    // Find the next main singer line (skip backup singers and disabled lines)
    let nextMainLine = null;
    // let nextMainLineIndex = -1; // Reserved for future use
    for (let i = currentLineIndex + 1; i < this.lyrics.length; i++) {
      if (!this.lyrics[i].isBackup && !this.lyrics[i].isDisabled) {
        nextMainLine = this.lyrics[i];
        // nextMainLineIndex = i;
        break;
      }
    }

    if (!currentLine || !nextMainLine) return;

    // Check if we're in an instrumental section (between current line end and next main line start)
    const currentLineEnd = currentLine.endTime;
    const nextLineStart = nextMainLine.startTime;
    const gapDuration = nextLineStart - currentLineEnd;

    // Only show progress bar for instrumental gaps longer than 5 seconds
    if (gapDuration <= 5) return;

    // Are we currently in the instrumental gap?
    if (now >= currentLineEnd && now <= nextLineStart) {
      // We're in the instrumental section - show progress bar and upcoming lyrics
      const gapProgress = (now - currentLineEnd) / gapDuration;
      const _timeRemaining = nextLineStart - now;

      // Draw progress bar at top
      const barWidth = canvasWidth * 0.8;
      const barX = (canvasWidth - barWidth) / 2;
      const barY = 80;

      const _barInfo = this.drawProgressBar(
        barX,
        barY,
        barWidth,
        undefined,
        gapProgress,
        canvasWidth
      );

      // Draw upcoming lyrics preview below progress bar with proper spacing
      this.drawUpcomingLyricsPreview(
        nextMainLine,
        canvasWidth,
        canvasHeight,
        gapProgress,
        barY + this.settings.progressBarMargin
      );

      // Draw any active backup singers during the instrumental gap (but skip upcoming lyrics since we already showed them)
      this.drawActiveLines(canvasWidth, canvasHeight, true); // true = skip upcoming lyrics
    }
  }

  drawInstrumentalIntro(canvasWidth, canvasHeight) {
    if (!this.lyrics || this.lyrics.length === 0) return;

    // Use interpolated time for smooth 60fps progress bar
    const now = this.getInterpolatedTime();
    const firstLine = this.lyrics[0];

    if (!firstLine) return;

    const introDuration = firstLine.startTime;
    const introProgress = now / introDuration;

    // Draw progress bar at top
    const barWidth = canvasWidth * 0.8;
    const barX = (canvasWidth - barWidth) / 2;
    const barY = 80;

    const _barInfo = this.drawProgressBar(
      barX,
      barY,
      barWidth,
      undefined,
      introProgress,
      canvasWidth
    );

    // Calculate where the upcoming lyric is being drawn
    const upcomingY = barY + this.settings.progressBarMargin;

    // Lock the first lyric as upcoming during intro
    if (this.lockedUpcomingIndex !== 0) {
      this.lockedUpcomingIndex = 0;
    }

    // Check if we should start the transition animation (0.3s before first lyric starts)
    // This ensures smooth transition from intro preview to active lyric
    this.startTransitionAnimations([], upcomingY);

    // Draw transitioning lyrics if animation has started
    for (const [lineIndex, transition] of this.lyricTransitions.entries()) {
      const lyricLine = this.lyrics[lineIndex];
      if (lyricLine) {
        this.drawTransitioningLine(lyricLine, canvasWidth, transition);
      }
    }

    // Draw upcoming first lyrics with proper spacing (if not transitioning)
    if (!this.lyricTransitions.has(0)) {
      this.drawUpcomingLyricsPreview(
        firstLine,
        canvasWidth,
        canvasHeight,
        introProgress,
        upcomingY
      );
    }
  }

  drawInstrumentalOutro(canvasWidth, canvasHeight) {
    // Find the last main singer line to calculate outro progress
    const lastMainLine = this.getLastMainSingerLine();
    if (!lastMainLine) return;

    // Use interpolated time for smooth 60fps progress bar
    const currentTime = this.getInterpolatedTime();
    const outroStartTime = lastMainLine.endTime;
    const outroLength = this.songDuration - outroStartTime;
    const outroProgress = Math.max(0, Math.min(1, (currentTime - outroStartTime) / outroLength));

    // Draw progress bar at top
    const _barInfo = this.drawProgressBar(
      undefined,
      undefined,
      undefined,
      undefined,
      outroProgress,
      canvasWidth
    );

    // Show outro message below progress bar
    this.ctx.fillStyle = this.settings.textColor;
    this.ctx.font = `${this.settings.fontSize}px ${this.settings.fontFamily}`;
    this.ctx.textAlign = 'center';

    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    this.drawTextWithBackground('♫ Instrumental Outro ♫', centerX, centerY);
  }

  drawBackupOnlyProgressBar(canvasWidth, canvasHeight) {
    if (!this.lyrics) return;

    // Use interpolated time for smooth 60fps progress bar
    const now = this.getInterpolatedTime();

    // Check if there's an active main singer at interpolated time
    // (prevents flash when interpolated time is ahead of reported time)
    for (let i = 0; i < this.lyrics.length; i++) {
      const line = this.lyrics[i];
      if (!line.isBackup && !line.isDisabled && now >= line.startTime && now <= line.endTime) {
        // There's an active main singer, don't show backup-only progress bar
        return;
      }
    }

    // Find the next main singer line
    let nextMainLine = null;
    for (let i = 0; i < this.lyrics.length; i++) {
      if (
        !this.lyrics[i].isBackup &&
        !this.lyrics[i].isDisabled &&
        now < this.lyrics[i].startTime
      ) {
        nextMainLine = this.lyrics[i];
        break;
      }
    }

    if (!nextMainLine) return;

    // Find when the backup-only period started (either song start or end of last main line)
    let gapStart = 0;
    for (let i = this.lyrics.length - 1; i >= 0; i--) {
      if (!this.lyrics[i].isBackup && !this.lyrics[i].isDisabled && this.lyrics[i].endTime <= now) {
        gapStart = this.lyrics[i].endTime;
        break;
      }
    }

    const gapDuration = nextMainLine.startTime - gapStart;

    // Only show progress bar for gaps longer than 5 seconds
    if (gapDuration <= 5) return;

    // Calculate progress
    const gapProgress = (now - gapStart) / gapDuration;

    // Draw progress bar at top
    const barWidth = canvasWidth * 0.8;
    const barX = (canvasWidth - barWidth) / 2;
    const barY = 80;

    const _barInfo = this.drawProgressBar(
      barX,
      barY,
      barWidth,
      undefined,
      gapProgress,
      canvasWidth
    );

    // Draw upcoming main lyrics preview
    this.drawUpcomingLyricsPreview(
      nextMainLine,
      canvasWidth,
      canvasHeight,
      gapProgress,
      barY + this.settings.progressBarMargin
    );

    // Still render any active backup singers below the progress bar
    this.drawActiveLines(canvasWidth, canvasHeight);
  }

  drawUpcomingLyricsPreview(nextLine, canvasWidth, canvasHeight, progress, startY) {
    if (!nextLine) return;

    // Get text from line (handle different KAI formats)
    let text = '';
    if (nextLine.text) {
      text = nextLine.text;
    } else if (nextLine.words && nextLine.words.length > 0) {
      text = nextLine.words.map((w) => w.text || w.word || w).join(' ');
    }

    if (!text || text.trim() === '') return;

    // Set font for upcoming lyrics (same size as current line)
    this.ctx.font = `${this.settings.fontSize}px ${this.settings.fontFamily}`;
    this.ctx.textAlign = 'center';

    // Determine color based on readiness
    const isReady = progress >= 1.0;
    this.ctx.fillStyle = isReady ? this.settings.activeColor : this.settings.upcomingColor;

    // Handle long text with proper wrapping
    const maxWidth = canvasWidth * 0.9;
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const testWidth = this.ctx.measureText(testLine).width;

      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Single word is too long, just add it anyway
          lines.push(word);
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    // Draw each line below the progress bar (consistent with other functions)
    const lineSpacing = this.settings.lineHeight * 0.8;
    let currentY = startY + 60; // Start below the progress bar with some padding

    lines.forEach((line) => {
      this.drawTextWithBackground(line, canvasWidth / 2, currentY);
      currentY += lineSpacing;
    });
  }

  wrapWordsToLinesPreview(words, maxWidth) {
    const lines = [];
    let currentLine = [];
    let currentWidth = 0;

    words.forEach((word, index) => {
      const wordWidth = this.ctx.measureText(word).width;
      const spaceWidth = index > 0 ? this.settings.wordSpacing : 0;
      const totalWidth = currentWidth + spaceWidth + wordWidth;

      if (totalWidth <= maxWidth || currentLine.length === 0) {
        currentLine.push(word);
        currentWidth = totalWidth;
      } else {
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = [word];
        currentWidth = wordWidth;
      }
    });

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return lines;
  }

  drawWordLinePreview(words, centerX, y, maxWidth, textColor, isReady) {
    // Calculate total width of this line
    const totalWidth = words.reduce((width, word, index) => {
      const wordWidth = this.ctx.measureText(word).width;
      const spacing = index < words.length - 1 ? this.settings.wordSpacing : 0;
      return width + wordWidth + spacing;
    }, 0);

    // Start position for centering
    let x = centerX - totalWidth / 2;

    words.forEach((word, _index) => {
      this.ctx.fillStyle = textColor;
      this.ctx.textAlign = 'left';

      // Add subtle glow effect when ready
      if (isReady) {
        this.ctx.save();
        this.ctx.shadowColor = this.settings.activeColor;
        this.ctx.shadowBlur = 4;
        this.ctx.fillText(word, x, y);
        this.ctx.restore();
      } else {
        this.ctx.fillText(word, x, y);
      }

      // Move to next word position
      const wordWidth = this.ctx.measureText(word).width;
      x += wordWidth + this.settings.wordSpacing;
    });
  }

  drawTextWithBackground(text, x, y) {
    // Measure text dimensions properly
    const metrics = this.ctx.measureText(text);
    const textWidth = metrics.width;
    const textAscent = metrics.actualBoundingBoxAscent || this.settings.fontSize * 0.8;
    const textDescent = metrics.actualBoundingBoxDescent || this.settings.fontSize * 0.2;
    const textHeight = textAscent + textDescent;

    // Calculate background rectangle with padding (10% larger)
    const padding = 12;
    const extraSize = 0.1; // 10% bigger
    const bgWidth = (textWidth + padding * 2) * (1 + extraSize);
    const bgHeight = (textHeight + padding) * (1 + extraSize);

    // Center the larger background around the text
    const bgX = x - bgWidth / 2;
    const bgY = y - textAscent - (bgHeight - textHeight) / 2;
    const borderRadius = 12;

    // Draw rounded background
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    this.ctx.beginPath();
    this.ctx.roundRect(bgX, bgY, bgWidth, bgHeight, borderRadius);
    this.ctx.fill();
    this.ctx.restore();

    // Draw main text
    this.ctx.fillText(text, x, y);
  }

  drawProgressBar(x, y, width, height, progress, canvasWidth) {
    // Default positioning if not provided
    const barX = x !== undefined ? x : 50;
    const barY = y !== undefined ? y : 50;
    const barWidth = width !== undefined ? width : canvasWidth - 100;
    const barHeight = height !== undefined ? height : this.settings.progressBarHeight;

    // Progress bar background
    this.ctx.fillStyle = this.settings.progressBarBg;
    this.ctx.fillRect(barX, barY, barWidth, barHeight);

    // Progress fill
    this.ctx.fillStyle = this.settings.progressBarColor;
    this.ctx.fillRect(barX, barY, barWidth * Math.max(0, Math.min(1, progress)), barHeight);

    return { barX, barY, barWidth, barHeight };
  }

  drawBouncingBall(x, word, lineY) {
    // Calculate ball position based on progress through word
    const progress = (this.currentTime - word.startTime) / (word.endTime - word.startTime);
    const wordWidth = this.ctx.measureText(word.text).width;

    const ballX = x + progress * wordWidth;
    const ballY = lineY - 30 + Math.sin(progress * Math.PI * 4) * 5; // Bouncing effect

    // Draw ball
    this.ctx.save();
    this.ctx.fillStyle = this.settings.ballColor;
    this.ctx.beginPath();
    this.ctx.arc(ballX, ballY, this.settings.ballSize, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  // Draw song info when loaded but not playing
  drawSongInfo(width, height, songData) {
    const ctx = this.ctx;
    ctx.save();

    // Get song info from various possible locations
    const title =
      songData.title ||
      songData.metadata?.title ||
      songData.name?.replace('.kai', '') ||
      'Unknown Title';
    const artist = songData.artist || songData.metadata?.artist || 'Unknown Artist';
    const requester = songData.requester;

    // Center position
    const centerX = width / 2;
    const centerY = height / 2;

    // Draw title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Add text shadow for better visibility
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillText(title, centerX, centerY - 50);

    // Draw artist
    ctx.fillStyle = '#cccccc';
    ctx.font = '48px Arial, sans-serif';
    ctx.fillText(artist, centerX, centerY + 50);

    // Draw singer/requester if present
    if (requester) {
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '36px Arial, sans-serif';
      ctx.fillText(`Singer: ${requester}`, centerX, centerY + 120);
    }

    ctx.restore();
  }

  destroy() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    // Clean up resize listener
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }

    // Destroy Butterchurn instance and ALL related components
    if (this.butterchurn && this.butterchurn.destroy) {
      this.butterchurn.destroy();
    }
    this.butterchurn = null;

    // Disconnect and clean up all Butterchurn audio nodes
    if (this.butterchurnSourceNode) {
      this.butterchurnSourceNode.disconnect();
      this.butterchurnSourceNode = null;
    }

    // Close Butterchurn audio context
    if (this.butterchurnAudioContext) {
      this.butterchurnAudioContext.close();
      this.butterchurnAudioContext = null;
    }

    // Clear all Butterchurn-related properties
    this.butterchurnAnalyser = null;
    this.butterchurnVisualAnalyser = null;
    this.butterchurnFrequencyData = null;
    this.butterchurnAudioBuffer = null;
    this.effectsCanvas = null;

    // Close waveform audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Stop microphone capture properly
    this.stopMicrophoneCapture();

    // Clear WebGL context if available
    if (this.gl) {
      this.gl = null;
    }
  }

  reinitialize() {
    // Store current preferences
    const currentPreferences = { ...this.waveformPreferences };

    // Destroy everything
    this.destroy();

    // Reset state variables
    this.lyrics = null;
    this.songDuration = 0;
    this.currentTime = 0;
    this.isPlaying = false;
    this.cachedCurrentLine = -1;
    this.lastTimeForLineCalculation = -1;
    this.backupAnimations.clear();

    // Restore preferences
    this.waveformPreferences = currentPreferences;

    // Reinitialize everything
    this.setupCanvas();
    this.setupAdvancedVisualizations();
    this.setupResponsiveCanvas();
    this.startAnimation();

    // Restart microphone if it was enabled (with delay to prevent issues)
    if (this.waveformPreferences.enableMic) {
      setTimeout(async () => {
        // Ensure the input device selection is properly restored before starting
        await this.ensureInputDeviceSelection();
        this.startMicrophoneCapture();
      }, 200); // Extra delay after reinitialize to let everything settle
    }
  }

  async ensureInputDeviceSelection() {
    try {
      // Load saved input device preference from settings API
      if (window.kaiAPI.settings) {
        const prefs = await window.kaiAPI.settings.get('devicePreferences');
        if (prefs && prefs.input && prefs.input.id) {
          this.inputDevice = prefs.input.id;
        }
      }
    } catch (error) {
      console.warn('Failed to load input device preference:', error);
    }
  }

  setShowUpcomingLyrics(enabled) {
    this.waveformPreferences.showUpcomingLyrics = enabled;
  }

  drawUpcomingLyrics(canvasWidth, canvasHeight, startY) {
    if (!this.lyrics) return;

    // Use interpolated time for precise upcoming lyric detection
    const now = this.getInterpolatedTime();
    const maxTimeAhead = 5.0; // Only show lyrics up to 5 seconds ahead

    // Check if current locked upcoming has become active - only then clear it
    if (this.lockedUpcomingIndex !== null && this.lockedUpcomingIndex !== undefined) {
      const lockedLine = this.lyrics[this.lockedUpcomingIndex];

      // Don't clear if this lyric is currently transitioning (prevents second lyric from flashing)
      const isTransitioning = this.lyricTransitions.has(this.lockedUpcomingIndex);

      // Only clear if the line doesn't exist or has actually become active AND is not transitioning
      if (!lockedLine || (now >= lockedLine.startTime && !isTransitioning)) {
        this.lockedUpcomingIndex = null;
      }
    }

    // If no locked upcoming or it became active, find the next one
    // BUT don't search if there are any transitioning lyrics (wait for them to finish)
    if (
      (this.lockedUpcomingIndex === null || this.lockedUpcomingIndex === undefined) &&
      this.lyricTransitions.size === 0
    ) {
      // Find the next upcoming lyric that starts after now
      let nextUpcomingIndex = null;
      let closestStartTime = Infinity;

      for (let i = 0; i < this.lyrics.length; i++) {
        const line = this.lyrics[i];
        if (
          !line.isDisabled &&
          !line.isBackup &&
          line.startTime > now &&
          line.startTime <= now + maxTimeAhead &&
          line.startTime < closestStartTime
        ) {
          nextUpcomingIndex = i;
          closestStartTime = line.startTime;
        }
      }

      this.lockedUpcomingIndex = nextUpcomingIndex;
    }

    // If still no upcoming, return
    if (this.lockedUpcomingIndex === null || this.lockedUpcomingIndex === undefined) return;

    const lockedLine = this.lyrics[this.lockedUpcomingIndex];
    if (!lockedLine) {
      this.lockedUpcomingIndex = null;
      return;
    }

    // Double-check it's not active (this shouldn't happen with the logic above)
    if (now >= lockedLine.startTime) {
      this.lockedUpcomingIndex = null;
      return;
    }

    // Don't draw if this lyric is currently transitioning/animating
    if (this.lyricTransitions.has(this.lockedUpcomingIndex)) {
      return;
    }

    // Draw the locked upcoming lyric
    this.ctx.save();
    this.ctx.font = `${this.settings.fontSize}px ${this.settings.fontFamily}`;
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#999999';
    this.ctx.globalAlpha = 0.8;

    const currentY = startY;

    // Get text from line
    let text = '';
    if (lockedLine.text) {
      text = lockedLine.text;
    } else if (lockedLine.words && lockedLine.words.length > 0) {
      text = lockedLine.words.map((w) => w.text || w.word || w).join(' ');
    }

    if (text) {
      this.drawWrappedText(text, canvasWidth / 2, currentY, canvasWidth * 0.9);
    }

    this.ctx.restore();
  }

  drawWrappedText(text, x, y, maxWidth) {
    const words = text.split(' ');
    let currentLine = '';
    let linesRendered = 0;
    const lineHeight = this.settings.fontSize * 1.2; // Match font size with some line spacing

    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine + (currentLine ? ' ' : '') + words[i];
      const testWidth = this.ctx.measureText(testLine).width;

      if (testWidth > maxWidth && currentLine) {
        // Draw current line and start new line
        this.drawTextWithBackground(currentLine, x, y);
        y += lineHeight;
        linesRendered++;
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }

    // Draw the final line
    if (currentLine) {
      this.drawTextWithBackground(currentLine, x, y);
      linesRendered++;
    }

    return linesRendered;
  }

  updateLyricTransitions(currentActiveLines, now, currentActiveEndY) {
    // Get current upcoming lyrics
    const upcomingLines = [];
    if (this.lyrics) {
      for (let i = 0; i < this.lyrics.length; i++) {
        const line = this.lyrics[i];
        if (
          !line.isDisabled &&
          !line.isBackup &&
          line.startTime > now &&
          line.startTime <= now + 5.0
        ) {
          upcomingLines.push({ ...line, index: i });
          break; // Only track the very next one for transitions
        }
      }
    }

    // Check for lyrics that should start transitioning (0.5 seconds before they become active)
    for (const upcomingLine of upcomingLines) {
      const timeToStart = upcomingLine.startTime - now;
      if (timeToStart <= 0.5 && timeToStart > 0 && !this.lyricTransitions.has(upcomingLine.index)) {
        // Use the EXACT position where the upcoming line was just displayed
        let upcomingPosition;
        if (
          this.lastUpcomingDisplayY !== null &&
          this.lastUpcomingLineIndex === upcomingLine.index
        ) {
          upcomingPosition = this.lastUpcomingDisplayY;
        } else {
          // Fallback calculation
          upcomingPosition = currentActiveEndY + 50;
        }

        const activePosition = this.canvas.height / 2 - 180; // Where active is shown (higher up)

        this.lyricTransitions.set(upcomingLine.index, {
          startTime: now,
          duration: this.settings.lyricTransitionDuration,
          progress: 0,
          startY: upcomingPosition, // EXACT position where it was displayed
          endY: activePosition, // Higher on screen (lower Y value)
        });
      }
    }

    // Update existing transitions
    for (const [lineIndex, transition] of this.lyricTransitions.entries()) {
      const elapsed = now - transition.startTime;

      // Update progress (let transitions complete naturally)
      const newProgress = Math.min(1.0, elapsed / transition.duration);
      transition.progress = newProgress;

      // Remove completed transitions
      if (transition.progress >= 1.0) {
        this.lyricTransitions.delete(lineIndex);
      }
    }
  }

  startTransitionAnimations(activeLines, upcomingY) {
    // Use interpolated time for smooth 60fps lyric slide animations
    const now = this.getInterpolatedTime();

    // Check if locked upcoming lyric should start animating
    if (this.lockedUpcomingIndex !== null && this.lockedUpcomingIndex !== undefined) {
      const upcomingLine = this.lyrics[this.lockedUpcomingIndex];
      if (upcomingLine) {
        const timeUntilActive = upcomingLine.startTime - now;

        // Start animation before the lyric becomes active
        if (timeUntilActive <= this.settings.lyricTransitionStartBefore && timeUntilActive > 0) {
          // Only start if not already animating
          if (!this.lyricTransitions.has(this.lockedUpcomingIndex)) {
            // Calculate active position (same as drawActiveLines)
            const canvasHeight = this.canvas.height;
            const lineSpacing = this.settings.lineHeight * 1.2;

            // Check if there are any current main lines (to calculate proper position)
            const currentMainLines = activeLines.filter((line) => !line.isBackup);
            const totalLines = Math.max(1, currentMainLines.length);
            const totalHeight = totalLines * lineSpacing;

            // This matches the exact calculation in drawActiveLines
            const activeY = canvasHeight / 2 - totalHeight / 2 + lineSpacing - 180;

            // Start the transition
            this.lyricTransitions.set(this.lockedUpcomingIndex, {
              startTime: now,
              duration: this.settings.lyricTransitionDuration,
              progress: 0,
              startY: upcomingY, // Where upcoming lyric is drawn (no offset)
              endY: activeY,
            });

            // Hide any currently active main lines that will overlap with this transition
            // Check all currently active lines (not just the filtered activeLines array)
            for (let i = 0; i < this.lyrics.length; i++) {
              const line = this.lyrics[i];
              if (!line.isDisabled && !line.isBackup && i !== this.lockedUpcomingIndex) {
                // Check if this line is currently active
                if (now >= line.startTime && now <= line.endTime) {
                  const timeUntilEnd = line.endTime - now;
                  // If active line ends during the transition period, hide it immediately
                  if (timeUntilEnd > 0 && timeUntilEnd <= this.settings.lyricTransitionDuration) {
                    this.hiddenDuringTransition.add(i);
                  }
                }
              }
            }
          }
        }
      }
    }

    // Update existing transitions
    for (const [lineIndex, transition] of this.lyricTransitions.entries()) {
      const elapsed = now - transition.startTime;

      // Update progress
      transition.progress = Math.min(1.0, elapsed / transition.duration);

      // Remove completed transitions (let them finish naturally)
      if (transition.progress >= 1.0) {
        this.lyricTransitions.delete(lineIndex);
      }
    }

    // Clean up hidden lines that are no longer active
    for (const hiddenIndex of this.hiddenDuringTransition) {
      const line = this.lyrics[hiddenIndex];
      if (line && (now > line.endTime || now < line.startTime)) {
        this.hiddenDuringTransition.delete(hiddenIndex);
      }
    }
  }

  drawTransitioningLine(line, canvasWidth, transition) {
    // Simple linear interpolation for position - THIS IS THE ANIMATION
    const currentY =
      transition.startY + (transition.endY - transition.startY) * transition.progress;

    // Interpolate color from upcoming grey to active color
    const startColor = { r: 136, g: 136, b: 136 }; // #888888 (upcoming grey from settings)
    const endColor = { r: 0, g: 191, b: 255 }; // #00BFFF (active blue from settings)

    const r = Math.round(startColor.r + (endColor.r - startColor.r) * transition.progress);
    const g = Math.round(startColor.g + (endColor.g - startColor.g) * transition.progress);
    const b = Math.round(startColor.b + (endColor.b - startColor.b) * transition.progress);

    // Interpolate alpha
    const alpha = 0.8 + (1.0 - 0.8) * transition.progress;

    // Set up context for animated line
    this.ctx.save();
    this.ctx.font = `${this.settings.fontSize}px ${this.settings.fontFamily}`;
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

    // Get text from line
    let text = '';
    if (line.text) {
      text = line.text;
    } else if (line.words && line.words.length > 0) {
      text = line.words.map((w) => w.text || w.word || w).join(' ');
    }

    if (text) {
      // Handle word wrapping during transition to prevent layout jumps
      const maxWidth = canvasWidth * 0.9;
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        const testWidth = this.ctx.measureText(testLine).width;

        if (testWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            lines.push(word);
          }
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      // Draw each wrapped line (match drawSingleLine spacing)
      const lineHeight = this.settings.lineHeight * 0.8;
      lines.forEach((textLine, index) => {
        const adjustedY = currentY + index * lineHeight;
        this.drawTextWithBackground(textLine, canvasWidth / 2, adjustedY);
      });
    }

    this.ctx.restore();
  }
}

// Export removed - KaraokeRenderer is used by PlayerController
// No longer attached to window global

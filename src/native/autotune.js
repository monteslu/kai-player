const EventEmitter = require('events');

class AutotuneEngine extends EventEmitter {
  constructor(sampleRate = 48000) {
    super();
    this.sampleRate = sampleRate;
    this.enabled = false;

    this.settings = {
      strength: 50,
      speed: 20,
      maxCorrection: 100,
      scale: 'chromatic',
      formantPreserve: true,
      key: 'C',
      mode: 'major',
    };

    this.pitchDetector = new PitchDetector(sampleRate);
    this.pitchShifter = new PitchShifter(sampleRate);

    this.targetNotes = this.generateScaleNotes();

    this.processingBuffer = new Float32Array(1024);
    this.outputBuffer = new Float32Array(1024);

    this.initialized = false;
  }

  initialize() {
    try {
      this.pitchDetector.initialize();
      this.pitchShifter.initialize();
      this.initialized = true;
      console.log('Autotune engine initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize autotune engine:', error);
      return false;
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.emit('enabledChanged', enabled);
  }

  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };

    if (settings.key || settings.mode) {
      this.targetNotes = this.generateScaleNotes();
    }

    this.emit('settingsChanged', this.settings);
  }

  generateScaleNotes() {
    const baseFreq = this.keyToFrequency(this.settings.key);
    const intervals = this.getScaleIntervals(this.settings.mode);

    const notes = [];

    for (let octave = 2; octave <= 6; octave++) {
      const octaveMultiplier = Math.pow(2, octave - 4);

      intervals.forEach((interval) => {
        const frequency = baseFreq * octaveMultiplier * Math.pow(2, interval / 12);
        notes.push(frequency);
      });
    }

    return notes.sort((a, b) => a - b);
  }

  keyToFrequency(key) {
    const keyMap = {
      C: 261.63,
      'C#': 277.18,
      Db: 277.18,
      D: 293.66,
      'D#': 311.13,
      Eb: 311.13,
      E: 329.63,
      F: 349.23,
      'F#': 369.99,
      Gb: 369.99,
      G: 392.0,
      'G#': 415.3,
      Ab: 415.3,
      A: 440.0,
      'A#': 466.16,
      Bb: 466.16,
      B: 493.88,
    };

    return keyMap[key] || 261.63;
  }

  getScaleIntervals(mode) {
    const scales = {
      major: [0, 2, 4, 5, 7, 9, 11],
      minor: [0, 2, 3, 5, 7, 8, 10],
      dorian: [0, 2, 3, 5, 7, 9, 10],
      mixolydian: [0, 2, 4, 5, 7, 9, 10],
      chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    };

    return scales[mode] || scales.major;
  }

  process(inputBuffer, outputBuffer) {
    if (!this.initialized || !this.enabled || !inputBuffer || !outputBuffer) {
      if (inputBuffer && outputBuffer) {
        outputBuffer.set(inputBuffer);
      }
      return;
    }

    try {
      const frameSize = Math.min(inputBuffer.length, outputBuffer.length);

      for (let i = 0; i < frameSize; i++) {
        this.processingBuffer[i] = inputBuffer[i];
      }

      const pitch = this.pitchDetector.detectPitch(this.processingBuffer);

      if (pitch.frequency > 80 && pitch.frequency < 1000 && pitch.confidence > 0.5) {
        const targetFreq = this.findClosestTargetNote(pitch.frequency);
        const correction = this.calculateCorrection(pitch.frequency, targetFreq);

        if (Math.abs(correction) > 5) {
          this.pitchShifter.shiftPitch(
            this.processingBuffer,
            this.outputBuffer,
            correction,
            frameSize
          );

          outputBuffer.set(this.outputBuffer.subarray(0, frameSize));
        } else {
          outputBuffer.set(this.processingBuffer.subarray(0, frameSize));
        }

        this.emit('pitchDetected', {
          detected: pitch.frequency,
          target: targetFreq,
          correction: correction,
          confidence: pitch.confidence,
        });
      } else {
        outputBuffer.set(this.processingBuffer.subarray(0, frameSize));
      }
    } catch (error) {
      console.error('Autotune processing error:', error);
      if (inputBuffer && outputBuffer) {
        outputBuffer.set(inputBuffer);
      }
    }
  }

  findClosestTargetNote(frequency) {
    if (this.settings.scale === 'chromatic') {
      const baseFreq = 440;
      const semitone = Math.round(12 * Math.log2(frequency / baseFreq));
      return baseFreq * Math.pow(2, semitone / 12);
    }

    let closest = this.targetNotes[0];
    let minDiff = Math.abs(frequency - closest);

    for (const note of this.targetNotes) {
      const diff = Math.abs(frequency - note);
      if (diff < minDiff) {
        minDiff = diff;
        closest = note;
      }
    }

    return closest;
  }

  calculateCorrection(detected, target) {
    const cents = 1200 * Math.log2(target / detected);
    const maxCorrection = this.settings.maxCorrection;
    const strength = this.settings.strength / 100;
    const speed = this.settings.speed / 100;

    let correction = cents * strength;
    correction = Math.max(-maxCorrection, Math.min(maxCorrection, correction));

    correction *= speed;

    return correction;
  }

  destroy() {
    this.enabled = false;

    if (this.pitchDetector) {
      this.pitchDetector.destroy();
    }

    if (this.pitchShifter) {
      this.pitchShifter.destroy();
    }

    this.initialized = false;
    console.log('Autotune engine destroyed');
  }
}

class PitchDetector {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.bufferSize = 1024;
    this.hopSize = 256;

    this.window = this.createHannWindow(this.bufferSize);
    this.fftBuffer = new Float32Array(this.bufferSize);
    this.spectrum = new Float32Array(this.bufferSize / 2);

    this.autocorrelationBuffer = new Float32Array(this.bufferSize);
    this.inputHistory = new Float32Array(this.bufferSize * 2);
    this.historyIndex = 0;
  }

  initialize() {
    console.log('Pitch detector initialized');
  }

  createHannWindow(size) {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    return window;
  }

  detectPitch(buffer) {
    for (let i = 0; i < buffer.length; i++) {
      this.inputHistory[this.historyIndex] = buffer[i];
      this.historyIndex = (this.historyIndex + 1) % this.inputHistory.length;
    }

    const startIndex =
      (this.historyIndex - this.bufferSize + this.inputHistory.length) % this.inputHistory.length;

    for (let i = 0; i < this.bufferSize; i++) {
      const historyIndex = (startIndex + i) % this.inputHistory.length;
      this.fftBuffer[i] = this.inputHistory[historyIndex] * this.window[i];
    }

    const frequency = this.autocorrelationMethod(this.fftBuffer);
    const confidence = this.calculateConfidence(this.fftBuffer, frequency);

    return { frequency, confidence };
  }

  autocorrelationMethod(buffer) {
    const minPeriod = Math.floor(this.sampleRate / 800);
    const maxPeriod = Math.floor(this.sampleRate / 80);

    this.autocorrelationBuffer.fill(0);

    for (let lag = minPeriod; lag < maxPeriod && lag < buffer.length; lag++) {
      let correlation = 0;
      for (let i = 0; i < buffer.length - lag; i++) {
        correlation += buffer[i] * buffer[i + lag];
      }
      this.autocorrelationBuffer[lag] = correlation;
    }

    let maxCorrelation = 0;
    let bestLag = minPeriod;

    for (let lag = minPeriod; lag < maxPeriod; lag++) {
      if (this.autocorrelationBuffer[lag] > maxCorrelation) {
        maxCorrelation = this.autocorrelationBuffer[lag];
        bestLag = lag;
      }
    }

    if (maxCorrelation > 0.3) {
      return this.sampleRate / bestLag;
    }

    return 0;
  }

  calculateConfidence(buffer, frequency) {
    if (frequency === 0) return 0;

    const rms = Math.sqrt(buffer.reduce((sum, val) => sum + val * val, 0) / buffer.length);

    if (rms < 0.01) return 0;

    const period = this.sampleRate / frequency;
    const periodInt = Math.round(period);

    if (periodInt >= buffer.length) return 0;

    let correlation = 0;
    let energy1 = 0;
    let energy2 = 0;

    const compareLength = Math.min(periodInt, buffer.length - periodInt);

    for (let i = 0; i < compareLength; i++) {
      const val1 = buffer[i];
      const val2 = buffer[i + periodInt];

      correlation += val1 * val2;
      energy1 += val1 * val1;
      energy2 += val2 * val2;
    }

    const normalizedCorrelation = correlation / Math.sqrt(energy1 * energy2);
    return Math.max(0, Math.min(1, normalizedCorrelation));
  }

  destroy() {
    console.log('Pitch detector destroyed');
  }
}

class PitchShifter {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.frameSize = 1024;
    this.overlapFactor = 4;
    this.hopSize = this.frameSize / this.overlapFactor;

    this.window = this.createHannWindow(this.frameSize);
    this.inputBuffer = new Float32Array(this.frameSize * 2);
    this.outputBuffer = new Float32Array(this.frameSize * 2);
    this.grainBuffer = new Float32Array(this.frameSize);

    this.inputIndex = 0;
    this.outputIndex = 0;

    this.grains = [];
    for (let i = 0; i < this.overlapFactor; i++) {
      this.grains.push({
        buffer: new Float32Array(this.frameSize),
        position: 0,
        active: false,
      });
    }
    this.currentGrain = 0;
  }

  initialize() {
    console.log('Pitch shifter initialized');
  }

  createHannWindow(size) {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    return window;
  }

  shiftPitch(input, output, centsShift, length) {
    const pitchRatio = Math.pow(2, centsShift / 1200);
    const timeStretchRatio = 1.0 / pitchRatio;

    for (let i = 0; i < length; i++) {
      this.inputBuffer[this.inputIndex] = input[i];
      this.inputIndex = (this.inputIndex + 1) % this.inputBuffer.length;

      if (this.inputIndex % this.hopSize === 0) {
        this.processGrain(timeStretchRatio);
      }

      let outputSample = 0;
      for (const grain of this.grains) {
        if (grain.active && grain.position < this.frameSize) {
          outputSample +=
            grain.buffer[Math.floor(grain.position)] * this.window[Math.floor(grain.position)];
          grain.position += pitchRatio;

          if (grain.position >= this.frameSize) {
            grain.active = false;
          }
        }
      }

      output[i] = outputSample * 0.5;
    }
  }

  processGrain(timeStretchRatio) {
    const grain = this.grains[this.currentGrain];

    const startIndex =
      (this.inputIndex - this.frameSize + this.inputBuffer.length) % this.inputBuffer.length;

    for (let i = 0; i < this.frameSize; i++) {
      const inputIdx = (startIndex + Math.floor(i * timeStretchRatio)) % this.inputBuffer.length;
      grain.buffer[i] = this.inputBuffer[inputIdx];
    }

    grain.position = 0;
    grain.active = true;

    this.currentGrain = (this.currentGrain + 1) % this.grains.length;
  }

  destroy() {
    console.log('Pitch shifter destroyed');
  }
}

module.exports = { AutotuneEngine, PitchDetector, PitchShifter };

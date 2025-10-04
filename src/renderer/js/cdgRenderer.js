// CDGraphics will be loaded from node_modules via webpack or as a global
// For now, we'll load it dynamically when needed

class CDGRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);

        if (!this.canvas) {
            console.error('CDG canvas not found:', canvasId);
            return;
        }

        this.ctx = this.canvas.getContext('2d');
        this.cdgPlayer = null;
        this.cdgData = null;
        this.isPlaying = false;
        this.currentTime = 0;
        this.animationFrame = null;

        // CDG output canvas (300x216)
        this.cdgCanvas = document.createElement('canvas');
        this.cdgCanvas.width = 300;
        this.cdgCanvas.height = 216;
        this.cdgCtx = this.cdgCanvas.getContext('2d');

        // Web Audio API for MP3 playback (will be set by main.js)
        this.audioContext = null;
        this.audioSource = null;
        this.audioBuffer = null;
        this.startTime = 0;
        this.pauseTime = 0;
        this.gainNode = null;
        this.analyserNode = null;

        // Background effects (Butterchurn)
        this.effectsCanvas = null;
        this.butterchurn = null;
        this.effectsEnabled = true;
        this.overlayOpacity = 0.7; // Default, will be updated from settings

        // State reporting interval
        this.stateReportInterval = null;

        console.log('💿 CDG Renderer initialized');
    }

    setOverlayOpacity(opacity) {
        this.overlayOpacity = opacity;
    }

    async loadCDG(cdgData) {
        try {
            console.log('💿 CDGRenderer: Loading CDG data', {
                format: cdgData.format,
                hasAudio: !!cdgData.audio,
                hasCDG: !!cdgData.cdg
            });

            this.cdgData = cdgData;

            // Load CDGraphics library dynamically
            console.log('💿 Checking CDGraphics availability:', typeof CDGraphics);
            if (typeof CDGraphics === 'undefined') {
                console.error('💿 CDGraphics library not loaded');
                throw new Error('CDGraphics library not available');
            }

            // Load CDG file data - convert to ArrayBuffer first
            const cdgBuffer = cdgData.cdg.data;

            console.log('💿 CDG buffer type:', cdgBuffer.constructor.name, 'hasBuffer:', !!cdgBuffer.buffer, 'length:', cdgBuffer.length || cdgBuffer.byteLength);

            // Convert to ArrayBuffer
            let arrayBuffer;
            if (cdgBuffer instanceof Uint8Array || cdgBuffer instanceof Buffer) {
                // Create a new ArrayBuffer and copy data
                arrayBuffer = new ArrayBuffer(cdgBuffer.length || cdgBuffer.byteLength);
                const view = new Uint8Array(arrayBuffer);
                view.set(cdgBuffer);
            } else if (cdgBuffer.buffer instanceof ArrayBuffer) {
                // It's a typed array with an ArrayBuffer
                arrayBuffer = cdgBuffer.buffer.slice(cdgBuffer.byteOffset, cdgBuffer.byteOffset + cdgBuffer.byteLength);
            } else if (cdgBuffer instanceof ArrayBuffer) {
                // It's already an ArrayBuffer
                arrayBuffer = cdgBuffer;
            } else {
                console.error('💿 Unknown buffer type:', cdgBuffer);
                throw new Error('Unknown buffer type');
            }

            console.log('💿 Converted to ArrayBuffer, length:', arrayBuffer.byteLength);

            // Initialize CDGraphics player with the ArrayBuffer
            console.log('💿 Creating CDGraphics instance with buffer');
            this.cdgPlayer = new CDGraphics(arrayBuffer);
            console.log('💿 CDGraphics instance created successfully');

            // Decode MP3 audio buffer using Web Audio API
            // Audio context will be set by main.js before loading
            if (!this.audioContext) {
                throw new Error('Audio context not set. Call setAudioContext() first.');
            }

            console.log('💿 Decoding MP3 audio buffer...');
            const mp3ArrayBuffer = cdgData.audio.mp3.buffer.slice(
                cdgData.audio.mp3.byteOffset,
                cdgData.audio.mp3.byteOffset + cdgData.audio.mp3.byteLength
            );
            this.audioBuffer = await this.audioContext.decodeAudioData(mp3ArrayBuffer);
            console.log('💿 MP3 decoded, duration:', this.audioBuffer.duration);

            console.log('💿 CDG loaded successfully, ready to play');

            return { success: true };
        } catch (error) {
            console.error('💿 Failed to load CDG:', error);
            return { success: false, error: error.message };
        }
    }

    play() {
        if (!this.cdgPlayer || !this.audioBuffer) {
            console.warn('💿 No CDG loaded');
            return;
        }

        console.log('💿 Playing CDG');
        this.isPlaying = true;

        // Stop existing source if any (and clear its onended handler)
        if (this.audioSource) {
            this.audioSource.onended = null; // Clear handler before stopping
            try {
                this.audioSource.stop();
            } catch (e) {
                // Already stopped
            }
            this.audioSource = null;
        }

        // Create new audio source
        this.audioSource = this.audioContext.createBufferSource();
        this.audioSource.buffer = this.audioBuffer;

        // Connect to gain node (which is connected to PA output)
        this.audioSource.connect(this.gainNode);

        // Also connect to analyser for Butterchurn
        if (this.analyserNode) {
            this.audioSource.connect(this.analyserNode);
        }

        // Handle song end - check both isPlaying AND that we've reached the end naturally
        const duration = this.audioBuffer.duration;
        this.audioSource.onended = () => {
            const currentPos = this.getCurrentTime();
            // Only treat as ended if we're near the end of the song (within 1 second)
            if (this.isPlaying && currentPos >= duration - 1) {
                this.handleSongEnd();
            }
        };

        // Start playback from current position
        const offset = this.pauseTime || 0;
        this.audioSource.start(0, offset);
        this.startTime = this.audioContext.currentTime - offset;

        this.startRendering();

        // Start state reporting
        this.startStateReporting();

        // Report immediate state change
        this.reportStateChange();
    }

    pause() {
        console.log('💿 Pausing CDG');
        this.isPlaying = false;

        // Store current position before stopping
        this.pauseTime = this.getCurrentTime();

        // Stop state reporting
        this.stopStateReporting();

        // Report paused state
        this.reportStateChange();

        // Stop audio source (and clear onended handler to prevent false song-end events)
        if (this.audioSource) {
            this.audioSource.onended = null; // Clear handler first
            try {
                this.audioSource.stop();
            } catch (e) {
                // Already stopped
            }
            this.audioSource = null;
        }

        this.stopRendering();
    }

    seek(positionSec) {
        console.log('💿 Seeking to:', positionSec);
        const wasPlaying = this.isPlaying;

        // Pause if playing
        if (wasPlaying) {
            this.pause();
        }

        // Set new position
        this.pauseTime = positionSec;
        this.currentTime = positionSec;

        // Resume if it was playing
        if (wasPlaying) {
            this.play();
        } else {
            // Force a frame render at new position
            this.renderFrame();
        }
    }

    startRendering() {
        if (this.animationFrame) return;

        const render = () => {
            if (!this.isPlaying) return;

            this.renderFrame();
            this.animationFrame = requestAnimationFrame(render);
        };

        render();
    }

    stopRendering() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    renderFrame() {
        if (!this.cdgPlayer) return;

        // Get current time from Web Audio API
        this.currentTime = this.getCurrentTime();

        // Get CDG frame for current time
        const result = this.cdgPlayer.render(this.currentTime);

        if (!result || !result.imageData) {
            console.warn('💿 No frame data at time:', this.currentTime);
            return;
        }

        // Make CDG background transparent for Butterchurn to show through
        const imageData = result.imageData;
        const data = imageData.data;

        // Get the background color from the CDG result (typically index 0 in palette)
        // The backgroundColor is usually at position 0,0
        const bgR = data[0];
        const bgG = data[1];
        const bgB = data[2];

        // Store background color for overlay
        this.cdgBackgroundColor = { r: bgR, g: bgG, b: bgB };

        // Make all pixels matching the background color transparent
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // If pixel matches background color, make it transparent
            if (r === bgR && g === bgG && b === bgB) {
                data[i + 3] = 0; // Set alpha to 0 (transparent)
            }
        }

        // Convert modified ImageData to canvas
        this.cdgCtx.putImageData(imageData, 0, 0);

        // Clear main canvas
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Butterchurn background effects if enabled
        if (this.effectsEnabled && this.effectsCanvas && this.butterchurn) {
            try {
                this.butterchurn.render();
                this.ctx.drawImage(this.effectsCanvas, 0, 0, this.canvas.width, this.canvas.height);
            } catch (err) {
                // Effects rendering can fail, don't crash the whole renderer
            }
        }

        // Draw CDG background color as semi-transparent overlay (like KAI renderer does)
        // This respects the overlayOpacity setting for consistent look
        const overlayOpacity = this.overlayOpacity || 0.7;
        this.ctx.save();
        this.ctx.globalAlpha = overlayOpacity;
        this.ctx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();

        // Scale and center CDG graphics on top
        // CDG is 300x216, scale 5x to 1500x1080 for 1080p
        const scale = 5;
        const cdgWidth = 300 * scale;   // 1500
        const cdgHeight = 216 * scale;  // 1080

        // Center horizontally in 1920px canvas (210px margins on each side)
        const offsetX = (this.canvas.width - cdgWidth) / 2;
        const offsetY = 0; // Fill height

        // Draw scaled CDG graphics on top (text and graphics only, no background)
        this.ctx.imageSmoothingEnabled = false; // Pixel-perfect scaling
        this.ctx.drawImage(
            this.cdgCanvas,
            offsetX, offsetY,
            cdgWidth, cdgHeight
        );
    }

    handleSongEnd() {
        console.log('💿 CDG song ended');
        this.isPlaying = false;
        this.stopRendering();

        // Notify main process
        if (window.electronAPI && window.electronAPI.queue) {
            window.electronAPI.queue.notifyComplete();
        }
    }

    setEffectsCanvas(canvas, butterchurn) {
        this.effectsCanvas = canvas;
        this.butterchurn = butterchurn;
        console.log('💿 Effects canvas set for CDG renderer');
    }

    setEffectsEnabled(enabled) {
        this.effectsEnabled = enabled;
        console.log('💿 Effects enabled:', enabled);
    }

    getCurrentTime() {
        if (this.isPlaying && this.audioContext) {
            return this.audioContext.currentTime - this.startTime;
        }
        return this.pauseTime || 0;
    }

    getDuration() {
        return this.audioBuffer ? this.audioBuffer.duration : 0;
    }

    reportStateChange() {
        if (window.kaiAPI?.renderer) {
            const state = {
                isPlaying: this.isPlaying,
                position: this.getCurrentTime(),
                duration: this.getDuration()
            };
            console.log('💿 CDG reporting state:', state);
            window.kaiAPI.renderer.updatePlaybackState(state);
        } else {
            console.warn('⚠️ kaiAPI.renderer not available for CDG reportStateChange');
        }
    }

    startStateReporting() {
        this.stopStateReporting();

        console.log('🎯 CDG startStateReporting() called, setting up interval');
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

    setAudioContext(audioContext, gainNode, analyserNode) {
        this.audioContext = audioContext;
        this.gainNode = gainNode;
        this.analyserNode = analyserNode;
        console.log('💿 Audio context set for CDG renderer', {
            hasContext: !!audioContext,
            hasGain: !!gainNode,
            hasAnalyser: !!analyserNode
        });
    }

    destroy() {
        this.stopRendering();
        if (this.audioSource) {
            try {
                this.audioSource.stop();
            } catch (e) {
                // Already stopped
            }
            this.audioSource = null;
        }
        this.audioBuffer = null;
        this.cdgPlayer = null;
        this.cdgData = null;
    }
}

// Make it available globally
if (typeof window !== 'undefined') {
    window.CDGRenderer = CDGRenderer;
}
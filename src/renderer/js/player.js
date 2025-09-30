class PlayerController {
    constructor(audioEngine = null) {
        this.audioEngine = audioEngine;
        this.lyricsContainer = document.getElementById('lyricsContainer');

        // Initialize karaoke renderer for KAI format
        this.karaokeRenderer = new KaraokeRenderer('karaokeCanvas');

        // Initialize CDG renderer for CDG format
        this.cdgRenderer = new CDGRenderer('karaokeCanvas');

        // Track current format
        this.currentFormat = null; // 'kai' or 'cdg'

        // Ensure canvas is properly sized after initialization
        setTimeout(() => {
            if (this.karaokeRenderer && this.karaokeRenderer.resizeHandler) {
                this.karaokeRenderer.resizeHandler();
            }
        }, 200);

        this.currentTime = document.getElementById('currentTime');
        this.totalTime = document.getElementById('totalTime');

        // Progress bar elements
        this.progressFill = document.getElementById('progressFill');
        this.progressHandle = document.getElementById('progressHandle');
        this.progressBar = document.querySelector('.progress-bar');

        this.songDuration = 0;
        this.currentPosition = 0;
        this.lyrics = null;

        this.isPlaying = false;
        this.animationFrame = null;

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
        // Progress bar click for seeking
        if (this.progressBar) {
            this.progressBar.addEventListener('click', (e) => {
                this.seekToProgressPosition(e);
            });
        }
        
        // Transport controls
        const restartBtn = document.getElementById('restartBtn');
        const nextTrackBtn = document.getElementById('nextTrackBtn');
        
        // Restart and next track buttons are handled by main.js
    }

    onSongLoaded(metadata) {
        // Always reset timer to 0 first
        this.currentPosition = 0;
        
        // Get real duration from audio engine if available, otherwise from metadata
        if (this.audioEngine && this.audioEngine.getDuration) {
            this.songDuration = this.audioEngine.getDuration();
        } else {
            this.songDuration = metadata?.duration || 0;
        }
        
        // If still zero, try to estimate from lyrics end time as fallback
        if (this.songDuration === 0 && metadata?.lyrics && Array.isArray(metadata.lyrics)) {
            let maxLyricTime = 0;
            for (const line of metadata.lyrics) {
                const endTime = line.end || line.end_time || (line.start || line.time || 0) + 3;
                maxLyricTime = Math.max(maxLyricTime, endTime);
            }
            if (maxLyricTime > 0) {
                this.songDuration = maxLyricTime + 10; // Add some padding
            }
        }
        
        this.lyrics = metadata?.lyrics || null;
        
        // Load lyrics into karaoke renderer with song duration
        if (this.lyrics) {
            this.karaokeRenderer.loadLyrics(this.lyrics, this.songDuration);
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
        
        
        // Update displays immediately to show reset timer and new duration
        this.updateTimeDisplay();
        this.updateProgressBar();
        
        // Ensure we're in stopped state
        this.pause();
    }





    renderLyrics() {
        if (!this.lyrics) {
            this.lyricsContainer.innerHTML = '<div class="no-lyrics">No lyrics available</div>';
            return;
        }

        this.lyricsContainer.innerHTML = '';
        
        if (Array.isArray(this.lyrics)) {
            this.lyrics.forEach((line, index) => {
                const lineElement = document.createElement('div');
                lineElement.className = 'lyric-line';
                lineElement.dataset.index = index;
                
                // Handle different KAI line formats
                if (typeof line === 'object' && line !== null) {
                    lineElement.dataset.time = line.time || line.start_time || 0;
                    lineElement.textContent = line.text || line.lyrics || line.content || '';
                } else {
                    lineElement.dataset.time = index * 3; // Fallback timing
                    lineElement.textContent = line || '';
                }
                
                this.lyricsContainer.appendChild(lineElement);
            });
        } else if (typeof this.lyrics === 'string') {
            const lines = this.lyrics.split('\n');
            lines.forEach((line, index) => {
                const lineElement = document.createElement('div');
                lineElement.className = 'lyric-line';
                lineElement.dataset.index = index;
                lineElement.textContent = line;
                this.lyricsContainer.appendChild(lineElement);
            });
        }
    }

    updatePosition() {
        // Get real position based on current format
        if (this.currentFormat === 'cdg' && this.cdgRenderer) {
            // CDG format - get time from CDG renderer's audio element
            this.currentPosition = this.cdgRenderer.getCurrentTime();
            this.songDuration = this.cdgRenderer.getDuration() || this.songDuration;
        } else if (this.audioEngine && this.audioEngine.getCurrentTime) {
            // KAI format - get time from audio engine
            const engineTime = this.audioEngine.getCurrentTime();
            this.currentPosition = engineTime;
        } else {
            // Fallback to increment
            this.currentPosition += 0.1;
        }
        
        // Stop playback when we reach the end of the song
        if (this.songDuration > 0 && this.currentPosition >= this.songDuration) {
            this.currentPosition = this.songDuration;
            this.pause();
        }
        
        this.updateTimeDisplay();
        this.updateProgressBar();
        this.updateKaraokeTime();
    }

    updateKaraokeTime() {
        if (this.karaokeRenderer) {
            this.karaokeRenderer.setCurrentTime(this.currentPosition);
            if (Math.random() < 0.05) { // Debug occasionally
            }
        }
    }

    updateTimeDisplay() {
        if (this.currentTime) {
            this.currentTime.textContent = this.formatTime(this.currentPosition);
        }
        
        if (this.totalTime) {
            this.totalTime.textContent = this.formatTime(this.songDuration);
        }
    }


    updateProgressBar() {
        if (!this.songDuration || !this.progressFill || !this.progressHandle) return;
        
        const progress = (this.currentPosition / this.songDuration) * 100;
        this.progressFill.style.width = progress + '%';
        this.progressHandle.style.left = progress + '%';
    }

    updateActiveLyrics() {
        if (!this.lyrics) return;
        
        const lyricLines = this.lyricsContainer.querySelectorAll('.lyric-line');
        let activeLineFound = false;
        
        lyricLines.forEach((line, index) => {
            const lineTime = parseFloat(line.dataset.time) || 0;
            const nextLineTime = index < lyricLines.length - 1 ? 
                parseFloat(lyricLines[index + 1].dataset.time) || Infinity : 
                Infinity;
            
            // A line is active if current time is between this line's time and next line's time
            const isActive = this.currentPosition >= lineTime && this.currentPosition < nextLineTime;
            
            line.classList.toggle('active', isActive);
            
            if (isActive && !activeLineFound) {
                activeLineFound = true;
                line.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        });
    }


    seekToProgressPosition(event) {
        if (!this.songDuration || !this.progressBar) return;
        
        const rect = this.progressBar.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const progress = Math.max(0, Math.min(1, x / rect.width));
        const newPosition = progress * this.songDuration;
        
        this.setPosition(newPosition);
    }

    async setPosition(positionSec) {
        this.currentPosition = Math.max(0, Math.min(this.songDuration, positionSec));

        if (this.currentFormat === 'cdg' && this.cdgRenderer) {
            // CDG format - seek using CDG renderer
            this.cdgRenderer.seek(this.currentPosition);
        } else if (this.audioEngine) {
            // KAI format - seek using audio engine
            try {
                await this.audioEngine.seek(this.currentPosition);
            } catch (error) {
                console.error('Seek error:', error);
            }
        }

        // Update karaoke renderer's time position immediately after seeking
        if (this.karaokeRenderer) {
            this.karaokeRenderer.setCurrentTime(this.currentPosition);
            // Reset the locked upcoming lyric so it recalculates based on new position
            this.karaokeRenderer.lockedUpcomingIndex = null;
        }

        this.updateTimeDisplay();
        this.updateProgressBar();
        this.updateActiveLyrics();
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

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    generateDummyWaveform(duration) {
        const sampleRate = 44100;
        const samples = Math.floor(duration * sampleRate);
        const data = new Float32Array(samples);
        
        for (let i = 0; i < samples; i++) {
            const t = i / sampleRate;
            const freq = 440 + Math.sin(t * 0.5) * 200;
            data[i] = Math.sin(t * freq * 2 * Math.PI) * 0.3 * Math.exp(-t * 0.5);
        }
        
        return data;
    }

    resample(audioData, targetSamples) {
        if (!audioData || audioData.length === 0) return [];
        
        const ratio = audioData.length / targetSamples;
        const resampled = new Array(targetSamples);
        
        for (let i = 0; i < targetSamples; i++) {
            const sourceIndex = Math.floor(i * ratio);
            resampled[i] = audioData[sourceIndex] || 0;
        }
        
        return resampled;
    }

    // Debug method to manually try loading vocals from current song data
    async debugLoadVocals() {
        
        if (this.audioEngine) {
            
            // Try different possible properties where song data might be stored
            const possibleSongData = this.audioEngine.currentSong || this.audioEngine.songData || this.audioEngine.loadedSong;
            
            if (possibleSongData) {
                
                if (possibleSongData.audio && possibleSongData.audio.sources) {
                    
                    const vocalsSource = possibleSongData.audio.sources.find(source => 
                        source.name === 'vocals' || 
                        source.filename?.includes('vocals')
                    );
                    
                    if (vocalsSource && vocalsSource.audioData) {
                        await this.karaokeRenderer.setVocalsAudio(vocalsSource.audioData);
                    } else {
                    }
                } else {
                }
            } else {
            }
        } else {
        }
    }

    destroy() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        
        if (this.karaokeRenderer) {
            this.karaokeRenderer.destroy();
        }
    }
}
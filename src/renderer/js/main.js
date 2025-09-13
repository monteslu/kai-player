class KaiPlayerApp {
    constructor() {
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
            overlayOpacity: 0.5,
            showUpcomingLyrics: true
        };
        
        this.autoTunePreferences = {
            enabled: false,
            strength: 50,
            speed: 20
        };
        
        this.init();
    }

    async init() {
        try {
            await this.setupEventListeners();
            await this.loadAudioDevices();
            this.setupTabs();
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
        if (this.autoTunePreferences) {
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
        this.editor = new LyricsEditorController();
        
        // Apply loaded waveform preferences immediately after player creation
        if (this.player.karaokeRenderer) {
            this.player.karaokeRenderer.waveformPreferences = { ...this.waveformPreferences };
            console.log('Applied waveform preferences on init:', this.waveformPreferences);
        }
        
        this.updateStatus('Ready');
        
        // Set initial UI state (no song loaded)
        this.updateUIForSongState();
        
        const version = await kaiAPI.app.getVersion();
        console.log(`KAI Player v${version} initialized`);
    }

    async setupEventListeners() {
        document.getElementById('loadKaiBtn').addEventListener('click', () => {
            this.loadKaiFile();
        });

        document.getElementById('refreshDevicesBtn').addEventListener('click', async () => {
            console.log('Refresh devices button clicked');
            await this.loadAudioDevices();
            console.log('Device refresh completed');
        });

        document.getElementById('songInfoBtn').addEventListener('click', () => {
            this.showSongInfo();
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

        document.getElementById('playPauseBtn').addEventListener('click', () => {
            this.togglePlayback();
        });


        document.getElementById('seekBackBtn').addEventListener('click', () => {
            this.seekRelative(-10);
        });

        document.getElementById('seekForwardBtn').addEventListener('click', () => {
            this.seekRelative(10);
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

        document.getElementById('inputDeviceSelect').addEventListener('change', async (e) => {
            const deviceId = e.target.value;
            console.log('Input device selected:', deviceId);
            
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

        kaiAPI.song.onData(async (event, songData) => {
            console.log('🎵 Received song data in renderer - performing full initialization');
            
            this.currentSong = songData;
            
            // Show loading state immediately
            this.showLoadingState();
            
            // Use pending metadata if available, otherwise use data from songData
            const metadata = this._pendingMetadata || songData.metadata || {};
            
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
                        console.log('Restarting microphone capture after song load...');
                        setTimeout(() => {
                            this.player.karaokeRenderer.startMicrophoneCapture();
                        }, 100);
                    }
                    
                    // Update effect display with current preset
                    setTimeout(() => this.updateEffectDisplay(), 100);
                }
            }
            
            // Wait for all contexts and buffers to be ready
            await new Promise(resolve => setTimeout(resolve, 500));
            
            if (this.coaching) {
                this.coaching.onSongLoaded(metadata || {});
            }
            
            if (this.editor && this.currentSong) {
                this.editor.onSongLoaded(this.currentSong);
            }
            
            if (this.mixer && this.audioEngine) {
                this.mixer.updateFromAudioEngine();
            }
            
            document.getElementById('loadingMessage').style.display = 'none';
            
            // Now that everything is fully loaded, update the UI
            this.updateUIForSongState();
            
            // Clear pending metadata
            this._pendingMetadata = null;
        });
    }

    async loadAudioDevices() {
        try {
            console.log('Loading audio devices...');
            
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
            console.log('Device selections restored after refresh');
            
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
            
            console.log(`Found ${audioDevices.length} real audio devices:`, 
                audioDevices.map(d => `${d.name} (${d.deviceKind})`));
            
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
            });
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
                return;
            }

            switch (e.key) {
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
    
    setupWaveformControls() {
        const enableWaveforms = document.getElementById('enableWaveforms');
        const micToSpeakers = document.getElementById('micToSpeakers');
        const enableMic = document.getElementById('enableMic');
        const enableEffects = document.getElementById('enableEffects');
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
        }
        
        // Show loading state
        document.getElementById('transportControls').style.display = 'none';
        document.getElementById('loadingMessage').style.display = 'flex';
        
        // Store metadata for later use when song data arrives
        this._pendingMetadata = metadata;
        
        const title = metadata?.title || 'Unknown Song';
        const artist = metadata?.artist || 'Unknown Artist';
        
        document.querySelector('.song-title').textContent = title;
        document.querySelector('.song-artist').textContent = artist;
        
        // Enable song info button
        document.getElementById('songInfoBtn').disabled = false;
    }

    showSongInfo() {
        if (!this.currentSong) return;
        
        const modal = document.getElementById('songInfoModal');
        const content = document.getElementById('songInfoContent');
        
        const metadata = this.currentSong.metadata;
        const meta = this.currentSong.meta || {};
        
        // Extract filename from originalFilePath
        const filePath = this.currentSong.originalFilePath || '';
        const fileName = filePath ? filePath.split('/').pop().split('\\').pop() : 'Unknown';

        let html = `
            <div class="info-section">
                <h3>Song Details</h3>
                <div class="info-grid">
                    <div class="info-label">Title:</div>
                    <div class="info-value">${metadata.title}</div>
                    <div class="info-label">Artist:</div>
                    <div class="info-value">${metadata.artist}</div>
                    <div class="info-label">Album:</div>
                    <div class="info-value">${metadata.album || 'Unknown'}</div>
                    <div class="info-label">Duration:</div>
                    <div class="info-value">${this.formatTime(metadata.duration)}</div>
                    <div class="info-label">Key:</div>
                    <div class="info-value">${metadata.key}</div>
                    <div class="info-label">Tempo:</div>
                    <div class="info-value">${metadata.tempo} BPM</div>`;
        
        // Add comment if it exists
        if (metadata.comment && metadata.comment.trim()) {
            html += `
                    <div class="info-label">Comment:</div>
                    <div class="info-value" style="white-space: pre-wrap; max-width: 400px; word-wrap: break-word;">${metadata.comment}</div>`;
        }
        
        html += `
                </div>
            </div>
            
            <div class="info-section">
                <h3>File Information</h3>
                <div class="info-grid">
                    <div class="info-label">Filename:</div>
                    <div class="info-value">${fileName}</div>
                    <div class="info-label">Full Path:</div>
                    <div class="info-value" style="word-break: break-all; font-family: monospace; font-size: 0.9em;">${filePath || 'Unknown'}</div>
                </div>
            </div>
        `;
        
        // Add stems info
        if (this.currentSong.stems && this.currentSong.stems.length > 0) {
            html += `
                <div class="info-section">
                    <h3>Audio Stems</h3>
                    <div class="info-grid">
            `;
            this.currentSong.stems.forEach(stem => {
                html += `
                    <div class="info-label">${stem}:</div>
                    <div class="info-value">Available</div>
                `;
            });
            html += `</div></div>`;
        }
        
        // Add ID3 info if available and not excluded
        if (meta.id3 && meta.id3.include_raw !== false) {
            html += `
                <div class="info-section">
                    <h3>ID3 Metadata</h3>
                    <div class="processing-info">
                        <pre>${JSON.stringify(meta.id3, null, 2)}</pre>
                    </div>
                </div>
            `;
        }
        
        // Add processing info if available
        if (meta.processing) {
            html += `
                <div class="info-section">
                    <h3>Processing Information</h3>
                    <div class="processing-info">
                        <pre>${JSON.stringify(meta.processing, null, 2)}</pre>
                    </div>
                </div>
            `;
        }
        
        content.innerHTML = html;
        modal.style.display = 'flex';
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }


    enableControls() {
        document.getElementById('playPauseBtn').disabled = false;
    }

    async togglePlayback() {
        if (!this.currentSong || !this.audioEngine) return;
        
        try {
            if (this.isPlaying) {
                await this.audioEngine.pause();
                this.isPlaying = false;
                this.updatePlayButton('▶');
                
                // Also pause the player controller
                if (this.player) {
                    await this.player.pause();
                }
            } else {
                await this.audioEngine.play();
                this.isPlaying = true;
                this.updatePlayButton('⏸');
                this.startPositionUpdater();
                
                // Also play the player controller
                if (this.player) {
                    await this.player.play();
                }
            }
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

    handleSongEnded() {
        console.log('Song ended - updating UI state');
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
        
        // Update status
        this.updateStatus('Song ended');
    }

    async seekRelative(seconds) {
        if (!this.currentSong || !this.audioEngine) return;
        
        const newPosition = Math.max(0, this.audioEngine.getCurrentPosition() + seconds);
        await this.audioEngine.seek(newPosition);
    }

    startPositionUpdater() {
        if (this.positionTimer) return;
        
        this.positionTimer = setInterval(() => {
            if (this.isPlaying && this.audioEngine) {
                this.currentPosition = this.audioEngine.getCurrentPosition();
                
                if (this.player) {
                    this.player.currentPosition = this.currentPosition;
                }
                
                if (this.coaching) {
                    this.coaching.setPosition(this.currentPosition);
                }
                
                const duration = this.audioEngine.getDuration();
                if (this.currentPosition >= duration) {
                    this.isPlaying = false;
                    this.updatePlayButton('▶');
                    if (this.positionTimer) {
                        clearInterval(this.positionTimer);
                        this.positionTimer = null;
                    }
                }
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
    loadDevicePreferences() {
        try {
            const saved = localStorage.getItem('kaiPlayerDevicePrefs');
            if (saved) {
                this.devicePreferences = { ...this.devicePreferences, ...JSON.parse(saved) };
                console.log('Loaded device preferences:', this.devicePreferences);
            }
        } catch (error) {
            console.warn('Failed to load device preferences:', error);
        }
    }
    
    // Waveform preferences methods
    loadWaveformPreferences() {
        try {
            const saved = localStorage.getItem('kaiPlayerWaveformPrefs');
            if (saved) {
                this.waveformPreferences = { ...this.waveformPreferences, ...JSON.parse(saved) };
                console.log('Loaded waveform preferences:', this.waveformPreferences);
                
                // Apply saved preferences to checkboxes
                const enableWaveforms = document.getElementById('enableWaveforms');
                const micToSpeakers = document.getElementById('micToSpeakers');
                const enableMic = document.getElementById('enableMic');
                const enableEffects = document.getElementById('enableEffects');
                
                const showUpcomingLyrics = document.getElementById('showUpcomingLyrics');
                
                if (enableWaveforms) enableWaveforms.checked = this.waveformPreferences.enableWaveforms;
                if (micToSpeakers) micToSpeakers.checked = this.waveformPreferences.micToSpeakers;
                if (enableMic) enableMic.checked = this.waveformPreferences.enableMic;
                if (enableEffects) enableEffects.checked = this.waveformPreferences.enableEffects;
                if (showUpcomingLyrics) showUpcomingLyrics.checked = this.waveformPreferences.showUpcomingLyrics;
                
                // Apply saved overlay opacity
                const overlayOpacity = document.getElementById('overlayOpacity');
                const overlayOpacityValue = document.getElementById('overlayOpacityValue');
                if (overlayOpacity && this.waveformPreferences.overlayOpacity !== undefined) {
                    overlayOpacity.value = this.waveformPreferences.overlayOpacity;
                    if (overlayOpacityValue) {
                        overlayOpacityValue.textContent = this.waveformPreferences.overlayOpacity.toFixed(2);
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to load waveform preferences:', error);
        }
    }
    
    saveWaveformPreferences() {
        try {
            localStorage.setItem('kaiPlayerWaveformPrefs', JSON.stringify(this.waveformPreferences));
            console.log('Saved waveform preferences:', this.waveformPreferences);
        } catch (error) {
            console.warn('Failed to save waveform preferences:', error);
        }
    }
    
    loadAutoTunePreferences() {
        try {
            const saved = localStorage.getItem('kaiPlayerAutoTunePrefs');
            if (saved) {
                this.autoTunePreferences = { ...this.autoTunePreferences, ...JSON.parse(saved) };
                console.log('Loaded auto-tune preferences:', this.autoTunePreferences);
                
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
    
    saveAutoTunePreferences() {
        try {
            localStorage.setItem('kaiPlayerAutoTunePrefs', JSON.stringify(this.autoTunePreferences));
            console.log('Saved auto-tune preferences:', this.autoTunePreferences);
        } catch (error) {
            console.warn('Failed to save auto-tune preferences:', error);
        }
    }
    
    saveDevicePreference(deviceType, deviceId) {
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
            
            localStorage.setItem('kaiPlayerDevicePrefs', JSON.stringify(this.devicePreferences));
            console.log(`Saved ${deviceType} device preference:`, this.devicePreferences[deviceType]);
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
                
                console.log(`Restored ${type} device: ${matchedDevice.name || matchedDevice.label}`);
            } else {
                console.log(`Saved ${type} device not found: ${savedDevice.name || savedDevice.id}`);
                // Clear invalid preference
                this.devicePreferences[type] = null;
                localStorage.setItem('kaiPlayerDevicePrefs', JSON.stringify(this.devicePreferences));
            }
        }
    }
    
    updateEffectDisplay() {
        const effectNameElement = document.getElementById('currentEffectName');
        if (effectNameElement && this.player && this.player.karaokeRenderer) {
            const renderer = this.player.karaokeRenderer;
            let displayName = 'Effect';
            
            if (renderer.effectType === 'butterchurn' && renderer.currentPreset) {
                // Truncate long preset names for display
                displayName = renderer.currentPreset.length > 15 ? 
                    renderer.currentPreset.substring(0, 15) + '...' : 
                    renderer.currentPreset;
            } else if (renderer.effectType === 'custom') {
                displayName = 'Custom Shader';
            }
            
            effectNameElement.textContent = displayName;
        }
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
}

window.addEventListener('DOMContentLoaded', () => {
    window.appInstance = new KaiPlayerApp();
});
import { LyricsEditor } from './lyricsEditor.js';
import { getAppInstance, getPlayer } from './appInstance.js';

export class LyricsEditorController {
    constructor() {
        // Waveform configuration
        this.WAVEFORM_WIDTH = 3800; // Canvas width in pixels for high-res displays
        this.WAVEFORM_SAMPLES = 1000; // Number of audio samples to analyze (independent of canvas width)

        this.currentPosition = 0;
        this.songDuration = 0;
        this.isPlaying = false;
        this.hasChanges = false;
        this.currentSong = null;
        this.callbackSetup = false;
        this.vocalsWaveform = null;
        this.audioElement = null;
        this.playbackAnimationFrame = null;
        this.playingLineEndTime = null;

        this.waveformCanvas = document.getElementById('vocalsWaveform');
        this.analyzeVocalsCheckbox = document.getElementById('analyzeVocals');

        // Set canvas width from constant
        if (this.waveformCanvas) {
            this.waveformCanvas.width = this.WAVEFORM_WIDTH;
        }

        // Initialize the new line-by-line lyrics editor
        this.lyricsEditor = new LyricsEditor();

        this.updateTimer = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
    }


    setupEventListeners() {
        // Editor controls
        document.getElementById('editorSaveBtn').addEventListener('click', () => {
            this.saveChanges();
        });

        document.getElementById('exportLyricsBtn').addEventListener('click', () => {
            this.exportLyrics();
        });

        document.getElementById('resetLyrics').addEventListener('click', () => {
            this.resetToOriginal();
        });

        // Analyze vocals checkbox
        this.analyzeVocalsCheckbox.addEventListener('change', () => {
            this.saveAnalyzeVocalsSetting();

            if (this.analyzeVocalsCheckbox.checked) {
                // If checking and a song is loaded, analyze it now
                if (this.currentSong) {
                    this.triggerVocalsAnalysis();
                }
            } else {
                // If unchecking, hide the waveform
                this.waveformCanvas.style.display = 'none';
            }
        });

        // Load saved setting
        this.loadAnalyzeVocalsSetting();

        // Make lyric lines selectable for waveform highlighting
        this.setupLyricLineSelection();

        // Canvas click handler for rectangle selection
        this.waveformCanvas.addEventListener('click', (e) => {
            this.handleCanvasClick(e);
        });

        // Listen for IEM device changes
        document.getElementById('iemDeviceSelect').addEventListener('change', () => {
            this.applyAudioDeviceSelection();
        });

        // Textarea changes - now handled by LyricsEditor
        // this.textarea.addEventListener('input', () => {
        //     this.onLyricsChanged();
        // });


    }

    onSongLoaded(songData) {
        this.currentSong = songData;
        this.songDuration = songData?.metadata?.duration || 0;
        
        // Reset editor state - no changes after fresh load
        this.hasChanges = false;
        this.updateSaveButton();
        
        this.enableControls();
        
        // Load vocals.mp3 into the audio element
        this.audioElement = document.getElementById('editorAudio');
        if (this.audioElement && songData?.audio?.sources) {
            // Find the vocals source
            const vocalsSource = songData.audio.sources.find(source =>
                source.name === 'vocals' ||
                source.filename?.includes('vocals')
            );

            if (vocalsSource && vocalsSource.audioData) {
                const vocalsBlob = new Blob([vocalsSource.audioData], { type: 'audio/mp3' });
                const vocalsUrl = URL.createObjectURL(vocalsBlob);
                this.audioElement.src = vocalsUrl;

                // Set up audio playback monitoring for waveform playhead
                this.setupAudioPlaybackMonitoring();

                // Analyze vocals if checkbox is checked
                if (this.analyzeVocalsCheckbox.checked) {
                    this.analyzeVocalsWaveform(vocalsBlob);
                }

                // Apply IEM device selection if available
                this.applyAudioDeviceSelection();
            } else {
            }
        }
        
        // Load lyrics directly into the line-by-line editor
        if (this.lyricsEditor && songData?.lyrics) {
            
            // Get rejections from KAI format metadata (meta.corrections.rejected)
            // Map KAI format to lyrics editor format
            const kaiRejections = songData?.meta?.corrections?.rejected || [];
            const rejections = kaiRejections.map(rejection => ({
                line_num: rejection.line,
                start_time: rejection.start,
                end_time: rejection.end,
                old_text: rejection.old,
                new_text: rejection.new,
                reason: rejection.reason,
                retention_rate: rejection.word_retention,
                min_required: 0.5 // Default minimum threshold
            }));

            // Get missing line suggestions from KAI format metadata
            const kaiSuggestions = songData?.meta?.corrections?.missing_lines_suggested || [];
            const suggestions = kaiSuggestions.map(suggestion => ({
                suggested_text: suggestion.suggested_text,
                start_time: suggestion.start,
                end_time: suggestion.end,
                confidence: suggestion.confidence,
                reason: suggestion.reason,
                pitch_activity: suggestion.pitch_activity
            }));

            this.lyricsEditor.loadLyrics(songData.lyrics, rejections, suggestions);
            
            // Set up callback to update karaoke renderer when lyrics are edited
            // Only set this up once to avoid duplicate callbacks
            if (!this.callbackSetup) {
                this.lyricsEditor.onLyricsEdited((editedLyrics, editedRejections, editedSuggestions) => {
                    this.onLyricsEdited(editedLyrics, editedRejections, editedSuggestions);
                });
                this.callbackSetup = true;
            }
        }
        
    }











    updateActiveLyrics() {
        // No longer needed - original lyrics display removed
    }
    
    async applyAudioDeviceSelection() {
        const audioElement = document.getElementById('editorAudio');
        const iemSelect = document.getElementById('iemDeviceSelect');

        if (!audioElement || !iemSelect) {
            console.log('Editor audio: Missing audioElement or iemSelect');
            return;
        }

        const selectedDevice = iemSelect.options[iemSelect.selectedIndex];
        console.log('Editor audio: Selected device option:', selectedDevice);
        console.log('Editor audio: Device ID from dataset:', selectedDevice?.dataset?.deviceId);
        console.log('Editor audio: Option value:', selectedDevice?.value);

        if (selectedDevice && selectedDevice.dataset.deviceId) {
            try {
                console.log(`Editor audio: Setting sink to device ID: ${selectedDevice.dataset.deviceId}`);
                // Use setSinkId to route audio to the selected IEM device
                if (typeof audioElement.setSinkId === 'function') {
                    await audioElement.setSinkId(selectedDevice.dataset.deviceId);
                    console.log('Editor audio: Successfully set sink ID');
                } else {
                    console.warn('setSinkId not supported in this browser');
                }
            } catch (error) {
                console.error('Failed to set audio output device:', error);
            }
        } else {
            console.log('Editor audio: No device ID found in dataset');
        }
    }




    onLyricsChanged() {
        // This is now handled by the LyricsEditor onLyricsEdited callback
        // The hasChanges flag is set in onLyricsEdited method
        this.updateSaveButton();
    }

    updateSaveButton() {
        const saveBtn = document.getElementById('editorSaveBtn');
        if (this.hasChanges) {
            saveBtn.textContent = '💾 Save Changes*';
            saveBtn.style.background = '#007acc';
        } else {
            saveBtn.textContent = '💾 Save Changes';
            saveBtn.style.background = '#3a3a3a';
        }
    }

    async saveChanges() {
        if (!this.hasChanges || !this.currentSong) return;
        
        try {
            // Get edited lyrics from the LyricsEditor
            const editedLyricsData = this.lyricsEditor ? this.lyricsEditor.getEditedLyrics() : [];
            
            // Update current song data
            this.currentSong.lyrics = editedLyricsData;
            
            // Save to file using the kaiAPI
            if (this.currentSong.originalFilePath) {
                const result = await kaiAPI.editor.saveKai(this.currentSong, this.currentSong.originalFilePath);
                
                if (result.success) {
                    this.hasChanges = false;
                    this.updateSaveButton();
                    this.showStatus('Changes saved successfully!', 'saved');
                    
                    // Reload the song after successful save to refresh all components
                    this.reloadSong();
                } else {
                    this.showStatus('Failed to save changes', 'error');
                    console.error('Failed to save KAI file');
                }
            } else {
                this.showStatus('No file path available for saving', 'error');
                console.error('No original file path available for saving');
            }
        } catch (error) {
            this.showStatus('Error saving changes', 'error');
            console.error('Error saving changes:', error);
        }
    }

    exportLyrics() {
        if (!this.lyricsEditor) return;
        
        // Get the edited lyrics and convert to text format
        const editedLyricsData = this.lyricsEditor.getEditedLyrics();
        const lyricsText = editedLyricsData.map(line => line.text || '').join('\n');
        
        const blob = new Blob([lyricsText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentSong?.metadata.title || 'lyrics'}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        
        this.showStatus('Lyrics exported successfully!', 'saved');
    }

    resetToOriginal() {
        if (!this.currentSong?.lyrics) return;
        
        // Reset the LyricsEditor to original from currentSong
        if (this.lyricsEditor && this.currentSong.lyrics) {
            this.lyricsEditor.loadLyrics(this.currentSong.lyrics);
        }
        this.hasChanges = false;
        this.updateSaveButton();
        
        this.showStatus('Reset to original lyrics', 'saved');
    }

    showStatus(message, type = '') {
        // Could show in a status area if we add one
    }

    enableControls() {
        document.getElementById('editorSaveBtn').disabled = false;
        document.getElementById('exportLyricsBtn').disabled = false;
        document.getElementById('resetLyrics').disabled = false;
        document.getElementById('addNewLine').disabled = false;
        // Enable controls - line-by-line editor is always enabled when song is loaded
    }

    onLyricsEdited(editedLyrics, editedRejections = [], editedSuggestions = []) {
        // Update the karaoke renderer with edited lyrics
        
        // Update the current song data with edited lyrics and rejections
        this.currentSong.lyrics = editedLyrics;

        // Map rejections back to KAI format and store in meta.corrections.rejected
        if (!this.currentSong.meta) {
            this.currentSong.meta = {};
        }
        if (!this.currentSong.meta.corrections) {
            this.currentSong.meta.corrections = {};
        }

        // Convert from lyrics editor format back to KAI format
        this.currentSong.meta.corrections.rejected = editedRejections.map(rejection => ({
            line: rejection.line_num,
            start: rejection.start_time,
            end: rejection.end_time,
            old: rejection.old_text,
            new: rejection.new_text,
            reason: rejection.reason,
            word_retention: rejection.retention_rate
        }));

        // Convert suggestions back to KAI format
        this.currentSong.meta.corrections.missing_lines_suggested = editedSuggestions.map(suggestion => ({
            suggested_text: suggestion.suggested_text,
            start: suggestion.start_time,
            end: suggestion.end_time,
            confidence: suggestion.confidence,
            reason: suggestion.reason,
            pitch_activity: suggestion.pitch_activity
        }));
        
        // Find the player instance through the main app and update karaoke renderer
        if (getAppInstance() && getAppInstance().player && getAppInstance().player.karaokeRenderer) {
            getAppInstance().player.karaokeRenderer.loadLyrics(editedLyrics, this.songDuration);
        }
        
        this.hasChanges = true;
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    async reloadSong() {
        if (!this.currentSong?.originalFilePath) {
            console.error('No original file path available for reload');
            return;
        }
        
        try {
            
            // Use the new reload API to reload the song
            const result = await kaiAPI.editor.reloadKai(this.currentSong.originalFilePath);
            
            if (result.success) {
                // Note: The actual data refresh happens automatically via the song:data event
                // which calls onSongLoaded and resets the editor state
                this.showStatus('Saved and reloaded successfully!', 'saved');
            } else {
                console.error('Failed to reload song:', result.error);
                this.showStatus('Saved but failed to reload', 'warning');
            }
        } catch (error) {
            console.error('Error reloading song after save:', error);
            this.showStatus('Saved but failed to reload', 'warning');
        }
    }

    async analyzeVocalsWaveform(vocalsBlob) {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await vocalsBlob.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            // Get channel data (use first channel for mono or averaging stereo)
            const channelData = audioBuffer.getChannelData(0);
            const sampleRate = audioBuffer.sampleRate;
            const duration = audioBuffer.duration;

            // Calculate downsampling factor based on sample count (not canvas width)
            const targetSamples = this.WAVEFORM_SAMPLES;
            const downsampleFactor = Math.floor(channelData.length / targetSamples);

            // Create Int8Array for efficient storage
            this.vocalsWaveform = new Int8Array(targetSamples);

            // Downsample by taking peak values in each window
            for (let i = 0; i < targetSamples; i++) {
                const start = i * downsampleFactor;
                const end = Math.min(start + downsampleFactor, channelData.length);

                let max = 0;
                for (let j = start; j < end; j++) {
                    max = Math.max(max, Math.abs(channelData[j]));
                }

                // Convert to Int8 (-128 to 127)
                this.vocalsWaveform[i] = Math.floor(max * 127);
            }

            // Draw waveform on canvas
            this.drawWaveform();

            // Show canvas
            this.waveformCanvas.style.display = 'block';

            audioContext.close();
        } catch (error) {
            console.error('Error analyzing vocals waveform:', error);
        }
    }

    drawWaveform() {
        if (!this.vocalsWaveform || !this.waveformCanvas) return;

        const ctx = this.waveformCanvas.getContext('2d');
        const width = this.waveformCanvas.width;
        const height = this.waveformCanvas.height;

        // Clear canvas completely
        ctx.clearRect(0, 0, width, height);

        // Draw background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, width, height);

        // Draw waveform first
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();

        const centerY = height / 2;
        const scale = height / 256; // Scale from Int8 range to canvas height

        // Scale waveform samples to canvas width
        for (let i = 0; i < this.vocalsWaveform.length; i++) {
            const x = (i / this.vocalsWaveform.length) * width; // Scale x to canvas width
            const value = this.vocalsWaveform[i];
            const y = centerY - (value * scale);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();

        // Mirror for bottom half
        ctx.beginPath();
        for (let i = 0; i < this.vocalsWaveform.length; i++) {
            const x = (i / this.vocalsWaveform.length) * width; // Scale x to canvas width
            const value = this.vocalsWaveform[i];
            const y = centerY + (value * scale);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();

        // Draw center line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();

        // Draw lyric duration rectangles AFTER waveform
        const songDuration = this.songDuration || this.currentSong?.metadata?.duration || 0;

        if (songDuration > 0 && this.lyricsEditor && this.lyricsEditor.lyricsData) {
            // Clear rectangle bounds for click detection
            this.lyricRectangles = [];

            const lyricsData = this.lyricsEditor.lyricsData;

            // Separate backup and regular lines for rendering order
            const backupLines = [];
            const regularLines = [];

            lyricsData.forEach((line, index) => {
                // Skip disabled lines
                if (line.disabled === true) {
                    return;
                }

                const isBackup = line.backup === true;
                if (isBackup) {
                    backupLines.push({ line, index });
                } else {
                    regularLines.push({ line, index });
                }
            });

            // Draw backup lines first (yellow, behind regular)
            backupLines.forEach(({ line, index }) => {
                this.drawLyricRectangle(line, index, ctx, songDuration, width, 'rgba(255, 200, 0, 0.35)', 'rgba(255, 200, 0, 0.7)');
            });

            // Draw regular lines second (blue, in front)
            regularLines.forEach(({ line, index }) => {
                this.drawLyricRectangle(line, index, ctx, songDuration, width, 'rgba(0, 100, 255, 0.35)', 'rgba(0, 100, 255, 0.7)');
            });
        }

        // Draw playhead if audio is playing or paused with position
        if (this.audioElement && this.currentPosition > 0 && songDuration > 0) {
            const playheadX = (this.currentPosition / songDuration) * width;

            // Draw white vertical line for playhead
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(playheadX, 0);
            ctx.lineTo(playheadX, height);
            ctx.stroke();

            // Draw tic marks at top and bottom
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            // Top tic
            ctx.fillRect(playheadX - 5, 0, 10, 8);
            // Bottom tic
            ctx.fillRect(playheadX - 5, height - 8, 10, 8);
        }
    }

    drawLyricRectangle(lineData, lineIndex, ctx, songDuration, width, fillColor, outlineColor) {
        // Read timing from data
        const startTime = lineData.start || lineData.time || lineData.start_time || 0;
        const endTime = lineData.end || lineData.end_time || (startTime + 3);
        const duration = endTime - startTime;

        if (duration > 0) {
            // Calculate position and width based on song duration
            const startX = (startTime / songDuration) * width;
            const rectWidth = (duration / songDuration) * width;

            // Find corresponding DOM element for click detection and selection state
            const lineElement = document.querySelector(`.lyric-line-editor[data-index="${lineIndex}"]`);

            // Store rectangle bounds for click detection
            if (!this.lyricRectangles) {
                this.lyricRectangles = [];
            }

            this.lyricRectangles.push({
                x: startX,
                y: 5,
                width: rectWidth,
                height: 70,
                lineElement: lineElement,
                lineIndex: lineIndex
            });

            // Draw rectangle
            ctx.fillStyle = fillColor;
            ctx.fillRect(startX, 5, rectWidth, 70);

            // Draw outline if line is selected (check DOM for selection state)
            if (lineElement && lineElement.classList.contains('selected')) {
                ctx.strokeStyle = outlineColor;
                ctx.lineWidth = 2;
                ctx.strokeRect(startX, 5, rectWidth, 70);
            }
        }
    }

    async saveAnalyzeVocalsSetting() {
        try {
            await window.kaiAPI.settings.set('editor.analyzeVocals', this.analyzeVocalsCheckbox.checked);
        } catch (error) {
            console.error('Failed to save analyze vocals setting:', error);
        }
    }

    async loadAnalyzeVocalsSetting() {
        try {
            const saved = await window.kaiAPI.settings.get('editor.analyzeVocals');
            if (saved !== null && saved !== undefined) {
                this.analyzeVocalsCheckbox.checked = saved;
            }
        } catch (error) {
            console.error('Failed to load analyze vocals setting:', error);
        }
    }

    triggerVocalsAnalysis() {
        if (!this.currentSong?.audio?.sources) return;

        const vocalsSource = this.currentSong.audio.sources.find(source =>
            source.name === 'vocals' || source.filename?.includes('vocals')
        );

        if (vocalsSource && vocalsSource.audioData) {
            const vocalsBlob = new Blob([vocalsSource.audioData], { type: 'audio/mp3' });
            this.analyzeVocalsWaveform(vocalsBlob);
        }
    }

    setupLyricLineSelection() {
        // Delegate click handling to parent container
        document.addEventListener('click', (e) => {
            const lyricLine = e.target.closest('.lyric-line-editor');
            if (lyricLine && !lyricLine.classList.contains('disabled')) {
                // Remove previous selection
                document.querySelectorAll('.lyric-line-editor.selected').forEach(el => {
                    el.classList.remove('selected');
                });

                // Add selection to clicked line
                lyricLine.classList.add('selected');

                // Redraw waveform with selection
                this.drawWaveform();
            }
        });
    }

    handleCanvasClick(e) {
        if (!this.lyricRectangles || this.lyricRectangles.length === 0) return;

        // Get canvas-relative coordinates
        const rect = this.waveformCanvas.getBoundingClientRect();
        const scaleX = this.waveformCanvas.width / rect.width;
        const scaleY = this.waveformCanvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Check if click is inside any rectangle (reverse order to match render order)
        for (let i = this.lyricRectangles.length - 1; i >= 0; i--) {
            const r = this.lyricRectangles[i];
            if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
                // Clear previous selection
                document.querySelectorAll('.lyric-line-editor.selected').forEach(el => {
                    el.classList.remove('selected');
                });

                // Select this line
                r.lineElement.classList.add('selected');

                // Scroll to line
                r.lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Redraw waveform
                this.drawWaveform();
                break;
            }
        }
    }

    setupAudioPlaybackMonitoring() {
        if (!this.audioElement) return;

        // Update waveform playhead during playback
        this.audioElement.addEventListener('timeupdate', () => {
            this.currentPosition = this.audioElement.currentTime;

            // Check if we need to stop at line end time
            if (this.playingLineEndTime !== null && this.currentPosition >= this.playingLineEndTime) {
                this.audioElement.pause();
                this.playingLineEndTime = null;
            }

            // Redraw waveform to update playhead position
            if (!this.audioElement.paused) {
                this.drawWaveform();
            }
        });

        this.audioElement.addEventListener('pause', () => {
            this.playingLineEndTime = null;
            this.drawWaveform();
        });

        this.audioElement.addEventListener('play', () => {
            this.drawWaveform();
        });
    }

    playLineSection(startTime, endTime) {
        if (!this.audioElement) return;

        this.audioElement.currentTime = startTime;
        this.playingLineEndTime = endTime;
        this.audioElement.play();
    }

    destroy() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        if (this.playbackAnimationFrame) {
            cancelAnimationFrame(this.playbackAnimationFrame);
        }
    }
}
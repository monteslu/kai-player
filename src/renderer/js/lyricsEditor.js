import { formatTime } from '../../shared/formatUtils.js';

export class LyricsEditor {
    constructor() {
        this.lyricsData = [];
        this.originalLyrics = null;
        this.rejections = [];
        this.suggestions = [];
        this.editedCallback = null;
        
        this.lyricsLinesContainer = document.getElementById('lyricsLines');
        this.addNewLineBtn = document.getElementById('addNewLine');
        this.resetLyricsBtn = document.getElementById('resetLyrics');
        
        this.init();
    }
    
    init() {
        if (this.addNewLineBtn) {
            this.addNewLineBtn.addEventListener('click', () => this.addNewLine());
        }
        if (this.resetLyricsBtn) {
            this.resetLyricsBtn.addEventListener('click', () => this.resetToOriginal());
        }
    }
    
    loadLyrics(lyrics, rejections = [], suggestions = []) {
        this.originalLyrics = JSON.parse(JSON.stringify(lyrics));
        this.lyricsData = JSON.parse(JSON.stringify(lyrics));
        this.rejections = JSON.parse(JSON.stringify(rejections));
        this.suggestions = JSON.parse(JSON.stringify(suggestions));
        this.renderEditor();
    }
    
    renderEditor() {
        if (!this.lyricsData || this.lyricsData.length === 0) {
            this.lyricsLinesContainer.innerHTML = '<div class="no-lyrics-message">Load a KAI file to edit lyrics</div>';
            return;
        }
        
        this.lyricsLinesContainer.innerHTML = '';
        
        // Create a combined list of lyrics and rejections, sorted by line number
        const items = [];
        
        // Add lyrics lines
        this.lyricsData.forEach((line, index) => {
            items.push({
                type: 'lyric',
                data: line,
                index: index,
                lineNum: index + 1
            });
        });
        
        // Add rejections
        this.rejections.forEach((rejection, rejectionIndex) => {
            items.push({
                type: 'rejection',
                data: rejection,
                rejectionIndex: rejectionIndex,
                lineNum: rejection.line_num
            });
        });

        // Add suggestions
        this.suggestions.forEach((suggestion, suggestionIndex) => {
            // Find the best insertion point based on timing
            let insertAfterLine = 0;
            for (let i = 0; i < this.lyricsData.length; i++) {
                const line = this.lyricsData[i];
                const lineStart = typeof line === 'object' ? (line.start || line.time || line.start_time || 0) : i * 3;
                if (lineStart < suggestion.start_time) {
                    insertAfterLine = i + 1;
                }
            }

            items.push({
                type: 'suggestion',
                data: suggestion,
                suggestionIndex: suggestionIndex,
                lineNum: insertAfterLine + 0.5 // Insert between existing lines
            });
        });
        
        // Sort by line number
        items.sort((a, b) => {
            if (a.lineNum === b.lineNum) {
                // If same line number, show rejection after lyric
                return a.type === 'lyric' ? -1 : 1;
            }
            return a.lineNum - b.lineNum;
        });
        
        // Render items
        items.forEach(item => {
            if (item.type === 'lyric') {
                const lineElement = this.createLineEditor(item.data, item.index);
                this.lyricsLinesContainer.appendChild(lineElement);
            } else if (item.type === 'rejection') {
                const rejectionElement = this.createRejectionBox(item.data, item.rejectionIndex);
                this.lyricsLinesContainer.appendChild(rejectionElement);
            } else if (item.type === 'suggestion') {
                const suggestionElement = this.createSuggestionBox(item.data, item.suggestionIndex);
                this.lyricsLinesContainer.appendChild(suggestionElement);
            }
        });
    }
    
    createLineEditor(line, index) {
        const container = document.createElement('div');
        container.dataset.index = index;
        
        // Parse timing - handle both formats
        let startTime = 0;
        let endTime = 0;
        let text = '';
        let disabled = false;
        let backup = false;
        
        
        if (typeof line === 'object' && line !== null) {
            // Handle different timing field names - prioritize KAI format (start/end)
            startTime = line.start || line.time || line.start_time || 0;
            endTime = line.end || line.end_time || (startTime + 3);
            text = line.text || line.lyrics || line.content || line.lyric || '';
            disabled = line.disabled === true;
            backup = line.backup === true;
        } else {
            text = line || '';
            startTime = index * 3;
            endTime = startTime + 3;
        }
        
        // Update container class now that disabled and backup are set
        container.className = `lyric-line-editor ${disabled ? 'disabled' : ''} ${backup ? 'backup' : ''}`;
        
        container.innerHTML = `
            <span class="line-number">${index + 1}</span>
            <div class="time-inputs">
                <input type="number" class="time-input start-time" value="${startTime.toFixed(1)}" step="0.1" min="0">
                <span class="time-separator">—</span>
                <input type="number" class="time-input end-time" value="${endTime.toFixed(1)}" step="0.1" min="0">
            </div>
            <input type="text" class="text-input" value="${text}" placeholder="Enter lyrics...">
            <div class="line-controls">
                <label class="checkbox-label">
                    <input type="checkbox" class="backup-checkbox" ${backup ? 'checked' : ''}>
                    <span class="checkbox-custom"></span>
                    Backup
                </label>
            </div>
            <div class="line-actions">
                <button class="btn-icon toggle-btn ${!disabled ? 'toggle-enabled' : 'toggle-disabled'}" 
                        title="${!disabled ? 'Disable line' : 'Enable line'}">
                    ${!disabled ? '👁' : '🚫'}
                </button>
                <button class="btn-icon delete-btn" title="Delete line">🗑</button>
                <button class="btn-icon add-after-btn" title="Add line after">➕</button>
            </div>
        `;
        
        this.setupLineEventListeners(container, index);
        
        return container;
    }
    
    setupLineEventListeners(container, index) {
        const lineNumber = container.querySelector('.line-number');
        const startTimeInput = container.querySelector('.start-time');
        const endTimeInput = container.querySelector('.end-time');
        const textInput = container.querySelector('.text-input');
        const backupCheckbox = container.querySelector('.backup-checkbox');
        const toggleBtn = container.querySelector('.toggle-btn');
        const deleteBtn = container.querySelector('.delete-btn');
        const addAfterBtn = container.querySelector('.add-after-btn');
        
        // Line number click - jump to time in audio player
        lineNumber.addEventListener('click', () => {
            const audioElement = document.getElementById('editorAudio');
            if (audioElement && audioElement.src) {
                const startTime = parseFloat(startTimeInput.value) || 0;
                audioElement.currentTime = startTime;
                if (audioElement.paused) {
                    audioElement.play();
                }
            }
        });
        
        // Time inputs
        startTimeInput.addEventListener('change', (e) => {
            const value = parseFloat(e.target.value) || 0;
            this.updateLineData(index, 'start', value);
        });
        
        endTimeInput.addEventListener('change', (e) => {
            const value = parseFloat(e.target.value) || 0;
            this.updateLineData(index, 'end', value);
        });
        
        // Text input
        textInput.addEventListener('input', (e) => {
            this.updateLineData(index, 'text', e.target.value);
        });
        
        // Backup checkbox
        backupCheckbox.addEventListener('change', (e) => {
            const isBackup = e.target.checked;
            this.updateLineData(index, 'backup', isBackup);
            
            container.classList.toggle('backup', isBackup);
        });
        
        // Toggle enable/disable
        toggleBtn.addEventListener('click', () => {
            const currentDisabled = this.lyricsData[index].disabled === true;
            const newDisabled = !currentDisabled;
            
            this.updateLineData(index, 'disabled', newDisabled);
            
            container.classList.toggle('disabled', newDisabled);
            toggleBtn.classList.toggle('toggle-enabled', !newDisabled);
            toggleBtn.classList.toggle('toggle-disabled', newDisabled);
            toggleBtn.textContent = !newDisabled ? '👁' : '🚫';
            toggleBtn.title = !newDisabled ? 'Disable line' : 'Enable line';
        });
        
        // Delete line
        deleteBtn.addEventListener('click', () => {
            if (confirm('Delete this lyric line?')) {
                this.deleteLine(index);
            }
        });
        
        // Add line after
        addAfterBtn.addEventListener('click', () => {
            this.addLineAfter(index);
        });
    }
    
    createRejectionBox(rejection, rejectionIndex) {
        const container = document.createElement('div');
        container.className = 'lyric-rejection-box';
        container.dataset.rejectionIndex = rejectionIndex;
        
        container.innerHTML = `
            <div class="rejection-header">
                <span class="rejection-label">❌ Rejected Update (Line ${rejection.line_num})</span>
                <button class="rejection-delete-btn" title="Delete this rejection">🗑️</button>
            </div>
            <div class="rejection-content">
                <div class="rejection-text-pair">
                    <div class="rejection-text old-text">
                        <label>Original:</label>
                        <div class="text-content">${rejection.old_text}</div>
                    </div>
                    <div class="rejection-text new-text">
                        <label>Proposed:</label>
                        <div class="text-content">${rejection.new_text}</div>
                        <button class="copy-text-btn" title="Copy proposed text">📋 Copy</button>
                        <button class="accept-text-btn" title="Accept proposed text and replace current lyric">✅ Accept</button>
                    </div>
                </div>
                <div class="rejection-details">
                    <span class="rejection-reason">Reason: ${rejection.reason}</span>
                    ${rejection.retention_rate !== undefined ? 
                        `<span class="rejection-retention">Retention: ${(rejection.retention_rate * 100).toFixed(1)}% (min: ${(rejection.min_required * 100).toFixed(1)}%)</span>` : 
                        ''}
                </div>
            </div>
        `;
        
        // Add delete functionality
        const deleteBtn = container.querySelector('.rejection-delete-btn');
        deleteBtn.addEventListener('click', () => {
            this.deleteRejection(rejectionIndex);
        });
        
        // Add copy functionality
        const copyBtn = container.querySelector('.copy-text-btn');
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(rejection.new_text);
                copyBtn.textContent = '✅ Copied';
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy';
                }, 2000);
            } catch (error) {
                console.error('Failed to copy text:', error);
                copyBtn.textContent = '❌ Failed';
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy';
                }, 2000);
            }
        });

        // Add accept functionality
        const acceptBtn = container.querySelector('.accept-text-btn');
        acceptBtn.addEventListener('click', () => {
            this.acceptRejection(rejectionIndex);
        });
        
        return container;
    }

    createSuggestionBox(suggestion, suggestionIndex) {
        const container = document.createElement('div');
        container.className = 'lyric-suggestion-box';
        container.dataset.suggestionIndex = suggestionIndex;

        // Format timing display
        const startTime = formatTime(suggestion.start_time);
        const endTime = formatTime(suggestion.end_time);

        container.innerHTML = `
            <div class="suggestion-header">
                <span class="suggestion-label">💡 Suggested Missing Line (${startTime} - ${endTime})</span>
                <button class="suggestion-delete-btn" title="Delete this suggestion">🗑️</button>
            </div>
            <div class="suggestion-content">
                <div class="suggestion-text-display">
                    <label>Suggested Text:</label>
                    <div class="suggested-text-content">${suggestion.suggested_text}</div>
                </div>
                <div class="suggestion-details">
                    <span class="suggestion-confidence">Confidence: ${suggestion.confidence}</span>
                    <span class="suggestion-reason">Reason: ${suggestion.reason}</span>
                    ${suggestion.pitch_activity ?
                        `<span class="suggestion-pitch">Pitch Activity: ${suggestion.pitch_activity}</span>` :
                        ''}
                </div>
                <div class="suggestion-actions">
                    <button class="accept-suggestion-btn" title="Add this as a new lyric line">✅ Add as New Line</button>
                    <button class="copy-suggestion-btn" title="Copy suggested text">📋 Copy Text</button>
                </div>
            </div>
        `;

        // Add delete functionality
        const deleteBtn = container.querySelector('.suggestion-delete-btn');
        deleteBtn.addEventListener('click', () => {
            this.deleteSuggestion(suggestionIndex);
        });

        // Add copy functionality
        const copyBtn = container.querySelector('.copy-suggestion-btn');
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(suggestion.suggested_text);
                copyBtn.textContent = '✅ Copied';
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy Text';
                }, 2000);
            } catch (error) {
                console.error('Failed to copy text:', error);
                copyBtn.textContent = '❌ Failed';
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy Text';
                }, 2000);
            }
        });

        // Add accept functionality
        const acceptBtn = container.querySelector('.accept-suggestion-btn');
        acceptBtn.addEventListener('click', () => {
            this.acceptSuggestion(suggestionIndex);
        });

        return container;
    }

    deleteRejection(rejectionIndex) {
        this.rejections.splice(rejectionIndex, 1);
        this.renderEditor();
        this.notifyChange();
    }

    acceptRejection(rejectionIndex) {
        const rejection = this.rejections[rejectionIndex];
        if (!rejection) return;

        // Find the lyric line to update by matching timing, not just line number
        // This ensures we replace the correct lyric even if line numbers have shifted
        let targetLineIndex = -1;

        for (let i = 0; i < this.lyricsData.length; i++) {
            const line = this.lyricsData[i];
            if (typeof line === 'object' && line !== null) {
                const lineStart = line.start || line.time || line.start_time || 0;
                const lineEnd = line.end || line.end_time || 0;

                // Check if timing matches the rejection's expected timing
                if (rejection.start_time !== undefined && rejection.end_time !== undefined) {
                    // Match by exact timing if available in rejection
                    if (Math.abs(lineStart - rejection.start_time) < 0.1 &&
                        Math.abs(lineEnd - rejection.end_time) < 0.1) {
                        targetLineIndex = i;
                        break;
                    }
                } else if (rejection.old_text && line.text === rejection.old_text) {
                    // Fallback: match by old text content if timing not available
                    targetLineIndex = i;
                    break;
                }
            }
        }

        // If no timing match found, fallback to line number approach
        if (targetLineIndex === -1) {
            const lineIndex = rejection.line_num - 1;
            if (lineIndex >= 0 && lineIndex < this.lyricsData.length) {
                targetLineIndex = lineIndex;
            }
        }

        if (targetLineIndex >= 0 && targetLineIndex < this.lyricsData.length) {
            // Update the lyric text with the proposed text
            if (typeof this.lyricsData[targetLineIndex] === 'string') {
                // Convert string to object format if needed
                this.lyricsData[targetLineIndex] = {
                    text: rejection.new_text,
                    start: targetLineIndex * 3,
                    end: (targetLineIndex * 3) + 3
                };
            } else {
                // Update existing object, preserving timing
                this.lyricsData[targetLineIndex].text = rejection.new_text;
            }

            // Remove the rejection from the list
            this.rejections.splice(rejectionIndex, 1);

            // Re-render and notify of changes
            this.renderEditor();
            this.notifyChange();
        } else {
            console.error('Could not find matching lyric line for rejection:', rejection);
        }
    }

    deleteSuggestion(suggestionIndex) {
        this.suggestions.splice(suggestionIndex, 1);
        this.renderEditor();
        this.notifyChange();
    }

    acceptSuggestion(suggestionIndex) {
        const suggestion = this.suggestions[suggestionIndex];
        if (!suggestion) return;

        // Find the best insertion point based on timing
        let insertionIndex = this.lyricsData.length; // Default to end

        for (let i = 0; i < this.lyricsData.length; i++) {
            const line = this.lyricsData[i];
            const lineStart = typeof line === 'object' ? (line.start || line.time || line.start_time || 0) : i * 3;

            if (suggestion.start_time < lineStart) {
                insertionIndex = i;
                break;
            }
        }

        // Create new lyric line from suggestion
        const newLine = {
            start: suggestion.start_time,
            end: suggestion.end_time,
            text: suggestion.suggested_text
        };

        // Insert the new line at the correct position
        this.lyricsData.splice(insertionIndex, 0, newLine);

        // Remove the suggestion from the list
        this.suggestions.splice(suggestionIndex, 1);

        // Re-render and notify of changes
        this.renderEditor();
        this.notifyChange();
    }

    updateLineData(index, property, value) {
        if (this.lyricsData[index]) {
            if (typeof this.lyricsData[index] === 'string') {
                this.lyricsData[index] = { text: this.lyricsData[index], start: index * 3, end: (index * 3) + 3 };
            }
            this.lyricsData[index][property] = value;
            this.notifyChange();
        }
    }
    
    deleteLine(index) {
        this.lyricsData.splice(index, 1);
        this.renderEditor();
        this.notifyChange();
    }
    
    addLineAfter(index) {
        const currentLine = this.lyricsData[index];
        const nextLine = this.lyricsData[index + 1];
        
        let startTime = 0;
        let endTime = 3;
        
        if (typeof currentLine === 'object' && currentLine !== null) {
            const currentEndTime = currentLine.end || currentLine.end_time || (currentLine.start || currentLine.time || 0) + 3;
            const nextStartTime = nextLine ? (nextLine.start || nextLine.time || nextLine.start_time || currentEndTime + 3) : currentEndTime + 3;
            
            startTime = currentEndTime;
            endTime = nextStartTime;
        }
        
        const newLine = {
            start: startTime,
            end: endTime,
            text: ''
            // No disabled or backup properties - defaults to enabled lead singer
        };
        
        this.lyricsData.splice(index + 1, 0, newLine);
        this.renderEditor();
        this.notifyChange();
    }
    
    addNewLine() {
        const lastLine = this.lyricsData[this.lyricsData.length - 1];
        let startTime = this.lyricsData.length * 3;
        
        if (typeof lastLine === 'object' && lastLine !== null) {
            startTime = (lastLine.end || lastLine.end_time || (lastLine.start || lastLine.time || 0) + 3) || startTime;
        }
        
        const newLine = {
            start: startTime,
            end: startTime + 3,
            text: ''
            // No disabled or backup properties - defaults to enabled lead singer
        };
        
        this.lyricsData.push(newLine);
        this.renderEditor();
        this.notifyChange();
        
        // Focus on the new line's text input
        setTimeout(() => {
            const newLineElement = this.lyricsLinesContainer.lastElementChild;
            const textInput = newLineElement.querySelector('.text-input');
            if (textInput) textInput.focus();
        }, 100);
    }
    
    resetToOriginal() {
        if (confirm('Reset all changes and restore original lyrics?')) {
            this.lyricsData = JSON.parse(JSON.stringify(this.originalLyrics));
            this.renderEditor();
            this.notifyChange();
        }
    }
    
    getEditedLyrics() {
        return this.lyricsData.map(line => {
            // Return all lines (including disabled ones)
            // Only the delete button actually removes lines from this.lyricsData
            const cleanLine = { ...line };
            
            // Only include disabled property if it's true
            if (line.disabled !== true) {
                delete cleanLine.disabled;
            }
            
            // Only include backup property if it's true
            if (line.backup !== true) {
                delete cleanLine.backup;
            }
            
            return cleanLine;
        });
    }
    
    onLyricsEdited(callback) {
        this.editedCallback = callback;
    }
    
    notifyChange() {
        if (this.editedCallback) {
            this.editedCallback(this.getEditedLyrics(), this.rejections, this.suggestions);
        }
    }
    
    parseTime(timeStr) {
        const parts = timeStr.split(':');
        if (parts.length !== 2) return 0;
        
        const minutes = parseInt(parts[0]) || 0;
        const secondsParts = parts[1].split('.');
        const seconds = parseInt(secondsParts[0]) || 0;
        const tenths = parseInt(secondsParts[1]) || 0;
        
        return minutes * 60 + seconds + tenths / 10;
    }
}
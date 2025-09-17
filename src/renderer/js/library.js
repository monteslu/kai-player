class LibraryManager {
    constructor() {
        this.songs = [];
        this.filteredSongs = [];
        this.selectedSong = null;
        this.songsFolder = null;
        
        this.setupEventListeners();
        this.loadLibrary();
    }

    async setupEventListeners() {
        // Folder management buttons
        document.getElementById('setSongsFolderBtn').addEventListener('click', async () => {
            await this.setSongsFolder();
        });

        document.getElementById('refreshLibraryBtn').addEventListener('click', async () => {
            await this.refreshLibrary();
        });

        // Search functionality
        const searchInput = document.getElementById('librarySearch');
        searchInput.addEventListener('input', (e) => {
            this.filterSongs(e.target.value);
        });

        // Listen for folder changes from main process
        if (window.kaiAPI) {
            window.kaiAPI.library.onFolderSet((event, folderPath) => {
                this.songsFolder = folderPath;
                this.refreshLibrary();
            });
        }
    }

    async loadLibrary() {
        try {
            // Get current songs folder
            this.songsFolder = await window.kaiAPI.library.getSongsFolder();
            
            if (this.songsFolder) {
                document.getElementById('libraryPath').textContent = this.songsFolder;
                await this.scanLibrary();
            } else {
                this.showEmptyState('No songs library set');
            }
        } catch (error) {
            console.error('❌ Failed to load library:', error);
            this.showEmptyState('Error loading library');
        }
    }

    async setSongsFolder() {
        try {
            const folderPath = await window.kaiAPI.library.setSongsFolder();
            if (folderPath) {
                this.songsFolder = folderPath;
                document.getElementById('libraryPath').textContent = folderPath;
                await this.refreshLibrary();
            }
        } catch (error) {
            console.error('❌ Failed to set songs folder:', error);
        }
    }

    async refreshLibrary() {
        if (!this.songsFolder) {
            this.showEmptyState('No songs library set');
            return;
        }

        this.showLoading();
        await this.scanLibrary();
    }

    async scanLibrary() {
        try {
            const result = await window.kaiAPI.library.scanFolder();
            
            if (result.error) {
                this.showEmptyState(`Error: ${result.error}`);
                return;
            }

            this.songs = result.files || [];
            this.filteredSongs = [...this.songs];
            
            // Sort by title (or name if no title)
            this.filteredSongs.sort((a, b) => {
                const titleA = a.title || a.name;
                const titleB = b.title || b.name;
                return titleA.localeCompare(titleB);
            });
            
            this.updateLibraryDisplay();

            // Also refresh the web server cache so web UI stays in sync
            this.refreshWebServerCache();

        } catch (error) {
            console.error('❌ Failed to scan library:', error);
            this.showEmptyState('Error scanning library');
        }
    }

    filterSongs(searchTerm) {
        if (!searchTerm.trim()) {
            this.filteredSongs = [...this.songs];
        } else {
            const term = searchTerm.toLowerCase();
            this.filteredSongs = this.songs.filter(song => {
                // Search in filename, title, artist, genre, key, and stems
                return song.name.toLowerCase().includes(term) ||
                       (song.title && song.title.toLowerCase().includes(term)) ||
                       (song.artist && song.artist.toLowerCase().includes(term)) ||
                       (song.genre && song.genre.toLowerCase().includes(term)) ||
                       (song.key && song.key.toLowerCase().includes(term)) ||
                       (song.stems && song.stems.some(stem => stem.toLowerCase().includes(term)));
            });
        }

        // Sort filtered results by title (or name if no title)
        this.filteredSongs.sort((a, b) => {
            const titleA = a.title || a.name;
            const titleB = b.title || b.name;
            return titleA.localeCompare(titleB);
        });

        this.updateLibraryDisplay();
    }

    updateLibraryDisplay() {
        const tableBody = document.getElementById('libraryTableBody');
        const countElement = document.getElementById('librarySongsCount');
        
        // Update count
        const count = this.filteredSongs.length;
        const total = this.songs.length;
        countElement.textContent = count === total ? 
            `${total} songs` : 
            `${count} of ${total} songs`;

        if (this.filteredSongs.length === 0) {
            if (this.songs.length === 0) {
                this.showEmptyState('No songs found in library');
            } else {
                this.showEmptyState('No songs match search');
            }
            return;
        }

        // Build table rows HTML
        const rowsHTML = this.filteredSongs.map(song => this.createSongRowHTML(song)).join('');
        tableBody.innerHTML = rowsHTML;

        // Add click handlers
        this.attachSongClickHandlers();
    }

    createSongRowHTML(song) {
        const title = song.title || song.name.replace('.kai', '');
        const artist = song.artist || '-';
        const genre = song.genre || '-';
        const key = song.key || '-';
        const duration = this.formatDuration(song.duration);
        const stems = this.formatStems(song.stems, song.stemCount);

        return `
            <tr class="song-row" data-path="${song.path}">
                <td class="col-title" title="${title}">${title}</td>
                <td class="col-artist" title="${artist}">${artist}</td>
                <td class="col-genre" title="${genre}">${genre}</td>
                <td class="col-key" title="${key}">${key}</td>
                <td class="col-duration song-duration">${duration}</td>
                <td class="col-stems song-stems">${stems}</td>
                <td class="col-actions">
                    <div class="song-actions">
                        <button class="action-btn queue-btn" data-path="${song.path}" title="Add to Queue">
                            <span class="material-icons">queue_music</span>
                        </button>
                        <button class="action-btn info-btn" data-path="${song.path}" title="Song Info">
                            <span class="material-icons">info</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    attachSongClickHandlers() {
        const songRows = document.querySelectorAll('.song-row');
        songRows.forEach(row => {
            row.addEventListener('click', (e) => {
                // Don't select row if clicking on action buttons
                if (!e.target.closest('.action-btn')) {
                    this.selectSong(row);
                }
            });
            
            row.addEventListener('dblclick', (e) => {
                // Don't double-click load if clicking on action buttons
                if (!e.target.closest('.action-btn')) {
                    this.loadSelectedSong();
                }
            });
        });

        // Attach action button handlers
        document.querySelectorAll('.queue-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.queueSong(btn.dataset.path);
            });
        });

        document.querySelectorAll('.info-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showSongInfo(btn.dataset.path);
            });
        });
    }

    selectSong(songRow) {
        // Remove previous selection
        document.querySelectorAll('.song-row.selected').forEach(row => {
            row.classList.remove('selected');
        });
        
        // Select new song
        songRow.classList.add('selected');
        this.selectedSong = songRow.dataset.path;
    }

    async loadSelectedSong() {
        if (!this.selectedSong) {
            return;
        }

        try {
            
            // Use the existing loadKaiFile method from main.js
            if (window.kaiPlayerApp && window.kaiPlayerApp.loadKaiFileFromPath) {
                await window.kaiPlayerApp.loadKaiFileFromPath(this.selectedSong);
            } else {
                // Fallback: trigger file load via IPC (we'll need to add this)
                await window.kaiAPI.file.loadKaiFromPath(this.selectedSong);
            }
            
            // Switch to player tab
            this.switchToPlayerTab();
            
        } catch (error) {
            console.error('❌ Failed to load song:', error);
        }
    }

    switchToPlayerTab() {
        // Remove active from all tabs
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        
        // Activate player tab
        document.querySelector('.tab-btn[data-tab="player"]').classList.add('active');
        document.getElementById('player-tab').classList.add('active');
    }

    showLoading() {
        const tableBody = document.getElementById('libraryTableBody');
        tableBody.innerHTML = `
            <tr class="library-empty-row">
                <td colspan="7">
                    <div class="library-empty">
                        <div class="empty-message">Scanning library...</div>
                        <div class="empty-detail">Please wait while we extract song metadata</div>
                    </div>
                </td>
            </tr>
        `;
    }

    showEmptyState(message, detail = 'Click "Set Songs Folder" to choose your music library') {
        const tableBody = document.getElementById('libraryTableBody');
        tableBody.innerHTML = `
            <tr class="library-empty-row">
                <td colspan="7">
                    <div class="library-empty">
                        <div class="empty-icon">🎵</div>
                        <div class="empty-message">${message}</div>
                        <div class="empty-detail">${detail}</div>
                    </div>
                </td>
            </tr>
        `;
    }

    formatDuration(seconds) {
        if (!seconds || seconds <= 0) return '-';
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    formatStems(stemArray, stemCount) {
        if (!stemArray || stemArray.length === 0) {
            return stemCount ? `${stemCount} stems` : '-';
        }

        // Show all stem names
        return stemArray.join(', ') || '-';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }


    async queueSong(songPath) {
        try {
            
            // Find the song data from our songs array
            const songData = this.songs.find(song => song.path === songPath);
            if (!songData) {
                console.error('❌ Could not find song data for:', songPath);
                return;
            }
            
            // Add to queue using the queue manager
            if (window.queueManager) {
                const wasQueueEmpty = window.queueManager.queue.length === 0;
                const queueItem = window.queueManager.addSong(songData);
                
                const title = songData.title || songData.name.replace('.kai', '');
                
                // If queue was empty, start playing this first song
                if (wasQueueEmpty) {
                    this.showToast(`Playing "${title}" from queue`);
                    await window.queueManager.playFromQueue(queueItem.id, false); // Don't switch tabs
                } else {
                    this.showToast(`Added "${title}" to queue`);
                }
            } else {
                console.error('❌ Queue manager not available - Queue system not initialized');
            }
            
        } catch (error) {
            console.error('❌ Failed to queue song:', error.message);
        }
    }

    async showSongInfo(songPath) {
        try {
            
            // Show loading in modal first
            const modal = document.getElementById('songInfoModal');
            const content = document.getElementById('songInfoContent');
            
            content.innerHTML = `
                <div class="info-loading">
                    <div class="loading-spinner"></div>
                    <div>Loading song information...</div>
                </div>
            `;
            modal.style.display = 'block';
            
            // Read song.json from the KAI file
            const songInfo = await window.kaiAPI.library.getSongInfo(songPath);
            
            if (songInfo.error) {
                content.innerHTML = `
                    <div class="info-error">
                        <div class="error-message">Error loading song information</div>
                        <div class="error-detail">${songInfo.error}</div>
                    </div>
                `;
                return;
            }
            
            // Display song information
            this.displaySongInfo(songInfo);
            
        } catch (error) {
            console.error('❌ Failed to show song info:', error);
            const content = document.getElementById('songInfoContent');
            content.innerHTML = `
                <div class="info-error">
                    <div class="error-message">Error loading song information</div>
                    <div class="error-detail">${error.message}</div>
                </div>
            `;
        }
    }

    displaySongInfo(songInfo) {
        const content = document.getElementById('songInfoContent');
        const song = songInfo.song || {};
        const audio = songInfo.audio || {};
        const meta = songInfo.meta || {};
        
        // Extract filename from path
        const fileName = songInfo.filePath ? songInfo.filePath.split('/').pop().split('\\').pop() : 'Unknown';

        let html = `
            <div class="info-section">
                <h3>Song Details</h3>
                <div class="info-grid">
                    <div class="info-label">Title:</div>
                    <div class="info-value">${song.title || 'Unknown'}</div>
                    <div class="info-label">Artist:</div>
                    <div class="info-value">${song.artist || 'Unknown'}</div>
                    <div class="info-label">Album:</div>
                    <div class="info-value">${song.album || 'Unknown'}</div>
                    <div class="info-label">Duration:</div>
                    <div class="info-value">${this.formatDuration(song.duration_sec)}</div>
                    <div class="info-label">Year:</div>
                    <div class="info-value">${song.year || 'Unknown'}</div>
                    <div class="info-label">Genre:</div>
                    <div class="info-value">${song.genre || 'Unknown'}</div>
                    <div class="info-label">Key:</div>
                    <div class="info-value">${song.key || 'Unknown'}</div>
                </div>
            </div>

            <div class="info-section">
                <h3>Audio Details</h3>
                <div class="info-grid">
                    <div class="info-label">Profile:</div>
                    <div class="info-value">${audio.profile || 'Unknown'}</div>
                    <div class="info-label">Sample Rate:</div>
                    <div class="info-value">${song.sample_rate || 'Unknown'} Hz</div>
                    <div class="info-label">Channels:</div>
                    <div class="info-value">${song.channels || 'Unknown'}</div>
                    <div class="info-label">Stems:</div>
                    <div class="info-value">${this.formatStemList(audio.sources)}</div>
                </div>
            </div>

            <div class="info-section">
                <h3>File Details</h3>
                <div class="info-grid">
                    <div class="info-label">Filename:</div>
                    <div class="info-value">${fileName}</div>
                    <div class="info-label">KAI Version:</div>
                    <div class="info-value">${songInfo.kai_version || 'Unknown'}</div>
                    <div class="info-label">Source File:</div>
                    <div class="info-value">${song.source_filename || 'Unknown'}</div>
                    <div class="info-label">File Size:</div>
                    <div class="info-value">${this.formatFileSize(songInfo.fileSize)}</div>
                </div>
            </div>
        `;
        
        content.innerHTML = html;
    }

    formatStemList(sources) {
        if (!sources || !Array.isArray(sources)) return 'Unknown';
        
        const roles = sources.map(source => source.role || source.id).filter(Boolean);
        return roles.length > 0 ? roles.join(', ') : 'Unknown';
    }

    showToast(message) {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;

        // Add to DOM
        document.body.appendChild(toast);

        // Show toast
        setTimeout(() => toast.classList.add('show'), 10);

        // Hide and remove toast
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 3000);
    }

    async refreshWebServerCache() {
        try {
            // Refresh the web server's songs cache by calling the web server directly
            // This ensures the web UI alphabet navigation and search stay in sync
            console.log('🔄 Refreshing web server cache...');

            // Get reference to the main app which has the web server
            const mainApp = require('@electron/remote').getGlobal('mainApp');
            if (mainApp && mainApp.webServer) {
                await mainApp.webServer.refreshSongsCache();
                console.log('✅ Web server cache refreshed');
            } else {
                console.log('⚠️ Web server not available for cache refresh');
            }
        } catch (error) {
            console.error('❌ Failed to refresh web server cache:', error);
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('library-tab')) {
        window.libraryManager = new LibraryManager();
    }
});
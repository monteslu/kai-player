import { getFormatIcon, formatDuration, formatFileSize } from '../../shared/formatUtils.js';
import { getQueueManager } from './appInstance.js';

class LibraryManager {
    constructor() {
        this.songs = [];
        this.filteredSongs = [];
        this.selectedSong = null;
        this.songsFolder = null;
        this.currentLetter = null;
        this.currentPage = 1;
        this.pageSize = 100;
        this.availableLetters = [];

        this.setupEventListeners();
        this.loadLibrary();
    }

    async setupEventListeners() {
        // Folder management buttons
        document.getElementById('setSongsFolderBtn').addEventListener('click', async () => {
            await this.setSongsFolder();
        });

        document.getElementById('syncLibraryBtn').addEventListener('click', async () => {
            await this.syncLibrary();
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

        // Listen for background scan progress
        if (window.kaiAPI && window.kaiAPI.events) {
            window.kaiAPI.events.on('library:scanProgress', (event, data) => {
                this.updateScanProgress(data.current, data.total);
            });

            window.kaiAPI.events.on('library:scanComplete', (event, data) => {
                console.log(`📚 Background scan complete: ${data.count} songs`);
                if (this.songsFolder && this.songs.length === 0) {
                    // Get cached results from background scan instead of re-scanning
                    this.loadCachedLibrary();
                }
            });
        }
    }

    async loadLibrary() {
        try {
            // Get current songs folder
            this.songsFolder = await window.kaiAPI.library.getSongsFolder();

            if (this.songsFolder) {
                document.getElementById('libraryPath').textContent = this.songsFolder;
                // Try to load cached library immediately
                await this.loadCachedLibrary();
            } else {
                this.showEmptyState('No songs library set', 'Click "Set Songs Folder" to choose your music library');
            }
        } catch (error) {
            console.error('❌ Failed to load library:', error);
            this.showEmptyState('Error loading library', 'Try refreshing or setting a different folder');
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

    async syncLibrary() {
        if (!this.songsFolder) {
            this.showEmptyState('No songs library set');
            return;
        }

        // Disable controls during sync
        const syncBtn = document.getElementById('syncLibraryBtn');
        const refreshBtn = document.getElementById('refreshLibraryBtn');
        const searchInput = document.getElementById('librarySearch');
        const alphabetNav = document.getElementById('alphabetNav');
        const paginationControls = document.getElementById('paginationControls');

        if (syncBtn) syncBtn.disabled = true;
        if (refreshBtn) refreshBtn.disabled = true;
        if (searchInput) searchInput.disabled = true;
        if (alphabetNav) alphabetNav.style.display = 'none';
        if (paginationControls) paginationControls.style.display = 'none';

        this.showLoading();

        try {
            const result = await window.kaiAPI.library.syncLibrary();
            if (result.success) {
                this.songs = result.songs || [];

                // Calculate available letters
                this.calculateAvailableLetters();

                // Create alphabet navigation
                this.createAlphabetNavigation();

                // Load first available letter
                const firstLetter = this.availableLetters.includes('A') ? 'A' : this.availableLetters[0];
                if (firstLetter) {
                    this.loadLetterPage(firstLetter, 1);
                } else {
                    this.showEmptyState('No songs found in library');
                }

                // Refresh web server cache
                this.refreshWebServerCache();
            } else {
                this.showEmptyState(result.error || 'Failed to sync library');
            }
        } catch (error) {
            console.error('Sync error:', error);
            this.showEmptyState('❌ Failed to sync library: ' + error.message);
        }

        // Re-enable controls after sync
        if (syncBtn) syncBtn.disabled = false;
        if (refreshBtn) refreshBtn.disabled = false;
        if (searchInput) searchInput.disabled = false;
        if (alphabetNav) alphabetNav.style.display = 'block';
        if (paginationControls) paginationControls.style.display = 'flex';
    }

    async refreshLibrary() {
        if (!this.songsFolder) {
            this.showEmptyState('No songs library set');
            return;
        }

        // Disable controls during scan
        const refreshBtn = document.getElementById('refreshLibraryBtn');
        const searchInput = document.getElementById('librarySearch');
        const alphabetNav = document.getElementById('alphabetNav');
        const paginationControls = document.getElementById('paginationControls');

        if (refreshBtn) {
            refreshBtn.disabled = true;
        }
        if (searchInput) {
            searchInput.disabled = true;
        }
        if (alphabetNav) {
            alphabetNav.style.display = 'none';
        }
        if (paginationControls) {
            paginationControls.style.display = 'none';
        }

        this.showLoading();
        await this.scanLibrary();

        // Re-enable controls after scan
        if (refreshBtn) {
            refreshBtn.disabled = false;
        }
        if (searchInput) {
            searchInput.disabled = false;
        }
        if (alphabetNav) {
            alphabetNav.style.display = 'block';
        }
        if (paginationControls) {
            paginationControls.style.display = 'flex';
        }
    }

    async loadCachedLibrary() {
        try {
            const result = await window.kaiAPI.library.getCachedSongs();

            if (result.error) {
                console.warn('No cached songs, scanning...');
                await this.scanLibrary();
                return;
            }

            this.songs = result.files || [];

            // Calculate available letters
            this.calculateAvailableLetters();

            // Create alphabet navigation
            this.createAlphabetNavigation();

            // Load first available letter
            const firstLetter = this.availableLetters.includes('A') ? 'A' : this.availableLetters[0];
            if (firstLetter) {
                this.loadLetterPage(firstLetter, 1);
            } else {
                this.showEmptyState('No songs found in library');
            }
        } catch (error) {
            console.error('❌ Failed to load cached library:', error);
            this.showEmptyState('Error loading library');
        }
    }

    async scanLibrary() {
        try {
            const result = await window.kaiAPI.library.scanFolder();

            if (result.error) {
                this.showEmptyState(`Error: ${result.error}`);
                return;
            }

            this.songs = result.files || [];

            // Calculate available letters
            this.calculateAvailableLetters();

            // Create alphabet navigation
            this.createAlphabetNavigation();

            // Load first available letter
            const firstLetter = this.availableLetters.includes('A') ? 'A' : this.availableLetters[0];
            if (firstLetter) {
                this.loadLetterPage(firstLetter, 1);
            } else {
                this.showEmptyState('No songs found in library');
            }

            // Also refresh the web server cache so web UI stays in sync
            this.refreshWebServerCache();

        } catch (error) {
            console.error('❌ Failed to scan library:', error);
            this.showEmptyState('Error scanning library');
        }
    }

    calculateAvailableLetters() {
        const letterSet = new Set();

        this.songs.forEach(song => {
            const artist = song.artist || song.title || song.name;
            if (artist) {
                const firstChar = artist.trim()[0].toUpperCase();
                if (/[A-Z]/.test(firstChar)) {
                    letterSet.add(firstChar);
                } else {
                    letterSet.add('#');
                }
            }
        });

        this.availableLetters = Array.from(letterSet).sort();
        // Put '#' at the end if it exists
        if (this.availableLetters.includes('#')) {
            this.availableLetters = this.availableLetters.filter(l => l !== '#');
            this.availableLetters.push('#');
        }
    }

    createAlphabetNavigation() {
        let alphabetNav = document.getElementById('alphabetNav');

        if (!alphabetNav) {
            // Create alphabet navigation element
            const libraryHeader = document.querySelector('.library-header');
            alphabetNav = document.createElement('div');
            alphabetNav.id = 'alphabetNav';
            alphabetNav.className = 'alphabet-nav';
            libraryHeader.parentNode.insertBefore(alphabetNav, libraryHeader.nextSibling);
        }

        const allLetters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '#'];

        alphabetNav.innerHTML = `
            <div class="alphabet-title">Browse by Artist:</div>
            <div class="alphabet-buttons">
                ${allLetters.map(letter => {
                    const hasContent = this.availableLetters.includes(letter);
                    const classes = hasContent ? 'alphabet-btn' : 'alphabet-btn disabled';
                    const isActive = this.currentLetter === letter ? ' active' : '';
                    return `<button class="${classes}${isActive}" data-letter="${letter}" ${!hasContent ? 'disabled' : ''}>${letter}</button>`;
                }).join('')}
            </div>
        `;

        // Attach event listeners
        alphabetNav.querySelectorAll('.alphabet-btn:not(.disabled)').forEach(btn => {
            btn.addEventListener('click', () => {
                const letter = btn.dataset.letter;
                this.loadLetterPage(letter, 1);
            });
        });
    }

    loadLetterPage(letter, page = 1) {
        this.currentLetter = letter;
        this.currentPage = page;

        // Filter songs by letter
        this.filteredSongs = this.songs.filter(song => {
            const artist = song.artist || song.title || song.name;
            if (!artist) return false;

            const firstChar = artist.trim()[0].toUpperCase();

            if (letter === '#') {
                return !/[A-Z]/.test(firstChar);
            } else {
                return firstChar === letter;
            }
        });

        // Sort by artist, then title
        this.filteredSongs.sort((a, b) => {
            const artistA = (a.artist || a.title || a.name).toLowerCase();
            const artistB = (b.artist || b.title || b.name).toLowerCase();
            if (artistA !== artistB) {
                return artistA.localeCompare(artistB);
            }
            const titleA = (a.title || a.name).toLowerCase();
            const titleB = (b.title || b.name).toLowerCase();
            return titleA.localeCompare(titleB);
        });

        // Update active button
        document.querySelectorAll('.alphabet-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`.alphabet-btn[data-letter="${letter}"]`)?.classList.add('active');

        // Update display
        this.updateLibraryDisplay();
    }

    filterSongs(searchTerm) {
        if (!searchTerm.trim()) {
            // If no search term, reload current letter
            if (this.currentLetter) {
                this.loadLetterPage(this.currentLetter, 1);
            }
            return;
        }

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

        // Sort filtered results by artist, then title
        this.filteredSongs.sort((a, b) => {
            const artistA = (a.artist || a.title || a.name).toLowerCase();
            const artistB = (b.artist || b.title || b.name).toLowerCase();
            if (artistA !== artistB) {
                return artistA.localeCompare(artistB);
            }
            const titleA = (a.title || a.name).toLowerCase();
            const titleB = (b.title || b.name).toLowerCase();
            return titleA.localeCompare(titleB);
        });

        // Reset to page 1 and clear letter selection for search
        this.currentLetter = null;
        this.currentPage = 1;

        // Update active buttons
        document.querySelectorAll('.alphabet-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        this.updateLibraryDisplay();
    }

    getPaginatedSongs() {
        const startIdx = (this.currentPage - 1) * this.pageSize;
        const endIdx = startIdx + this.pageSize;
        return this.filteredSongs.slice(startIdx, endIdx);
    }

    getTotalPages() {
        return Math.ceil(this.filteredSongs.length / this.pageSize);
    }

    goToPage(page) {
        const totalPages = this.getTotalPages();
        if (page < 1 || page > totalPages) return;
        this.currentPage = page;
        this.updateLibraryDisplay();
    }

    nextPage() {
        this.goToPage(this.currentPage + 1);
    }

    prevPage() {
        this.goToPage(this.currentPage - 1);
    }

    updateLibraryDisplay() {
        const tableBody = document.getElementById('libraryTableBody');
        const countElement = document.getElementById('librarySongsCount');

        // Update count
        const count = this.filteredSongs.length;
        const total = this.songs.length;
        const totalPages = this.getTotalPages();

        if (this.currentLetter) {
            countElement.textContent = `${count} songs by artists starting with "${this.currentLetter}"`;
        } else if (count === total) {
            countElement.textContent = `${total} songs`;
        } else {
            countElement.textContent = `${count} of ${total} songs`;
        }

        if (this.filteredSongs.length === 0) {
            if (this.songs.length === 0) {
                this.showEmptyState('No songs found in library');
            } else {
                this.showEmptyState('No songs match search');
            }
            this.updatePaginationControls();
            return;
        }

        // Get paginated songs
        const paginatedSongs = this.getPaginatedSongs();

        // Build table rows HTML for current page only
        const rowsHTML = paginatedSongs.map(song => this.createSongRowHTML(song)).join('');
        tableBody.innerHTML = rowsHTML;

        // Add click handlers
        this.attachSongClickHandlers();

        // Update pagination controls
        this.updatePaginationControls();
    }

    updatePaginationControls() {
        const totalPages = this.getTotalPages();
        let paginationControls = document.getElementById('paginationControls');

        // Create pagination controls if they don't exist
        if (!paginationControls) {
            const libraryContent = document.querySelector('.library-content');
            paginationControls = document.createElement('div');
            paginationControls.id = 'paginationControls';
            paginationControls.className = 'pagination-controls';
            // Append to library-content (after the table)
            libraryContent.appendChild(paginationControls);
        }

        if (totalPages <= 1) {
            paginationControls.style.display = 'none';
            return;
        }

        paginationControls.style.display = 'flex';

        // Build pagination HTML with page numbers
        const startSong = (this.currentPage - 1) * this.pageSize + 1;
        const endSong = Math.min(this.currentPage * this.pageSize, this.filteredSongs.length);

        let buttonsHTML = '';

        // Previous button
        if (this.currentPage > 1) {
            buttonsHTML += `<button class="pagination-btn" data-action="prev">‹ Prev</button>`;
        }

        // Page number buttons (show up to 5 around current page)
        const maxButtons = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxButtons - 1);

        // Adjust start if we're near the end
        if (endPage - startPage < maxButtons - 1) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === this.currentPage ? ' active' : '';
            buttonsHTML += `<button class="pagination-btn page-number${isActive}" data-page="${i}">${i}</button>`;
        }

        // Next button
        if (this.currentPage < totalPages) {
            buttonsHTML += `<button class="pagination-btn" data-action="next">Next ›</button>`;
        }

        const letterText = this.currentLetter ? ` by artists starting with "${this.currentLetter}"` : '';
        paginationControls.innerHTML = `
            <div class="pagination-info">
                Showing ${startSong}-${endSong} of ${this.filteredSongs.length} songs${letterText}
            </div>
            <div class="pagination-buttons">
                ${buttonsHTML}
            </div>
        `;

        // Attach event listeners
        paginationControls.querySelectorAll('[data-action="prev"]').forEach(btn => {
            btn.addEventListener('click', () => this.prevPage());
        });
        paginationControls.querySelectorAll('[data-action="next"]').forEach(btn => {
            btn.addEventListener('click', () => this.nextPage());
        });
        paginationControls.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page);
                this.goToPage(page);
            });
        });
    }

    createSongRowHTML(song) {
        const title = song.title || song.name.replace('.kai', '');
        const artist = song.artist || '-';
        const album = song.album || '-';
        const genre = song.genre || '-';
        const key = song.key || '-';
        const duration = formatDuration(song.duration);
        const year = song.year || '-';
        const stems = this.formatStems(song.stems, song.stemCount);
        const formatIcon = getFormatIcon(song.format);

        return `
            <tr class="song-row" data-path="${song.path}">
                <td class="col-title" title="${title}">
                    <span class="format-icon">${formatIcon}</span> ${title}
                </td>
                <td class="col-artist" title="${artist}">${artist}</td>
                <td class="col-album" title="${album}">${album}</td>
                <td class="col-genre" title="${genre}">${genre}</td>
                <td class="col-key" title="${key}">${key}</td>
                <td class="col-duration song-duration">${duration}</td>
                <td class="col-year song-year">${year}</td>
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
                        <div class="progress-container">
                            <div class="progress-bar-bg">
                                <div class="progress-bar-fill" id="scanProgressBar"></div>
                            </div>
                            <div class="progress-text" id="scanProgressText">0%</div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }

    updateScanProgress(current, total) {
        const progressBar = document.getElementById('scanProgressBar');
        const progressText = document.getElementById('scanProgressText');

        if (progressBar && progressText) {
            const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
            progressBar.style.width = `${percentage}%`;
            progressText.textContent = `${current} / ${total} files (${percentage}%)`;
        }
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

    formatStems(stemArray, stemCount) {
        if (!stemArray || stemArray.length === 0) {
            return stemCount ? `${stemCount} stems` : '-';
        }

        // Show all stem names
        return stemArray.join(', ') || '-';
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
            const queueManager = getQueueManager();
            if (queueManager) {
                const wasQueueEmpty = queueManager.queue.length === 0;
                const queueItem = queueManager.addSong(songData);

                const title = songData.title || songData.name.replace('.kai', '');

                // If queue was empty, start playing this first song
                if (wasQueueEmpty) {
                    this.showToast(`Playing "${title}" from queue`);
                    await queueManager.playFromQueue(queueItem.id, false); // Don't switch tabs
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

            console.log('📊 Song info received:', songInfo);

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
        // All metadata is directly on songInfo object (no nesting)

        // Get full path and filename
        const fullPath = songInfo.path || 'Unknown';
        const fileName = songInfo.path ? songInfo.path.split('/').pop().split('\\').pop() : 'Unknown';

        // Format duration
        const duration = songInfo.duration_sec ? formatDuration(songInfo.duration_sec) :
                        songInfo.duration ? formatDuration(songInfo.duration) : 'Unknown';

        let html = `
            <div class="info-section">
                <h3>Song Details</h3>
                <div class="info-grid">
                    <div class="info-label">Title:</div>
                    <div class="info-value">${songInfo.title || 'Unknown'}</div>
                    <div class="info-label">Artist:</div>
                    <div class="info-value">${songInfo.artist || 'Unknown'}</div>
                    <div class="info-label">Album:</div>
                    <div class="info-value">${songInfo.album || 'Unknown'}</div>
                    <div class="info-label">Duration:</div>
                    <div class="info-value">${duration}</div>
                    <div class="info-label">Year:</div>
                    <div class="info-value">${songInfo.year || 'Unknown'}</div>
                    <div class="info-label">Genre:</div>
                    <div class="info-value">${songInfo.genre || 'Unknown'}</div>
                    <div class="info-label">Key:</div>
                    <div class="info-value">${songInfo.key || 'Unknown'}</div>
                </div>
            </div>

            <div class="info-section">
                <h3>Audio Details</h3>
                <div class="info-grid">
                    <div class="info-label">Format:</div>
                    <div class="info-value">${songInfo.format || 'Unknown'}</div>
                    <div class="info-label">Sample Rate:</div>
                    <div class="info-value">${songInfo.sample_rate ? songInfo.sample_rate + ' Hz' : 'Unknown'}</div>
                    <div class="info-label">Channels:</div>
                    <div class="info-value">${songInfo.channels || 'Unknown'}</div>
                    <div class="info-label">Stems:</div>
                    <div class="info-value">${this.formatStemList(songInfo.sources)}</div>
                </div>
            </div>

            <div class="info-section">
                <h3>File Details</h3>
                <div class="info-grid">
                    <div class="info-label">Filename:</div>
                    <div class="info-value">${fileName}</div>
                    <div class="info-label">Full Path:</div>
                    <div class="info-value" style="word-break: break-all;">${fullPath}</div>
                    <div class="info-label">KAI Version:</div>
                    <div class="info-value">${songInfo.kai_version || 'Unknown'}</div>
                    <div class="info-label">Source File:</div>
                    <div class="info-value">${songInfo.source_filename || 'Unknown'}</div>
                    <div class="info-label">File Size:</div>
                    <div class="info-value">${songInfo.fileSize ? formatFileSize(songInfo.fileSize) : 'Unknown'}</div>
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
            console.log('🔄 Refreshing web server cache...');
            const result = await window.kaiAPI.webServer.refreshCache();

            if (result.success) {
                console.log('✅ Web server cache refreshed');
            } else {
                console.log('⚠️ Failed to refresh web server cache:', result.error);
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
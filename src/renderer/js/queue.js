import { getFormatIcon, formatDuration } from '../../shared/formatUtils.js';

class QueueManager {
    constructor() {
        this.queue = []; // Display cache only - main process is source of truth
        this.currentIndex = -1;
        this.isPlaying = false;

        this.setupEventListeners();
        this.initializeQueue();
    }

    async initializeQueue() {
        // Load initial queue state from main process (AppState is canonical)
        await this.refreshQueueFromMain();

        // Check if there's a currently loaded song and sync currentIndex
        this.syncCurrentIndex();

        // Poll for queue updates every 2 seconds as backup (AppState changes push via IPC)
        setInterval(() => {
            this.refreshQueueFromMain();
        }, 2000);
    }

    setupEventListeners() {
        // Listen for queue updates from main process (e.g., web requests)
        if (window.kaiAPI && window.kaiAPI.events) {
            console.log('✅ QueueManager: IPC events API is available');

            window.kaiAPI.events.on('queue:updated', (event, mainQueue) => {
                console.log('📥 Received queue update from main process:', mainQueue);
                this.queue = mainQueue || [];
                // Don't reset currentIndex - it should persist across queue updates
                this.updateQueueDisplay();
                // Sync currentIndex after queue update
                this.syncCurrentIndex();
            });

            // Listen for song started notifications to sync currentIndex
            window.kaiAPI.events.on('queue:songStarted', (event, songPath) => {
                console.log('🎵 Song started notification received in renderer:', songPath);
                this.notifySongStarted(songPath);
            });

            // Add a test listener to see if any IPC events are coming through
            window.kaiAPI.events.on('song:loaded', (event, data) => {
                console.log('🔍 Test: song:loaded event received:', data);
            });
        } else {
            console.error('❌ QueueManager: IPC events API not available!');
        }

        // Player sidebar queue controls
        document.getElementById('playerClearQueueBtn')?.addEventListener('click', () => {
            if (this.queue.length > 0 && confirm('Are you sure you want to clear the queue?')) {
                this.clearQueue();
            }
        });

        document.getElementById('playerShuffleQueueBtn')?.addEventListener('click', () => {
            this.shuffleQueue();
        });

        // Quick search functionality
        const quickSearch = document.getElementById('quickLibrarySearch');
        if (quickSearch) {
            quickSearch.addEventListener('input', (e) => {
                this.handleQuickSearch(e.target.value);
            });
            
            quickSearch.addEventListener('focus', (e) => {
                if (e.target.value.trim()) {
                    this.showSearchDropdown();
                }
            });
            
            quickSearch.addEventListener('blur', (e) => {
                // Delay hiding to allow clicks on dropdown items
                setTimeout(() => this.hideSearchDropdown(), 150);
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const searchControls = document.querySelector('.quick-search-controls');
            if (searchControls && !searchControls.contains(e.target)) {
                this.hideSearchDropdown();
            }
        });

        // Listen for song end events to auto-advance
        // We'll hook this up when we integrate with the audio engine
    }

    // Add song to queue
    async addSong(songData) {
        const queueItem = {
            path: songData.path,
            title: songData.title || songData.name.replace('.kai', ''),
            artist: songData.artist || 'Unknown Artist',
            duration: songData.duration,
            requester: 'KJ', // Songs added from UI are by the KJ
            addedVia: 'ui'
        };

        // Add to main process queue (single source of truth)
        if (window.kaiAPI && window.kaiAPI.queue) {
            await window.kaiAPI.queue.addSong(queueItem);
        }

        // Refresh display from main queue
        this.refreshQueueFromMain();

        return queueItem;
    }

    // Refresh queue display from main process (single source of truth)
    async refreshQueueFromMain() {
        if (window.kaiAPI && window.kaiAPI.queue) {
            try {
                const result = await window.kaiAPI.queue.get();
                // Handle new service response format {success, queue}
                this.queue = result.queue || result || [];
                this.updateQueueDisplay();
            } catch (error) {
                console.error('Failed to refresh queue from main:', error);
            }
        }
    }

    // Add song to top of queue (for immediate loading)
    async addSongToTop(songData) {
        const queueItem = {
            path: songData.path,
            title: songData.title || songData.name.replace('.kai', ''),
            artist: songData.artist || 'Unknown Artist',
            duration: songData.duration,
            requester: 'KJ',
            addedVia: 'ui'
        };

        // Add to main process queue (it will be added at the end)
        if (window.kaiAPI && window.kaiAPI.queue) {
            await window.kaiAPI.queue.addSong(queueItem);
        }

        // Refresh display from main queue
        await this.refreshQueueFromMain();

        // Return the last added item (will have id from AppState)
        const queue = await window.kaiAPI.queue.get();
        return queue[queue.length - 1];
    }

    // Remove song from queue by ID
    async removeSong(itemId) {
        // Remove from main process queue (source of truth)
        if (window.kaiAPI && window.kaiAPI.queue) {
            const result = await window.kaiAPI.queue.removeSong(itemId);

            // Refresh display from main queue
            await this.refreshQueueFromMain();

            return result.removed;
        }
        return null;
    }

    // Clear entire queue
    async clearQueue() {
        // Clear queue in main process (source of truth)
        if (window.kaiAPI && window.kaiAPI.queue) {
            await window.kaiAPI.queue.clear();
        }

        // Reset local state and refresh from main
        this.currentIndex = -1;
        await this.refreshQueueFromMain();
    }

    // Get next song in queue
    getNextSong() {
        if (this.queue.length === 0) return null;
        
        const nextIndex = this.currentIndex + 1;
        if (nextIndex < this.queue.length) {
            return this.queue[nextIndex];
        }
        return null;
    }

    // Get current song
    getCurrentSong() {
        if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
            return this.queue[this.currentIndex];
        }
        return null;
    }

    // Advance to next song
    async playNext() {
        const nextSong = this.getNextSong();
        if (nextSong) {
            this.currentIndex++;
            await this.playSong(nextSong);
            this.updateQueueDisplay();
            return nextSong;
        }
        return null;
    }

    // Play a specific song from queue
    async playFromQueue(itemId, switchToPlayerTab = true) {
        const index = this.queue.findIndex(item => item.id === itemId);
        if (index !== -1) {
            this.currentIndex = index;
            const song = this.queue[index];
            await this.playSong(song, switchToPlayerTab);
            this.updateQueueDisplay();
            return song;
        }
        return null;
    }

    // Move song in queue
    moveSong(itemId, newIndex) {
        const currentIndex = this.queue.findIndex(item => item.id === itemId);
        if (currentIndex === -1 || newIndex < 0 || newIndex >= this.queue.length) {
            return false;
        }

        const [item] = this.queue.splice(currentIndex, 1);
        this.queue.splice(newIndex, 0, item);
        
        // Adjust current index
        if (currentIndex === this.currentIndex) {
            this.currentIndex = newIndex;
        } else if (currentIndex < this.currentIndex && newIndex >= this.currentIndex) {
            this.currentIndex--;
        } else if (currentIndex > this.currentIndex && newIndex <= this.currentIndex) {
            this.currentIndex++;
        }
        
        this.updateQueueDisplay();
        return true;
    }

    // Play a song (delegate to main player)
    async playSong(queueItem, switchToPlayerTab = true) {
        try {
            this.isPlaying = true;
            
            if (window.kaiPlayerApp && window.kaiPlayerApp.loadKaiFileFromPath) {
                await window.kaiPlayerApp.loadKaiFileFromPath(queueItem.path);
            } else {
                await window.kaiAPI.file.loadKaiFromPath(queueItem.path);
            }
            
            // Switch to player tab only if requested
            if (switchToPlayerTab) {
                this.switchToPlayerTab();
            }
            
        } catch (error) {
            console.error('❌ Failed to play song from queue:', error);
            this.isPlaying = false;
        }
    }

    switchToPlayerTab() {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        
        document.querySelector('.tab-btn[data-tab="player"]').classList.add('active');
        document.getElementById('player-tab').classList.add('active');
    }

    // Shuffle the queue
    shuffleQueue() {
        if (this.queue.length <= 1) return;
        
        // Don't shuffle the currently playing song
        const currentSong = this.currentIndex >= 0 ? this.queue[this.currentIndex] : null;
        let songsToShuffle = [...this.queue];
        
        // If there's a current song, remove it from shuffle and add it back at the beginning
        if (currentSong) {
            songsToShuffle.splice(this.currentIndex, 1);
        }
        
        // Fisher-Yates shuffle algorithm
        for (let i = songsToShuffle.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [songsToShuffle[i], songsToShuffle[j]] = [songsToShuffle[j], songsToShuffle[i]];
        }
        
        // Rebuild queue with current song first (if exists)
        if (currentSong) {
            this.queue = [currentSong, ...songsToShuffle];
            this.currentIndex = 0;
        } else {
            this.queue = songsToShuffle;
        }
        
        this.updateQueueDisplay();
    }

    // Update the queue display UI
    updateQueueDisplay() {
        // Only update player sidebar queue now
        this.updatePlayerQueueDisplay();
    }


    // Get queue statistics
    getQueueStats() {
        const totalDuration = this.queue.reduce((sum, item) => sum + (item.duration || 0), 0);
        return {
            count: this.queue.length,
            totalDuration: totalDuration,
            currentIndex: this.currentIndex,
            isPlaying: this.isPlaying
        };
    }

    // Notify queue that a song started playing
    notifySongStarted(songPath) {
        console.log('🔍 notifySongStarted called with path:', songPath);
        console.log('🔍 Current queue:', this.queue.map(item => ({ path: item.path, title: item.title })));

        // Find the song in the queue and update currentIndex
        const index = this.queue.findIndex(item => item.path === songPath);
        console.log('🔍 Found song at index:', index);

        if (index !== -1) {
            console.log(`🎯 Setting currentIndex from ${this.currentIndex} to ${index}`);
            this.currentIndex = index;
            this.isPlaying = true;
            this.updateQueueDisplay();
            console.log('✅ Queue display updated with currentIndex:', this.currentIndex);
        } else {
            console.log('❌ Song not found in queue, resetting currentIndex');
            // Song not in queue, reset tracking
            this.currentIndex = -1;
            this.isPlaying = true;
            this.updateQueueDisplay();
        }
    }

    // Sync currentIndex with the currently loaded song
    async syncCurrentIndex() {
        try {
            // Get the current song from the main process (this will be the last loaded song)
            const currentSong = await window.kaiAPI.song?.getCurrentSong?.();

            if (currentSong && currentSong.path) {
                console.log('🔄 Syncing currentIndex with loaded song:', currentSong.path);

                // Find this song in the queue
                const index = this.queue.findIndex(item => item.path === currentSong.path);
                if (index !== -1) {
                    console.log(`🎯 Found loaded song in queue at index ${index}, setting as current`);
                    this.currentIndex = index;
                    this.isPlaying = true;
                    this.updateQueueDisplay();
                } else {
                    console.log('🔍 Loaded song not found in queue, keeping current state');
                    // Don't reset currentIndex - the loaded song might not be from the queue
                    // Only update display if we have a valid currentIndex
                    if (this.currentIndex >= 0) {
                        this.updateQueueDisplay();
                    }
                }
            } else {
                console.log('🔍 No song currently loaded');
                // Only reset if we're sure there's no current song
                // Keep existing currentIndex if it's valid to preserve queue state
                if (this.currentIndex >= this.queue.length) {
                    this.currentIndex = -1;
                }
                this.isPlaying = false;
            }
        } catch (error) {
            console.error('❌ Error syncing currentIndex:', error);
            this.currentIndex = -1;
            this.isPlaying = false;
        }
    }

    // Load next song from queue without playing
    async loadNext() {
        const nextSong = this.getNextSong();
        if (nextSong) {
            this.currentIndex++;
            await this.loadSong(nextSong);
            this.updateQueueDisplay();
            return nextSong;
        }
        return null;
    }

    // Load a song without playing it
    async loadSong(queueItem) {
        try {
            
            if (window.kaiPlayerApp && window.kaiPlayerApp.loadKaiFileFromPath) {
                await window.kaiPlayerApp.loadKaiFileFromPath(queueItem.path);
            } else {
                await window.kaiAPI.file.loadKaiFromPath(queueItem.path);
            }
            
            // Don't set isPlaying = true since we're just loading
            
        } catch (error) {
            console.error('❌ Failed to load song from queue:', error);
        }
    }

    // Handle song end (load next but don't auto-play)
    async handleSongEnded() {
        this.isPlaying = false;
        
        const nextSong = await this.loadNext();
        if (nextSong) {
        } else {
            this.updateQueueDisplay();
        }
    }

    // Update player sidebar queue display
    updatePlayerQueueDisplay() {
        const playerQueueList = document.getElementById('playerQueueList');
        if (!playerQueueList) return;
        
        if (this.queue.length === 0) {
            playerQueueList.innerHTML = `
                <div class="player-queue-empty">
                    <div class="empty-icon">🎵</div>
                    <div class="empty-message">Queue is empty</div>
                </div>
            `;
            return;
        }

        // Build queue items for player sidebar
        const itemsHTML = this.queue.map((item, index) => {
            const isCurrentSong = index === this.currentIndex;
            const itemClass = isCurrentSong ? 'player-queue-item current' : 'player-queue-item';

            
            const requesterText = item.requester ? ` • Singer: ${item.requester}` : '';

            return `
                <div class="${itemClass}" data-item-id="${item.id}">
                    <div class="queue-item-number">${index + 1}</div>
                    <div class="queue-item-info">
                        <div class="queue-item-title" title="${item.title}">${item.title}</div>
                        <div class="queue-item-artist" title="${item.artist}${requesterText}">${item.artist}${requesterText}</div>
                    </div>
                    <div class="queue-item-actions">
                        <button class="queue-item-btn play-queue-sidebar-btn" data-item-id="${item.id}" title="Play Now">▶️</button>
                        <button class="queue-item-btn remove-queue-sidebar-btn" data-item-id="${item.id}" title="Remove">❌</button>
                    </div>
                </div>
            `;
        }).join('');
        
        playerQueueList.innerHTML = itemsHTML;
        
        // Attach event listeners to new buttons
        this.attachPlayerQueueListeners();
    }

    // Attach event listeners for player queue sidebar
    attachPlayerQueueListeners() {
        // Play from sidebar queue
        document.querySelectorAll('.play-queue-sidebar-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const itemId = parseFloat(btn.dataset.itemId);
                await this.playFromQueue(itemId, false); // Don't switch tabs since we're already in player
            });
        });

        // Remove from sidebar queue
        document.querySelectorAll('.remove-queue-sidebar-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const itemId = parseFloat(btn.dataset.itemId);
                await this.removeSong(itemId);
            });
        });
    }

    // Handle quick library search
    async handleQuickSearch(searchTerm) {
        const resultsContainer = document.getElementById('quickSearchResults');
        if (!resultsContainer) return;
        
        if (!searchTerm.trim()) {
            this.hideSearchDropdown();
            return;
        }

        // Get library data (assuming window.libraryManager exists)
        if (!window.libraryManager || !window.libraryManager.songs) {
            resultsContainer.innerHTML = '<div class="no-search-message">Library not loaded</div>';
            this.showSearchDropdown();
            return;
        }

        const searchLower = searchTerm.toLowerCase();
        const matches = window.libraryManager.songs
            .filter(song =>
                song.title?.toLowerCase().includes(searchLower) ||
                song.artist?.toLowerCase().includes(searchLower)
            )
            .sort((a, b) => a.title.localeCompare(b.title))
            .slice(0, 8); // Limit to first 8 results for dropdown

        if (matches.length === 0) {
            resultsContainer.innerHTML = '<div class="no-search-message">No matches found</div>';
            this.showSearchDropdown();
            return;
        }

        const resultsHTML = matches.map(song => {
            const formatIcon = getFormatIcon(song.format);
            return `
            <div class="quick-search-item" data-song-path="${song.path}">
                <div class="quick-search-info">
                    <div class="quick-search-title"><span class="format-icon">${formatIcon}</span> ${song.title}</div>
                    <div class="quick-search-artist">${song.artist}</div>
                </div>
                <div class="quick-search-buttons">
                    <button class="quick-search-add" data-song-path="${song.path}">Add</button>
                    <button class="quick-search-load" data-song-path="${song.path}">Load</button>
                </div>
            </div>
        `;}).join('');

        resultsContainer.innerHTML = resultsHTML;
        this.showSearchDropdown();

        // Attach add to queue listeners
        document.querySelectorAll('.quick-search-add').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const songPath = btn.dataset.songPath;
                const song = window.libraryManager.songs.find(s => s.path === songPath);
                if (song) {
                    const wasQueueEmpty = this.queue.length === 0;
                    const queueItem = this.addSong(song);
                    
                    const title = song.title || song.name.replace('.kai', '');
                    
                    // If queue was empty, start playing this first song
                    if (wasQueueEmpty) {
                        await this.playFromQueue(queueItem.id, false); // Don't switch tabs since we're already in player
                        this.showToast(`Playing "${title}" from queue`);
                    } else {
                        this.showToast(`Added "${title}" to queue`);
                    }
                    
                    // Show brief feedback then revert
                    const originalText = btn.textContent;
                    btn.textContent = '✓';
                    setTimeout(() => {
                        btn.textContent = originalText;
                    }, 300);
                    
                    // Clear search text and hide dropdown
                    const searchInput = document.getElementById('quickLibrarySearch');
                    if (searchInput) {
                        searchInput.value = '';
                    }
                    setTimeout(() => this.hideSearchDropdown(), 500);
                }
            });
        });

        // Attach load button listeners
        document.querySelectorAll('.quick-search-load').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const songPath = btn.dataset.songPath;
                const song = window.libraryManager.songs.find(s => s.path === songPath);
                if (song) {
                    const queueItem = this.addSongToTop(song);
                    const title = song.title || song.name.replace('.kai', '');
                    
                    // Load and play the song immediately
                    await this.playFromQueue(queueItem.id, false);
                    this.showToast(`Loading "${title}" now`);
                    
                    // Show brief feedback then revert
                    const originalText = btn.textContent;
                    btn.textContent = '✓';
                    setTimeout(() => {
                        btn.textContent = originalText;
                    }, 300);
                    
                    // Clear search text and hide dropdown
                    const searchInput = document.getElementById('quickLibrarySearch');
                    if (searchInput) {
                        searchInput.value = '';
                    }
                    setTimeout(() => this.hideSearchDropdown(), 500);
                }
            });
        });
    }

    showSearchDropdown() {
        const dropdown = document.getElementById('quickSearchResults');
        if (dropdown) {
            dropdown.style.display = 'block';
        }
    }

    hideSearchDropdown() {
        const dropdown = document.getElementById('quickSearchResults');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    }

    showToast(message) {
        // Use library manager's toast if available, otherwise fallback to console
        if (window.libraryManager && window.libraryManager.showToast) {
            window.libraryManager.showToast(message);
        } else {
            console.log('🎵 ' + message);
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Always initialize queue manager since it's used by the player sidebar
    window.queueManager = new QueueManager();
});
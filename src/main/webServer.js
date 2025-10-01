const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cookieSession = require('cookie-session');
const { Server } = require('socket.io');
const http = require('http');
const Fuse = require('fuse.js');

class WebServer {
    constructor(mainApp) {
        this.mainApp = mainApp;
        this.app = express();
        this.httpServer = null;
        this.io = null;
        this.port = 3069;
        this.songRequests = [];
        this.defaultSettings = {
            requireKJApproval: true,
            allowSongRequests: true,
            serverName: 'Loukai Karaoke',
            port: 3069,
            maxRequestsPerIP: 10
        };

        // Settings will be loaded after initialization in start() method
        this.settings = { ...this.defaultSettings };

        // Fuzzy search instance - will be initialized when songs are loaded
        this.fuse = null;

        // Songs cache to avoid scanning directory on every request
        this.cachedSongs = null;
        this.songsCacheTime = null;

        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Encrypted cookie-based sessions (persists across server restarts)
        this.app.use(cookieSession({
            name: 'kai-admin-session',
            keys: [this.getOrCreateSecretKey()], // Encryption key
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            httpOnly: true,
            secure: false, // Set to true in production with HTTPS
            sameSite: 'strict'
        }));
        
        // Serve static files (shared between main app and web interface)
        this.app.use('/static', express.static(path.join(__dirname, '../../static')));

        // Serve Butterchurn libraries for the screenshot generator (both root and admin paths)
        this.app.use('/lib', express.static(path.join(__dirname, '../renderer/lib')));
        this.app.use('/admin/lib', express.static(path.join(__dirname, '../renderer/lib')));

        // Serve Butterchurn effect screenshots
        this.app.use('/screenshots', express.static(path.join(__dirname, '../../static/images/butterchurn-screenshots')));

        // Serve React web UI build (production)
        const webDistPath = path.join(__dirname, '../web/dist');
        if (fs.existsSync(webDistPath)) {
            this.app.use('/admin', express.static(webDistPath));
        }
        
        // Rate limiting middleware
        this.app.use((req, res, next) => {
            // Simple in-memory rate limiting by IP
            req.clientIP = req.ip || req.connection.remoteAddress;
            next();
        });
    }

    setupRoutes() {
        // Main song request page for users
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../../static/song-request.html'));
        });

        // Admin page for KJs (old static version)
        this.app.get('/admin/legacy', (req, res) => {
            res.sendFile(path.join(__dirname, '../../static/admin.html'));
        });

        // Check if admin password is set
        this.app.get('/admin/check-auth', (req, res) => {
            try {
                const passwordHash = this.mainApp.settings?.get('server.adminPasswordHash');
                res.json({
                    passwordSet: !!passwordHash,
                    authenticated: !!req.session.isAdmin
                });
            } catch (error) {
                console.error('Error checking auth:', error);
                res.status(500).json({ error: 'Server error' });
            }
        });

        // Admin login endpoint
        this.app.post('/admin/login', async (req, res) => {
            try {
                const { password } = req.body;

                if (!password) {
                    return res.status(400).json({ error: 'Password required' });
                }

                const passwordHash = this.mainApp.settings?.get('server.adminPasswordHash');

                if (!passwordHash) {
                    return res.status(403).json({ error: 'No admin password set' });
                }

                const bcrypt = require('bcrypt');
                const isValid = await bcrypt.compare(password, passwordHash);

                if (isValid) {
                    // Set session data (automatically encrypted by cookie-session)
                    req.session.isAdmin = true;
                    req.session.loginTime = Date.now();

                    res.json({ success: true, message: 'Login successful' });
                } else {
                    res.status(401).json({ error: 'Invalid password' });
                }
            } catch (error) {
                console.error('Error during login:', error);
                res.status(500).json({ error: 'Server error' });
            }
        });

        // Admin logout endpoint
        this.app.post('/admin/logout', (req, res) => {
            // Clear session data (cookie-session handles the rest)
            req.session = null;
            res.json({ success: true, message: 'Logged out successfully' });
        });

        // Auth middleware - require login for protected admin endpoints
        const requireAuth = (req, res, next) => {
            if (req.session && req.session.isAdmin) {
                next(); // User is authenticated
            } else {
                res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Please login to access admin features'
                });
            }
        };

        // Apply auth middleware to all /admin/* routes except login/logout/check-auth
        this.app.use('/admin/*', (req, res, next) => {
            const openRoutes = ['/admin/login', '/admin/logout', '/admin/check-auth'];
            if (openRoutes.includes(req.path)) {
                next(); // Allow these routes without auth
            } else {
                requireAuth(req, res, next); // Require auth for everything else
            }
        });

        // Get available letters for alphabet navigation
        this.app.get('/api/letters', async (req, res) => {
            try {
                console.log('API: Getting available letters...');

                // Get songs from cache
                const allSongs = await this.getCachedSongs();
                console.log(`API: Found ${allSongs.length} songs`);

                // Group by first letter of artist
                const letterCounts = {};
                allSongs.forEach(song => {
                    const artist = song.artist || 'Unknown Artist';
                    const firstChar = artist.charAt(0).toUpperCase();
                    let letter = firstChar;

                    // Group numbers and special characters
                    if (!/[A-Z]/.test(firstChar)) {
                        letter = '#';
                    }

                    letterCounts[letter] = (letterCounts[letter] || 0) + 1;
                });

                // Return available letters with counts
                res.json({
                    letters: Object.keys(letterCounts).sort((a, b) => {
                        if (a === '#') return 1;  // # goes last
                        if (b === '#') return -1; // # goes last
                        return a.localeCompare(b);
                    }),
                    counts: letterCounts
                });
            } catch (error) {
                console.error('Error fetching letters:', error);
                res.status(500).json({ error: 'Failed to fetch letters' });
            }
        });

        // Get paginated songs for a specific letter
        this.app.get('/api/songs/letter/:letter', async (req, res) => {
            try {
                const letter = req.params.letter;
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 100;

                console.log(`API: Getting songs for letter ${letter}, page ${page}, limit ${limit}`);

                // Get songs from cache
                const allSongs = await this.getCachedSongs();

                // Filter songs by first letter of artist
                const letterSongs = allSongs.filter(song => {
                    const artist = song.artist || 'Unknown Artist';
                    const firstChar = artist.charAt(0).toUpperCase();
                    const songLetter = /[A-Z]/.test(firstChar) ? firstChar : '#';
                    return songLetter === letter;
                });

                // Sort by artist, then title
                letterSongs.sort((a, b) => {
                    const artistCompare = a.artist.localeCompare(b.artist);
                    if (artistCompare !== 0) return artistCompare;
                    return a.title.localeCompare(b.title);
                });

                // Paginate
                const totalSongs = letterSongs.length;
                const totalPages = Math.ceil(totalSongs / limit);
                const startIndex = (page - 1) * limit;
                const endIndex = startIndex + limit;
                const pageSongs = letterSongs.slice(startIndex, endIndex);

                const response = {
                    songs: pageSongs.map(song => ({
                        id: song.path,
                        title: song.title,
                        artist: song.artist,
                        duration: song.duration,
                        format: song.format || 'kai'
                    })),
                    pagination: {
                        currentPage: page,
                        totalPages,
                        totalSongs,
                        songsPerPage: limit,
                        hasNextPage: page < totalPages,
                        hasPreviousPage: page > 1
                    }
                };

                res.json(response);
            } catch (error) {
                console.error('Error fetching songs for letter:', error);
                res.status(500).json({ error: 'Failed to fetch songs' });
            }
        });

        // Get available songs for the request interface (search functionality)
        this.app.get('/api/songs', async (req, res) => {
            try {
                const search = req.query.search || '';
                const limit = parseInt(req.query.limit) || 50;

                console.log('API: Getting songs from cache...');

                // Get songs from cache
                const allSongs = await this.getCachedSongs();

                console.log(`API: Found ${allSongs.length} songs`);

                let songs = allSongs;

                if (search) {
                    // Initialize or update Fuse.js if not already done or songs changed
                    if (!this.fuse || this.fuse._docs.length !== allSongs.length) {
                        this.fuse = new Fuse(allSongs, {
                            keys: ['title', 'artist', 'album'],
                            threshold: 0.3, // 0 = exact match, 1 = match anything
                            includeScore: true,
                            ignoreLocation: true,
                            findAllMatches: true
                        });
                    }

                    // Use fuzzy search
                    const fuseResults = this.fuse.search(search);
                    songs = fuseResults.map(result => result.item);
                } else {
                    // Sort alphabetically by title when no search
                    songs = allSongs.sort((a, b) => a.title.localeCompare(b.title));
                }

                const limitedSongs = songs.slice(0, limit).map(song => ({
                    id: song.path,
                    path: song.path,
                    title: song.title,
                    artist: song.artist,
                    duration: song.duration,
                    format: song.format || 'kai'
                }));

                res.json({
                    songs: limitedSongs,
                    total: songs.length,
                    hasMore: songs.length > limit
                });
            } catch (error) {
                console.error('Error fetching songs:', error);
                res.status(500).json({ error: 'Failed to fetch songs' });
            }
        });

        // Submit song request
        this.app.post('/api/request', async (req, res) => {
            try {
                console.log('🎤 NEW REQUEST received:', req.body);

                if (!this.settings.allowSongRequests) {
                    console.log('❌ REQUEST DENIED: requests disabled');
                    return res.status(403).json({ error: 'Song requests are currently disabled' });
                }

                const { songId, requesterName, message } = req.body;

                if (!songId || !requesterName) {
                    console.log('❌ REQUEST DENIED: missing required fields', { songId: !!songId, requesterName: !!requesterName });
                    return res.status(400).json({ error: 'Song ID and requester name are required' });
                }

                // Find the song in the library
                console.log('🔍 Looking for song with ID:', songId);
                const allSongs = await this.getCachedSongs();
                console.log('📚 Found library with', allSongs.length, 'songs');
                const song = allSongs.find(s => s.path === songId);

                if (!song) {
                    console.log('❌ SONG NOT FOUND in library:', songId);
                    return res.status(404).json({ error: 'Song not found' });
                }

                console.log('✅ Song found:', song.title, 'by', song.artist);

                const request = {
                    id: Date.now() + Math.random(),
                    songId,
                    song: {
                        title: song.title,
                        artist: song.artist,
                        path: song.path
                    },
                    requesterName: requesterName.trim().substring(0, 50),
                    message: message ? message.trim().substring(0, 200) : '',
                    timestamp: new Date(),
                    status: this.settings.requireKJApproval ? 'pending' : 'approved',
                    clientIP: req.clientIP
                };

                console.log('📝 Created request object:', request);
                this.songRequests.push(request);
                console.log('📋 Request added to list, total requests:', this.songRequests.length);

                // If auto-approval is enabled, add to queue immediately
                if (!this.settings.requireKJApproval) {
                    console.log('⚡ Auto-approval enabled, adding to queue...');
                    try {
                        await this.addToQueue(request);
                        request.status = 'queued';
                        console.log('✅ Successfully added to queue');
                    } catch (queueError) {
                        console.error('❌ Failed to add to queue:', queueError);
                        throw queueError;
                    }
                } else {
                    console.log('⏳ Manual approval required, request pending');
                }

                // Notify the main app about the new request
                console.log('📢 Notifying main app about new request...');
                this.mainApp.onSongRequest?.(request);

                // Broadcast to admin clients and renderer
                this.io.to('admin-clients').emit('song-request', request);
                this.io.to('electron-apps').emit('song-request', request);
                console.log('📡 Broadcasted request to admin and renderer');

                const responseData = {
                    success: true,
                    message: this.settings.requireKJApproval ?
                        'Request submitted! Waiting for KJ approval.' :
                        'Song added to queue!',
                    requestId: request.id,
                    status: request.status
                };

                console.log('📤 Sending success response:', responseData);
                res.json(responseData);

            } catch (error) {
                console.error('❌ ERROR processing request:', error);
                res.status(500).json({ error: 'Failed to process request' });
            }
        });

        // Get queue status for users
        this.app.get('/api/queue', (req, res) => {
            try {
                const state = this.mainApp.appState.getSnapshot();
                const queueInfo = state.queue.map((item, index) => ({
                    position: index + 1,
                    title: item.title,
                    artist: item.artist,
                    requester: item.requester || 'KJ'
                }));

                res.json({
                    queue: queueInfo,
                    currentlyPlaying: state.currentSong,
                    playback: state.playback
                });
            } catch (error) {
                console.error('Error fetching queue:', error);
                res.status(500).json({ error: 'Failed to fetch queue' });
            }
        });

        // Admin endpoints (for the main Electron app) - all require auth via middleware above
        this.app.get('/admin/requests', (req, res) => {
            res.json({
                requests: this.songRequests,
                settings: this.settings
            });
        });

        this.app.post('/admin/requests/:id/approve', async (req, res) => {
            const requestId = parseFloat(req.params.id);
            const result = await this.approveRequest(requestId);

            if (result.success) {
                res.json(result);
            } else {
                const status = result.error === 'Request not found' ? 404 : 400;
                res.status(status).json(result);
            }
        });

        this.app.post('/admin/requests/:id/reject', async (req, res) => {
            const requestId = parseFloat(req.params.id);
            const result = await this.rejectRequest(requestId);

            if (result.success) {
                res.json(result);
            } else {
                const status = result.error === 'Request not found' ? 404 : 400;
                res.status(status).json(result);
            }
        });

        this.app.post('/admin/settings', (req, res) => {
            try {
                this.settings = { ...this.settings, ...req.body };
                res.json({ success: true, settings: this.settings });
            } catch (error) {
                res.status(500).json({ error: 'Failed to update settings' });
            }
        });

        // Screenshot generator utility (admin only - no linking from user interface)
        this.app.get('/admin/screenshot-generator', (req, res) => {
            res.sendFile(path.join(__dirname, '../../static/screenshot-generator.html'));
        });

        // Butterchurn screenshot API - case insensitive filename matching
        this.app.get('/api/butterchurn-screenshot/:presetName', (req, res) => {
            const fs = require('fs');
            const presetName = decodeURIComponent(req.params.presetName);

            console.log(`Screenshot API request for: "${presetName}"`);

            // Sanitize preset name same way as screenshot generator
            const sanitizedName = presetName.replace(/[^a-zA-Z0-9-_\s]/g, '_') + '.png';
            console.log(`Sanitized filename: "${sanitizedName}"`);

            const screenshotsDir = path.join(__dirname, '../../static/images/butterchurn-screenshots');

            try {
                // First try exact match
                const exactPath = path.join(screenshotsDir, sanitizedName);
                if (fs.existsSync(exactPath)) {
                    return res.sendFile(exactPath);
                }

                // If exact match fails, try case-insensitive search
                const files = fs.readdirSync(screenshotsDir);
                const matchingFile = files.find(file =>
                    file.toLowerCase() === sanitizedName.toLowerCase()
                );

                if (matchingFile) {
                    const matchedPath = path.join(screenshotsDir, matchingFile);
                    return res.sendFile(matchedPath);
                }

                // No match found
                res.status(404).send('Screenshot not found');

            } catch (error) {
                console.error('Error serving screenshot:', error);
                res.status(500).send('Server error');
            }
        });

        // Server info endpoint
        this.app.get('/api/info', (req, res) => {
            res.json({
                serverName: this.settings.serverName,
                allowRequests: this.settings.allowSongRequests,
                requireApproval: this.settings.requireKJApproval
            });
        });

        // Unified state endpoint - canonical source of truth for web clients
        this.app.get('/api/state', (req, res) => {
            try {
                const state = this.mainApp.appState.getSnapshot();
                res.json(state);
            } catch (error) {
                console.error('Error fetching app state:', error);
                res.status(500).json({ error: 'Failed to fetch state' });
            }
        });


        // Admin queue management endpoints
        this.app.get('/admin/queue', async (req, res) => {
            try {
                const state = this.mainApp.appState.getSnapshot();
                res.json({
                    queue: state.queue,
                    currentSong: state.currentSong,
                    playback: state.playback
                });
            } catch (error) {
                console.error('Error fetching admin queue:', error);
                res.status(500).json({ error: 'Failed to fetch queue' });
            }
        });

        // Player control endpoints
        this.app.post('/admin/player/play', async (req, res) => {
            try {
                console.log('🎮 Admin play button pressed');
                console.log('🎮 mainApp exists:', !!this.mainApp);
                console.log('🎮 playerPlay method exists:', !!this.mainApp?.playerPlay);

                if (this.mainApp && this.mainApp.playerPlay) {
                    console.log('🎮 Calling playerPlay method...');
                    console.log('🎮 playerPlay function:', typeof this.mainApp.playerPlay);
                    const result = await this.mainApp.playerPlay();
                    console.log('🎮 playerPlay method completed, result:', result);
                } else {
                    console.log('🎮 ERROR: playerPlay method not available');
                    console.log('🎮 mainApp type:', typeof this.mainApp);
                    console.log('🎮 mainApp keys:', this.mainApp ? Object.keys(this.mainApp).slice(0, 10) : 'none');
                }

                res.json({ success: true, message: 'Play command sent' });
            } catch (error) {
                console.error('🎮 Error sending play command:', error);
                res.status(500).json({ error: 'Failed to send play command' });
            }
        });

        this.app.post('/admin/player/load', async (req, res) => {
            try {
                const { path } = req.body;

                if (!path) {
                    return res.status(400).json({ error: 'Song path required' });
                }

                if (this.mainApp.loadKaiFile) {
                    await this.mainApp.loadKaiFile(path);
                    res.json({ success: true, message: 'Song loaded' });
                } else {
                    res.status(500).json({ error: 'Load song not available' });
                }
            } catch (error) {
                console.error('Error loading song:', error);
                res.status(500).json({ error: 'Failed to load song' });
            }
        });

        this.app.post('/admin/player/pause', async (req, res) => {
            try {
                await this.mainApp.playerPause?.();
                res.json({ success: true, message: 'Pause command sent' });
            } catch (error) {
                console.error('Error sending pause command:', error);
                res.status(500).json({ error: 'Failed to send pause command' });
            }
        });

        this.app.post('/admin/player/restart', async (req, res) => {
            try {
                await this.mainApp.playerRestart?.();
                res.json({ success: true, message: 'Restart command sent' });
            } catch (error) {
                console.error('Error sending restart command:', error);
                res.status(500).json({ error: 'Failed to send restart command' });
            }
        });

        this.app.post('/admin/player/seek', async (req, res) => {
            try {
                const { position } = req.body;
                if (typeof position !== 'number') {
                    return res.status(400).json({ error: 'Position required' });
                }
                await this.mainApp.playerSeek?.(position);
                res.json({ success: true, message: 'Seek command sent' });
            } catch (error) {
                console.error('Error sending seek command:', error);
                res.status(500).json({ error: 'Failed to send seek command' });
            }
        });

        this.app.post('/admin/player/next', async (req, res) => {
            try {
                await this.mainApp.playerNext?.();
                res.json({ success: true, message: 'Next command sent' });
            } catch (error) {
                console.error('Error sending next command:', error);
                res.status(500).json({ error: 'Failed to send next command' });
            }
        });

        this.app.post('/admin/queue/add', async (req, res) => {
            try {
                const { song, requester } = req.body;

                if (!song || !song.path) {
                    return res.status(400).json({ error: 'Song path required' });
                }

                const queueItem = {
                    path: song.path,
                    title: song.title || 'Unknown',
                    artist: song.artist || 'Unknown',
                    duration: song.duration,
                    requester: requester || 'Admin',
                    addedVia: 'web-admin'
                };

                if (this.mainApp.addSongToQueue) {
                    await this.mainApp.addSongToQueue(queueItem);
                    res.json({ success: true, message: 'Song added to queue' });
                } else {
                    res.status(500).json({ error: 'Queue not available' });
                }
            } catch (error) {
                console.error('Error adding to queue:', error);
                res.status(500).json({ error: 'Failed to add to queue' });
            }
        });

        this.app.post('/admin/queue/reset', async (req, res) => {
            try {
                await this.mainApp.clearQueue?.();
                res.json({ success: true, message: 'Queue reset' });
            } catch (error) {
                console.error('Error resetting queue:', error);
                res.status(500).json({ error: 'Failed to reset queue' });
            }
        });

        // Effects management endpoints
        this.app.get('/admin/effects', async (req, res) => {
            try {
                // Get effects list from renderer via IPC
                const effects = await this.mainApp.getEffectsList?.() || [];

                // Get current effect from AppState
                const state = this.mainApp.appState.getSnapshot();
                const currentEffect = state.effects?.current || null;

                // Get disabled effects from settings (waveformPreferences)
                const waveformPrefs = this.mainApp.settings.get('waveformPreferences', {});
                const disabledEffects = waveformPrefs.disabledEffects || [];

                res.json({
                    effects,
                    currentEffect,
                    disabledEffects
                });
            } catch (error) {
                console.error('Error fetching effects:', error);
                res.status(500).json({ error: 'Failed to fetch effects' });
            }
        });

        this.app.post('/admin/effects/select', async (req, res) => {
            try {
                const { effectName } = req.body;
                if (!effectName) {
                    return res.status(400).json({ error: 'Effect name required' });
                }

                await this.mainApp.selectEffect?.(effectName);
                res.json({ success: true, message: `Selected effect: ${effectName}` });
            } catch (error) {
                console.error('Error selecting effect:', error);
                res.status(500).json({ error: 'Failed to select effect' });
            }
        });

        this.app.post('/admin/effects/toggle', async (req, res) => {
            try {
                const { effectName, enabled } = req.body;
                if (!effectName || typeof enabled !== 'boolean') {
                    return res.status(400).json({ error: 'Effect name and enabled status required' });
                }

                await this.mainApp.toggleEffect?.(effectName, enabled);
                res.json({ success: true, message: `Effect ${effectName} ${enabled ? 'enabled' : 'disabled'}` });
            } catch (error) {
                console.error('Error toggling effect:', error);
                res.status(500).json({ error: 'Failed to toggle effect' });
            }
        });

        // Refresh library cache
        this.app.post('/admin/library/refresh', async (req, res) => {
            try {
                console.log('🔄 Admin requested library cache refresh');
                await this.refreshSongsCache();

                // Notify all web-ui clients to refresh their alphabet navigation
                this.io.emit('library-refreshed', {
                    songsCount: this.cachedSongs.length,
                    timestamp: this.songsCacheTime
                });

                res.json({
                    success: true,
                    message: `Library refreshed successfully. Found ${this.cachedSongs.length} songs.`,
                    songsCount: this.cachedSongs.length,
                    cacheTime: this.songsCacheTime
                });
            } catch (error) {
                console.error('Error refreshing library cache:', error);
                res.status(500).json({ error: 'Failed to refresh library cache' });
            }
        });

        // ===== NEW: Master Mixer Control Endpoints =====
        this.app.post('/admin/mixer/master-gain', async (req, res) => {
            try {
                const { bus, gainDb } = req.body;
                if (!bus || typeof gainDb !== 'number') {
                    return res.status(400).json({ error: 'bus (PA/IEM/mic) and gainDb required' });
                }

                // Update AppState immediately
                const currentMixer = this.mainApp.appState.state.mixer;
                if (currentMixer[bus]) {
                    console.log(`🎚️ Setting ${bus} gain: ${currentMixer[bus].gain} → ${gainDb} dB`);

                    // Create a new mixer state object with the updated bus
                    const updatedMixer = {
                        ...currentMixer,
                        [bus]: {
                            ...currentMixer[bus],
                            gain: gainDb
                        }
                    };
                    this.mainApp.appState.updateMixerState(updatedMixer);
                }

                // Call audioEngine via renderer window to apply audio changes
                if (this.mainApp.mainWindow && !this.mainApp.mainWindow.isDestroyed()) {
                    this.mainApp.mainWindow.webContents.send('mixer:setMasterGain', bus, gainDb);
                    res.json({ success: true, bus, gainDb });
                } else {
                    res.status(500).json({ error: 'Renderer window not available' });
                }
            } catch (error) {
                console.error('Error setting master gain:', error);
                res.status(500).json({ error: 'Failed to set master gain' });
            }
        });

        this.app.post('/admin/mixer/master-mute', async (req, res) => {
            try {
                const { bus } = req.body;
                if (!bus) {
                    return res.status(400).json({ error: 'bus (PA/IEM/mic) required' });
                }

                // Update AppState immediately (toggle mute)
                const currentMixer = this.mainApp.appState.state.mixer;
                let newMuted = false;

                if (currentMixer[bus]) {
                    const oldMuted = currentMixer[bus].muted;
                    newMuted = !oldMuted;
                    console.log(`🔇 Toggling ${bus} mute: ${oldMuted} → ${newMuted}`);

                    // Create a new mixer state object with the updated bus
                    const updatedMixer = {
                        ...currentMixer,
                        [bus]: {
                            ...currentMixer[bus],
                            muted: newMuted
                        }
                    };
                    this.mainApp.appState.updateMixerState(updatedMixer);
                }

                // Call audioEngine via renderer window to apply audio changes
                if (this.mainApp.mainWindow && !this.mainApp.mainWindow.isDestroyed()) {
                    // Send the new muted state, not a toggle command
                    this.mainApp.mainWindow.webContents.send('mixer:setMasterMute', bus, newMuted);
                    res.json({ success: true, bus, muted: newMuted });
                } else {
                    res.status(500).json({ error: 'Renderer window not available' });
                }
            } catch (error) {
                console.error('Error toggling master mute:', error);
                res.status(500).json({ error: 'Failed to toggle master mute' });
            }
        });

        // ===== NEW: Effects Control Endpoints =====
        this.app.post('/admin/effects/set', async (req, res) => {
            try {
                const { effectName } = req.body;
                if (!effectName) {
                    return res.status(400).json({ error: 'effectName required' });
                }

                // Update AppState
                this.mainApp.appState.updateEffectsState({ current: effectName });

                // Send to renderer
                await this.mainApp.sendToRendererAndWait('effects:set', { effectName }, 2000);

                res.json({ success: true, effectName });
            } catch (error) {
                console.error('Error setting effect:', error);
                res.status(500).json({ error: 'Failed to set effect' });
            }
        });

        this.app.post('/admin/effects/next', async (req, res) => {
            try {
                this.mainApp.sendToRenderer('effects:next');
                res.json({ success: true });
            } catch (error) {
                console.error('Error changing to next effect:', error);
                res.status(500).json({ error: 'Failed to change effect' });
            }
        });

        this.app.post('/admin/effects/previous', async (req, res) => {
            try {
                this.mainApp.sendToRenderer('effects:previous');
                res.json({ success: true });
            } catch (error) {
                console.error('Error changing to previous effect:', error);
                res.status(500).json({ error: 'Failed to change effect' });
            }
        });

        this.app.post('/admin/effects/random', async (req, res) => {
            try {
                this.mainApp.sendToRenderer('effects:random');
                res.json({ success: true });
            } catch (error) {
                console.error('Error selecting random effect:', error);
                res.status(500).json({ error: 'Failed to select random effect' });
            }
        });

        this.app.post('/admin/effects/disable', async (req, res) => {
            try {
                const { effectName } = req.body;
                if (!effectName) {
                    return res.status(400).json({ error: 'effectName required' });
                }

                // Get current waveformPreferences from settings
                const waveformPrefs = this.mainApp.settings.get('waveformPreferences', {});
                const disabled = [...(waveformPrefs.disabledEffects || [])];

                if (!disabled.includes(effectName)) {
                    disabled.push(effectName);
                    waveformPrefs.disabledEffects = disabled;
                    this.mainApp.settings.set('waveformPreferences', waveformPrefs);
                    await this.mainApp.settings.save();

                    // Notify renderer to update its disabled effects list
                    this.mainApp.sendToRenderer('effects:disable', effectName);
                }

                res.json({ success: true, disabled });
            } catch (error) {
                console.error('Error disabling effect:', error);
                res.status(500).json({ error: 'Failed to disable effect' });
            }
        });

        this.app.post('/admin/effects/enable', async (req, res) => {
            try {
                const { effectName } = req.body;
                if (!effectName) {
                    return res.status(400).json({ error: 'effectName required' });
                }

                // Get current waveformPreferences from settings
                const waveformPrefs = this.mainApp.settings.get('waveformPreferences', {});
                const disabled = (waveformPrefs.disabledEffects || []).filter(e => e !== effectName);
                waveformPrefs.disabledEffects = disabled;
                this.mainApp.settings.set('waveformPreferences', waveformPrefs);
                await this.mainApp.settings.save();

                // Notify renderer to update its disabled effects list
                this.mainApp.sendToRenderer('effects:enable', effectName);

                res.json({ success: true, disabled });
            } catch (error) {
                console.error('Error enabling effect:', error);
                res.status(500).json({ error: 'Failed to enable effect' });
            }
        });

        // ===== NEW: Preferences Control Endpoints =====
        this.app.get('/admin/preferences', (req, res) => {
            try {
                const state = this.mainApp.appState.getSnapshot();
                res.json(state.preferences);
            } catch (error) {
                console.error('Error fetching preferences:', error);
                res.status(500).json({ error: 'Failed to fetch preferences' });
            }
        });

        this.app.get('/admin/settings/waveform', (req, res) => {
            try {
                const waveformPrefs = this.mainApp.settings.get('waveformPreferences', {});
                res.json({ settings: waveformPrefs });
            } catch (error) {
                console.error('Error fetching waveform settings:', error);
                res.status(500).json({ error: 'Failed to fetch waveform settings' });
            }
        });

        this.app.post('/admin/settings/waveform', async (req, res) => {
            try {
                const waveformPrefs = this.mainApp.settings.get('waveformPreferences', {});
                const updated = { ...waveformPrefs, ...req.body };
                this.mainApp.settings.set('waveformPreferences', updated);
                await this.mainApp.settings.save();

                // Send to renderer for immediate effect
                this.mainApp.sendToRenderer('waveform:settingsChanged', updated);

                res.json({ success: true, settings: updated });
            } catch (error) {
                console.error('Error updating waveform settings:', error);
                res.status(500).json({ error: 'Failed to update waveform settings' });
            }
        });

        this.app.get('/admin/settings/autotune', (req, res) => {
            try {
                const autotunePrefs = this.mainApp.settings.get('autoTunePreferences', {});
                res.json({ settings: autotunePrefs });
            } catch (error) {
                console.error('Error fetching autotune settings:', error);
                res.status(500).json({ error: 'Failed to fetch autotune settings' });
            }
        });

        this.app.post('/admin/settings/autotune', async (req, res) => {
            try {
                const autotunePrefs = this.mainApp.settings.get('autoTunePreferences', {});
                const updated = { ...autotunePrefs, ...req.body };
                this.mainApp.settings.set('autoTunePreferences', updated);
                await this.mainApp.settings.save();

                // Send to renderer for immediate effect
                this.mainApp.sendToRenderer('autotune:settingsChanged', updated);

                res.json({ success: true, settings: updated });
            } catch (error) {
                console.error('Error updating autotune settings:', error);
                res.status(500).json({ error: 'Failed to update autotune settings' });
            }
        });

        this.app.post('/admin/preferences/autotune', async (req, res) => {
            try {
                const { enabled, strength, speed } = req.body;
                const updates = {};

                if (typeof enabled === 'boolean') updates.enabled = enabled;
                if (typeof strength === 'number') updates.strength = strength;
                if (typeof speed === 'number') updates.speed = speed;

                this.mainApp.appState.setAutoTunePreferences(updates);

                // Send to renderer
                await this.mainApp.sendToRendererAndWait('autotune:setSettings', updates, 2000);

                res.json({ success: true, autoTune: this.mainApp.appState.state.preferences.autoTune });
            } catch (error) {
                console.error('Error updating autotune preferences:', error);
                res.status(500).json({ error: 'Failed to update autotune preferences' });
            }
        });

        this.app.post('/admin/preferences/microphone', async (req, res) => {
            try {
                const { enabled, gain, toSpeakers } = req.body;
                const updates = {};

                if (typeof enabled === 'boolean') updates.enabled = enabled;
                if (typeof gain === 'number') updates.gain = gain;
                if (typeof toSpeakers === 'boolean') updates.toSpeakers = toSpeakers;

                this.mainApp.appState.setMicrophonePreferences(updates);

                // Send to renderer
                if (updates.enabled !== undefined) {
                    await this.mainApp.sendToRendererAndWait('microphone:setEnabled', { enabled: updates.enabled }, 2000);
                }
                if (updates.gain !== undefined) {
                    await this.mainApp.sendToRendererAndWait('microphone:setGain', { gain: updates.gain }, 2000);
                }

                res.json({ success: true, microphone: this.mainApp.appState.state.preferences.microphone });
            } catch (error) {
                console.error('Error updating microphone preferences:', error);
                res.status(500).json({ error: 'Failed to update microphone preferences' });
            }
        });

        this.app.post('/admin/preferences/effects', async (req, res) => {
            try {
                const updates = {};
                const { enableWaveforms, enableEffects, randomEffectOnSong, overlayOpacity, showUpcomingLyrics } = req.body;

                if (typeof enableWaveforms === 'boolean') updates.enableWaveforms = enableWaveforms;
                if (typeof enableEffects === 'boolean') updates.enableEffects = enableEffects;
                if (typeof randomEffectOnSong === 'boolean') updates.randomEffectOnSong = randomEffectOnSong;
                if (typeof overlayOpacity === 'number') updates.overlayOpacity = overlayOpacity;
                if (typeof showUpcomingLyrics === 'boolean') updates.showUpcomingLyrics = showUpcomingLyrics;

                this.mainApp.appState.updateEffectsState(updates);

                // Send to renderer
                await this.mainApp.sendToRendererAndWait('effects:updateSettings', updates, 2000);

                res.json({ success: true, effects: this.mainApp.appState.state.effects });
            } catch (error) {
                console.error('Error updating effects preferences:', error);
                res.status(500).json({ error: 'Failed to update effects preferences' });
            }
        });

        // SPA fallback for React Router - serve index.html for all /admin/* routes not handled above
        this.app.get('/admin/*', (req, res) => {
            const webDistPath = path.join(__dirname, '../web/dist');
            const indexPath = path.join(webDistPath, 'index.html');
            if (fs.existsSync(indexPath)) {
                res.sendFile(indexPath);
            } else {
                res.status(404).send('Web UI not built. Run: cd src/web && npm run build');
            }
        });
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            // Handle connection type identification
            socket.on('identify', (data) => {
                socket.clientType = data.type; // 'electron-app', 'web-ui', or 'admin'
                console.log(`Client identified as: ${data.type}`);

                if (data.type === 'electron-app') {
                    socket.join('electron-apps');
                } else if (data.type === 'web-ui') {
                    socket.join('web-clients');
                } else if (data.type === 'admin') {
                    socket.join('admin-clients');
                    console.log('Admin client connected and authenticated');

                    // Send current state to newly connected admin client
                    const currentState = this.mainApp.appState.getSnapshot();

                    // Get disabled effects from settings (not AppState)
                    const waveformPrefs = this.mainApp.settings.get('waveformPreferences', {});
                    const effectsState = {
                        ...currentState.effects,
                        disabled: waveformPrefs.disabledEffects || []
                    };

                    socket.emit('mixer-update', currentState.mixer);
                    socket.emit('effects-update', effectsState);
                    socket.emit('queue-update', {
                        queue: currentState.queue,
                        currentSong: currentState.currentSong
                    });
                    socket.emit('playback-state-update', currentState.playback);
                    console.log('📤 Sent initial state to admin client:', {
                        mixer: currentState.mixer,
                        queue: currentState.queue.length,
                        playback: currentState.playback,
                        disabledEffects: effectsState.disabled.length
                    });
                }
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
            });

            // Song request events
            socket.on('song-request', (request) => {
                // Broadcast to electron apps
                socket.to('electron-apps').emit('new-song-request', request);
            });

            // Queue updates
            socket.on('queue-updated', (queueData) => {
                // Broadcast to all web clients and admin clients
                socket.to('web-clients').emit('queue-update', queueData);
                socket.to('admin-clients').emit('queue-update', queueData);
            });

            // Player state events
            socket.on('player-state', (state) => {
                socket.to('web-clients').emit('player-state-update', state);
                socket.to('admin-clients').emit('player-state-update', state);
            });

            // Settings changes
            socket.on('settings-changed', (settings) => {
                socket.to('web-clients').emit('settings-update', settings);
                socket.to('admin-clients').emit('settings-update', settings);
            });


            // Playback position sync
            socket.on('playback-position', (data) => {
                // Broadcast current playback position to all web clients
                socket.to('web-clients').emit('position-sync', data);
            });

            // Song loading events
            socket.on('song-loaded', (songData) => {
                // Notify all clients that a new song is loaded
                socket.to('web-clients').emit('song-changed', songData);
                socket.to('admin-clients').emit('song-changed', songData);
            });

            // Effect control events
            socket.on('effect-control', (data) => {
                // Forward effect control commands to electron apps
                socket.to('electron-apps').emit('effect-control', data);
                console.log(`Effect control: ${data.action}`);
            });
        });
    }

    async addToQueue(request) {
        console.log('🎵 Adding to queue:', request.song.title);

        // Add the song to the main app's queue
        if (this.mainApp.addSongToQueue) {
            const queueItem = {
                ...request.song,
                requester: request.requesterName,
                addedVia: 'web-request'
            };
            console.log('🎵 Queue item:', queueItem);
            console.log('🎵 Calling mainApp.addSongToQueue...');

            try {
                await this.mainApp.addSongToQueue(queueItem);
                console.log('✅ Successfully called mainApp.addSongToQueue');
            } catch (error) {
                console.error('❌ Error in mainApp.addSongToQueue:', error);
                throw error;
            }
        } else {
            console.error('❌ mainApp.addSongToQueue method not available');
            throw new Error('Queue functionality not available');
        }
    }

    async approveRequest(requestId) {
        const request = this.songRequests.find(r => r.id === requestId);

        if (!request) {
            return { success: false, error: 'Request not found' };
        }

        if (request.status !== 'pending') {
            return { success: false, error: 'Request is not pending' };
        }

        request.status = 'approved';
        await this.addToQueue(request);
        request.status = 'queued';

        // Broadcast the approval
        this.io.to('admin-clients').emit('request-approved', request);
        this.io.to('electron-apps').emit('request-approved', request);

        return { success: true, request };
    }

    async rejectRequest(requestId) {
        const request = this.songRequests.find(r => r.id === requestId);

        if (!request) {
            return { success: false, error: 'Request not found' };
        }

        if (request.status !== 'pending') {
            return { success: false, error: 'Request is not pending' };
        }

        request.status = 'rejected';

        // Broadcast the rejection
        this.io.to('admin-clients').emit('request-rejected', request);
        this.io.to('electron-apps').emit('request-rejected', request);

        return { success: true, request };
    }

    async start(port) {
        // Load settings first to get the saved port
        this.settings = this.loadSettings();

        // Use port from settings if not explicitly provided
        if (!port) {
            port = this.settings.port || 3069;
        }

        this.port = port;

        return new Promise((resolve, reject) => {
            // Try the requested port first, then try others if it's taken
            const tryPort = (currentPort) => {
                // Create HTTP server for Socket.IO
                this.httpServer = http.createServer(this.app);

                // Initialize Socket.IO
                this.io = new Server(this.httpServer, {
                    cors: {
                        origin: "*",
                        methods: ["GET", "POST"]
                    }
                });

                // Setup Socket.IO connection handling
                this.setupSocketHandlers();

                // Add global error handling to prevent server crashes
                this.httpServer.on('error', (error) => {
                    console.error('🚨 HTTP Server error:', error);
                });

                this.httpServer.on('clientError', (error, socket) => {
                    console.error('🚨 HTTP Client error:', error);
                    if (!socket.destroyed) {
                        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
                    }
                });

                // Add Express error handling middleware
                this.app.use((error, req, res, next) => {
                    console.error('🚨 Express error:', error);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Internal server error' });
                    }
                });

                this.server = this.httpServer.listen(currentPort, (err) => {
                    if (err) {
                        if (err.code === 'EADDRINUSE' && currentPort < port + 10) {
                            console.log(`Port ${currentPort} in use, trying ${currentPort + 1}...`);
                            tryPort(currentPort + 1);
                        } else {
                            reject(err);
                        }
                    } else {
                        this.port = currentPort;

                        // Load settings from persistent storage now that mainApp is available
                        this.settings = this.loadSettings();

                        console.log(`Web server started on http://localhost:${this.port}`);
                        console.log(`Socket.IO server ready for connections`);
                        console.log(`🔧 Loaded settings:`, this.settings);
                        resolve(this.port);
                    }
                });

                this.server.on('error', (err) => {
                    if (err.code === 'EADDRINUSE' && currentPort < port + 10) {
                        tryPort(currentPort + 1);
                    } else {
                        reject(err);
                    }
                });
            };

            tryPort(port);
        });
    }

    stop() {
        if (this.io) {
            this.io.close();
            this.io = null;
        }

        if (this.server) {
            this.server.close();
            this.server = null;
            console.log('Web server and Socket.IO server stopped');
        }

        if (this.httpServer) {
            this.httpServer = null;
        }
    }

    getPort() {
        return this.port;
    }

    getLanIp() {
        try {
            const interfaces = os.networkInterfaces();
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name]) {
                    // Skip internal (loopback) and non-IPv4 addresses
                    if (iface.family === 'IPv4' && !iface.internal) {
                        return iface.address;
                    }
                }
            }
        } catch (error) {
            console.error('Failed to get LAN IP:', error);
        }
        return 'localhost';
    }

    getServerUrl() {
        if (!this.port) return null;
        const ip = this.getLanIp();
        return `http://${ip}:${this.port}`;
    }

    getSettings() {
        return this.settings;
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        // Save to persistent storage
        this.saveSettings();
        // Broadcast changes to all connected clients
        this.broadcastSettingsChange(this.settings);
    }

    loadSettings() {
        try {
            // Load from main app's settings manager
            const savedSettings = {};
            if (this.mainApp && this.mainApp.settings) {
                savedSettings.serverName = this.mainApp.settings.get('server.serverName', this.defaultSettings.serverName);
                savedSettings.allowSongRequests = this.mainApp.settings.get('server.allowSongRequests', this.defaultSettings.allowSongRequests);
                savedSettings.requireKJApproval = this.mainApp.settings.get('server.requireKJApproval', this.defaultSettings.requireKJApproval);
                savedSettings.maxRequestsPerIP = this.mainApp.settings.get('server.maxRequestsPerIP', this.defaultSettings.maxRequestsPerIP);
            }
            const finalSettings = { ...this.defaultSettings, ...savedSettings };
            console.log('🔧 Final loaded settings:', finalSettings);
            return finalSettings;
        } catch (error) {
            console.error('Error loading settings:', error);
            return { ...this.defaultSettings };
        }
    }

    saveSettings() {
        try {
            if (this.mainApp && this.mainApp.settings) {
                console.log('🔧 Saving server settings:', this.settings);
                this.mainApp.settings.set('server.serverName', this.settings.serverName);
                this.mainApp.settings.set('server.allowSongRequests', this.settings.allowSongRequests);
                this.mainApp.settings.set('server.requireKJApproval', this.settings.requireKJApproval);
                this.mainApp.settings.set('server.maxRequestsPerIP', this.settings.maxRequestsPerIP);
                console.log('🔧 Server settings saved to persistent storage');
            } else {
                console.error('🚨 Cannot save settings: mainApp or settings manager not available');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    broadcastSettingsChange(settings) {
        if (this.io) {
            // Broadcast to admin clients and electron apps
            this.io.to('admin-clients').emit('settings-update', settings);
            this.io.to('electron-apps').emit('settings-update', settings);
            console.log('📡 Settings changes broadcasted to clients');
        }
    }

    getSongRequests() {
        return this.songRequests;
    }

    clearRequests() {
        this.songRequests = [];
    }


    broadcastPlaybackPosition(position, isPlaying, songId) {
        if (this.io) {
            this.io.emit('playback-position', {
                position: position,
                isPlaying: isPlaying,
                songId: songId,
                timestamp: Date.now()
            });
        }
    }

    broadcastPlaybackState(playbackState) {
        if (this.io) {
            this.io.emit('playback-state-update', playbackState);
        }
    }

    broadcastSongLoaded(songData) {
        if (this.io) {
            // Handle both AppState song format and legacy format
            const title = songData.title || songData.metadata?.title || 'Unknown';
            const artist = songData.artist || songData.metadata?.artist || 'Unknown';
            const duration = songData.duration || songData.metadata?.duration || 0;

            this.io.emit('song-loaded', {
                songId: `${title} - ${artist}`,
                title,
                artist,
                duration
            });
        }
    }

    // Get cached songs or refresh cache if needed
    async getCachedSongs() {
        if (!this.cachedSongs) {
            console.log('📚 Loading songs into cache...');
            await this.refreshSongsCache();
        }
        return this.cachedSongs;
    }

    // Refresh the songs cache by scanning the directory
    async refreshSongsCache() {
        try {
            console.log('🔄 Refreshing songs cache...');
            this.cachedSongs = await this.mainApp.getLibrarySongs?.() || [];
            this.songsCacheTime = Date.now();

            // Reset Fuse.js instance since songs changed
            this.fuse = null;

            console.log(`✅ Cached ${this.cachedSongs.length} songs`);
        } catch (error) {
            console.error('❌ Failed to refresh songs cache:', error);
            this.cachedSongs = [];
        }
    }

    // Clear the songs cache (useful for manual refresh)
    clearSongsCache() {
        console.log('🗑️ Clearing songs cache...');
        this.cachedSongs = null;
        this.songsCacheTime = null;
        this.fuse = null;
    }

    // Get or create a persistent secret key for cookie encryption
    getOrCreateSecretKey() {
        const keyName = 'server.cookieSecretKey';
        let secretKey = this.mainApp.settings?.get(keyName);

        if (!secretKey) {
            // Generate a new 32-byte random key
            const crypto = require('crypto');
            secretKey = crypto.randomBytes(32).toString('base64');

            // Save it persistently
            if (this.mainApp.settings) {
                this.mainApp.settings.set(keyName, secretKey);
                console.log('🔐 Generated new cookie encryption key');
            }
        }

        return secretKey;
    }

}

module.exports = WebServer;
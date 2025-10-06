import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import cookieSession from 'cookie-session';
import { Server } from 'socket.io';
import http from 'http';
import Fuse from 'fuse.js';
import * as queueService from '../shared/services/queueService.js';
import * as libraryService from '../shared/services/libraryService.js';
import * as playerService from '../shared/services/playerService.js';
import * as preferencesService from '../shared/services/preferencesService.js';
import * as effectsService from '../shared/services/effectsService.js';
import * as mixerService from '../shared/services/mixerService.js';
import * as requestsService from '../shared/services/requestsService.js';
import * as serverSettingsService from '../shared/services/serverSettingsService.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

        // Get queue status for users - using shared queueService
        this.app.get('/api/queue', (req, res) => {
            try {
                const result = queueService.getQueueInfo(this.mainApp.appState);
                const state = this.mainApp.appState.getSnapshot();

                res.json({
                    queue: result.queue,
                    currentlyPlaying: result.currentSong,
                    playback: state.playback,
                    total: result.total
                });
            } catch (error) {
                console.error('Error fetching queue:', error);
                res.status(500).json({ error: 'Failed to fetch queue' });
            }
        });

        // Admin endpoints (for the main Electron app) - all require auth via middleware above
        this.app.get('/admin/requests', (req, res) => {
            const result = requestsService.getRequests(this);
            if (result.success) {
                res.json({
                    requests: result.requests,
                    settings: result.settings
                });
            } else {
                res.status(500).json(result);
            }
        });

        this.app.post('/admin/requests/:id/approve', async (req, res) => {
            const requestId = parseFloat(req.params.id);
            const result = await requestsService.approveRequest(this, requestId);

            if (result.success) {
                res.json(result);
            } else {
                const status = result.error === 'Request not found' ? 404 : 400;
                res.status(status).json(result);
            }
        });

        this.app.post('/admin/requests/:id/reject', async (req, res) => {
            const requestId = parseFloat(req.params.id);
            const result = await requestsService.rejectRequest(this, requestId);

            if (result.success) {
                res.json(result);
            } else {
                const status = result.error === 'Request not found' ? 404 : 400;
                res.status(status).json(result);
            }
        });

        this.app.post('/admin/settings', (req, res) => {
            const result = serverSettingsService.updateServerSettings(this, req.body);
            if (result.success) {
                res.json(result);
            } else {
                res.status(500).json(result);
            }
        });

        // Screenshot generator utility (admin only - no linking from user interface)
        this.app.get('/admin/screenshot-generator', (req, res) => {
            res.sendFile(path.join(__dirname, '../../static/screenshot-generator.html'));
        });

        // Butterchurn screenshot API - case insensitive filename matching
        this.app.get('/api/butterchurn-screenshot/:presetName', (req, res) => {
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


        // Admin queue management endpoints - using shared queueService
        this.app.get('/admin/queue', async (req, res) => {
            try {
                const result = queueService.getQueue(this.mainApp.appState);
                const state = this.mainApp.appState.getSnapshot();
                res.json({
                    success: result.success,
                    queue: result.queue,
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
                const result = playerService.play(this.mainApp);
                res.json(result);
            } catch (error) {
                console.error('Error sending play command:', error);
                res.status(500).json({ error: 'Failed to send play command' });
            }
        });

        this.app.post('/admin/player/load', async (req, res) => {
            try {
                const { path } = req.body;

                if (!path) {
                    return res.status(400).json({ error: 'Song path required' });
                }

                const result = await playerService.loadSong(this.mainApp, path);
                res.json(result);
            } catch (error) {
                console.error('Error loading song:', error);
                res.status(500).json({ error: 'Failed to load song' });
            }
        });

        this.app.post('/admin/player/pause', async (req, res) => {
            try {
                const result = playerService.pause(this.mainApp);
                res.json(result);
            } catch (error) {
                console.error('Error sending pause command:', error);
                res.status(500).json({ error: 'Failed to send pause command' });
            }
        });

        this.app.post('/admin/player/restart', async (req, res) => {
            try {
                const result = playerService.restart(this.mainApp);
                res.json(result);
            } catch (error) {
                console.error('Error sending restart command:', error);
                res.status(500).json({ error: 'Failed to send restart command' });
            }
        });

        this.app.post('/admin/player/seek', async (req, res) => {
            try {
                const { position } = req.body;
                const result = playerService.seek(this.mainApp, position);
                if (result.success) {
                    res.json(result);
                } else {
                    res.status(400).json(result);
                }
            } catch (error) {
                console.error('Error sending seek command:', error);
                res.status(500).json({ error: 'Failed to send seek command' });
            }
        });

        this.app.post('/admin/player/next', async (req, res) => {
            try {
                const result = await playerService.playNext(this.mainApp);
                res.json(result);
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

                // Use shared queueService via mainApp method
                // (mainApp.addSongToQueue already uses queueService internally)
                if (this.mainApp.addSongToQueue) {
                    const result = await this.mainApp.addSongToQueue(queueItem);
                    res.json({ success: result.success, message: 'Song added to queue', queueItem: result.queueItem });
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
                // Use shared queueService via mainApp method
                const result = await this.mainApp.clearQueue?.();
                res.json(result || { success: true, message: 'Queue reset' });
            } catch (error) {
                console.error('Error resetting queue:', error);
                res.status(500).json({ error: 'Failed to reset queue' });
            }
        });

        this.app.post('/admin/queue/load', async (req, res) => {
            try {
                const { songId } = req.body;
                const result = await queueService.loadFromQueue(this.mainApp, songId);
                res.json(result);
            } catch (error) {
                console.error('Error loading from queue:', error);
                res.status(500).json({ error: 'Failed to load from queue' });
            }
        });

        this.app.post('/admin/queue/remove/:songId', async (req, res) => {
            try {
                const { songId } = req.params;
                const result = queueService.removeSongFromQueue(this.mainApp.appState, parseFloat(songId));
                res.json(result);
            } catch (error) {
                console.error('Error removing from queue:', error);
                res.status(500).json({ error: 'Failed to remove from queue' });
            }
        });

        this.app.post('/admin/queue/reorder', async (req, res) => {
            try {
                const { songId, newIndex } = req.body;
                const result = queueService.reorderQueue(this.mainApp.appState, songId, newIndex);
                res.json(result);
            } catch (error) {
                console.error('Error reordering queue:', error);
                res.status(500).json({ error: 'Failed to reorder queue' });
            }
        });

        // Effects management endpoints
        this.app.get('/admin/effects', async (req, res) => {
            try {
                const result = await effectsService.getEffects(this.mainApp);
                if (result.success) {
                    res.json({
                        effects: result.effects,
                        currentEffect: result.currentEffect,
                        disabledEffects: result.disabledEffects
                    });
                } else {
                    res.status(500).json({ error: result.error });
                }
            } catch (error) {
                console.error('Error fetching effects:', error);
                res.status(500).json({ error: 'Failed to fetch effects' });
            }
        });

        this.app.post('/admin/effects/select', async (req, res) => {
            try {
                const result = await effectsService.selectEffect(this.mainApp, req.body.effectName);
                if (result.success) {
                    res.json(result);
                } else {
                    res.status(400).json(result);
                }
            } catch (error) {
                console.error('Error selecting effect:', error);
                res.status(500).json({ error: 'Failed to select effect' });
            }
        });

        this.app.post('/admin/effects/toggle', async (req, res) => {
            try {
                const result = await effectsService.toggleEffect(this.mainApp, req.body.effectName, req.body.enabled);
                if (result.success) {
                    res.json(result);
                } else {
                    res.status(400).json(result);
                }
            } catch (error) {
                console.error('Error toggling effect:', error);
                res.status(500).json({ error: 'Failed to toggle effect' });
            }
        });

        // Get songs folder
        this.app.get('/admin/library/folder', (req, res) => {
            try {
                const folder = this.mainApp.settings?.getSongsFolder?.();
                res.json({ folder: folder || null });
            } catch (error) {
                console.error('Error getting songs folder:', error);
                res.status(500).json({ error: 'Failed to get songs folder' });
            }
        });

        // Get cached library songs
        this.app.get('/admin/library/songs', (req, res) => {
            try {
                res.json({
                    success: true,
                    files: this.cachedSongs || [],
                    cached: this.cachedSongs !== null
                });
            } catch (error) {
                console.error('Error getting cached songs:', error);
                res.status(500).json({ error: 'Failed to get cached songs' });
            }
        });

        // Sync library (quick scan for changes)
        this.app.post('/admin/library/sync', async (req, res) => {
            try {
                const result = await libraryService.syncLibrary(this.mainApp);
                if (result.success) {
                    await libraryService.updateLibraryCache(this.mainApp, result.files);
                }
                res.json(result);
            } catch (error) {
                console.error('Error syncing library:', error);
                res.status(500).json({ error: 'Failed to sync library' });
            }
        });

        // Search library
        this.app.get('/admin/library/search', (req, res) => {
            try {
                const query = req.query.q || '';
                const result = libraryService.searchSongs(this.mainApp, query);
                res.json(result);
            } catch (error) {
                console.error('Library search failed:', error);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    songs: []
                });
            }
        });

        // Load song for editing
        this.app.post('/admin/editor/load', async (req, res) => {
            try {
                const { path } = req.body;

                const editorService = await import('../shared/services/editorService.js');
                const result = await editorService.loadSong(path);

                // For KAI files, add download URLs for audio playback
                if (result.format === 'kai') {
                    const audioFiles = result.kaiData.audio.sources.map(source => {
                        const filename = source.filename || source.name;
                        const fileId = Buffer.from(`${path}:${filename}`).toString('base64url');

                        return {
                            name: source.name,
                            filename: filename,
                            downloadUrl: `/admin/editor/kai-audio/${fileId}`
                        };
                    });

                    res.json({
                        success: true,
                        data: {
                            format: 'kai',
                            metadata: result.kaiData.metadata || {},
                            lyrics: result.kaiData.lyrics || [],
                            audioFiles: audioFiles,
                            songJson: result.kaiData.originalSongJson || {}
                        }
                    });
                } else {
                    // For CDG+MP3, read ID3 tags from MP3 file
                    const pathModule = await import('path');
                    const fs = await import('fs/promises');

                    // Find the MP3 file - the path might be .cdg or .mp3
                    let mp3Path;
                    if (path.toLowerCase().endsWith('.cdg')) {
                        mp3Path = path.replace(/\.cdg$/i, '.mp3');
                    } else if (path.toLowerCase().endsWith('.mp3')) {
                        mp3Path = path;
                    } else {
                        return res.json({
                            success: false,
                            error: 'Invalid file format'
                        });
                    }

                    // Check if MP3 file exists
                    try {
                        await fs.access(mp3Path);
                    } catch (err) {
                        return res.json({
                            success: false,
                            error: `MP3 file not found: ${mp3Path}`
                        });
                    }

                    // Read ID3 tags using music-metadata
                    const mm = await import('music-metadata');
                    const mmData = await mm.parseFile(mp3Path);

                    // Extract key from comment field if present
                    let key = '';
                    if (mmData.common && mmData.common.comment) {
                        const comments = Array.isArray(mmData.common.comment)
                            ? mmData.common.comment
                            : [mmData.common.comment];

                        for (const comment of comments) {
                            // Convert to string if it's an object
                            const commentStr = typeof comment === 'string' ? comment : String(comment);
                            const keyMatch = commentStr.match(/Key:\s*(.+)/i);
                            if (keyMatch) {
                                key = keyMatch[1];
                                break;
                            }
                        }
                    }

                    res.json({
                        success: true,
                        data: {
                            format: 'cdg-pair',
                            metadata: {
                                title: mmData.common?.title || '',
                                artist: mmData.common?.artist || '',
                                album: mmData.common?.album || '',
                                year: mmData.common?.year ? String(mmData.common.year) : '',
                                genre: mmData.common?.genre ? mmData.common.genre[0] : '',
                                key: key
                            },
                            lyrics: null
                        }
                    });
                }
            } catch (error) {
                console.error('Failed to load song for editing:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Download KAI audio file
        this.app.get('/admin/editor/kai-audio/:fileId', async (req, res) => {
            try {
                const { fileId } = req.params;

                // Decode the fileId to get path and filename
                const decoded = Buffer.from(fileId, 'base64url').toString('utf8');
                const [kaiPath, filename] = decoded.split(':');

                // Load the KAI file to extract the audio
                const KaiLoader = (await import('../utils/kaiLoader.js')).default;
                const kaiData = await KaiLoader.load(kaiPath);

                // Find the audio file
                const audioSource = kaiData.audio.sources.find(s => {
                    const sourceName = s.filename || s.name;
                    return sourceName === filename;
                });

                if (!audioSource || !audioSource.audioData) {
                    return res.status(404).json({
                        success: false,
                        error: 'Audio file not found in KAI archive'
                    });
                }

                // Send the audio file
                const ext = filename.split('.').pop().toLowerCase();
                const mimeTypes = {
                    'mp3': 'audio/mpeg',
                    'wav': 'audio/wav',
                    'flac': 'audio/flac'
                };

                res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.send(audioSource.audioData);
            } catch (error) {
                console.error('Failed to download KAI audio:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Save song edits
        this.app.post('/admin/editor/save', async (req, res) => {
            try {
                const { path, format, metadata, lyrics } = req.body;
                if (!path) {
                    return res.status(400).json({
                        success: false,
                        error: 'Path is required'
                    });
                }

                // For KAI files, save metadata and lyrics
                if (format === 'kai') {
                    const editorService = await import('../shared/services/editorService.js');
                    await editorService.saveSong(path, { format, metadata, lyrics });

                    // Update cached library entry if it exists
                    if (this.mainApp.cachedLibrary) {
                        const songIndex = this.mainApp.cachedLibrary.findIndex(s => s.path === path);
                        if (songIndex !== -1) {
                            // Update the cached song metadata
                            this.mainApp.cachedLibrary[songIndex] = {
                                ...this.mainApp.cachedLibrary[songIndex],
                                title: metadata.title !== undefined ? metadata.title : this.mainApp.cachedLibrary[songIndex].title,
                                artist: metadata.artist !== undefined ? metadata.artist : this.mainApp.cachedLibrary[songIndex].artist,
                                album: metadata.album !== undefined ? metadata.album : this.mainApp.cachedLibrary[songIndex].album,
                                year: metadata.year !== undefined ? metadata.year : this.mainApp.cachedLibrary[songIndex].year,
                                genre: metadata.genre !== undefined ? metadata.genre : this.mainApp.cachedLibrary[songIndex].genre,
                                key: metadata.key !== undefined ? metadata.key : this.mainApp.cachedLibrary[songIndex].key
                            };

                            // Notify renderer about the update
                            this.mainApp.sendToRenderer('library:songUpdated', {
                                path: path,
                                metadata: this.mainApp.cachedLibrary[songIndex]
                            });

                            // Notify web clients about the update
                            this.io.emit('library:songUpdated', {
                                path: path,
                                metadata: this.mainApp.cachedLibrary[songIndex]
                            });
                        }
                    }

                    res.json({
                        success: true,
                        message: 'Song saved successfully'
                    });
                } else {
                    // For CDG+MP3, save ID3 tags to the MP3 file
                    const pathModule = await import('path');
                    const fs = await import('fs/promises');

                    // Find the MP3 file - the path might be .cdg or .mp3
                    let mp3Path;
                    if (path.toLowerCase().endsWith('.cdg')) {
                        mp3Path = path.replace(/\.cdg$/i, '.mp3');
                    } else if (path.toLowerCase().endsWith('.mp3')) {
                        mp3Path = path;
                    } else {
                        return res.json({
                            success: false,
                            error: 'Invalid file format'
                        });
                    }

                    // Check if MP3 file exists
                    try {
                        await fs.access(mp3Path);
                    } catch (err) {
                        return res.json({
                            success: false,
                            error: `MP3 file not found: ${mp3Path}`
                        });
                    }

                    // Write ID3 tags
                    const NodeID3Module = await import('node-id3');
                    const NodeID3 = NodeID3Module.default || NodeID3Module;

                    const tags = {
                        title: metadata.title !== undefined ? metadata.title : '',
                        artist: metadata.artist !== undefined ? metadata.artist : '',
                        album: metadata.album !== undefined ? metadata.album : '',
                        year: metadata.year !== undefined ? metadata.year : '',
                        genre: metadata.genre !== undefined ? metadata.genre : '',
                        comment: {
                            language: 'eng',
                            text: metadata.key !== undefined && metadata.key ? `Key: ${metadata.key}` : ''
                        }
                    };

                    const success = NodeID3.write(tags, mp3Path);

                    if (success) {
                        // Update cached library entry if it exists
                        if (this.mainApp.cachedLibrary) {
                            const songIndex = this.mainApp.cachedLibrary.findIndex(s => s.path === path);
                            if (songIndex !== -1) {
                                // Update the cached song metadata
                                this.mainApp.cachedLibrary[songIndex] = {
                                    ...this.mainApp.cachedLibrary[songIndex],
                                    title: metadata.title !== undefined ? metadata.title : this.mainApp.cachedLibrary[songIndex].title,
                                    artist: metadata.artist !== undefined ? metadata.artist : this.mainApp.cachedLibrary[songIndex].artist,
                                    album: metadata.album !== undefined ? metadata.album : this.mainApp.cachedLibrary[songIndex].album,
                                    year: metadata.year !== undefined ? metadata.year : this.mainApp.cachedLibrary[songIndex].year,
                                    genre: metadata.genre !== undefined ? metadata.genre : this.mainApp.cachedLibrary[songIndex].genre,
                                    key: metadata.key !== undefined ? metadata.key : this.mainApp.cachedLibrary[songIndex].key
                                };

                                // Notify renderer about the update
                                this.mainApp.sendToRenderer('library:songUpdated', {
                                    path: path,
                                    metadata: this.mainApp.cachedLibrary[songIndex]
                                });

                                // Notify web clients about the update
                                this.io.emit('library:songUpdated', {
                                    path: path,
                                    metadata: this.mainApp.cachedLibrary[songIndex]
                                });
                            }
                        }

                        res.json({
                            success: true,
                            message: 'Song saved successfully'
                        });
                    } else {
                        res.json({
                            success: false,
                            error: 'Failed to write ID3 tags'
                        });
                    }
                }
            } catch (error) {
                console.error('Failed to save song edits:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Refresh library cache
        this.app.post('/admin/library/refresh', async (req, res) => {
            try {
                console.log('🔄 Admin requested library cache refresh');

                // Use libraryService to scan library
                const result = await libraryService.scanLibrary(this.mainApp);

                if (result.success) {
                    // Update all caches (mainApp, webServer, disk)
                    await libraryService.updateLibraryCache(this.mainApp, result.files);

                    res.json({
                        success: true,
                        message: `Library refreshed successfully. Found ${result.files.length} songs.`,
                        songsCount: result.files.length,
                        cacheTime: this.songsCacheTime
                    });
                } else {
                    res.status(500).json({ error: result.error || 'Failed to refresh library cache' });
                }
            } catch (error) {
                console.error('Error refreshing library cache:', error);
                res.status(500).json({ error: 'Failed to refresh library cache' });
            }
        });

        // ===== NEW: Master Mixer Control Endpoints =====
        this.app.post('/admin/mixer/master-gain', async (req, res) => {
            try {
                const { bus, gainDb } = req.body;
                const result = mixerService.setMasterGain(this.mainApp, bus, gainDb);

                if (result.success) {
                    res.json(result);
                } else {
                    res.status(400).json(result);
                }
            } catch (error) {
                console.error('Error setting master gain:', error);
                res.status(500).json({ error: 'Failed to set master gain' });
            }
        });

        this.app.post('/admin/mixer/master-mute', async (req, res) => {
            try {
                const { bus } = req.body;
                const result = mixerService.toggleMasterMute(this.mainApp, bus);

                if (result.success) {
                    res.json(result);
                } else {
                    res.status(400).json(result);
                }
            } catch (error) {
                console.error('Error toggling master mute:', error);
                res.status(500).json({ error: 'Failed to toggle master mute' });
            }
        });

        // ===== NEW: Effects Control Endpoints =====
        this.app.post('/admin/effects/set', async (req, res) => {
            try {
                const result = await effectsService.setEffect(this.mainApp, req.body.effectName);
                if (result.success) {
                    res.json(result);
                } else {
                    res.status(400).json(result);
                }
            } catch (error) {
                console.error('Error setting effect:', error);
                res.status(500).json({ error: 'Failed to set effect' });
            }
        });

        this.app.post('/admin/effects/next', async (req, res) => {
            try {
                const result = effectsService.nextEffect(this.mainApp);
                res.json(result);
            } catch (error) {
                console.error('Error changing to next effect:', error);
                res.status(500).json({ error: 'Failed to change effect' });
            }
        });

        this.app.post('/admin/effects/previous', async (req, res) => {
            try {
                const result = effectsService.previousEffect(this.mainApp);
                res.json(result);
            } catch (error) {
                console.error('Error changing to previous effect:', error);
                res.status(500).json({ error: 'Failed to change effect' });
            }
        });

        this.app.post('/admin/effects/random', async (req, res) => {
            try {
                const result = effectsService.randomEffect(this.mainApp);
                res.json(result);
            } catch (error) {
                console.error('Error selecting random effect:', error);
                res.status(500).json({ error: 'Failed to select random effect' });
            }
        });

        this.app.post('/admin/effects/disable', async (req, res) => {
            try {
                const result = await effectsService.disableEffect(this.mainApp, req.body.effectName);
                if (result.success) {
                    // Broadcast to web clients
                    this.io.emit('effects:disabled', {
                        effectName: req.body.effectName,
                        disabled: result.disabled
                    });
                    res.json(result);
                } else {
                    res.status(400).json(result);
                }
            } catch (error) {
                console.error('Error disabling effect:', error);
                res.status(500).json({ error: 'Failed to disable effect' });
            }
        });

        this.app.post('/admin/effects/enable', async (req, res) => {
            try {
                const result = await effectsService.enableEffect(this.mainApp, req.body.effectName);
                if (result.success) {
                    // Broadcast to web clients
                    this.io.emit('effects:enabled', {
                        effectName: req.body.effectName,
                        disabled: result.disabled
                    });
                    res.json(result);
                } else {
                    res.status(400).json(result);
                }
            } catch (error) {
                console.error('Error enabling effect:', error);
                res.status(500).json({ error: 'Failed to enable effect' });
            }
        });

        // ===== NEW: Preferences Control Endpoints =====
        this.app.get('/admin/preferences', async (req, res) => {
            try {
                const result = preferencesService.getPreferences(this.mainApp.appState);
                if (result.success) {
                    // Also load waveform and autotune preferences from settings
                    const waveformPreferences = await this.mainApp.settings.get('waveformPreferences', {
                        enableWaveforms: true,
                        enableEffects: true,
                        randomEffectOnSong: false,
                        showUpcomingLyrics: true,
                        overlayOpacity: 0.7
                    });

                    const autoTunePreferences = await this.mainApp.settings.get('autoTunePreferences', {
                        enabled: false,
                        strength: 50,
                        speed: 20
                    });

                    res.json({
                        ...result.preferences,
                        waveformPreferences,
                        autoTunePreferences
                    });
                } else {
                    res.status(500).json({ error: result.error });
                }
            } catch (error) {
                console.error('Error fetching preferences:', error);
                res.status(500).json({ error: 'Failed to fetch preferences' });
            }
        });

        this.app.get('/admin/settings/waveform', (req, res) => {
            try {
                const result = preferencesService.getWaveformSettings(this.mainApp.settings);
                res.json(result);
            } catch (error) {
                console.error('Error fetching waveform settings:', error);
                res.status(500).json({ error: 'Failed to fetch waveform settings' });
            }
        });

        this.app.post('/admin/settings/waveform', async (req, res) => {
            try {
                const result = await preferencesService.updateWaveformSettings(this.mainApp.settings, req.body);

                if (result.success) {
                    // Send to renderer for immediate effect
                    this.mainApp.sendToRenderer('waveform:settingsChanged', result.settings);
                    res.json(result);
                } else {
                    res.status(500).json(result);
                }
            } catch (error) {
                console.error('Error updating waveform settings:', error);
                res.status(500).json({ error: 'Failed to update waveform settings' });
            }
        });

        this.app.get('/admin/settings/autotune', (req, res) => {
            try {
                const result = preferencesService.getAutoTuneSettings(this.mainApp.settings);
                res.json(result);
            } catch (error) {
                console.error('Error fetching autotune settings:', error);
                res.status(500).json({ error: 'Failed to fetch autotune settings' });
            }
        });

        this.app.post('/admin/settings/autotune', async (req, res) => {
            try {
                const result = await preferencesService.updateAutoTuneSettings(this.mainApp.settings, req.body);

                if (result.success) {
                    // Send to renderer for immediate effect
                    this.mainApp.sendToRenderer('autotune:settingsChanged', result.settings);
                    res.json(result);
                } else {
                    res.status(500).json(result);
                }
            } catch (error) {
                console.error('Error updating autotune settings:', error);
                res.status(500).json({ error: 'Failed to update autotune settings' });
            }
        });

        this.app.post('/admin/preferences/autotune', async (req, res) => {
            try {
                const result = preferencesService.updateAutoTunePreferences(this.mainApp.appState, req.body);

                if (result.success) {
                    // Save settings and send to renderer (no need to wait for response)
                    await this.mainApp.settings.set('autoTunePreferences', req.body);

                    // Send to renderer window to apply in real-time
                    if (this.mainApp.mainWindow && !this.mainApp.mainWindow.isDestroyed()) {
                        this.mainApp.mainWindow.webContents.send('autotune:settingsChanged', req.body);
                    }

                    // Broadcast to all web admin clients
                    this.io.to('admin-clients').emit('settings:autotune', req.body);

                    res.json(result);
                } else {
                    res.status(500).json(result);
                }
            } catch (error) {
                console.error('Error updating autotune preferences:', error);
                res.status(500).json({ error: 'Failed to update autotune preferences' });
            }
        });

        this.app.post('/admin/preferences/microphone', async (req, res) => {
            try {
                const result = preferencesService.updateMicrophonePreferences(this.mainApp.appState, req.body);

                if (result.success) {
                    // Send to renderer
                    if (req.body.enabled !== undefined) {
                        await this.mainApp.sendToRendererAndWait('microphone:setEnabled', { enabled: req.body.enabled }, 2000);
                    }
                    if (req.body.gain !== undefined) {
                        await this.mainApp.sendToRendererAndWait('microphone:setGain', { gain: req.body.gain }, 2000);
                    }
                    res.json(result);
                } else {
                    res.status(500).json(result);
                }
            } catch (error) {
                console.error('Error updating microphone preferences:', error);
                res.status(500).json({ error: 'Failed to update microphone preferences' });
            }
        });

        this.app.post('/admin/preferences/effects', async (req, res) => {
            try {
                const result = preferencesService.updateEffectsPreferences(this.mainApp.appState, req.body);

                if (result.success) {
                    // Save settings and send to renderer (no need to wait for response)
                    await this.mainApp.settings.set('waveformPreferences', req.body);

                    // Send to renderer window to apply in real-time
                    if (this.mainApp.mainWindow && !this.mainApp.mainWindow.isDestroyed()) {
                        this.mainApp.mainWindow.webContents.send('waveform:settingsChanged', req.body);
                    }

                    // Broadcast to all web admin clients
                    this.io.to('admin-clients').emit('settings:waveform', req.body);

                    res.json(result);
                } else {
                    res.status(500).json(result);
                }
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

    setupStateChangeListeners() {
        // Subscribe to mixer state changes and broadcast to admin clients
        this.mainApp.appState.on('mixerChanged', (mixerState) => {
            this.io.to('admin-clients').emit('mixer-update', mixerState);
        });

        // Subscribe to effects state changes and broadcast to admin clients
        this.mainApp.appState.on('effectsChanged', (effectsState) => {
            this.io.to('admin-clients').emit('effects-update', effectsState);
        });

        // Subscribe to queue changes and broadcast to admin clients
        this.mainApp.appState.on('queueChanged', (queue) => {
            const currentSong = this.mainApp.appState.state.currentSong;
            this.io.to('admin-clients').emit('queue-update', {
                queue,
                currentSong
            });
        });

        // Subscribe to current song changes and broadcast to admin clients (includes isLoading state)
        this.mainApp.appState.on('currentSongChanged', (currentSong) => {
            this.io.to('admin-clients').emit('current-song-update', currentSong);
        });

        // Subscribe to playback state changes and broadcast to admin clients
        this.mainApp.appState.on('playbackChanged', (playbackState) => {
            this.io.to('admin-clients').emit('playback-state-update', playbackState);
        });

        console.log('✅ State change listeners configured for WebSocket broadcasting');
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
        return await requestsService.approveRequest(this, requestId);
    }

    async rejectRequest(requestId) {
        return await requestsService.rejectRequest(this, requestId);
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

                // Setup state change listeners for broadcasting
                this.setupStateChangeListeners();

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
        const result = serverSettingsService.updateServerSettings(this, newSettings);
        return result.success;
    }

    loadSettings() {
        return serverSettingsService.loadSettings(this);
    }

    saveSettings() {
        return serverSettingsService.saveSettings(this);
    }

    broadcastSettingsChange(settings) {
        serverSettingsService.broadcastSettingsChange(this, settings);
    }

    getSongRequests() {
        return this.songRequests;
    }

    clearRequests() {
        const result = requestsService.clearRequests(this);
        return result.success;
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
            const path = songData.path || songData.originalFilePath || null;
            const requester = songData.requester || null;
            const queueItemId = songData.queueItemId || null;
            const isLoading = songData.isLoading || false;

            this.io.emit('song-loaded', {
                songId: `${title} - ${artist}`,
                title,
                artist,
                duration,
                path,
                requester,
                queueItemId,
                isLoading
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

export default WebServer;
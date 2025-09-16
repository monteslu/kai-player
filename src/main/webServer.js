const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

class WebServer {
    constructor(mainApp) {
        this.mainApp = mainApp;
        this.app = express();
        this.server = null;
        this.port = 3069;
        this.songRequests = [];
        this.settings = {
            requireKJApproval: true,
            allowSongRequests: true,
            serverName: 'Loukai Karaoke',
            maxRequestsPerIP: 10
        };
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Session middleware
        this.app.use(session({
            secret: 'kai-player-admin-secret',
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: false, // Set to true if using HTTPS
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            }
        }));
        
        // Serve static files (shared between main app and web interface)
        this.app.use('/static', express.static(path.join(__dirname, '../../static')));

        // Serve Butterchurn libraries for the screenshot generator (both root and admin paths)
        this.app.use('/lib', express.static(path.join(__dirname, '../renderer/lib')));
        this.app.use('/admin/lib', express.static(path.join(__dirname, '../renderer/lib')));
        
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

        // Admin page for KJs
        this.app.get('/admin', (req, res) => {
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
                    req.session.isAdmin = true;
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
            req.session.destroy((err) => {
                if (err) {
                    console.error('Session destroy error:', err);
                    res.status(500).json({ error: 'Logout failed' });
                } else {
                    res.json({ success: true, message: 'Logged out successfully' });
                }
            });
        });

        // Get available songs for the request interface
        this.app.get('/api/songs', async (req, res) => {
            try {
                const search = req.query.search || '';
                const limit = parseInt(req.query.limit) || 50;

                console.log('API: Getting songs from main app...');

                // Get songs from the main app's library
                const allSongs = await this.mainApp.getLibrarySongs?.() || [];

                console.log(`API: Found ${allSongs.length} songs`);

                let songs = allSongs;
                if (search) {
                    const searchLower = search.toLowerCase();
                    songs = allSongs.filter(song =>
                        song.title.toLowerCase().includes(searchLower) ||
                        song.artist.toLowerCase().includes(searchLower)
                    );
                }

                const limitedSongs = songs.slice(0, limit).map(song => ({
                    id: song.path,
                    title: song.title,
                    artist: song.artist,
                    duration: song.duration
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
                if (!this.settings.allowSongRequests) {
                    return res.status(403).json({ error: 'Song requests are currently disabled' });
                }

                const { songId, requesterName, message } = req.body;

                if (!songId || !requesterName) {
                    return res.status(400).json({ error: 'Song ID and requester name are required' });
                }

                // Find the song in the library
                const allSongs = await this.mainApp.getLibrarySongs?.() || [];
                const song = allSongs.find(s => s.path === songId);
                
                if (!song) {
                    return res.status(404).json({ error: 'Song not found' });
                }

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

                this.songRequests.push(request);

                // If auto-approval is enabled, add to queue immediately
                if (!this.settings.requireKJApproval) {
                    await this.addToQueue(request);
                    request.status = 'queued';
                }

                // Notify the main app about the new request
                this.mainApp.onSongRequest?.(request);

                res.json({
                    success: true,
                    message: this.settings.requireKJApproval ? 
                        'Request submitted! Waiting for KJ approval.' :
                        'Song added to queue!',
                    requestId: request.id,
                    status: request.status
                });

            } catch (error) {
                console.error('Error processing request:', error);
                res.status(500).json({ error: 'Failed to process request' });
            }
        });

        // Get queue status for users
        this.app.get('/api/queue', (req, res) => {
            try {
                const queue = this.mainApp.getQueue?.() || [];
                const queueInfo = queue.map((item, index) => ({
                    position: index + 1,
                    title: item.title,
                    artist: item.artist,
                    requester: item.requester || 'KJ'
                }));

                res.json({
                    queue: queueInfo,
                    currentlyPlaying: this.mainApp.getCurrentSong?.() || null
                });
            } catch (error) {
                console.error('Error fetching queue:', error);
                res.status(500).json({ error: 'Failed to fetch queue' });
            }
        });

        // Admin endpoints (for the main Electron app)
        this.app.get('/admin/requests', (req, res) => {
            res.json({
                requests: this.songRequests,
                settings: this.settings
            });
        });

        this.app.post('/admin/requests/:id/approve', async (req, res) => {
            const requestId = parseFloat(req.params.id);
            const request = this.songRequests.find(r => r.id === requestId);

            if (!request) {
                return res.status(404).json({ error: 'Request not found' });
            }

            if (request.status === 'pending') {
                request.status = 'approved';
                await this.addToQueue(request);
                request.status = 'queued';

                res.json({ success: true, request });
            } else {
                res.status(400).json({ error: 'Request is not pending' });
            }
        });

        this.app.post('/admin/requests/:id/reject', (req, res) => {
            const requestId = parseFloat(req.params.id);
            const request = this.songRequests.find(r => r.id === requestId);
            
            if (!request) {
                return res.status(404).json({ error: 'Request not found' });
            }

            if (request.status === 'pending') {
                request.status = 'rejected';
                res.json({ success: true, request });
            } else {
                res.status(400).json({ error: 'Request is not pending' });
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

        // Admin queue management endpoints
        this.app.get('/admin/queue', async (req, res) => {
            try {
                const queue = await this.mainApp.getQueue?.() || [];
                const currentSong = await this.mainApp.getCurrentSong?.() || null;
                res.json({
                    queue,
                    currentSong
                });
            } catch (error) {
                console.error('Error fetching admin queue:', error);
                res.status(500).json({ error: 'Failed to fetch queue' });
            }
        });

        // Player control endpoints
        this.app.post('/admin/player/play', async (req, res) => {
            try {
                await this.mainApp.playerPlay?.();
                res.json({ success: true, message: 'Play command sent' });
            } catch (error) {
                console.error('Error sending play command:', error);
                res.status(500).json({ error: 'Failed to send play command' });
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

        this.app.post('/admin/queue/reset', async (req, res) => {
            try {
                await this.mainApp.clearQueue?.();
                res.json({ success: true, message: 'Queue reset' });
            } catch (error) {
                console.error('Error resetting queue:', error);
                res.status(500).json({ error: 'Failed to reset queue' });
            }
        });
    }

    async addToQueue(request) {
        // Add the song to the main app's queue
        if (this.mainApp.addSongToQueue) {
            const queueItem = {
                ...request.song,
                requester: request.requesterName,
                addedVia: 'web-request'
            };
            await this.mainApp.addSongToQueue(queueItem);
        }
    }

    async start(port = 3069) {
        this.port = port;
        
        return new Promise((resolve, reject) => {
            // Try the requested port first, then try others if it's taken
            const tryPort = (currentPort) => {
                this.server = this.app.listen(currentPort, (err) => {
                    if (err) {
                        if (err.code === 'EADDRINUSE' && currentPort < port + 10) {
                            console.log(`Port ${currentPort} in use, trying ${currentPort + 1}...`);
                            tryPort(currentPort + 1);
                        } else {
                            reject(err);
                        }
                    } else {
                        this.port = currentPort;
                        console.log(`Web server started on http://localhost:${this.port}`);
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
        if (this.server) {
            this.server.close();
            this.server = null;
            console.log('Web server stopped');
        }
    }

    getPort() {
        return this.port;
    }

    getSettings() {
        return this.settings;
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    getSongRequests() {
        return this.songRequests;
    }

    clearRequests() {
        this.songRequests = [];
    }
}

module.exports = WebServer;
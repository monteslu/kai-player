# Loukai — Karaoke Player App (v1.0)

**Status:** Implementation Spec (current)
**Date:** 2025-09-29
**Targets:** Linux, Windows, macOS
**License:** AGPLv3

## 1. Scope
- Multi-format karaoke playback: KAI v1.0 and CDG (CD+Graphics)
- Load `.kai` v1.0 files from local library
- Load CDG format: `.kar`/`.zip` archives or loose MP3+CDG file pairs
- Parse `song.json` for audio sources, lyrics, and metadata (KAI format)
- Extract ID3 tags from MP3 files for metadata (CDG format)
- Real-time audio mixing with stem-level control (mute/solo/gain) for KAI files
- Dual-output routing (PA + IEM) with independent master controls and per-stem routing
- Live microphone input with optional auto-tune
- Visual effects (Butterchurn presets) with waveform visualization
- CDG graphics rendering with Butterchurn background layer
- Song queue management with auto-advance
- Web-based remote control and song requests
- Lyrics editor with line-by-line editing (KAI format only)
- Real-time settings sync between renderer and web admin

## 2. Architecture
- **UI Framework:** Electron with renderer process for main UI
- **Audio Engine:** Web Audio API with AudioWorklet for low-latency processing
- **Visualization:** Canvas-based karaoke display with Butterchurn effects
- **Web Server:** Express + Socket.IO for remote control and song requests
- **State Management:** Dual persistence (app-state.json for runtime, settings.json for preferences)
- **IPC:** Electron IPC for renderer ↔ main communication

### 2.1 Code Sharing Between Environments
The application runs in multiple JavaScript environments:
- **Main Process** (Node.js) - `src/main/`
- **Renderer Process** (Electron/Browser) - `src/renderer/`
- **Web UI** (React/Vite) - `src/web/`

**Shared Code Location:** `src/shared/`
- Contains pure ES modules (`.js` files with `export` statements)
- Used for utility functions that need to work across all environments
- Examples: format helpers, constants, validation functions

**How to Share Code:**
1. Create a pure ES module in `src/shared/` with named exports
   ```javascript
   export function utilityFunction() { /* ... */ }
   ```

2. Import from renderer process (ES modules):
   ```javascript
   import { utilityFunction } from '../../shared/utils.js';
   ```
   - Script tag must use `type="module"` in `index.html`
   - Path is relative from `src/renderer/js/` → `src/shared/`

3. Import from web UI (React/Vite):
   ```javascript
   import { utilityFunction } from '../../../shared/utils.js';
   ```
   - Path is relative from `src/web/src/components/` → `src/shared/`
   - Vite bundler handles the import automatically

4. Import from main process (Node.js):
   ```javascript
   import { utilityFunction } from '../shared/utils.js';
   ```
   - Node.js 14+ supports ES modules natively
   - Or use CommonJS `require()` if needed

**DO NOT:**
- Use global variables or window namespace pollution
- Duplicate utility functions across environments
- Mix CommonJS and ES modules within the same file

**Example:** `src/shared/formatUtils.js` is used by both renderer (`library.js`, `queue.js`) and web UI (`SongSearch.jsx`) to provide consistent file format icons.

## 3. Audio System
### 3.1 Audio Engine (RendererAudioEngine)
- Web Audio API with AudioContext
- AudioWorklet for real-time DSP
- Supports multi-stem playback from separate audio files
- Master buses: PA (Public Address) and IEM (In-Ear Monitor)
- Per-stem routing to either or both buses
- Per-stem gain, mute, and solo controls
- Master gain and mute per bus
- Real-time microphone input with routing options

### 3.2 Mixer
- Per-stem channel strips with:
  - Gain fader (-∞ to +12 dB)
  - Mute button per bus (PA/IEM)
  - Solo button
  - Level meters
- Master section with:
  - PA master gain and mute
  - IEM master gain and mute
  - IEM mono vocals option (for single earpiece)
- Microphone channel with gain and mute

### 3.3 Auto-Tune
- Real-time pitch correction on microphone input
- Adjustable strength (0-100%)
- Adjustable speed (1-100)
- Enable/disable toggle
- Settings persist and sync between renderer and web admin

## 4. Visual System
### 4.1 Karaoke Renderer
- Canvas-based rendering at 60 FPS
- Synchronized lyrics display with current/upcoming lines
- Waveform visualization for vocals and music stems
- Microphone input waveform
- Butterchurn effects integration (1000+ presets)
- Fullscreen support
- Separate canvas window option

### 4.2 Effects
- Butterchurn preset library with categorization
- Search and filter by category/author
- Random effect selection
- Effect switching (previous/next/random)
- Per-effect enable/disable
- Optional random effect on song load
- Overlay opacity control
- Enable/disable waveforms independently
- Enable/disable effects independently

### 4.3 CDG (CD+Graphics) Support
- Legacy karaoke format compatibility
- CDG graphics rendering: 300×216 pixels (scaled 5x to 1500×1080)
- Canvas layering architecture:
  - Background: Butterchurn visualizations (full 1920×1080)
  - Foreground: CDG graphics (1500×1080, centered with 210px margins)
  - Transparency: CDG background can be transparent, showing effects through
- Perfect integer scaling for crisp, pixel-perfect graphics
- Synchronized CDG instruction timing with audio playback
- 16-color palette support with 64 transparency levels

#### File Format Detection
- **Archive formats:** `.kar` or `.zip` containing MP3 + CDG files
- **Loose file pairs:** Matching MP3 + CDG in directory (e.g., `song.mp3` + `song.cdg`)
- **Metadata extraction:** ID3 tags from MP3 (title, artist, genre)
- **Fallback metadata:** Filename (without extension) used as title if no ID3 tags

#### Audio Routing
- **PA Output:** MP3 audio routed to PA only
- **IEM Output:** Disabled/silent (no separate stems available)
- **Single mixed track:** Vocals + music pre-mixed in MP3

#### Rendering Strategy
- CDG instructions parsed and rendered frame-by-frame
- Layered canvas composition for effects + graphics
- Side margins (420px total) filled with Butterchurn effects
- **Waveform visualization:** Disabled (no separate vocal/music stems)
- **Effects only:** Butterchurn visualizations in background and margins
- Classic karaoke nostalgia with modern visual enhancement

## 5. Library & Queue
### 5.1 Library
- Folder-based song library with metadata parsing
- Multi-format support: KAI and CDG
- Search by title, artist, genre, key
- Song information display (stems, duration, key, genre, format)
- Format indicators: ⚡ for KAI, 💿 for CDG
- Add to queue functionality
- Quick search from player tab

### 5.2 Queue
- Ordered list of songs to play
- Drag-to-reorder support
- Remove individual songs
- Clear entire queue
- Shuffle queue
- Auto-advance to next song on completion
- Current song indicator
- Queue state persists in app-state.json

## 6. Web Server & Remote Control
### 6.1 User Interface (Port 3000)
- Song search and browsing
- Song request submission
- Now playing display
- Song requests require optional KJ approval

### 6.2 Admin Interface (/admin)
- Password-protected access
- Real-time playback controls (play/pause/restart/next/seek)
- Queue management
- Mixer controls (gain, mute for all stems and masters)
- Visual effects selection and control
- Player settings (waveforms, auto-tune)
- Song request approval/rejection
- Settings sync bidirectionally with renderer

### 6.3 Real-Time Updates
- Socket.IO for bidirectional communication
- Playback state broadcasting
- Queue updates
- Mixer state changes
- Settings synchronization
- Song request notifications

## 7. Settings & Persistence
### 7.1 Settings (settings.json)
- Songs folder path
- Window bounds
- Server settings (cookie secret, admin password hash)
- Sidebar collapsed state
- Waveform preferences:
  - Enable waveforms
  - Enable effects
  - Random effect on song load
  - Overlay opacity
  - Show upcoming lyrics
- Auto-tune preferences:
  - Enabled state
  - Strength
  - Speed
- Device preferences (PA, IEM, input device selections)

### 7.2 App State (app-state.json)
- Current mixer state (all gains, mutes, solos)
- Current effect selection
- Disabled effects list
- Audio device configuration
- IEM mono vocals setting
- Saved at regular intervals during operation

### 7.3 Bidirectional Sync
- Renderer → Web Admin via Socket.IO
- Web Admin → Renderer via IPC events
- Settings changes immediately reflected in both UIs
- No page refresh required

## 8. Lyrics Editor
- Line-by-line editing of text, start time, and end time
- Toggle disable/enable for individual lines
- Disabled lines hidden during playback but preserved in file
- Atomic save operation rewrites entire .kai file
- Export lyrics to text file
- Real-time preview during editing
- Preserves all KAI format fields

## 9. Song Requests
### 9.1 Request Flow
- User submits request via web UI
- Request stored with timestamp, requester name, song info
- KJ notified in renderer (badge on Requests tab)
- KJ approves/rejects from renderer or web admin
- Approved requests automatically added to queue
- All clients receive real-time updates via Socket.IO

### 9.2 Request Management
- Pending requests list
- Recent activity history
- Clear all requests
- Request counts and statistics

## 10. User Interface
### 10.1 Main Window Tabs
- **Player:** Canvas display, queue sidebar, transport controls
- **Library:** Song browsing and search
- **Audio Settings:** Mixer controls, device selection
- **Coaching:** Pitch display and metrics (placeholder)
- **Effects:** Butterchurn preset browser
- **Song Requests:** Pending/recent requests, server settings
- **Server:** Web server configuration and admin password
- **Lyrics Editor:** Edit timing and content

### 10.2 Sidebar
- Waveform options (enable/disable waveforms, effects, upcoming lyrics)
- Overlay opacity slider
- Random effect on song toggle
- Auto-tune controls (enable, strength, speed)
- Collapsible with state persistence

### 10.3 Transport Controls
- Play/pause button
- Restart button
- Next track button
- Progress bar with scrubbing
- Time display (current / total)
- Effect controls (previous/next, name display)
- Open canvas window button

## 11. Keyboard Shortcuts
- **Space:** Play/pause
- **F:** Toggle fullscreen (canvas)
- **V:** Toggle vocals mute (global)
- **Ctrl/Cmd+V:** Toggle vocals PA only
- **1-9:** Toggle stem mute (index 0-8)
- **Shift+1-9:** Toggle stem solo

## 12. Technical Details
### 12.1 File Format
- KAI v1.0 ZIP container
- song.json with metadata, audio sources, lyrics, timing
- Separate audio files per stem (vocals, music, drums, bass, etc.)
- Optional features directory with analysis data

### 12.2 Audio Processing
- Sample rate: 48000 Hz (configurable)
- Buffer size: 256-4096 samples
- Latency target: < 50ms
- AudioWorklet for DSP processing
- Clickless gain ramping for mute/unmute

### 12.3 State Management
- AppState class manages runtime state
- SettingsManager class manages persistent settings
- Automatic state saving on changes
- Backup files created before writes

## 13. Web API Endpoints
### Public Endpoints
- GET /api/songs - List available songs
- POST /api/request - Submit song request
- GET /api/state - Get current playback state

### Admin Endpoints (require authentication)
- POST /admin/login - Authenticate
- POST /admin/logout - End session
- GET /admin/check-auth - Check authentication status
- POST /admin/player/play - Play
- POST /admin/player/pause - Pause
- POST /admin/player/restart - Restart
- POST /admin/player/next - Next track
- POST /admin/player/seek - Seek to position
- GET /admin/queue - Get queue
- POST /admin/queue - Add to queue
- DELETE /admin/queue/:id - Remove from queue
- DELETE /admin/queue - Clear queue
- POST /admin/mixer/master-gain - Set master gain
- POST /admin/mixer/master-mute - Toggle master mute
- GET /admin/effects - Get effects list
- POST /admin/effects/select - Select effect
- POST /admin/effects/toggle - Enable/disable effect
- GET /admin/requests - Get song requests
- POST /admin/requests/:id/approve - Approve request
- POST /admin/requests/:id/reject - Reject request
- GET /admin/settings/waveform - Get waveform settings
- POST /admin/settings/waveform - Update waveform settings
- GET /admin/settings/autotune - Get auto-tune settings
- POST /admin/settings/autotune - Update auto-tune settings

## 14. Socket.IO Events
### Server → Client
- `playback-state-update` - Playback state changes
- `song-loaded` - New song loaded
- `queue-update` - Queue changed
- `mixer-update` - Mixer state changed
- `effects-update` - Effect changed
- `song-request` - New song request
- `request-approved` - Request approved
- `request-rejected` - Request rejected
- `settings:waveform` - Waveform settings changed (from renderer)
- `settings:autotune` - Auto-tune settings changed (from renderer)

### Client → Server
- `identify` - Client identification (admin/user)

## 15. Testing & Quality
- XRun monitoring and display
- Latency measurement and display
- Audio device enumeration and selection
- Settings persistence across restarts
- Queue state persistence
- Web server auto-start on app launch
- Error handling and recovery
- Graceful degradation for missing features

## 16. Future Enhancements (Not Implemented)

### 16.1 Video/Movie File Support
**Priority:** Low (last resort for karaoke, after CDG implementation)

- **Format support:** MP4, MKV, AVI, MOV, WebM (Electron's Chromium-supported formats)
- **File detection:** Scan library for video files alongside audio formats
- **Metadata extraction:** Video file metadata (title, duration, resolution)
- **Fallback metadata:** Filename (without extension) used as title if no metadata
- **Format indicator:** 🎬 (movie camera emoji) in library and search results

#### Rendering Architecture
- **Canvas-based rendering:** Video rendered to canvas (preserves consistency)
  - Hidden `<video>` element as source
  - `canvas.drawImage(videoElement, ...)` in animation loop
  - Maintains existing canvas features: maximize, RTC broadcast, fullscreen, separate window
- **Audio routing:**
  - Video audio stream captured via Web Audio API
  - Route to PA output through existing audio engine
  - IEM disabled (single mixed audio track)
- **Transport controls:**
  - Main controls update video element (play, pause, seek)
  - Video element emits timeupdate/ended events
  - Progress bar synced with video.currentTime
  - Unified control interface across all formats

#### Playback Strategy
- No Butterchurn effects or waveforms (video fills full canvas)
- Canvas consistency enables RTC broadcast and window management
- Standard video controls integrated with existing transport

#### Use Cases
- Music videos with lyrics/karaoke text embedded
- Video karaoke files (Video CD format)
- Concert footage
- DJ visuals and ambient content

#### Library Integration
- Searchable by title, artist (from metadata)
- Queue alongside KAI and CDG files
- Auto-advance to next item after video completion
- Format icons: ⚡ KAI, 💿 CDG, 🎬 Video

### 16.2 Other Future Features
- Pitch coaching with real-time feedback
- Scoring system
- Multi-singer support
- Scene recall (A/B presets)
- Advanced routing matrix
- Plugin architecture for effects
- Cloud library sync
- Mobile companion app
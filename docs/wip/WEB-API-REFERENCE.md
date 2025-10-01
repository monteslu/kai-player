# Loukai Web API Reference

Complete REST API and Socket.IO reference for building web clients.

---

## Base URL

```
http://localhost:3000
```

Default port is `3000`, configurable in settings.

---

## Authentication

### **Public Endpoints** (No Auth Required)
- `GET /api/*` - Song library, queue status, server info
- `POST /api/request` - Submit song requests

### **Admin Endpoints** (Auth Required)
All `/admin/*` endpoints require authentication via session cookie.

**Login Flow:**
```javascript
// 1. Login
POST /admin/login
{
  "password": "your-admin-password"
}
→ Returns session cookie

// 2. Subsequent requests include cookie automatically
POST /admin/player/play
→ Cookie sent automatically by browser
→ 200 OK if authenticated, 401 if not
```

**Setting Admin Password:**
Set in Electron app Settings → Web Server → Admin Password

**Cookie Details:**
- Name: `kai-admin-session`
- Encrypted with persistent key
- HttpOnly, signed
- Survives server restarts

---

## REST API Endpoints

### **Authentication**

#### `POST /admin/login`
Login to access admin endpoints.

**Request Body:**
```json
{
  "password": "your-admin-password"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Login successful"
}
```

**Response (Error):**
```json
{
  "error": "Invalid password"
}
```

**Status Codes:**
- `200` - Login successful, session cookie set
- `400` - Password missing
- `401` - Invalid password
- `403` - No admin password configured

#### `POST /admin/logout`
Logout and clear session.

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### `GET /admin/check-auth`
Check if currently authenticated.

**Response:**
```json
{
  "passwordSet": true,
  "authenticated": true
}
```

---

### **State & Status**

#### `GET /api/state`
Get complete application state (canonical source of truth).

**Response:**
```json
{
  "playback": {
    "isPlaying": false,
    "position": 0,
    "duration": 245.5,
    "songPath": "/path/to/song.kai",
    "lastUpdate": 1710000000000
  },
  "currentSong": {
    "path": "/path/to/song.kai",
    "title": "Song Title",
    "artist": "Artist Name",
    "duration": 245.5,
    "requester": "John Doe"
  },
  "queue": [
    {
      "id": 1710000001,
      "path": "/path/to/song2.kai",
      "title": "Next Song",
      "artist": "Another Artist",
      "duration": 180,
      "requester": "Jane Smith",
      "addedVia": "web-request",
      "addedAt": "2024-03-10T12:00:00.000Z"
    }
  ],
  "mixer": {
    "stems": [
      {
        "id": "vocals",
        "name": "vocals",
        "gain": 0,
        "muted": { "PA": false, "IEM": false },
        "solo": false
      }
    ],
    "gains": { "vocals": 0, "drums": -3 },
    "mutes": {
      "PA": { "vocals": false },
      "IEM": { "vocals": false }
    },
    "solos": { "vocals": false },
    "scenes": { "A": null, "B": null },
    "activeScene": null
  },
  "effects": {
    "current": "Roiling Smoke",
    "disabled": ["Glitchy", "Broken"],
    "enableWaveforms": true,
    "enableEffects": true,
    "randomEffectOnSong": false,
    "overlayOpacity": 0.7,
    "showUpcomingLyrics": true
  },
  "preferences": {
    "autoTune": {
      "enabled": false,
      "strength": 50,
      "speed": 20
    },
    "microphone": {
      "enabled": false,
      "gain": 1.0,
      "toSpeakers": true
    },
    "iemMonoVocals": true,
    "audio": {
      "devices": {
        "PA": { "id": "device-id", "name": "Device Name" },
        "IEM": { "id": "device-id", "name": "Device Name" },
        "input": { "id": "device-id", "name": "Device Name" }
      }
    }
  }
}
```

#### `GET /api/queue`
Get queue with current song and playback info.

**Response:**
```json
{
  "queue": [
    {
      "position": 1,
      "title": "Song Title",
      "artist": "Artist Name",
      "requester": "John Doe"
    }
  ],
  "currentlyPlaying": {
    "title": "Current Song",
    "artist": "Artist Name"
  },
  "playback": {
    "isPlaying": true,
    "position": 45.2
  }
}
```

#### `GET /api/info`
Get server configuration.

**Response:**
```json
{
  "serverName": "Loukai Server",
  "allowRequests": true,
  "requireApproval": true
}
```

---

### **Playback Control**

#### `POST /admin/player/play`
Start playback.

**Response:**
```json
{
  "success": true,
  "message": "Play command sent"
}
```

#### `POST /admin/player/pause`
Pause playback.

**Response:**
```json
{
  "success": true,
  "message": "Pause command sent"
}
```

#### `POST /admin/player/restart`
Restart current song from beginning.

**Response:**
```json
{
  "success": true,
  "message": "Restart command sent"
}
```

#### `POST /admin/player/next`
Play next song in queue.

**Response:**
```json
{
  "success": true,
  "message": "Next command sent"
}
```

#### `POST /admin/player/seek`
Seek to specific position.

**Request Body:**
```json
{
  "position": 120.5
}
```

**Response:**
```json
{
  "success": true,
  "message": "Seek command sent",
  "position": 120.5
}
```

---

### **Queue Management**

#### `GET /admin/queue`
Get detailed queue info (admin view).

**Response:**
```json
{
  "queue": [...],
  "currentSong": {...},
  "playback": {...}
}
```

#### `POST /admin/queue/reset`
Clear entire queue.

**Response:**
```json
{
  "success": true,
  "message": "Queue reset"
}
```

#### `POST /api/request`
Submit song request (public endpoint).

**Request Body:**
```json
{
  "songPath": "/path/to/song.kai",
  "title": "Song Title",
  "artist": "Artist Name",
  "requester": "John Doe",
  "singer": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Request submitted and approved",
  "requestId": 12345
}
```

---

### **Mixer Control**

#### `POST /admin/mixer/gain`
Set stem gain in dB.

**Request Body:**
```json
{
  "stemId": "vocals",
  "gainDb": -3.0
}
```

**Response:**
```json
{
  "success": true,
  "stemId": "vocals",
  "gainDb": -3.0
}
```

#### `POST /admin/mixer/mute`
Toggle stem mute on specific bus.

**Request Body:**
```json
{
  "stemId": "vocals",
  "bus": "PA"
}
```

**Buses:** `PA` (public address) or `IEM` (in-ear monitors)

**Response:**
```json
{
  "success": true,
  "stemId": "vocals",
  "bus": "PA"
}
```

#### `POST /admin/mixer/solo`
Toggle stem solo.

**Request Body:**
```json
{
  "stemId": "drums"
}
```

**Response:**
```json
{
  "success": true,
  "stemId": "drums"
}
```

#### `POST /admin/mixer/preset`
Apply mixer preset.

**Request Body:**
```json
{
  "presetId": "karaoke"
}
```

**Presets:**
- `original` - All stems unmuted
- `karaoke` - Vocals muted on PA
- `band_only` - Vocals muted on both PA and IEM
- `acoustic` - Electronic/synth stems muted

**Response:**
```json
{
  "success": true,
  "presetId": "karaoke"
}
```

---

### **Effects Control**

#### `POST /admin/effects/set`
Set specific effect by name.

**Request Body:**
```json
{
  "effectName": "Roiling Smoke"
}
```

**Response:**
```json
{
  "success": true,
  "effectName": "Roiling Smoke"
}
```

#### `POST /admin/effects/next`
Change to next effect.

**Response:**
```json
{
  "success": true
}
```

#### `POST /admin/effects/previous`
Change to previous effect.

**Response:**
```json
{
  "success": true
}
```

#### `POST /admin/effects/disable`
Disable specific effect (won't be selected randomly).

**Request Body:**
```json
{
  "effectName": "Glitchy"
}
```

**Response:**
```json
{
  "success": true,
  "disabled": ["Glitchy", "Broken"]
}
```

#### `POST /admin/effects/enable`
Re-enable previously disabled effect.

**Request Body:**
```json
{
  "effectName": "Glitchy"
}
```

**Response:**
```json
{
  "success": true,
  "disabled": ["Broken"]
}
```

---

### **Preferences Control**

#### `GET /admin/preferences`
Get all user preferences.

**Response:**
```json
{
  "autoTune": {
    "enabled": false,
    "strength": 50,
    "speed": 20
  },
  "microphone": {
    "enabled": false,
    "gain": 1.0,
    "toSpeakers": true
  },
  "iemMonoVocals": true,
  "audio": {
    "devices": {
      "PA": { "id": "device-id", "name": "Device Name" },
      "IEM": { "id": "device-id", "name": "Device Name" },
      "input": { "id": "device-id", "name": "Device Name" }
    }
  }
}
```

#### `POST /admin/preferences/autotune`
Update auto-tune settings.

**Request Body (all fields optional):**
```json
{
  "enabled": true,
  "strength": 75,
  "speed": 30
}
```

**Response:**
```json
{
  "success": true,
  "autoTune": {
    "enabled": true,
    "strength": 75,
    "speed": 30
  }
}
```

#### `POST /admin/preferences/microphone`
Update microphone settings.

**Request Body (all fields optional):**
```json
{
  "enabled": true,
  "gain": 1.5,
  "toSpeakers": false
}
```

**Response:**
```json
{
  "success": true,
  "microphone": {
    "enabled": true,
    "gain": 1.5,
    "toSpeakers": false
  }
}
```

#### `POST /admin/preferences/effects`
Update effects preferences.

**Request Body (all fields optional):**
```json
{
  "enableWaveforms": true,
  "enableEffects": true,
  "randomEffectOnSong": true,
  "overlayOpacity": 0.5,
  "showUpcomingLyrics": false
}
```

**Response:**
```json
{
  "success": true,
  "effects": {
    "current": "Roiling Smoke",
    "disabled": [],
    "enableWaveforms": true,
    "enableEffects": true,
    "randomEffectOnSong": true,
    "overlayOpacity": 0.5,
    "showUpcomingLyrics": false
  }
}
```

---

### **Library**

#### `GET /api/songs`
Get song library (paginated, searchable).

**Query Parameters:**
- `letter` - Filter by first letter
- `search` - Search query

**Response:**
```json
{
  "songs": [
    {
      "path": "/path/to/song.kai",
      "title": "Song Title",
      "artist": "Artist Name",
      "duration": 245
    }
  ]
}
```

#### `POST /admin/library/refresh`
Refresh library cache.

**Response:**
```json
{
  "success": true,
  "message": "Library refreshed successfully. Found 1234 songs.",
  "songsCount": 1234,
  "cacheTime": 1710000000000
}
```

---

## Socket.IO Events

Connect to Socket.IO on same port as HTTP server:

```javascript
const socket = io('http://localhost:3000');

// Identify client type
socket.emit('identify', { type: 'web-ui' });
// Types: 'electron-app', 'web-ui', 'admin'
```

### **Client → Server Events**

#### `identify`
Identify client type.

```javascript
socket.emit('identify', { type: 'admin' });
```

### **Server → Client Events**

#### `playback-state-update`
Real-time playback state changes (10x/sec when playing).

```javascript
socket.on('playback-state-update', (state) => {
  // { isPlaying, position, duration, songPath, lastUpdate }
});
```

#### `playback-position`
Position updates (1x/sec, legacy).

```javascript
socket.on('playback-position', (data) => {
  // { position, isPlaying, songId, timestamp }
});
```

#### `song-loaded`
New song loaded.

```javascript
socket.on('song-loaded', (song) => {
  // { songId, title, artist, duration }
});
```

#### `queue-update`
Queue changed.

```javascript
socket.on('queue-update', (data) => {
  // { queue: [...], currentSong: {...} }
});
```

#### `mixer-update`
Mixer state changed.

```javascript
socket.on('mixer-update', (mixer) => {
  // { stems, gains, mutes, solos, scenes, activeScene }
});
```

#### `effects-update`
Effects state changed.

```javascript
socket.on('effects-update', (effects) => {
  // { current, disabled, enableWaveforms, ... }
});
```

#### `preferences-update`
Preferences changed.

```javascript
socket.on('preferences-update', (preferences) => {
  // { autoTune, microphone, iemMonoVocals, audio }
});
```

#### `library-refreshed`
Library cache refreshed.

```javascript
socket.on('library-refreshed', (data) => {
  // { songsCount, timestamp }
});
```

---

## Example Usage

### **React Admin Panel**

```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

function AdminPanel() {
  const [state, setState] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Load initial state
    fetch('/api/state')
      .then(res => res.json())
      .then(setState);

    // Connect to Socket.IO for real-time updates
    const sock = io('http://localhost:3000');
    sock.emit('identify', { type: 'admin' });

    sock.on('playback-state-update', (playback) => {
      setState(prev => ({ ...prev, playback }));
    });

    sock.on('mixer-update', (mixer) => {
      setState(prev => ({ ...prev, mixer }));
    });

    setSocket(sock);
    return () => sock.close();
  }, []);

  const handlePlay = () => {
    fetch('/admin/player/play', { method: 'POST' });
  };

  const handleSetGain = (stemId, gainDb) => {
    fetch('/admin/mixer/gain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stemId, gainDb })
    });
  };

  return (
    <div>
      <h1>{state?.currentSong?.title}</h1>
      <button onClick={handlePlay}>Play</button>
      {/* Mixer UI, effects controls, etc. */}
    </div>
  );
}
```

### **Mobile Control App**

```javascript
// Simple mobile interface
async function togglePlayPause() {
  const state = await fetch('/api/state').then(r => r.json());

  if (state.playback.isPlaying) {
    await fetch('/admin/player/pause', { method: 'POST' });
  } else {
    await fetch('/admin/player/play', { method: 'POST' });
  }
}

async function adjustAutoTune(enabled, strength) {
  await fetch('/admin/preferences/autotune', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, strength })
  });
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message describing what went wrong"
}
```

**Status Codes:**
- `200` - Success
- `400` - Bad request (missing/invalid parameters)
- `500` - Server error

---

## State Persistence

- **Queue**, **mixer state**, **effects settings**, and **preferences** persist across app restarts
- **Playback position** and **isPlaying** do NOT persist (always starts paused at 0:00)
- State saved every 30 seconds and on app quit

---

## Performance Notes

- **Position updates**: 10x/sec from audio engine, 1x/sec to web clients (interpolated)
- **State queries**: Instant (in-memory snapshots)
- **Control commands**: ~100ms roundtrip (IPC to renderer)

---

## Future Enhancements

- Authentication/API keys
- WebRTC canvas streaming to web UI
- Multi-room support (multiple karaoke stations)
- User permissions (singer vs. KJ vs. admin)
- Undo/redo for mixer changes
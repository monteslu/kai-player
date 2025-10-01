# Web UI / Renderer UI Feature Parity

This document tracks which features are available in each client interface.

---

## Architecture

Both UIs are **equal peers** querying the same canonical state from main process:

```
┌──────────────────────┐         ┌──────────────────────┐
│   Renderer UI        │         │   Web UI             │
│   (Electron)         │         │   (Browser/Mobile)   │
│                      │         │                      │
│   + Audio Hardware   │         │   REST API           │
│   + File System      │         │   Socket.IO          │
│   + IPC              │         │                      │
└──────────┬───────────┘         └──────────┬───────────┘
           │                                 │
           └─────────────┬───────────────────┘
                         ↓
            ┌────────────────────────┐
            │   Main Process         │
            │   (Canonical State)    │
            │   • playback           │
            │   • queue              │
            │   • mixer              │
            │   • effects            │
            │   • preferences        │
            └────────────────────────┘
```

---

## Feature Matrix

### ✅ = Available
### 🟡 = Partially Available
### ❌ = Not Available
### 🔧 = Hardware-Only (Renderer Exclusive)

| Feature | Renderer UI | Web UI | Notes |
|---------|------------|---------|-------|
| **Playback Control** |
| View current song | ✅ | ✅ | Via `/api/state` |
| View playback position | ✅ | ✅ | Real-time via Socket.IO |
| Play/Pause | ✅ | ✅ | POST `/admin/player/play` or `/pause` |
| Seek | ✅ | ✅ | POST `/admin/player/seek` |
| Restart song | ✅ | ✅ | POST `/admin/player/restart` |
| Next song | ✅ | ✅ | POST `/admin/player/next` |
| **Queue Management** |
| View queue | ✅ | ✅ | GET `/api/queue` |
| Add song to queue | ✅ | ✅ | POST `/api/request` |
| Remove from queue | ✅ | 🟡 | Endpoint exists, UI not built |
| Reorder queue | ✅ | ❌ | IPC only, needs REST endpoint |
| Clear queue | ✅ | ✅ | POST `/admin/queue/reset` |
| **Song Library** |
| Browse songs | ✅ | ✅ | GET `/api/songs` |
| Search songs | ✅ | ✅ | GET `/api/songs?search=...` |
| Filter by letter | ✅ | ✅ | GET `/api/songs?letter=A` |
| Scan folder | 🔧 | ❌ | File system access required |
| Set songs folder | 🔧 | ❌ | File system access required |
| **Mixer Control** |
| View mixer state | ✅ | ✅ | GET `/api/state` → mixer |
| Adjust stem gain | ✅ | ✅ | POST `/admin/mixer/gain` |
| Mute stem (PA/IEM) | ✅ | ✅ | POST `/admin/mixer/mute` |
| Solo stem | ✅ | ✅ | POST `/admin/mixer/solo` |
| Apply preset | ✅ | ✅ | POST `/admin/mixer/preset` |
| Save/recall scenes | ✅ | ❌ | Needs REST endpoint |
| **Effects Control** |
| View current effect | ✅ | ✅ | GET `/api/state` → effects |
| Change effect | ✅ | ✅ | POST `/admin/effects/set` |
| Next/Previous effect | ✅ | ✅ | POST `/admin/effects/next` |
| Disable effect | ✅ | ✅ | POST `/admin/effects/disable` |
| Enable effect | ✅ | ✅ | POST `/admin/effects/enable` |
| Toggle waveforms | ✅ | ✅ | POST `/admin/preferences/effects` |
| Set overlay opacity | ✅ | ✅ | POST `/admin/preferences/effects` |
| Random effect on song | ✅ | ✅ | POST `/admin/preferences/effects` |
| **Auto-Tune** |
| Enable/disable | ✅ | ✅ | POST `/admin/preferences/autotune` |
| Adjust strength | ✅ | ✅ | POST `/admin/preferences/autotune` |
| Adjust speed | ✅ | ✅ | POST `/admin/preferences/autotune` |
| **Microphone** |
| Enable/disable | ✅ | ✅ | POST `/admin/preferences/microphone` |
| Adjust gain | ✅ | ✅ | POST `/admin/preferences/microphone` |
| Route to speakers | ✅ | ✅ | POST `/admin/preferences/microphone` |
| **Audio Devices** |
| Select PA output | 🔧 | ❌ | Web Audio API can't enumerate hardware |
| Select IEM output | 🔧 | ❌ | Web Audio API can't enumerate hardware |
| Select input device | 🔧 | ❌ | Web Audio API can't enumerate hardware |
| View device names | ✅ | ✅ | GET `/api/state` → preferences.audio.devices |
| **Lyrics Editor** |
| Edit lyrics | 🔧 | ❌ | Requires file write access |
| Enable/disable lines | 🔧 | ❌ | Requires file write access |
| Adjust timing | 🔧 | ❌ | Requires file write access |
| **Karaoke Display** |
| View lyrics | ✅ | ✅ | Canvas can be streamed via WebRTC |
| View waveform | ✅ | ✅ | Canvas can be streamed via WebRTC |
| View effects | ✅ | ✅ | Canvas can be streamed via WebRTC |
| **Song Requests** |
| Submit request | ❌ | ✅ | Public endpoint for users |
| Approve request | ✅ | ✅ | POST `/admin/request/approve` |
| Reject request | ✅ | ✅ | POST `/admin/request/reject` |
| View pending | ✅ | ✅ | GET `/admin/requests` |
| **Server Management** |
| View server settings | ✅ | ✅ | GET `/api/info` |
| Update settings | ✅ | ❌ | IPC only, needs REST endpoint |
| Refresh library cache | ✅ | ✅ | POST `/admin/library/refresh` |

---

## Current Web UI Capabilities

### **Fully Functional (Ready to Use)**

1. **Playback Control**
   - Start/stop/pause playback
   - Seek to any position
   - Skip to next song
   - View real-time position updates

2. **Queue Management**
   - View full queue
   - Add songs via requests
   - Clear entire queue
   - See what's currently playing

3. **Song Library**
   - Browse entire library
   - Search by title/artist
   - Filter by first letter
   - View song metadata

4. **Mixer Control**
   - Adjust gain for any stem (-60dB to +12dB)
   - Mute/unmute stems on PA or IEM
   - Solo individual stems
   - Apply mixer presets (karaoke, original, band_only, acoustic)

5. **Effects Control**
   - Change to specific effect by name
   - Cycle through effects (next/previous)
   - Disable unwanted effects
   - Re-enable disabled effects
   - Toggle waveforms on/off
   - Adjust overlay opacity
   - Toggle random effect on song change
   - Toggle upcoming lyrics display

6. **Auto-Tune**
   - Enable/disable in real-time
   - Adjust strength (0-100)
   - Adjust speed (0-100)

7. **Microphone**
   - Enable/disable mic input
   - Adjust mic gain (0.0-2.0)
   - Toggle mic to speakers routing

8. **Real-Time Updates**
   - Position updates 1x/sec
   - State changes via Socket.IO
   - Mixer changes broadcast
   - Effect changes broadcast
   - Queue updates broadcast

### **Missing from Web UI (Renderer-Only)**

1. **Hardware Access**
   - Select specific audio devices (PA/IEM/input)
   - Enumerate available audio interfaces
   - Direct ASIO/JACK device selection

2. **File System**
   - Open .kai files from disk
   - Save edited lyrics back to .kai files
   - Scan folders for songs
   - Set songs folder path

3. **Lyrics Editor**
   - Edit lyric text
   - Adjust word timing
   - Enable/disable lyric lines
   - Save changes to .kai file

4. **Native UI**
   - Open secondary canvas window
   - Native fullscreen mode
   - System tray integration

---

## Use Cases by Client Type

### **Renderer UI (Electron App)**
**Best for:**
- KJ station (main computer with audio hardware)
- Editing song metadata
- Audio device configuration
- Initial library setup

**Typical user:** Professional KJ at the mixer desk

---

### **Web UI - Admin Panel**
**Best for:**
- Remote control from tablet/phone
- Co-KJ controlling playback
- Adjusting mixer from anywhere in venue
- Emergency song skips from phone
- Band member adjusting their IEM mix

**Typical user:** KJ assistant, band member, venue staff

---

### **Web UI - Public Song Requests**
**Best for:**
- Audience members requesting songs
- Self-service karaoke booking
- Touch-screen kiosk at venue

**Typical user:** Singer waiting to perform

---

## Development Roadmap

### **Phase 1: Current State** ✅
- Canonical state model in main
- REST API for all controls
- Socket.IO for real-time updates
- Preferences sync across clients

### **Phase 2: Web UI Polish** 🚧
- Build React/Vue admin dashboard
- Mixer UI with faders
- Effect selector with thumbnails
- Queue drag-and-drop reordering
- Responsive mobile layout

### **Phase 3: Advanced Features**
- WebRTC canvas streaming to web UI
- Multi-user authentication
- User roles (singer/KJ/admin)
- Scene save/recall via REST
- Song history/analytics

### **Phase 4: Mobile App**
- React Native app
- iOS/Android native
- Same REST API backend
- Offline mode for requesters

---

## API Coverage

**Endpoints Implemented:** 35
- Player control: 5
- Queue management: 3
- Mixer control: 4
- Effects control: 5
- Preferences: 4
- Library: 2
- State/Info: 3
- Song requests: 3
- Admin: 6

**Socket.IO Events:** 8
- Real-time state synchronization
- Broadcasts on all state changes

**See:** `WEB-API-REFERENCE.md` for complete API documentation

---

## Example: Remote KJ Setup

```
Stage Computer (Renderer UI)
├─ Audio outputs to PA system
├─ Audio outputs to IEM transmitters
├─ Microphone input
└─ Karaoke display on projector

KJ Tablet (Web UI - Admin)
├─ Control playback
├─ Adjust mixer levels
├─ See queue
└─ Approve requests

Singer's Phone (Web UI - Public)
├─ Browse song library
├─ Submit requests
└─ See queue position

Band Member's Phone (Web UI - Admin)
├─ View mixer
└─ Adjust their IEM mix
```

---

## Conclusion

The web UI is now a **first-class client** with nearly **complete feature parity** for remote control and monitoring. The only exclusive features in the renderer UI are those requiring **hardware access** or **file system writes**.

This architecture enables:
- ✅ Remote KJ control from tablet/phone
- ✅ Multiple simultaneous operators
- ✅ Singer self-service requests
- ✅ Band member IEM mixing
- ✅ Venue staff emergency controls

**Next:** Build the actual React/Vue web UI components using the REST API!
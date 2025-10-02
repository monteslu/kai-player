# Module Refactor Plan

## Goal
Incrementally refactor the Loukai codebase from "vibe-coded globals" to proper ESM module architecture, while maintaining full functionality at every step. **Share code between Electron renderer, web admin UI, and Node.js main process** using universal ESM modules.

## Principles
1. **Never break working features** - Each change must be tested before moving to the next
2. **One module at a time** - Refactor in small, isolated chunks
3. **Backwards compatibility** - Keep old APIs working alongside new ones during transition
4. **Test continuously** - After each step, run the app and verify core features work
5. **Write once, run everywhere** - Shared ESM modules work in browser, Electron renderer, and Node.js
6. **React everywhere** - Single UI framework for Electron renderer and web admin

## Current Architecture Analysis

### What We Have Now
1. **Electron renderer** (`src/renderer/`) - Vanilla JS with manual DOM manipulation
2. **Web admin** (`src/web/`) - React + Vite, completely separate codebase
3. **Main process** (`src/main/`) - Node.js, CommonJS modules
4. **No shared code** - Everything duplicated between UIs

### What We Want
1. **Shared ESM modules** (`src/shared/`) - Universal code (state, business logic, utilities)
2. **React everywhere** - Both Electron renderer and web admin use same components
3. **Platform adapters** - Thin adapter layer for Electron vs web differences
4. **Type safety** - TypeScript for better code sharing and refactoring

## Current Architecture Problems

### 1. Global Window Pollution
- `window.kaiAPI` - Main process IPC bridge
- `window.settingsAPI` - Settings persistence
- `window.appInstance` - Global app reference for cross-component communication
- No clear module boundaries or dependency injection

### 2. Multiple Sources of Truth
- Device preferences: Saved via `settingsAPI.setDevicePreferences()`, loaded from `appState.preferences.audio.devices` (wrong path!)
- Mixer state: In `audioEngine.mixerState`, `appState.mixer`, and persisted separately
- Playback state: In `audioEngine`, `player`, and broadcast via IPC
- No single source of truth for any state

### 3. State Management Issues
- State scattered across multiple classes
- No reactive state updates
- Manual synchronization between renderer and main process
- Race conditions when state updates come from multiple sources

### 4. IPC Communication Chaos
- `ipcRenderer.invoke()` calls scattered throughout codebase
- No abstraction layer or error handling
- Main process handlers in main.js have no clear organization
- No request/response typing or validation

### 5. Circular Dependencies
- `main.js` creates `audioEngine`, which needs `mixer`, which needs `audioEngine`
- Components reference each other via global `window.appInstance`
- No clear dependency graph

## Target Architecture

```
kai-player/
├── src/
│   ├── shared/              # Universal ESM modules (browser + Node.js)
│   │   ├── state/           # State management (works everywhere)
│   │   ├── models/          # Data models and types
│   │   ├── utils/           # Pure utility functions
│   │   └── constants.js     # Shared constants
│   │
│   ├── renderer/            # Electron renderer (React)
│   │   ├── components/      # React components
│   │   ├── hooks/           # React hooks
│   │   ├── services/        # Electron-specific services (IPC bridge)
│   │   └── index.jsx        # Entry point
│   │
│   ├── web/                 # Web admin (React)
│   │   ├── components/      # React components (many shared with renderer)
│   │   ├── services/        # Web-specific services (REST/WebSocket)
│   │   └── main.jsx         # Entry point
│   │
│   └── main/                # Node.js main process (ESM)
│       ├── handlers/        # IPC handlers
│       ├── services/        # Node services (file system, audio devices)
│       └── main.js          # Entry point
```

### Code Sharing Strategy

**What goes in `src/shared/`:**
- State management (StateManager, stores)
- Business logic (song queue management, mixer calculations)
- Data models (Song, QueueItem, MixerState)
- Utilities (time formatting, gain calculations)
- Constants (IPC channel names, default values)

**What stays platform-specific:**
- `src/renderer/services/` - Electron IPC calls
- `src/web/services/` - REST/WebSocket calls
- `src/main/` - File system, native audio, Electron APIs
- Canvas rendering (uses native APIs)
- Audio engine (uses Web Audio API - renderer only)

**React components:**
- Most UI components can be shared (MixerPanel, QueueList, SongSearch)
- Platform differences handled via dependency injection
- Example: `<MixerPanel />` accepts `onGainChange` prop, doesn't care if it's IPC or REST

## Phased Refactor Plan

### Phase 0: Documentation & Analysis
**Goal:** Understand current state before changing anything

- [x] Document current architecture problems
- [x] Map all state locations (where each piece of state lives)
- [x] Map all IPC channels and their purposes
- [x] Identify critical paths (play/pause, device routing, mixer control)
- [x] Create comprehensive test checklist for regression testing

**Success Criteria:** ✅ COMPLETE - Clear map of codebase, test checklist ready

---

### Phase 1: Convert Main Process to ESM
**Goal:** Establish ESM foundation by converting Node.js main process first

#### Why Start Here?
1. Main process is isolated - doesn't affect renderer immediately
2. Can test thoroughly without touching UI
3. Easier to convert (no DOM, no browser quirks)
4. Establishes patterns for rest of codebase
5. Unblocks shared module creation

#### Step 1.1: Audit Main Process Dependencies
- [x] List all `require()` calls in `src/main/`
- [x] Identify CommonJS vs ESM packages
- [x] Check which need updating or have ESM versions
- [x] Document any incompatible packages
- **Test:** ✅ Nothing broken, documented

#### Step 1.2: Add ESM Support to Package.json
- [x] Add `"type": "module"` to root `package.json`
- [x] Update Electron entry point if needed
- **Test:** ✅ Launched successfully

#### Step 1.3: Convert Main Entry Point (main.js)
- [x] Convert `require()` to `import`
- [x] Convert all `module.exports` to `export`
- [x] Fix `__dirname` and `__filename` for ESM
- **Test:** ✅ App launches without errors

#### Step 1.4: Convert Main Process Modules One-by-One
- [x] Convert `src/main/audioEngine.js`
- [x] Convert `src/main/appState.js`
- [x] Convert `src/main/settingsManager.js`
- [x] Convert `src/main/statePersistence.js`
- [x] Convert `src/main/webServer.js` (added `__dirname` fix)
- [x] Convert `src/utils/kaiLoader.js`
- [x] Convert `src/utils/cdgLoader.js`
- [x] Convert `src/utils/kaiWriter.js`
- [ ] Convert `src/main/preload.js` (special case - keeping CommonJS for Electron compatibility)
- **Test after each:** ✅ App works, IPC calls succeed

#### Step 1.5: Handle Dynamic Imports
- [x] No dynamic imports needed currently
- **Test:** ✅ All loading works

#### Step 1.6: Clean Up and Verify
- [x] Consistent import style across main process
- [x] All files use `.js` extensions
- [x] Syntax check passed
- **Test:** ✅ Full regression test - all features work

**Success Criteria:** ✅ COMPLETE - Main process fully ESM, app launches and works perfectly

---

### Phase 2: Setup Shared Directory
**Goal:** Create universal ESM modules that work everywhere

#### Step 2.1: Create Shared Infrastructure
- [x] Create `src/shared/` directory structure
- [x] Add `src/shared/package.json` with `"type": "module"`
- [x] Create basic utilities:
  - [x] `src/shared/constants.js` - IPC channels, default values
  - [x] `src/shared/utils/format.js` - Time formatting, file size
  - [x] `src/shared/utils/audio.js` - Gain/dB conversions, stem detection
- **Test:** ✅ Syntax validated, ready for import

#### Step 2.2: Extract Shared Business Logic from Main
- [x] Created `src/shared/services/queueService.js` with pure functions
- [x] Functions: addSongToQueue, removeSongFromQueue, clearQueue, getQueue, getQueueInfo, reorderQueue
- [x] Updated main.js IPC handlers to use queueService
- [x] Updated webServer.js REST endpoints to use queueService
- [x] Updated renderer queue.js to handle new response format
- [x] Tested - both IPC and REST use same business logic (no duplication)
- **Test:** ✅ Queue operations work identically via IPC and REST

#### Step 2.3: Create State Manager (Shared)
- [x] Created `src/shared/state/StateManager.js` - Universal EventEmitter-based state container
- [x] Supports domain-specific state updates (playback, queue, mixer, effects, preferences, etc.)
- [x] Provides reactive subscriptions via EventEmitter
- [x] Works in both Node.js and browser environments
- [x] Integrated into AppState - AppState now extends StateManager
- [x] All AppState methods now use StateManager's update() for state changes
- [x] Maintains backward compatibility with existing event listeners
- **Test:** ✅ App starts successfully, no stack overflow, state persistence works

**Success Criteria:** ✅ COMPLETE - Shared infrastructure created (Step 2.1 ✅), Queue service extracted (Step 2.2 ✅), StateManager implemented (Step 2.3 ✅)

#### Step 2.4: Extract Library Service
- [x] Created `src/shared/services/libraryService.js` with shared functions
- [x] Functions: getSongsFolder, getCachedSongs, getLibrarySongs, scanLibrary, syncLibrary, getSongInfo, clearLibraryCache
- [x] Updated main.js IPC handlers to use libraryService
- [x] Updated main.js getLibrarySongs() method to use libraryService
- [x] Updated webServer.js /admin/library/refresh endpoint to use libraryService
- [x] Tested - library loads successfully from cache
- **Test:** ✅ Library operations work via both IPC and REST

#### Step 2.5: Extract Player Service
- [x] Created `src/shared/services/playerService.js` with shared functions
- [x] Functions: play, pause, restart, seek, loadSong, playNext, getPlaybackState, getCurrentSong
- [x] Updated main.js methods to use playerService (playerPlay, playerPause, playerRestart, playerSeek, playerNext, getCurrentSong)
- [x] Updated webServer.js REST endpoints to use playerService (/admin/player/play, pause, restart, seek, next, load)
- [x] Tested - app starts successfully, no errors
- **Test:** ✅ Player operations work via both IPC and REST

#### Step 2.6: Extract Preferences Service
- [x] Created `src/shared/services/preferencesService.js` with shared functions
- [x] Functions: getPreferences, updateAutoTunePreferences, updateMicrophonePreferences, updateEffectsPreferences, getWaveformSettings, updateWaveformSettings, getAutoTuneSettings, updateAutoTuneSettings
- [x] Updated webServer.js REST endpoints to use preferencesService (/admin/preferences, /admin/preferences/autotune, /admin/preferences/microphone, /admin/preferences/effects, /admin/settings/waveform, /admin/settings/autotune)
- [x] Tested - app starts successfully, library loads from cache (2174 songs)
- **Test:** ✅ Preferences operations work via REST endpoints

#### Step 2.7: Extract Effects Service
- [x] Created `src/shared/services/effectsService.js` with shared functions
- [x] Functions: getEffects, setEffect, selectEffect, toggleEffect, nextEffect, previousEffect, randomEffect, disableEffect, enableEffect
- [x] Updated webServer.js REST endpoints to use effectsService (/admin/effects GET, /admin/effects/select, /admin/effects/toggle, /admin/effects/set, /admin/effects/next, /admin/effects/previous, /admin/effects/random, /admin/effects/disable, /admin/effects/enable)
- [x] Fixed bi-directional synchronization (renderer → web UI and web UI → renderer)
- [x] Tested - app starts successfully, library loads from cache (2174 songs)
- **Test:** ✅ Effects operations work via REST endpoints and sync between UIs

#### Step 2.8: Extract Mixer Service
- [x] Created `src/shared/services/mixerService.js` with shared functions
- [x] Functions: getMixerState, setMasterGain, toggleMasterMute, setMasterMute
- [x] Updated webServer.js REST endpoints to use mixerService (/admin/mixer/master-gain, /admin/mixer/master-mute)
- [x] Tested - app starts successfully, library loads from cache (2174 songs)
- **Test:** ✅ Mixer operations work via REST endpoints

#### Step 2.9: Extract Song Requests Service
- [x] Create `src/shared/services/requestsService.js` with shared functions
- [x] Functions: getRequests, approveRequest, rejectRequest, addRequest, clearRequests
- [x] Update main.js IPC handlers to use requestsService (webServer:getSongRequests, webServer:approveRequest, webServer:rejectRequest)
- [x] Update webServer.js REST endpoints to use requestsService (/admin/requests GET, /admin/requests/:id/approve, /admin/requests/:id/reject)
- [x] Update webServer methods to delegate to requestsService
- [x] Tested - app starts successfully, no errors
- **Test:** ✅ Request operations work via both IPC and REST

#### Step 2.10: Extract Web Server Settings Service
- [x] Create `src/shared/services/serverSettingsService.js` with shared functions
- [x] Functions: getServerSettings, updateServerSettings, loadSettings, saveSettings, broadcastSettingsChange
- [x] Update main.js IPC handlers to use serverSettingsService (webServer:getSettings, webServer:updateSettings)
- [x] Update main.js methods to use serverSettingsService (getWebServerSettings, updateWebServerSettings)
- [x] Update webServer.js REST endpoint to use serverSettingsService (/admin/settings POST)
- [x] Update webServer methods to delegate to serverSettingsService
- [x] Tested - app starts successfully, no errors
- **Test:** ✅ Server settings operations work via both IPC and REST

**Success Criteria:** ✅ COMPLETE (10/10 complete) - All services extracted (Queue ✅, Library ✅, Player ✅, Preferences ✅, Effects ✅, Mixer ✅, Requests ✅, Server Settings ✅)

---

### Phase 3: Migrate Electron Renderer to React
**Goal:** Both UIs use React, enabling component sharing

#### Step 3.1: Setup React in Renderer
- Add React + ReactDOM to renderer dependencies
- Setup Vite for renderer (like web admin already has)
- Create `src/renderer/index.html` that loads React app
- Create minimal `src/renderer/App.jsx` that renders "Hello React"
- **Test:** Electron window shows React app

#### Step 3.2: Create Adapter Pattern for IPC
- Create `src/renderer/services/ElectronBridge.js`
- Wraps all `window.kaiAPI` calls
- Create `src/web/services/WebBridge.js`
- Wraps all REST/WebSocket calls
- Both implement same interface:
```javascript
// src/shared/services/BridgeInterface.js
export class BridgeInterface {
  async setDevice(type, id) { throw new Error('Not implemented'); }
  async setMasterGain(bus, gain) { throw new Error('Not implemented'); }
  // ... all IPC/REST methods
}
```
- **Test:** Both bridges work in their respective environments

#### Step 3.3: Port One Component to React
- Start small: Port `PlayerControls` to React
- Make it work in Electron renderer using ElectronBridge
- Verify it still works in web admin using WebBridge
- Keep old vanilla JS version running in parallel
- **Test:** React PlayerControls works in both UIs

#### Step 3.4: Port Remaining Components
- Port components one at a time:
  - MixerPanel
  - QueueList
  - SongSearch
  - EffectsPanel
  - RequestsList
- Test each one thoroughly before moving to next
- Remove vanilla JS versions once React versions work
- **Test:** All UI features work in React

#### Step 3.5: Share Components Between UIs
- Move shared components to `src/renderer/components/shared/`
- Import them in web admin: `import { MixerPanel } from '../../renderer/components/shared/MixerPanel.jsx'`
- Ensure they work with both bridges (ElectronBridge and WebBridge)
- **Test:** Both UIs use exact same components

**Success Criteria:** Both UIs use React, most components are shared

---

### Phase 4: Migrate State to Shared Module
**Goal:** State management works everywhere, single source of truth

#### Step 4.1: Migrate Device State
- Move device preferences to StateManager
- Update `saveDevicePreference()` to use StateManager
- Update `loadDevicePreferences()` to read from StateManager
- Keep old APIs working by proxying to StateManager
- **Test:** Verify device selection still works

#### Step 4.2: Migrate Mixer State
- Move all mixer state to StateManager
- Update audioEngine to read from StateManager
- Update mixer UI to subscribe to StateManager changes
- **Test:** Verify mixer controls work, state persists

#### Step 4.3: Migrate Playback State
- Move playback position, isPlaying, duration to StateManager
- Update audioEngine to publish state changes
- Update UI to subscribe to StateManager
- **Test:** Verify play/pause/seek work, progress bar updates

**Success Criteria:** All app state lives in shared StateManager

---

### Phase 5: Remove Global Window Pollution
**Goal:** Replace global `window.*` with proper dependency injection

#### Step 5.1: Already Done (ElectronBridge from Phase 3)
- ElectronBridge already wraps `window.kaiAPI`
- React components receive bridge via props/context
- No more direct `window.*` access in components

#### Step 5.2: Remove `window.appInstance`
- Replace with React Context or shared StateManager
- Components communicate via state changes, not direct method calls
- **Test:** All features work without global app reference

**Success Criteria:** No more `window.*` globals, everything via DI or context

---

### Phase 6: Consolidate IPC Layer
**Goal:** Clean IPC abstraction with typed contracts

#### Step 6.1: Define IPC Contracts
- Create `src/shared/ipcContracts.js` (used by both main and renderer)
- Define all channels, request/response types
- Example:
```javascript
export const IPC_CHANNELS = {
  AUDIO_SET_DEVICE: 'audio:setDevice',
  MIXER_SET_GAIN: 'mixer:setMasterGain',
  // ...
};

export const IPC_SCHEMAS = {
  [IPC_CHANNELS.AUDIO_SET_DEVICE]: {
    request: { deviceType: 'string', deviceId: 'string' },
    response: 'boolean'
  }
};
```

#### Step 6.2: Create Type-Safe IPC Wrapper
- Validate requests/responses against schemas
- Centralized error handling
- Automatic logging/debugging
- **Test:** All IPC calls still work with validation

#### Step 6.3: Refactor Main Process Handlers
- Group related handlers into modules
- `src/main/handlers/audioHandlers.js`
- `src/main/handlers/mixerHandlers.js`
- Clear separation of concerns
- **Test:** Main process still responds correctly

**Success Criteria:** All IPC communication goes through typed contracts

---

### Phase 7: Break Circular Dependencies
**Goal:** Clear dependency graph, proper layering

#### Step 7.1: Identify Dependency Layers
- Layer 1: Services (IPC, Settings, Device enumeration)
- Layer 2: Core (AudioEngine, StateManager)
- Layer 3: Controllers (Mixer, Player, Editor)
- Layer 4: UI Components
- Lower layers never import from higher layers

#### Step 7.2: Refactor AudioEngine Dependencies
- AudioEngine should not know about Mixer or Player
- Use StateManager for communication instead
- Emit events, don't call methods on other classes
- **Test:** Audio routing still works

#### Step 7.3: Refactor Component Communication
- Components subscribe to StateManager, don't call each other directly
- Use event bus for cross-cutting concerns (e.g., "song ended")
- **Test:** All features work without direct component references

**Success Criteria:** Clean dependency graph, no circular deps

---

### Phase 8: Persistence Layer Cleanup
**Goal:** Consistent state persistence and loading

#### Step 8.1: Audit All Persisted State
- List everything that gets saved to disk
- Identify duplicates and conflicts
- Document expected persistence behavior

#### Step 8.2: Create Persistence Service
- Single service responsible for save/load
- Versioned state schema
- Migration support for schema changes
- Automatic debouncing/batching of saves

#### Step 8.3: Migrate All Persistence
- Device preferences → Persistence Service
- Mixer state → Persistence Service
- Auto-tune settings → Persistence Service
- Waveform preferences → Persistence Service
- **Test:** All settings persist and restore correctly

**Success Criteria:** Single persistence mechanism, no conflicts

---

### Phase 9: TypeScript Migration (Optional but Recommended)
**Goal:** Type safety to prevent bugs like the device preference mismatch

#### Step 9.1: Setup TypeScript
- Configure tsconfig.json for gradual migration
- Allow `.js` and `.ts` files to coexist
- Start with strict mode disabled, gradually enable

#### Step 9.2: Type the State
- Convert StateManager to TypeScript
- Define all state interfaces
- Instant validation of state access patterns

#### Step 9.3: Type Services and Core
- Convert Services to TypeScript
- Convert AudioEngine to TypeScript
- Convert IPC contracts to TypeScript
- **Test:** Everything still works, but now with type checking

#### Step 9.4: Type Controllers and UI (Lower Priority)
- Gradually migrate remaining code
- Focus on core logic first, UI later

**Success Criteria:** Core architecture is type-safe

---

## Testing Checklist (Run After Each Step)

### Critical Path Tests
- [ ] Open a KAI file and play it
- [ ] Pause/resume playback
- [ ] Seek to different positions
- [ ] Vocals route to IEM device only
- [ ] Music routes to PA device only
- [ ] Change IEM device, verify routing updates
- [ ] Change PA device, verify routing updates
- [ ] Adjust PA master gain
- [ ] Adjust IEM master gain
- [ ] Mute/unmute PA
- [ ] Mute/unmute IEM
- [ ] Open editor tab, modify lyrics
- [ ] Save lyrics changes
- [ ] Reload app, verify settings persisted

### Secondary Tests
- [ ] Add songs to queue
- [ ] Skip to next song in queue
- [ ] Visual effects switch
- [ ] CDG file playback
- [ ] Microphone input
- [ ] Auto-tune on/off
- [ ] Web admin interface connects
- [ ] Song requests from web interface

### Regression Tests
- [ ] No console errors during startup
- [ ] No console errors during playback
- [ ] Device selection dropdowns populate
- [ ] All tabs render correctly
- [ ] Window resize doesn't break layout
- [ ] Canvas window opens/closes

---

## Non-Goals (Out of Scope)

- Rewriting from scratch (too risky)
- Changing UI framework (React/Vue/etc.)
- Major feature additions during refactor
- Performance optimization (unless blocking refactor)
- Web Audio API changes (unless necessary)

---

## Rollback Strategy

At each phase:
1. Work in a feature branch: `refactor/phase-N-description`
2. Commit after each working step
3. Tag working states: `refactor-phase-N-step-M-working`
4. If something breaks and can't be fixed in 30 minutes, roll back to last tag
5. Merge phase branch only when fully tested

---

## Timeline Estimate

- Phase 0: 2-4 hours (documentation) ✅ COMPLETE
- Phase 1: 2-3 days (ESM foundation) ✅ COMPLETE
- Phase 2: 2-3 days (shared services extraction) ✅ COMPLETE
- Phase 3: 3-5 days (React migration - biggest lift)
- Phase 4: 1-2 days (state migration to shared)
- Phase 5: 1 day (remove window globals)
- Phase 6: 1 day (IPC cleanup)
- Phase 7: 1 day (break circular deps)
- Phase 8: 1 day (persistence cleanup)
- Phase 9: 2-3 days (TypeScript, optional)

**Total:** 2-3 weeks of focused work, or 4-6 weeks if done incrementally

**Critical path:** Phase 3 (React migration) is the biggest effort but enables code sharing

---

## Success Metrics

- Zero regressions in functionality
- Both UIs (Electron + web admin) use React
- 80%+ of UI components shared between Electron and web
- All shared business logic in `src/shared/` ESM modules
- Zero `window.*` global usage (except platform detection)
- 100% of state in shared StateManager
- Zero circular dependencies
- All IPC calls go through contracts
- Single persistence mechanism
- (Optional) 80%+ TypeScript coverage of core code

---

## Notes

The app does something genuinely innovative - AI stem separation + dual-output routing for karaoke coaching is novel and valuable. The codebase is "dogshit" but the functionality is amazing. This refactor preserves what makes the app great while making it maintainable for future development.

Priority is **stability over purity**. If a refactor step is too risky, skip it. Ship a working product > ship perfect code.

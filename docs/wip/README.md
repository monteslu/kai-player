# KAI Player

A cross-platform karaoke player and coach app for `.kai` files. Built with Electron, this application provides real-time stem mixing, dual-output routing (PA + IEM), lyrics editing, and vocal coaching features.

## Features

- **KAI File Support**: Load and play `.kai` v1.0 files (ZIP containers with stems and lyrics)
- **Real-time Stem Control**: Individual mute/solo controls for vocals, drums, bass, and other stems
- **Dual Output Routing**: Independent PA and IEM outputs with per-stem routing control
- **Lyrics Editor**: Line-by-line lyric editing with disable/enable toggles
- **Vocal Coaching**: Live pitch analysis and scoring (planned)
- **Auto-tune**: Real-time pitch correction (planned)

## Requirements

- Node.js 18+ 
- npm or yarn

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd kai-player

# Install dependencies
npm install
```

## Development

```bash
# Start in development mode (hot reload)
npm run dev
```

This will launch the Electron app with hot reload enabled for both main and renderer processes.

## Usage

1. Launch the app with `npm run dev`
2. Load a `.kai` file using the file picker
3. Use the mixer controls to adjust stem levels and routing
4. Switch to the Editor tab to modify lyrics
5. Use transport controls to play/pause/seek

## File Format

The app supports `.kai` v1.0 files as specified in `KAI-File-Format-v1.0.md`. These are ZIP files containing:

- `song.json` - Metadata, timing, and lyrics
- Audio stems (MP3 files) - vocals, drums, bass, other
- Optional analysis data in `features/` directory

## Architecture

- **Frontend**: Electron renderer with HTML/CSS/JS
- **Backend**: Node.js main process
- **Audio**: Web Audio API (stub implementation, native audio engine planned)
- **File Handling**: ZIP parsing and manipulation

## Documentation

- `docs/KAI-File-Format-v1.0.md` - File format specification
- `docs/KAI-Play-Spec-v1.0.md` - Player application specification

## License

AGPLv3 (recommended to match dependencies)
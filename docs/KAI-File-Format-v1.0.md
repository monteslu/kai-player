
# KAI File Format — v1.0 (Initial Release)
**Date:** 2025-09-07T18:31:12Z  
**Status:** Stable (initial)  
**License:** CC BY 4.0 for this spec (software implementations may choose their own FOSS licenses)

## 1. Overview
`.kai` is a plain **ZIP** container (custom extension) that packages all assets and analysis needed to run a high-quality, low-latency karaoke/coach experience fully offline and open-source.

- Primary descriptor: **`song.json`** (metadata, alignment, structure, audio layout, and optional provenance)
- Audio assets: **MP3 files at ZIP root** (no `stems/` folder)
- Optional analysis: **`features/`** directory

## 2. Goals
- **Portable**: one file works everywhere.
- **Deterministic**: encoder delays and timing offsets are explicit.
- **Extensible**: new features live under `features/`; unknown keys are ignored; experimental keys use `x-*`.
- **Open**: only FOSS tools required to build and use.
- **Single descriptor**: no separate manifest; optional provenance/hashes live in `song.json.meta`.

## 3. Required contents (ZIP root)
- `song.json` — canonical descriptor (metadata, alignment, singers, lyric timings, **audio profile**; **`meta` is optional**).
- MP3 stems at root depending on **audio profile** (`song.json.audio.profile`):
  - **KAI-4 (MVP)**: `vocals.mp3`, `drums.mp3`, `bass.mp3`, `other.mp3`
  - **KAI-2**: `vocals.mp3`, `music.mp3`
  - **KAI-6**: add `guitar.mp3`, `piano.mp3`
  - **KAI-CUSTOM**: `song.json.audio.sources[]` lists arbitrary roles/files.

## 4. Optional contents (root)
- `features/` — precomputed analysis (any subset): `vocals_f0.json`, `vocal_pitch.json`, `notes_ref.json`, `onsets_ref.json`, `tempo_map.json`, `keys.json`, `chords.json`, `vocal_activity.json`, `mfcc_ref.json`
- `assets/` — auxiliary audio (e.g., `assets/click.mp3`, `assets/count_in.wav`).

## 5. ZIP layout (examples)
```
# KAI-4 (MVP)
My Song.kai
├── song.json
├── vocals.mp3
├── drums.mp3
├── bass.mp3
└── other.mp3
```
```
# KAI-2
My Song.kai
├── song.json
├── vocals.mp3
└── music.mp3
```

## 6. `song.json` (v1.0 schema excerpt)
All time values are seconds (float). Use UTF-8 and LF newlines.

```json
{
  "kai_version": "1.0",
  "song": {
    "title": "Track Title",
    "artist": "Artist",
    "album": "Album Title",
    "album_artist": "Album Artist",
    "track": { "no": 1, "of": 12 },
    "disc":  { "no": 1, "of": 1 },
    "year": "2020",
    "genre": "Pop",
    "comment": "Optional comment about the song",
    "isrc": "US-XXX-20-00001",
    "musicbrainz": { "recording_id": "", "track_id": "", "release_id": "" },
    "source_filename": "InputFile.mp3",
    "duration_sec": 213.47,
    "sample_rate": 44100,
    "channels": 2
  },
  "audio": {
    "profile": "KAI-4",                      // KAI-2 | KAI-4 | KAI-6 | KAI-CUSTOM
    "encoder_delay_samples": 1105,           // MP3 encoder delay applied to all stems
    "sources": [
      { "id": "vocals", "file": "vocals.mp3", "role": "vocals" },
      { "id": "drums",  "file": "drums.mp3",  "role": "drums"  },
      { "id": "bass",   "file": "bass.mp3",   "role": "bass"   },
      { "id": "other",  "file": "other.mp3",  "role": "other"  }
    ],
    "presets": [
      { "id": "karaoke",    "levels": { "vocals": -120 } },
      { "id": "drums_only", "solo":   ["drums"] }
    ]
  },
  "timing": {
    "reference": "aligned_to_vocals_wav",
    "offset_sec": 0.000
  },
  "meter": { "bpm": 100.0 },
  "singers": [ { "id": "A", "name": "Lead", "guide": "vocals.mp3" } ],
  "vocal_pitch": {
    "quantization_type": "midi_cents",     // default: midi_cents | note_only_rle | segments | delta_encoded
    "sample_rate_hz": 25,                  // for midi_cents and delta_encoded types
    "quant_data": [                        // format depends on quantization_type
      [60, 15], [60, 12], [62, -10], ...   // midi_cents: [note, cents_offset]
    ]
  },
  "lines": [
    {
      "start": 10.5,
      "end": 13.2,
      "text": "Hello world, this is a test",
      "disabled": false
    },
    {
      "start": 12.0,
      "end": 13.5,
      "text": "(Hello world)",
      "backup": true
    },
    {
      "start": 14.0,
      "end": 17.5,
      "text": "Another line of lyrics",
      "disabled": true
    }
  ],

  "meta": {
    "(optional)": true,
    "created_utc": "2025-09-07T18:31:12Z",
    "source": { "filename": "InputFile.mp3", "sha256": "..." },
    "id3": {
      "(optional)": true,
      "version": "ID3v2.3",
      "normalized": {
        "title": "Title", "artist": "Artist", "album": "Album",
        "album_artist": "Album Artist", "track": { "no": 1, "of": 12 },
        "disc": { "no": 1, "of": 1 }, "year": "2020", "genre": "Pop",
        "isrc": "US-XXX-20-00001",
        "musicbrainz": { "recording_id": "", "track_id": "", "release_id": "" }
      },
      "raw": {
        "(optional)": true,
        "TIT2": "Title", "TPE1": "Artist", "TALB": "Album",
        "TPE2": "Album Artist", "TRCK": "1/12", "TPOS": "1/1",
        "TCON": "Pop", "TYER": "2020", "TSRC": "US-XXX-20-00001"
      }
    },
    "processing": {
      "(optional)": true,
      "separation": { "model": "htdemucs_ft", "device": "cuda|cpu", "profile": "KAI-4" },
      "alignment":  { "model": "kai-aligner-ctc-dtw", "version": "…" },
      "analysis":   { "f0": "crepe-tiny", "onsets": "madmom", "tempo": "madmom-tempo" }
    },
    "hashes": {
      "(optional)": true,
      "vocals.mp3": { "sha256": "...", "bitrate_kbps": 128 },
      "drums.mp3":  { "sha256": "...", "bitrate_kbps": 160 },
      "bass.mp3":   { "sha256": "...", "bitrate_kbps": 160 },
      "other.mp3":  { "sha256": "...", "bitrate_kbps": 160 }
    }
  }
}
```

### 6.1 Vocal Pitch Format

The optional `vocal_pitch` property contains quantized pitch data from vocal analysis, primarily for auto-tune and pitch visualization features.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `quantization_type` | string | Yes | Type of quantization: `midi_cents` (default), `note_only_rle`, `segments`, or `delta_encoded` |
| `sample_rate_hz` | number | Conditional | Sample rate in Hz (required for `midi_cents` and `delta_encoded` types) |
| `quant_data` | array | Yes | Quantized pitch data (format depends on `quantization_type`) |

**Quantization Types:**

1. **`midi_cents`** (default) - MIDI note + cents offset at fixed sample rate
   - Best for auto-tune applications with predictable size (~11KB for 3-min song at 25Hz)
   - `quant_data`: Array of `[note, cents]` pairs where note is MIDI (0-127, 0=silence) and cents is offset (-50 to +50)
   - Example: `[[60, 15], [60, 12], [62, -10], [0, 0]]`

2. **`note_only_rle`** - Run-length encoded MIDI notes only
   - Most compact (~1-5KB) but loses microtonal detail
   - `quant_data`: Array of `[note, duration_ms]` pairs
   - Example: `[[60, 500], [62, 700], [0, 300]]` (C4 for 500ms, D4 for 700ms, silence for 300ms)

3. **`segments`** - Time-based pitch segments
   - Compact (~2-5KB) with variable timing, good for sparse vocals
   - `quant_data`: Array of objects with `t` (start time in ms), `d` (duration in ms), `n` (MIDI note), `c` (cents offset)
   - Example: `[{"t": 0, "d": 500, "n": 60, "c": 15}, {"t": 500, "d": 700, "n": 62, "c": -10}]`

4. **`delta_encoded`** - Delta compression from initial pitch
   - Good compression (~20-30KB) but requires sequential decoding
   - `quant_data`: Object with `initial` (starting MIDI+cents) and `deltas` (array of pitch changes)
   - `sample_rate_hz` required to determine timing
   - Example: `{"initial": [60, 0], "deltas": [0, 2, -1, 0, 3, -3]}`

**Notes:**
- MIDI note 0 represents silence/no pitch
- Cents offsets range from -50 to +50 (100 cents = 1 semitone)
- Players not supporting auto-tune can safely ignore this property
- Large pitch data may be stored in `features/vocal_pitch.json` instead

### 6.2 Lyrics Line Format

Each lyric line in the `lines[]` array is an object with the following properties:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `start` | number | Yes | Start time in seconds (float) |
| `end` | number | Yes | End time in seconds (float) |
| `text` | string | Yes | Lyric text content |
| `disabled` | boolean | No | If `true`, line is hidden during playback but preserved in editor. Defaults to `false` if omitted. |
| `backup` | boolean | No | If `true`, line represents backup singer vocals. Defaults to `false` if omitted (lead singer). |

**Notes:**
- Time values must be non-negative and `end >= start`
- Lines with `disabled: true` are filtered out during playback but remain visible in lyric editors
- Lines without the `disabled` property are treated as enabled (`disabled: false`)
- Lines with `backup: true` represent backup singer vocals; lines without this property are lead singer vocals
- Empty `text` is permitted for instrumental sections
- The `disabled` property enables selective lyric editing without losing original content
- The `backup` property enables differentiation between lead and backup singer vocals for multi-singer songs

### 6.3 Metadata policy (ID3 ingestion & fallbacks)
- Packers **MUST** attempt to read ID3v2.4/2.3/2.2 (and v1) from the **source MP3**.
- Canonical fields go to `song.song`; optional `meta.id3.normalized/raw` may be included for provenance.
- **Fallbacks:** if `title` missing, set to **filename stem**; if `artist` missing, use `"Unknown Artist"`. Always set `song.source_filename`.
- Text MUST be UTF-8; normalize whitespace; trim NULs.
- Packer flag `--id3-raw=false` MAY omit `meta.id3.raw` to reduce size/privacy.

## 7. Validation (reader must check)
A `.kai` is valid iff:
1) `song.json` exists at root and `song.json.kai_version == "1.0"`;  
2) All files named in `song.json.audio.sources[].file` exist at root;  
3) `audio.profile` is one of `KAI-2`, `KAI-4`, `KAI-6`, or `KAI-CUSTOM`;  
4) `audio.encoder_delay_samples` and `timing.reference`/`offset_sec` exist.  
**Note:** `meta` and all of its subfields are **optional** and **must not** be required for playback.

## 8. Minimal compliant `song.json` example
```json
{
  "kai_version": "1.0",
  "song": {
    "title": "Filename Fallback Title",
    "artist": "Unknown Artist",
    "source_filename": "MySong.mp3",
    "duration_sec": 180.0,
    "sample_rate": 44100,
    "channels": 2
  },
  "audio": {
    "profile": "KAI-4",
    "encoder_delay_samples": 1105,
    "sources": [
      { "id": "vocals", "file": "vocals.mp3", "role": "vocals" },
      { "id": "drums",  "file": "drums.mp3",  "role": "drums"  },
      { "id": "bass",   "file": "bass.mp3",   "role": "bass"   },
      { "id": "other",  "file": "other.mp3",  "role": "other"  }
    ]
  },
  "timing": { "reference": "aligned_to_vocals_wav", "offset_sec": 0.0 },
  "meter": { "bpm": 100.0 },
  "singers": [ { "id": "A", "name": "Lead", "guide": "vocals.mp3" } ],
  "lines": []
}
```

## 9. Extensibility rules
- New analyses → `features/` (JSON). New audio → additional MP3s referenced in `song.json.audio.sources[]`.
- Experimental keys may use `x-*` namespaces.
- Minor 1.x additions are non-breaking; 2.0 may break.

/**
 * Stem Builder - Creates .stem.m4a files with embedded stem data
 *
 * The .stem.m4a format embeds multiple audio stems in a single M4A container
 * using custom atoms/boxes. This is compatible with Native Instruments Stems.
 *
 * Structure:
 * - ftyp (file type)
 * - moov (movie header with metadata)
 * - mdat (media data with stems)
 * - stem (custom atom with stem mapping)
 * - kaid (custom atom with karaoke ID data)
 * - kons (custom atom with onset/lyrics data)
 * - vpch (custom atom with vocal pitch data)
 */

import { readFileSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import { getFFmpegPath } from './systemChecker.js';

/**
 * Build a .stem.m4a file from individual stem files
 *
 * @param {Object} options - Build options
 * @param {string} options.outputPath - Output .stem.m4a path
 * @param {Object} options.stems - Map of stem name to path
 * @param {Object} options.metadata - Song metadata (title, artist, duration)
 * @param {Object} options.lyrics - Whisper transcription result with word timestamps
 * @param {Object} options.pitch - CREPE pitch detection result
 * @returns {Promise<void>}
 */
export async function buildStemM4a(options) {
  const { outputPath, stems, metadata, lyrics, pitch } = options;

  // For now, use ffmpeg to mux stems into a single file
  // The stem.m4a format requires custom atom injection
  // We'll use the first stem as the main track and embed others as metadata

  const ffmpegPath = getFFmpegPath();

  // Build ffmpeg command to combine stems
  // Using -map to include multiple audio streams
  const args = [];

  // Add input files
  const stemNames = Object.keys(stems);
  for (const name of stemNames) {
    args.push('-i', stems[name]);
  }

  // Map all inputs to output
  for (let i = 0; i < stemNames.length; i++) {
    args.push('-map', `${i}:a`);
  }

  // Set metadata - copy ALL original tags
  const tags = metadata.tags || {};

  // Standard ID3 tags to preserve
  const tagMapping = {
    title: metadata.title || tags.title,
    artist: metadata.artist || tags.artist,
    album: tags.album,
    album_artist: tags.album_artist || tags.albumartist,
    composer: tags.composer,
    genre: tags.genre,
    date: tags.date || tags.year,
    track: tags.track || tags.tracknumber,
    disc: tags.disc || tags.discnumber,
    comment: tags.comment,
    copyright: tags.copyright,
    publisher: tags.publisher,
    encoded_by: tags.encoded_by,
    language: tags.language,
    lyrics: tags.lyrics || tags.unsyncedlyrics,
    bpm: tags.bpm || tags.tbpm,
    isrc: tags.isrc,
    barcode: tags.barcode,
    catalog: tags.catalog,
    compilation: tags.compilation,
    grouping: tags.grouping,
  };

  // Add all non-empty tags
  for (const [key, value] of Object.entries(tagMapping)) {
    if (value) {
      args.push('-metadata', `${key}=${value}`);
    }
  }

  // Also pass through any additional tags we might have missed
  for (const [key, value] of Object.entries(tags)) {
    const lowerKey = key.toLowerCase();
    // Skip if already handled above
    if (!tagMapping[lowerKey] && value) {
      args.push('-metadata', `${key}=${value}`);
    }
  }

  args.push('-metadata', 'encoder=Loukai Creator');

  // Copy codecs (stems are already AAC)
  args.push('-c', 'copy');

  // Add stream labels for stems
  for (let i = 0; i < stemNames.length; i++) {
    const stemName = stemNames[i];
    // Use metadata to label streams
    args.push(`-metadata:s:a:${i}`, `title=${stemName}`);
  }

  // Output format
  args.push('-f', 'mp4');
  args.push('-y'); // Overwrite output
  args.push(outputPath);

  // Run ffmpeg
  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg failed (code ${code}): ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run FFmpeg: ${err.message}`));
    });
  });

  // Now inject custom atoms for karaoke data
  injectKaraokeAtoms(outputPath, { lyrics, pitch, metadata, stems: stemNames });
}

/**
 * Inject custom karaoke atoms into an M4A file
 *
 * @param {string} filePath - Path to M4A file
 * @param {Object} data - Karaoke data to embed
 */
function injectKaraokeAtoms(filePath, data) {
  const { lyrics, pitch, metadata, stems } = data;

  // Read the existing file
  const fileBuffer = readFileSync(filePath);

  // Build custom atoms
  const atoms = [];

  // kaid atom - Karaoke ID (metadata as JSON)
  // Include all original tags for the player to use
  const originalTags = metadata.tags || {};
  const kaidData = JSON.stringify({
    version: 1,
    format: 'stem.m4a',
    title: metadata.title || '',
    artist: metadata.artist || '',
    album: originalTags.album || '',
    duration: metadata.duration || 0,
    stems: stems,
    createdAt: new Date().toISOString(),
    creator: 'Loukai',
    // Preserve all original ID3 tags
    tags: originalTags,
  });
  atoms.push(buildAtom('kaid', Buffer.from(kaidData, 'utf8')));

  // kons atom - Karaoke Onsets/Lyrics (word timestamps)
  if (lyrics && lyrics.words && lyrics.words.length > 0) {
    const konsData = JSON.stringify({
      version: 1,
      language: lyrics.language || 'en',
      words: lyrics.words.map((w) => ({
        w: w.word,
        s: Math.round(w.start * 1000), // ms
        e: Math.round(w.end * 1000), // ms
        c: w.confidence || 1,
      })),
      segments: lyrics.segments || [],
    });
    atoms.push(buildAtom('kons', Buffer.from(konsData, 'utf8')));
  }

  // vpch atom - Vocal Pitch (CREPE data, compressed)
  if (pitch && pitch.frequencies && pitch.frequencies.length > 0) {
    // Compress pitch data - store as delta-encoded integers
    const pitchData = {
      version: 1,
      sampleRate: pitch.sampleRate || 100, // samples per second
      frequencies: compressPitchData(pitch.frequencies),
      confidence: compressConfidenceData(pitch.confidence || []),
    };
    atoms.push(buildAtom('vpch', Buffer.from(JSON.stringify(pitchData), 'utf8')));
  }

  // stem atom - Stem mapping (NI Stems format compatibility)
  const stemData = {
    version: 1,
    stems: stems.map((name, index) => ({
      name,
      index,
      color: getStemColor(name),
    })),
  };
  atoms.push(buildAtom('stem', Buffer.from(JSON.stringify(stemData), 'utf8')));

  // Combine atoms
  const atomsBuffer = Buffer.concat(atoms);

  // Append atoms to file
  // M4A files can have atoms at the end after mdat
  const outputBuffer = Buffer.concat([fileBuffer, atomsBuffer]);

  writeFileSync(filePath, outputBuffer);
}

/**
 * Build an MP4/M4A atom
 *
 * @param {string} type - 4-character atom type
 * @param {Buffer} data - Atom payload
 * @returns {Buffer}
 */
function buildAtom(type, data) {
  // Atom structure: [4 bytes size][4 bytes type][data]
  const size = 8 + data.length;
  const buffer = Buffer.alloc(size);

  // Write size (big-endian)
  buffer.writeUInt32BE(size, 0);

  // Write type
  buffer.write(type, 4, 4, 'ascii');

  // Write data
  data.copy(buffer, 8);

  return buffer;
}

/**
 * Compress pitch frequency data using delta encoding
 *
 * @param {number[]} frequencies - Array of frequencies in Hz
 * @returns {string} Base64 encoded compressed data
 */
function compressPitchData(frequencies) {
  // Convert to MIDI note numbers (more compressible than Hz)
  const midiNotes = frequencies.map((f) => {
    if (f <= 0) return 0;
    return Math.round(12 * Math.log2(f / 440) + 69);
  });

  // Delta encode
  const deltas = [];
  let prev = 0;
  for (const note of midiNotes) {
    deltas.push(note - prev);
    prev = note;
  }

  // Pack as int8 (clamped)
  const packed = Buffer.alloc(deltas.length);
  for (let i = 0; i < deltas.length; i++) {
    packed.writeInt8(Math.max(-127, Math.min(127, deltas[i])), i);
  }

  return packed.toString('base64');
}

/**
 * Compress confidence data
 *
 * @param {number[]} confidence - Array of confidence values 0-1
 * @returns {string} Base64 encoded compressed data
 */
function compressConfidenceData(confidence) {
  // Quantize to uint8 (0-255)
  const packed = Buffer.alloc(confidence.length);
  for (let i = 0; i < confidence.length; i++) {
    packed.writeUInt8(Math.round(confidence[i] * 255), i);
  }

  return packed.toString('base64');
}

/**
 * Get default color for a stem type
 *
 * @param {string} stemName - Stem name
 * @returns {string} Hex color
 */
function getStemColor(stemName) {
  const colors = {
    vocals: '#FF6B6B',
    drums: '#4ECDC4',
    bass: '#45B7D1',
    other: '#96CEB4',
    no_vocals: '#9B59B6',
    instrumental: '#3498DB',
  };

  return colors[stemName.toLowerCase()] || '#95A5A6';
}

export default {
  buildStemM4a,
};

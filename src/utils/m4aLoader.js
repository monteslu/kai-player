import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import os from 'os';
import { Atoms as M4AAtoms } from 'm4a-stems';

const execAsync = promisify(exec);

class M4ALoader {
  /**
   * Extract a single audio track from M4A file using FFmpeg
   * @param {string} m4aPath - Path to M4A file
   * @param {number} trackIndex - Track index (0-based)
   * @returns {Promise<Buffer>} Audio data as buffer
   */
  static async extractTrack(m4aPath, trackIndex) {
    try {
      // Create temporary file for extracted track
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `track_${trackIndex}_${Date.now()}.m4a`);

      // Use FFmpeg to extract the specific track
      // -map 0:a:{trackIndex} selects the audio track at the given index
      // -loglevel error suppresses verbose output
      const ffmpegCmd = `ffmpeg -loglevel error -i "${m4aPath}" -map 0:a:${trackIndex} -c copy "${tempFile}" -y`;

      console.log(`📦 Extracting track ${trackIndex} from M4A...`);
      const { stderr } = await execAsync(ffmpegCmd);

      if (stderr) {
        console.warn(`⚠️  FFmpeg warning for track ${trackIndex}:`, stderr);
      }

      // Read the extracted audio file
      const audioBuffer = await fs.promises.readFile(tempFile);

      // Clean up temporary file
      try {
        await fs.promises.unlink(tempFile);
      } catch (unlinkErr) {
        console.warn(`Could not delete temp file ${tempFile}:`, unlinkErr.message);
      }

      console.log(`✅ Extracted track ${trackIndex} (${audioBuffer.length} bytes)`);
      return audioBuffer;
    } catch (error) {
      // Check if FFmpeg is not installed
      if (error.message.includes('ffmpeg') && error.message.includes('not found')) {
        throw new Error('FFmpeg is not installed. Please install FFmpeg to play M4A stems files.');
      }
      console.error(`Failed to extract track ${trackIndex}:`, error.message);
      throw new Error(`Failed to extract track ${trackIndex}: ${error.message}`);
    }
  }

  /**
   * Extract all audio tracks from M4A file
   * @param {string} m4aPath - Path to M4A file
   * @param {Array} sources - Array of source definitions with trackIndex
   * @returns {Promise<Map>} Map of track name to audio buffer
   */
  static async extractAllTracks(m4aPath, sources) {
    const audioFiles = new Map();

    console.log(`📦 Extracting ${sources.length} tracks from M4A...`);

    for (const source of sources) {
      try {
        const audioBuffer = await this.extractTrack(m4aPath, source.track);
        audioFiles.set(source.role || source.id, audioBuffer);
      } catch (error) {
        console.warn(
          `⚠️  Failed to extract track ${source.track} (${source.role || source.id}):`,
          error.message
        );
      }
    }

    return audioFiles;
  }

  /**
   * Load M4A Stems format with karaoke extensions
   * @param {string} m4aPath - Path to .stem.m4a file
   * @returns {Promise<Object>} M4A data object compatible with KAI structure
   */
  static async load(m4aPath) {
    try {
      // Read M4A file
      const m4aBuffer = await fs.promises.readFile(m4aPath);

      // Import music-metadata to read MP4 metadata
      const mm = await import('music-metadata');
      const mmData = await mm.parseFile(m4aPath);

      // Extract kara atom (karaoke data) using m4a-stems
      let karaData = null;
      try {
        karaData = await M4AAtoms.readKaraAtom(m4aPath);
      } catch {
        // No kara atom found - will create default structure below
      }

      // If no kara atom found, create default structure for new karaoke file
      if (!karaData) {
        console.warn('⚠️  M4A file does not contain kara atom - creating default structure');

        // Get track count from format
        const trackCount = mmData.format?.numberOfChannels || 2;

        // Create default audio sources
        const defaultSources = [];
        for (let i = 0; i < trackCount; i++) {
          defaultSources.push({
            id: `track${i}`,
            role: `track${i}`,
            track: i,
          });
        }

        // Create minimal kara structure
        karaData = {
          audio: {
            sources: defaultSources,
            profile: 'STEMS-2',
            encoder_delay_samples: 0,
          },
          lines: [],
          singers: [],
        };
      }

      // Extract musical key from iTunes metadata
      let musicalKey = 'C'; // Default key if not specified
      if (mmData.native && mmData.native.iTunes) {
        const keyAtom = mmData.native.iTunes.find(
          (tag) => tag.id === '----:com.apple.iTunes:initialkey'
        );
        if (keyAtom && keyAtom.value) {
          // Value is typically a Buffer, convert to string
          const keyString =
            typeof keyAtom.value === 'string'
              ? keyAtom.value
              : Buffer.isBuffer(keyAtom.value)
                ? keyAtom.value.toString('utf-8')
                : String(keyAtom.value);
          musicalKey = keyString.trim();
          console.log(`🎹 Detected musical key: ${musicalKey}`);
        }
      }

      // Extract standard metadata
      const metadata = {
        title: mmData.common?.title || path.basename(m4aPath, path.extname(m4aPath)),
        artist: mmData.common?.artist || '',
        album: mmData.common?.album || '',
        duration: mmData.format?.duration || 0,
        key: musicalKey,
        tempo: karaData.meter?.bpm || 120,
        genre: mmData.common?.genre ? mmData.common.genre[0] : '',
        year: mmData.common?.year || null,
      };

      // Extract audio tracks from M4A container
      console.log('🎵 Extracting audio tracks from M4A container...');
      const audioFiles = await this.extractAllTracks(m4aPath, karaData.audio.sources);

      // Build audio sources from kara data with extracted audio buffers
      const sources = [];
      if (karaData.audio && karaData.audio.sources) {
        for (const source of karaData.audio.sources) {
          const sourceName = source.role || source.id;
          sources.push({
            name: sourceName,
            filename: `track_${source.track}.m4a`, // Virtual filename for track reference
            gain: 0,
            pan: 0,
            solo: false,
            mute: false,
            trackIndex: source.track, // M4A track index
            audioData: audioFiles.get(sourceName) || null, // Extracted audio buffer
          });
        }
      }

      // Extract lyrics from kara data and transform property names
      let lyrics = null;
      if (karaData.lines && karaData.lines.length > 0) {
        lyrics = karaData.lines
          .map((line) => ({
            ...line,
            startTime: line.start,
            endTime: line.end,
            isDisabled: line.disabled || false,
            isBackup: line.backup || false,
          }))
          .sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
      }

      // Build data structure compatible with KaiLoader
      const processedData = {
        metadata,

        meta: {
          format: 'm4a-stems',
          profile: karaData.audio?.profile || 'STEMS-4',
          encoder_delay_samples: karaData.audio?.encoder_delay_samples || 0,
        },

        audio: {
          sources,

          presets: karaData.audio?.presets || this.generatePresets(sources),

          timing: {
            offsetSec: karaData.timing?.offset_sec || 0,
            encoderDelaySamples: karaData.audio?.encoder_delay_samples || 0,
          },

          profile: karaData.audio?.profile || 'STEMS-4',
        },

        lyrics,

        features: {
          notesRef: null,
          vocalPitch: karaData.vocal_pitch || null,
          vocalsF0: null,
          onsets: karaData.onsets || null,
          tempo: karaData.meter || null,
        },

        coaching: {
          enabled: true,
          pitchTolerance: 50,
          timingTolerance: 0.1,
          stabilityThreshold: 20,
        },

        // Store original kara data for reference
        karaData,

        // Store file path and buffer for track extraction
        originalFilePath: m4aPath,
        m4aBuffer: new Uint8Array(m4aBuffer),

        // Store singers if available
        singers: karaData.singers || [],

        // Store original song metadata
        song: metadata,

        // Preserve original kara data for editor access
        originalSongJson: karaData,
      };

      return processedData;
    } catch (error) {
      throw new Error(`Failed to load M4A file: ${error.message}`);
    }
  }

  /**
   * Generate default presets for M4A stems
   */
  static generatePresets(sources) {
    const presets = [
      {
        id: 'original',
        name: 'Original',
        description: 'All tracks enabled',
        settings: {},
      },
      {
        id: 'karaoke',
        name: 'Karaoke',
        description: 'Vocals muted on PA, enabled on IEM',
        settings: {
          mutes: {
            PA: { vocals: true },
            IEM: { vocals: false },
          },
        },
      },
    ];

    const hasVocals = sources.some((s) => s.name?.toLowerCase().includes('vocal'));
    const hasDrums = sources.some((s) => s.name?.toLowerCase().includes('drum'));

    if (hasVocals) {
      presets.push({
        id: 'band_only',
        name: 'Band Only',
        description: 'Vocals completely muted',
        settings: {
          mutes: {
            PA: { vocals: true },
            IEM: { vocals: true },
          },
        },
      });
    }

    if (hasDrums) {
      presets.push({
        id: 'acoustic',
        name: 'Acoustic',
        description: 'Drums muted for acoustic feel',
        settings: {
          mutes: {
            PA: { drums: true },
            IEM: { drums: true },
          },
        },
      });
    }

    return presets;
  }

  /**
   * Parse metadata from filename if no tags available
   */
  static parseFilenameMetadata(baseName) {
    const metadata = {
      title: baseName,
      artist: '',
    };

    // Remove .stem suffix if present
    const cleanName = baseName.replace(/\.stem$/i, '');

    // Try to parse "Artist - Title" format
    const dashIndex = cleanName.indexOf(' - ');
    if (dashIndex > 0 && dashIndex < cleanName.length - 3) {
      metadata.artist = cleanName.substring(0, dashIndex).trim();
      metadata.title = cleanName.substring(dashIndex + 3).trim();
    } else {
      metadata.title = cleanName;
    }

    return metadata;
  }
}

export default M4ALoader;

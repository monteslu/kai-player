/**
 * Editor Service - Shared business logic for song editing
 *
 * Used by both IPC handlers (Electron) and REST endpoints (Web Server)
 * to ensure consistent song editing behavior across all interfaces.
 */

import KaiLoader from '../../utils/kaiLoader.js';
import KaiWriter from '../../utils/kaiWriter.js';
import M4ALoader from '../../utils/m4aLoader.js';
import { Atoms } from 'm4a-stems';

/**
 * Load a song for editing
 * @param {string} path - Path to the song file
 * @returns {Promise<Object>} Song data ready for editing
 */
export async function loadSong(path) {
  if (!path) {
    throw new Error('Path is required');
  }

  const lowerPath = path.toLowerCase();

  // Determine format from file extension
  let format;
  if (lowerPath.endsWith('.kai')) {
    format = 'kai';
  } else if (lowerPath.endsWith('.m4a') || lowerPath.endsWith('.mp4')) {
    format = 'm4a-stems';
  } else {
    format = 'cdg-pair';
  }

  if (format === 'kai') {
    const kaiData = await KaiLoader.load(path);
    kaiData.originalFilePath = path;
    return {
      format: 'kai',
      kaiData: kaiData,
    };
  } else if (format === 'm4a-stems') {
    const m4aData = await M4ALoader.load(path);
    m4aData.originalFilePath = path;
    return {
      format: 'm4a-stems',
      kaiData: m4aData, // Use same structure as KAI for compatibility
    };
  } else {
    // CDG format - not yet implemented
    throw new Error('CDG format not yet supported in editor');
  }
}

/**
 * Save song edits
 * @param {string} path - Path to the song file
 * @param {Object} updates - Updates to apply
 * @returns {Promise<Object>} Save result
 */
export async function saveSong(path, updates) {
  if (!path) {
    throw new Error('Path is required');
  }

  const { format, metadata, lyrics } = updates;

  if (format === 'm4a-stems') {
    // Handle M4A format
    return await saveM4ASong(path, { metadata, lyrics });
  } else if (format === 'kai') {
    // Handle KAI format
    return await saveKAISong(path, { metadata, lyrics });
  } else {
    throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Save KAI song edits
 * @param {string} path - Path to KAI file
 * @param {Object} updates - Updates to apply
 * @returns {Promise<Object>} Save result
 */
async function saveKAISong(path, updates) {
  const { metadata, lyrics } = updates;

  // Load existing KAI data
  const kaiData = await KaiLoader.load(path);

  // Merge metadata updates
  const updatedSong = { ...kaiData.song };
  if (metadata.title !== undefined) updatedSong.title = metadata.title;
  if (metadata.artist !== undefined) updatedSong.artist = metadata.artist;
  if (metadata.album !== undefined) updatedSong.album = metadata.album;
  if (metadata.year !== undefined) updatedSong.year = metadata.year;
  if (metadata.genre !== undefined) updatedSong.genre = metadata.genre;
  if (metadata.key !== undefined) updatedSong.key = metadata.key;

  // Use updated lyrics array
  let updatedLyrics = kaiData.lyrics;
  if (lyrics !== undefined && Array.isArray(lyrics)) {
    updatedLyrics = lyrics;
  }

  // Prepare data to save
  const dataToSave = {
    song: updatedSong,
    lyrics: updatedLyrics,
  };

  // Handle AI corrections metadata (rejections/suggestions)
  if (metadata.rejections !== undefined || metadata.suggestions !== undefined) {
    const updatedMeta = { ...kaiData.originalSongJson?.meta };

    if (!updatedMeta.corrections) {
      updatedMeta.corrections = {};
    }

    if (metadata.rejections !== undefined) {
      updatedMeta.corrections.rejected = metadata.rejections.map((r) => ({
        line: r.line_num,
        start: r.start_time,
        end: r.end_time,
        old: r.old_text,
        new: r.new_text,
        reason: r.reason,
        word_retention: r.retention_rate,
      }));
    }

    if (metadata.suggestions !== undefined) {
      updatedMeta.corrections.missing_lines_suggested = metadata.suggestions.map((s) => ({
        suggested_text: s.suggested_text,
        start: s.start_time,
        end: s.end_time,
        confidence: s.confidence,
        reason: s.reason,
        pitch_activity: s.pitch_activity,
      }));
    }

    dataToSave.meta = updatedMeta;
  }

  // Save using KaiWriter
  const result = await KaiWriter.save(dataToSave, path);

  if (!result.success) {
    throw new Error(result.error || 'Failed to save KAI file');
  }

  return result;
}

/**
 * Save M4A song edits
 * @param {string} path - Path to M4A file
 * @param {Object} updates - Updates to apply
 * @returns {Promise<Object>} Save result
 */
async function saveM4ASong(path, updates) {
  const { metadata, lyrics } = updates;

  // Load existing M4A data
  const m4aData = await M4ALoader.load(path);

  // Merge metadata updates into the song data
  const updatedMetadata = { ...m4aData.metadata };
  if (metadata.title !== undefined) updatedMetadata.title = metadata.title;
  if (metadata.artist !== undefined) updatedMetadata.artist = metadata.artist;
  if (metadata.album !== undefined) updatedMetadata.album = metadata.album;
  if (metadata.year !== undefined) updatedMetadata.year = metadata.year;
  if (metadata.genre !== undefined) updatedMetadata.genre = metadata.genre;
  if (metadata.key !== undefined) updatedMetadata.key = metadata.key;

  // NOTE: Standard metadata (title, artist, album, year, genre) is now written
  // using proper MP4 atoms via addStandardMetadata() below, not FFmpeg

  // Use updated lyrics array
  let updatedLyrics = m4aData.lyrics;
  if (lyrics !== undefined && Array.isArray(lyrics)) {
    updatedLyrics = lyrics;
  }

  // Prepare data to save
  const dataToSave = {
    metadata: updatedMetadata,
    lyrics: updatedLyrics,
    audio: m4aData.audio, // Preserve audio configuration
    features: m4aData.features, // Preserve features
    singers: m4aData.singers, // Preserve singers
    meta: m4aData.meta, // Preserve meta
  };

  // Handle AI corrections metadata (rejections/suggestions) if present
  if (metadata.rejections !== undefined || metadata.suggestions !== undefined) {
    const updatedMeta = { ...(dataToSave.meta || {}) };

    if (!updatedMeta.corrections) {
      updatedMeta.corrections = {};
    }

    if (metadata.rejections !== undefined) {
      updatedMeta.corrections.rejected = metadata.rejections.map((r) => ({
        line: r.line_num,
        start: r.start_time,
        end: r.end_time,
        old: r.old_text,
        new: r.new_text,
        reason: r.reason,
        word_retention: r.retention_rate,
      }));
    }

    if (metadata.suggestions !== undefined) {
      updatedMeta.corrections.missing_lines_suggested = metadata.suggestions.map((s) => ({
        suggested_text: s.suggested_text,
        start: s.start_time,
        end: s.end_time,
        confidence: s.confidence,
        reason: s.reason,
        pitch_activity: s.pitch_activity,
      }));
    }

    dataToSave.meta = updatedMeta;
  }

  // Prepare kara data structure for m4a-stems
  const karaData = {
    // Audio configuration
    audio: {
      sources: (dataToSave.audio?.sources || []).map((source, index) => ({
        id: source.name || source.filename,
        role: source.name || source.filename,
        track: source.trackIndex !== undefined ? source.trackIndex : index,
      })),
      profile: dataToSave.audio?.profile || dataToSave.meta?.profile || 'STEMS-4',
      encoder_delay_samples: dataToSave.audio?.timing?.encoderDelaySamples || 0,
      presets: dataToSave.audio?.presets || [],
    },

    // Timing information
    timing: {
      offset_sec: dataToSave.audio?.timing?.offsetSec || 0,
    },

    // Lyrics (lines)
    lines: (dataToSave.lyrics || []).map((line) => ({
      start: line.start || line.startTimeSec || 0,
      end: line.end || line.endTimeSec || 0,
      text: line.text || '',
      ...(line.disabled && { disabled: true }),
    })),

    // Optional: vocal pitch data
    ...(dataToSave.features?.vocalPitch && {
      vocal_pitch: dataToSave.features.vocalPitch,
    }),

    // Optional: onsets data
    ...(dataToSave.features?.onsets && {
      onsets: dataToSave.features.onsets,
    }),

    // Optional: tempo/meter data
    ...(dataToSave.features?.tempo && {
      meter: dataToSave.features.tempo,
    }),

    // Optional: singers
    ...(dataToSave.singers &&
      dataToSave.singers.length > 0 && {
        singers: dataToSave.singers,
      }),
  };

  // Save using m4a-stems
  console.log('💾 Saving M4A kara atom:', path);
  console.log('📝 kara data prepared:', {
    lyricsCount: karaData.lines?.length || 0,
    audioSources: karaData.audio?.sources?.length || 0,
  });

  await Atoms.writeKaraAtom(path, karaData);

  // Write standard MP4 metadata atoms (title, artist, album, year, genre, BPM)
  const standardMetadata = {
    title: updatedMetadata.title,
    artist: updatedMetadata.artist,
    album: updatedMetadata.album,
    year: updatedMetadata.year,
    genre: updatedMetadata.genre,
    tempo: updatedMetadata.tempo,
  };
  await Atoms.addStandardMetadata(path, standardMetadata);

  // Write vocal pitch atom if we have pitch data
  if (dataToSave.features?.vocalPitch) {
    console.log('🎵 Writing vocal pitch atom...');
    await Atoms.writeVpchAtom(path, dataToSave.features.vocalPitch);
  }

  // Write onsets atom if we have onset data
  if (dataToSave.features?.onsets && Array.isArray(dataToSave.features.onsets)) {
    console.log('🎯 Writing onsets atom...');
    await Atoms.writeKonsAtom(path, dataToSave.features.onsets);
  }

  // Write musical key if changed (separate atom for DJ software)
  if (metadata.key !== undefined && updatedMetadata.key) {
    console.log(`🎹 Writing musical key: ${updatedMetadata.key}`);
    await Atoms.addMusicalKey(path, updatedMetadata.key);
  }

  // Restore any preserved atoms that we didn't explicitly handle
  if (m4aData._preservedAtoms && Object.keys(m4aData._preservedAtoms).length > 0) {
    console.log(`📦 Restoring ${Object.keys(m4aData._preservedAtoms).length} preserved atoms`);
    // Note: These atoms are already in the file and we didn't delete them,
    // so they should still be there. This is just for logging.
  }

  console.log('✅ M4A file saved successfully');

  return { success: true };
}

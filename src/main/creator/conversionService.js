/**
 * Conversion Service - Orchestrates the full karaoke creation pipeline
 *
 * Steps:
 * 1. Convert input to WAV (if needed)
 * 2. Run Demucs stem separation
 * 3. Run Whisper transcription on vocals
 * 4. Run CREPE pitch detection on vocals (optional)
 * 5. Assemble into .stem.m4a file
 */

import { join, dirname } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { convertToWav, encodeToAAC } from './ffmpegService.js';
import { runDemucs, runWhisper, runCrepe } from './pythonRunner.js';
import { prepareWhisperContext } from './lrclibService.js';
import { buildStemM4a } from './stemBuilder.js';

// Active conversion state
let conversionInProgress = false;
let conversionCancelled = false;
let currentProcess = null;

/**
 * Check if conversion is in progress
 * @returns {boolean}
 */
export function isConversionInProgress() {
  return conversionInProgress;
}

/**
 * Cancel the current conversion
 * @returns {boolean} True if cancellation was initiated
 */
export function cancelConversion() {
  if (!conversionInProgress) {
    return false;
  }

  conversionCancelled = true;

  // Kill current subprocess if any
  if (currentProcess && typeof currentProcess.kill === 'function') {
    try {
      currentProcess.kill('SIGTERM');
    } catch {
      // Process may have already ended
    }
  }

  return true;
}

/**
 * Check if conversion was cancelled
 * @throws {Error} If cancelled
 */
function checkCancelled() {
  if (conversionCancelled) {
    throw new Error('Conversion cancelled');
  }
}

/**
 * Run the full conversion pipeline
 *
 * @param {Object} options - Conversion options
 * @param {string} options.inputPath - Path to input audio/video file
 * @param {string} options.title - Song title
 * @param {string} options.artist - Artist name
 * @param {Object} options.tags - All original ID3 tags to preserve
 * @param {number} options.numStems - Number of stems (2 or 4)
 * @param {string} options.whisperModel - Whisper model to use
 * @param {string} options.language - Language code
 * @param {boolean} options.enableCrepe - Whether to run pitch detection
 * @param {string} options.referenceLyrics - Reference lyrics for Whisper hints
 * @param {string} options.outputDir - Output directory (defaults to input file directory)
 * @param {Function} onProgress - Progress callback (step, message, progress)
 * @returns {Promise<Object>} Result with outputPath
 */
export async function runConversion(options, onProgress = () => {}) {
  const {
    inputPath,
    title,
    artist,
    tags = {},
    numStems = 4,
    whisperModel = 'large-v3-turbo',
    language = 'en',
    enableCrepe = true,
    referenceLyrics = '',
    outputDir = dirname(inputPath),
  } = options;

  if (conversionInProgress) {
    throw new Error('Conversion already in progress');
  }

  conversionInProgress = true;
  conversionCancelled = false;
  currentProcess = null;

  // Create temp directory for intermediate files
  const tempDir = join(tmpdir(), `kai-convert-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });

  // Create stems temp directory
  const stemsDir = join(tempDir, 'stems');
  mkdirSync(stemsDir, { recursive: true });

  try {
    const safeFileName = (artist ? `${artist} - ${title}` : title).replace(/[<>:"/\\|?*]/g, '_');

    // Step labels for UI
    const STEPS = {
      wav: '1/7 Prepare',
      demucs: '2/7 Stems',
      context: '3/7 Context',
      whisper: '4/7 Lyrics',
      crepe: '5/7 Pitch',
      encode: '6/7 Encode',
      build: '7/7 Build',
    };

    // Step 1: Convert to WAV (0-5%)
    onProgress('wav', `[${STEPS.wav}] Converting to WAV...`, 0);
    checkCancelled();

    const wavPath = join(tempDir, 'input.wav');
    await convertToWav(inputPath, wavPath, { sampleRate: 44100 }, (progress) => {
      onProgress(
        'wav',
        `[${STEPS.wav}] Converting to WAV... ${Math.round(progress)}%`,
        Math.floor(progress * 0.05)
      );
    });

    checkCancelled();

    // Step 2: Run Demucs (5-50%)
    onProgress('demucs', `[${STEPS.demucs}] Loading Demucs...`, 5);
    checkCancelled();

    const demucsResult = await runDemucs(wavPath, stemsDir, { numStems }, (progress, message) => {
      onProgress('demucs', `[${STEPS.demucs}] ${message}`, 5 + Math.floor(progress * 0.45));
    });

    checkCancelled();

    // Use stem paths returned by demucs_runner.py
    const stemPaths = demucsResult.stems;

    if (!stemPaths || Object.keys(stemPaths).length === 0) {
      throw new Error('Demucs did not return stem paths');
    }

    // Verify stem files exist
    for (const [name, path] of Object.entries(stemPaths)) {
      if (!existsSync(path)) {
        throw new Error(`Stem file not found: ${name} at ${path}`);
      }
    }

    // Step 3: Prepare Whisper context (50-52%)
    onProgress('context', `[${STEPS.context}] Preparing vocabulary hints...`, 50);
    checkCancelled();

    let initialPrompt = '';
    if (referenceLyrics) {
      const context = await prepareWhisperContext(title, artist, referenceLyrics);
      initialPrompt = context.initialPrompt || '';
      onProgress(
        'context',
        `[${STEPS.context}] Using ${initialPrompt.split(' ').length} vocabulary hints`,
        51
      );
    }

    // Step 4: Run Whisper (52-80%)
    onProgress('whisper', `[${STEPS.whisper}] Loading Whisper...`, 52);
    checkCancelled();

    const whisperResult = await runWhisper(
      stemPaths.vocals,
      {
        model: whisperModel,
        language,
        initialPrompt,
      },
      (progress, message) => {
        onProgress('whisper', `[${STEPS.whisper}] ${message}`, 52 + Math.floor(progress * 0.28));
      }
    );

    checkCancelled();

    // Step 5: Run CREPE (80-90%, optional)
    let pitchData = null;
    if (enableCrepe) {
      onProgress('crepe', `[${STEPS.crepe}] Loading CREPE...`, 80);
      checkCancelled();

      const crepeResult = await runCrepe(stemPaths.vocals, null, {}, (progress, message) => {
        onProgress('crepe', `[${STEPS.crepe}] ${message}`, 80 + Math.floor(progress * 0.1));
      });

      pitchData = crepeResult;
    }

    checkCancelled();

    // Step 6: Encode stems to AAC (90-95%)
    const stemLabels = {
      vocals: '🎤 Vocals',
      drums: '🥁 Drums',
      bass: '🎸 Bass',
      other: '🎹 Other',
      no_vocals: '🎵 Instrumental',
    };

    onProgress('encode', `[${STEPS.encode}] Encoding stems to AAC...`, 90);
    checkCancelled();

    const aacPaths = {};
    const stemNames = Object.keys(stemPaths);
    const encodeProgress = 5 / stemNames.length;

    for (let i = 0; i < stemNames.length; i++) {
      const stemName = stemNames[i];
      const stemPath = stemPaths[stemName];
      const aacPath = join(tempDir, `${stemName}.m4a`);
      const label = stemLabels[stemName] || stemName;

      onProgress(
        'encode',
        `[${STEPS.encode}] Encoding ${label}...`,
        90 + Math.floor(i * encodeProgress)
      );
      await encodeToAAC(stemPath, aacPath, { codec: 'aac', bitrate: '192k' });
      aacPaths[stemName] = aacPath;

      checkCancelled();
    }

    // Step 7: Build .stem.m4a (95-100%)
    onProgress('build', `[${STEPS.build}] Packaging stem.m4a file...`, 95);
    checkCancelled();

    const outputPath = join(outputDir, `${safeFileName}.stem.m4a`);

    await buildStemM4a({
      outputPath,
      stems: aacPaths,
      metadata: {
        title,
        artist,
        duration: demucsResult.duration || 0,
        tags, // Preserve all original ID3 tags
      },
      lyrics: whisperResult,
      pitch: pitchData,
    });

    onProgress('complete', '✓ Karaoke file created!', 100);

    // Cleanup temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      console.warn('Failed to cleanup temp directory:', tempDir);
    }

    conversionInProgress = false;

    return {
      success: true,
      outputPath,
      duration: demucsResult.duration,
      stems: Object.keys(aacPaths),
      hasLyrics: Boolean(whisperResult?.words?.length),
      hasPitch: Boolean(pitchData),
    };
  } catch (error) {
    conversionInProgress = false;

    // Cleanup on error
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    if (conversionCancelled) {
      return { success: false, cancelled: true };
    }

    throw error;
  }
}

export default {
  runConversion,
  cancelConversion,
  isConversionInProgress,
};

/**
 * FFmpeg Service - Audio conversion and processing
 *
 * Provides Node.js wrappers for FFmpeg/FFprobe operations:
 * - Audio info extraction (duration, sample rate, channels)
 * - Format conversion (to WAV for processing)
 * - AAC encoding (for M4A stems)
 */

import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { platform } from 'os';
import { getCacheDir } from './systemChecker.js';

/**
 * Get FFmpeg executable path
 * Checks system PATH first, then cache directory
 */
export function getFFmpegPath() {
  // Check system PATH first
  try {
    const plat = platform();
    const checkCmd = plat === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
    const result = execSync(checkCmd, { encoding: 'utf8', timeout: 5000 });
    const path = result.trim().split('\n')[0];
    if (path && existsSync(path)) {
      return path;
    }
  } catch {
    // Not in PATH, check cache
  }

  // Check cache directory
  const cacheDir = getCacheDir();
  const plat = platform();
  const filename = plat === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const cachedPath = join(cacheDir, 'bin', filename);

  if (existsSync(cachedPath)) {
    return cachedPath;
  }

  // Default to assuming it's in PATH (will fail if not)
  return 'ffmpeg';
}

/**
 * Get FFprobe executable path
 */
export function getFFprobePath() {
  // Check system PATH first
  try {
    const plat = platform();
    const checkCmd = plat === 'win32' ? 'where ffprobe' : 'which ffprobe';
    const result = execSync(checkCmd, { encoding: 'utf8', timeout: 5000 });
    const path = result.trim().split('\n')[0];
    if (path && existsSync(path)) {
      return path;
    }
  } catch {
    // Not in PATH, check cache
  }

  // Check cache directory
  const cacheDir = getCacheDir();
  const plat = platform();
  const filename = plat === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  const cachedPath = join(cacheDir, 'bin', filename);

  if (existsSync(cachedPath)) {
    return cachedPath;
  }

  return 'ffprobe';
}

/**
 * Get audio file information using ffprobe
 *
 * @param {string} inputPath - Path to audio file
 * @returns {Promise<Object>} Audio info (duration, sampleRate, channels, codec)
 */
export function getAudioInfo(inputPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = getFFprobePath();

    const args = [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      inputPath,
    ];

    const proc = spawn(ffprobe, args, { timeout: 30000 });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed: ${stderr}`));
        return;
      }

      try {
        const info = JSON.parse(stdout);

        // Find audio stream
        const audioStream = info.streams?.find((s) => s.codec_type === 'audio');

        if (!audioStream) {
          reject(new Error('No audio stream found in file'));
          return;
        }

        // Extract ID3/metadata tags (normalize to lowercase keys)
        const rawTags = info.format?.tags || {};
        const tags = {};
        for (const [key, value] of Object.entries(rawTags)) {
          tags[key.toLowerCase()] = value;
        }

        resolve({
          duration: parseFloat(info.format?.duration || audioStream.duration || 0),
          sampleRate: parseInt(audioStream.sample_rate, 10),
          channels: audioStream.channels,
          codec: audioStream.codec_name,
          bitRate: parseInt(info.format?.bit_rate || audioStream.bit_rate || 0, 10),
          format: info.format?.format_name,
          // ID3 tags
          title: tags.title || '',
          artist: tags.artist || tags.album_artist || '',
          album: tags.album || '',
          tags,
        });
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffprobe: ${err.message}`));
    });
  });
}

/**
 * Convert audio file to WAV format
 *
 * @param {string} inputPath - Input audio file
 * @param {string} outputPath - Output WAV file path
 * @param {Object} options - Conversion options
 * @param {number} options.sampleRate - Target sample rate (default 44100)
 * @param {number} options.channels - Target channels (default 2 for stereo)
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<void>}
 */
export function convertToWav(inputPath, outputPath, options = {}, onProgress = null) {
  return new Promise((resolve, reject) => {
    const ffmpeg = getFFmpegPath();
    const sampleRate = options.sampleRate || 44100;
    const channels = options.channels || 2;

    const args = [
      '-y', // Overwrite output
      '-i',
      inputPath,
      '-ar',
      String(sampleRate),
      '-ac',
      String(channels),
      '-f',
      'wav',
      '-progress',
      'pipe:2', // Progress to stderr
      outputPath,
    ];

    const proc = spawn(ffmpeg, args, { timeout: 600000 }); // 10 min timeout

    let duration = 0;
    let stderr = '';

    // Parse progress from stderr
    proc.stderr.on('data', (data) => {
      const str = data.toString();
      stderr += str;

      // Extract duration on first encounter
      if (!duration) {
        const durMatch = str.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (durMatch) {
          duration =
            parseInt(durMatch[1], 10) * 3600 +
            parseInt(durMatch[2], 10) * 60 +
            parseFloat(durMatch[3]);
        }
      }

      // Extract current time for progress
      if (duration && onProgress) {
        const timeMatch = str.match(/out_time_ms=(\d+)/);
        if (timeMatch) {
          const currentMs = parseInt(timeMatch[1], 10);
          const progress = Math.min(100, (currentMs / 1000000 / duration) * 100);
          onProgress(progress);
        }
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg conversion failed: ${stderr.slice(-500)}`));
        return;
      }
      resolve();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

/**
 * Encode audio to AAC for M4A packaging
 *
 * @param {string} inputPath - Input WAV file
 * @param {string} outputPath - Output M4A file path
 * @param {Object} options - Encoding options
 * @param {string} options.bitrate - Target bitrate (default '128k')
 * @param {number} options.sampleRate - Target sample rate (default 44100)
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<Object>} Encoding info
 */
export function encodeToAAC(inputPath, outputPath, options = {}, onProgress = null) {
  return new Promise((resolve, reject) => {
    const ffmpeg = getFFmpegPath();
    const bitrate = options.bitrate || '128k';
    const sampleRate = options.sampleRate || 44100;

    const args = [
      '-y',
      '-i',
      inputPath,
      '-c:a',
      'aac',
      '-b:a',
      bitrate,
      '-ar',
      String(sampleRate),
      '-ac',
      '2',
      '-progress',
      'pipe:2',
      outputPath,
    ];

    const proc = spawn(ffmpeg, args, { timeout: 600000 });

    let duration = 0;
    let stderr = '';

    proc.stderr.on('data', (data) => {
      const str = data.toString();
      stderr += str;

      if (!duration) {
        const durMatch = str.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (durMatch) {
          duration =
            parseInt(durMatch[1], 10) * 3600 +
            parseInt(durMatch[2], 10) * 60 +
            parseFloat(durMatch[3]);
        }
      }

      if (duration && onProgress) {
        const timeMatch = str.match(/out_time_ms=(\d+)/);
        if (timeMatch) {
          const currentMs = parseInt(timeMatch[1], 10);
          const progress = Math.min(100, (currentMs / 1000000 / duration) * 100);
          onProgress(progress);
        }
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`AAC encoding failed: ${stderr.slice(-500)}`));
        return;
      }

      resolve({
        bitrate,
        sampleRate,
        outputPath,
      });
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

/**
 * Extract audio from video file
 *
 * @param {string} inputPath - Input video file
 * @param {string} outputPath - Output audio file path
 * @param {Object} options - Extraction options
 * @param {string} options.format - Output format ('wav', 'mp3', 'aac')
 * @param {number} options.sampleRate - Target sample rate
 * @returns {Promise<void>}
 */
export function extractAudio(inputPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    const ffmpeg = getFFmpegPath();
    const format = options.format || 'wav';
    const sampleRate = options.sampleRate || 44100;

    const args = ['-y', '-i', inputPath, '-vn', '-ar', String(sampleRate), '-ac', '2'];

    // Add format-specific options
    if (format === 'wav') {
      args.push('-f', 'wav');
    } else if (format === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', '192k');
    } else if (format === 'aac') {
      args.push('-c:a', 'aac', '-b:a', '192k');
    }

    args.push(outputPath);

    const proc = spawn(ffmpeg, args, { timeout: 600000 });

    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Audio extraction failed: ${stderr.slice(-500)}`));
        return;
      }
      resolve();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

/**
 * Check if input file is a video (has video stream)
 *
 * @param {string} inputPath - Path to file
 * @returns {Promise<boolean>}
 */
export function isVideoFile(inputPath) {
  const ffprobe = getFFprobePath();

  return new Promise((resolve) => {
    const args = [
      '-v',
      'quiet',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'csv=p=0',
      inputPath,
    ];

    const proc = spawn(ffprobe, args, { timeout: 10000 });

    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', () => {
      resolve(stdout.trim() === 'video');
    });

    proc.on('error', () => {
      resolve(false);
    });
  });
}

export default {
  getFFmpegPath,
  getFFprobePath,
  getAudioInfo,
  convertToWav,
  encodeToAAC,
  extractAudio,
  isVideoFile,
};

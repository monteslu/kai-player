/**
 * Python Runner - Spawns Python ML scripts from Node.js
 *
 * Handles:
 * - Demucs stem separation
 * - Whisper transcription
 * - CREPE pitch detection
 *
 * Progress is parsed from stderr and emitted via callbacks.
 * Results are parsed from stdout JSON.
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPythonPath, getPythonEnv } from './systemChecker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to Python scripts
const PYTHON_SCRIPTS_DIR = join(__dirname, 'python');

/**
 * Run a Python script with JSON arguments
 *
 * @param {string} scriptName - Name of script (e.g., 'demucs_runner.py')
 * @param {Object} args - Arguments to pass as JSON
 * @param {Function} onProgress - Progress callback (step, message, progress%)
 * @returns {Promise<Object>} Parsed JSON result from script
 */
export function runPythonScript(scriptName, args, onProgress = null) {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath();
    const scriptPath = join(PYTHON_SCRIPTS_DIR, scriptName);
    const argsJson = JSON.stringify(args);

    const proc = spawn(pythonPath, [scriptPath, argsJson], {
      env: getPythonEnv(),
      timeout: 3600000, // 1 hour timeout for long operations
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    // Track last known progress message for tqdm updates
    let lastProgressMessage = '';
    let lastProgressPercent = 0;

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;

      const lines = text.split('\n');

      for (const line of lines) {
        // Parse our PROGRESS: updates
        if (line.startsWith('PROGRESS:')) {
          const parts = line.split(':');
          if (parts.length >= 3) {
            lastProgressPercent = parseInt(parts[1], 10);
            lastProgressMessage = parts.slice(2).join(':');
            if (onProgress) {
              onProgress(lastProgressPercent, lastProgressMessage);
            }
          }
          continue;
        }

        // Parse tqdm progress bars: " 14%|█▍        | 4/28 [00:10<01:02,  2.60s/it]"
        // or simpler: "  4/28" pattern
        const tqdmMatch = line.match(/(\d+)%\|.*?\|\s*(\d+)\/(\d+)/);
        if (tqdmMatch && onProgress) {
          const current = parseInt(tqdmMatch[2], 10);
          const total = parseInt(tqdmMatch[3], 10);
          if (total > 0) {
            // Map tqdm progress (0-100%) to our 10-80% range for separation
            const tqdmPercent = (current / total) * 100;
            const mappedPercent = Math.floor(10 + tqdmPercent * 0.7);
            onProgress(mappedPercent, `${lastProgressMessage} (${current}/${total})`);
          }
          continue;
        }

        // Also try simpler pattern for tqdm without percentage
        const simpleMatch = line.match(/\s+(\d+)\/(\d+)\s+\[/);
        if (simpleMatch && onProgress) {
          const current = parseInt(simpleMatch[1], 10);
          const total = parseInt(simpleMatch[2], 10);
          if (total > 0) {
            const tqdmPercent = (current / total) * 100;
            const mappedPercent = Math.floor(10 + tqdmPercent * 0.7);
            onProgress(mappedPercent, `${lastProgressMessage} (${current}/${total})`);
          }
        }
      }
    });

    proc.on('close', (code) => {
      try {
        const result = JSON.parse(stdout.trim());

        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result);
        }
      } catch (e) {
        if (code !== 0) {
          reject(new Error(`Python script failed (code ${code}): ${stderr.slice(-1000)}`));
        } else {
          reject(
            new Error(`Failed to parse Python output: ${e.message}\nOutput: ${stdout.slice(-500)}`)
          );
        }
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Python: ${err.message}`));
    });
  });
}

/**
 * Run Demucs stem separation
 *
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputDir - Directory to save stems
 * @param {Object} options - Options
 * @param {string} options.model - Demucs model (default 'htdemucs_ft')
 * @param {number} options.numStems - Number of stems (2 or 4)
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Result with stem file paths
 */
export function runDemucs(inputPath, outputDir, options = {}, onProgress = null) {
  return runPythonScript(
    'demucs_runner.py',
    {
      input: inputPath,
      output_dir: outputDir,
      model: options.model || 'htdemucs_ft',
      num_stems: options.numStems || 4,
    },
    onProgress
  );
}

/**
 * Run Whisper transcription
 *
 * @param {string} inputPath - Path to audio file (preferably vocals)
 * @param {Object} options - Options
 * @param {string} options.model - Whisper model (default 'large-v3-turbo')
 * @param {string} options.initialPrompt - Initial prompt with vocabulary hints
 * @param {string} options.language - Language code (default 'en')
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Transcription result with word timestamps
 */
export function runWhisper(inputPath, options = {}, onProgress = null) {
  return runPythonScript(
    'whisper_runner.py',
    {
      input: inputPath,
      model: options.model || 'large-v3-turbo',
      initial_prompt: options.initialPrompt || null,
      language: options.language || 'en',
    },
    onProgress
  );
}

/**
 * Run CREPE pitch detection
 *
 * @param {string} inputPath - Path to vocal audio file
 * @param {string} outputPath - Path to save pitch data JSON (optional)
 * @param {Object} options - Options
 * @param {string} options.model - CREPE model capacity (default 'full')
 * @param {number} options.hopLength - Hop length in samples (default 512)
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Pitch detection result
 */
export function runCrepe(inputPath, outputPath = null, options = {}, onProgress = null) {
  return runPythonScript(
    'crepe_runner.py',
    {
      input: inputPath,
      output: outputPath,
      model: options.model || 'full',
      hop_length: options.hopLength || 512,
    },
    onProgress
  );
}

export default {
  runPythonScript,
  runDemucs,
  runWhisper,
  runCrepe,
};

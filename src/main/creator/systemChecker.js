/**
 * System Checker - Validates system requirements for the Creator feature
 *
 * Checks for:
 * - Python availability
 * - PyTorch installation
 * - Demucs (stem separation)
 * - Whisper (transcription)
 * - CREPE (pitch detection)
 * - FFmpeg (audio processing)
 * - Downloaded models
 */

import { existsSync, statSync } from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';
import { execSync, spawn } from 'child_process';

/**
 * Get the data directory for loukai creator (Python, models, etc.)
 * Uses the same base as Electron's userData for consistency
 */
export function getCacheDir() {
  const plat = platform();
  if (plat === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'loukai', 'creator');
  } else if (plat === 'win32') {
    return join(homedir(), 'AppData', 'Local', 'loukai', 'creator');
  } else {
    return join(homedir(), '.config', 'loukai', 'creator');
  }
}

/**
 * Get the Python executable path
 */
export function getPythonPath() {
  const cacheDir = getCacheDir();
  const plat = platform();

  if (plat === 'win32') {
    return join(cacheDir, 'python', 'python.exe');
  } else {
    return join(cacheDir, 'python', 'bin', 'python3');
  }
}

/**
 * Get environment variables for Python processes
 */
export function getPythonEnv() {
  const cacheDir = getCacheDir();

  return {
    ...process.env,
    TORCH_HOME: join(cacheDir, 'models', 'torch'),
    HF_HOME: join(cacheDir, 'models', 'huggingface'),
    XDG_CACHE_HOME: cacheDir, // For whisper model cache
  };
}

/**
 * Check if a system command is available
 */
function checkSystemCommand(command) {
  try {
    const plat = platform();
    const checkCmd = plat === 'win32' ? `where ${command}` : `which ${command}`;
    execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Python is installed and get version
 */
export function checkPython() {
  const pythonPath = getPythonPath();

  if (!existsSync(pythonPath)) {
    return { installed: false, reason: 'not_found' };
  }

  try {
    const output = execSync(`"${pythonPath}" --version`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    const version = output.trim().replace('Python ', '');
    return { installed: true, version, path: pythonPath };
  } catch (e) {
    return { installed: false, reason: 'not_executable', error: e.message };
  }
}

/**
 * Check if a Python package is installed by trying to import it
 */
async function checkPythonPackage(packageName, versionAttr = '__version__') {
  const pythonPath = getPythonPath();

  if (!existsSync(pythonPath)) {
    return { installed: false, reason: 'no_python' };
  }

  const script = `
import sys
try:
    import ${packageName}
    version = getattr(${packageName}, '${versionAttr}', 'unknown')
    print(f"OK:{version}")
except ImportError as e:
    print(f"ERROR:{e}")
`;

  return new Promise((resolve) => {
    const proc = spawn(pythonPath, ['-c', script], {
      env: getPythonEnv(),
      timeout: 30000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (_code) => {
      const output = stdout.trim();
      if (output.startsWith('OK:')) {
        const version = output.replace('OK:', '');
        resolve({ installed: true, version });
      } else {
        resolve({ installed: false, reason: 'import_failed', error: output || stderr });
      }
    });

    proc.on('error', (err) => {
      resolve({ installed: false, reason: 'spawn_failed', error: err.message });
    });
  });
}

/**
 * Check PyTorch and detect GPU availability
 */
export async function checkPyTorch() {
  const pythonPath = getPythonPath();

  if (!existsSync(pythonPath)) {
    return { installed: false, reason: 'no_python' };
  }

  const script = `
import sys
try:
    import torch
    version = torch.__version__
    if torch.cuda.is_available():
        device = 'cuda'
    elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        device = 'mps'
    else:
        device = 'cpu'
    print(f"OK:{version}:{device}")
except ImportError as e:
    print(f"ERROR:{e}")
`;

  return new Promise((resolve) => {
    const proc = spawn(pythonPath, ['-c', script], {
      env: getPythonEnv(),
      timeout: 30000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', () => {
      const output = stdout.trim();
      if (output.startsWith('OK:')) {
        const [version, device] = output.replace('OK:', '').split(':');
        resolve({ installed: true, version, device });
      } else {
        resolve({ installed: false, reason: 'import_failed', error: output || stderr });
      }
    });

    proc.on('error', (err) => {
      resolve({ installed: false, reason: 'spawn_failed', error: err.message });
    });
  });
}

/**
 * Check Demucs
 */
export async function checkDemucs() {
  return checkPythonPackage('demucs', '__version__');
}

/**
 * Check Whisper
 */
export async function checkWhisper() {
  return checkPythonPackage('whisper', '__version__');
}

/**
 * Check CREPE (torchcrepe)
 */
export async function checkCrepe() {
  return checkPythonPackage('torchcrepe', '__version__');
}

/**
 * Get the FFmpeg executable path
 * Returns system ffmpeg if available, otherwise cached version
 */
export function getFFmpegPath() {
  // Check system PATH first
  if (checkSystemCommand('ffmpeg')) {
    return 'ffmpeg';
  }

  // Check cache directory
  const cacheDir = getCacheDir();
  const plat = platform();
  const filename = plat === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const ffmpegPath = join(cacheDir, 'bin', filename);

  if (existsSync(ffmpegPath)) {
    return ffmpegPath;
  }

  // Fallback to assuming it's in PATH
  return 'ffmpeg';
}

/**
 * Check FFmpeg availability
 */
export function checkFFmpeg() {
  // Check system PATH first
  if (checkSystemCommand('ffmpeg')) {
    try {
      const output = execSync('ffmpeg -version', { encoding: 'utf8', timeout: 5000 });
      const versionMatch = output.match(/ffmpeg version (\S+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';
      return { installed: true, version, source: 'system' };
    } catch {
      return { installed: true, source: 'system' };
    }
  }

  // Check cache directory
  const cacheDir = getCacheDir();
  const plat = platform();
  const filename = plat === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const ffmpegPath = join(cacheDir, 'bin', filename);

  if (existsSync(ffmpegPath)) {
    return { installed: true, source: 'cached', path: ffmpegPath };
  }

  return { installed: false };
}

/**
 * Check if a Whisper model is downloaded
 */
export function checkWhisperModel(modelName) {
  const cacheDir = getCacheDir();

  // Whisper stores models in ~/.cache/whisper/ by default
  // We redirect via XDG_CACHE_HOME to our cache dir
  const modelPaths = [
    join(cacheDir, 'whisper', `${modelName}.pt`),
    join(homedir(), '.cache', 'whisper', `${modelName}.pt`),
  ];

  // Expected minimum sizes for models (to detect truncated downloads)
  const minSizes = {
    tiny: 70_000_000,
    base: 130_000_000,
    small: 450_000_000,
    medium: 1_400_000_000,
    large: 2_800_000_000,
    'large-v2': 2_800_000_000,
    'large-v3': 2_800_000_000,
    'large-v3-turbo': 1_500_000_000,
  };

  for (const modelPath of modelPaths) {
    if (existsSync(modelPath)) {
      try {
        const stats = statSync(modelPath);
        const minSize = minSizes[modelName] || 0;

        if (stats.size >= minSize) {
          return { installed: true, path: modelPath, size: stats.size };
        } else {
          return { installed: false, reason: 'truncated', size: stats.size, expected: minSize };
        }
      } catch {
        continue;
      }
    }
  }

  return { installed: false, reason: 'not_found' };
}

/**
 * Check if Demucs model is downloaded
 */
export function checkDemucsModel(_modelName = 'htdemucs_ft') {
  const cacheDir = getCacheDir();

  // Demucs stores models in torch hub cache
  const checkPaths = [
    join(cacheDir, 'models', 'torch', 'hub', 'checkpoints'),
    join(homedir(), '.cache', 'torch', 'hub', 'checkpoints'),
  ];

  for (const checkPath of checkPaths) {
    if (existsSync(checkPath)) {
      // Just check if directory has files - model names vary
      return { installed: true, path: checkPath };
    }
  }

  return { installed: false, reason: 'not_found' };
}

/**
 * Perform complete system check
 */
export async function checkAllComponents() {
  const [python, pytorch, demucs, whisper, crepe] = await Promise.all([
    checkPython(),
    checkPyTorch(),
    checkDemucs(),
    checkWhisper(),
    checkCrepe(),
  ]);

  const ffmpeg = checkFFmpeg();
  const whisperModel = checkWhisperModel('large-v3-turbo');
  const demucsModel = checkDemucsModel('htdemucs_ft');

  const components = {
    python,
    pytorch,
    demucs,
    whisper,
    crepe,
    ffmpeg,
    whisperModel,
    demucsModel,
  };

  // Check if all required components are installed
  const allInstalled =
    python.installed &&
    pytorch.installed &&
    demucs.installed &&
    whisper.installed &&
    crepe.installed &&
    ffmpeg.installed &&
    whisperModel.installed &&
    demucsModel.installed;

  return {
    ...components,
    allInstalled,
    cacheDir: getCacheDir(),
  };
}

export default {
  getCacheDir,
  getPythonPath,
  getPythonEnv,
  getFFmpegPath,
  checkPython,
  checkPyTorch,
  checkDemucs,
  checkWhisper,
  checkCrepe,
  checkFFmpeg,
  checkWhisperModel,
  checkDemucsModel,
  checkAllComponents,
};

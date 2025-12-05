/**
 * Download Manager - Handles downloading and installing AI components for Creator
 *
 * Components:
 * - Python (standalone build from python-build-standalone)
 * - PyTorch (with MPS/CUDA/CPU support)
 * - Demucs (stem separation)
 * - Whisper (transcription)
 * - torchcrepe (pitch detection)
 * - FFmpeg (audio processing)
 * - Models (Whisper large-v3-turbo, Demucs htdemucs_ft)
 */

import https from 'https';
import http from 'http';
import { createWriteStream, existsSync, mkdirSync, rmSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { execSync, spawn } from 'child_process';
import { getCacheDir, getPythonPath, getPythonEnv } from './systemChecker.js';

// Python standalone builds from indygreg/python-build-standalone
const PYTHON_BUILDS = {
  darwin: {
    x64: 'https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-x86_64-apple-darwin-install_only.tar.gz',
    arm64:
      'https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-aarch64-apple-darwin-install_only.tar.gz',
  },
  win32: {
    x64: 'https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-x86_64-pc-windows-msvc-shared-install_only.tar.gz',
  },
  linux: {
    x64: 'https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-x86_64-unknown-linux-gnu-install_only.tar.gz',
    arm64:
      'https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-aarch64-unknown-linux-gnu-install_only.tar.gz',
  },
};

/**
 * Get Python build URL for current platform
 */
function getPythonBuildUrl() {
  const platform = process.platform;
  const arch = process.arch;

  const builds = PYTHON_BUILDS[platform];
  if (!builds) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const url = builds[arch] || builds.x64;
  if (!url) {
    throw new Error(`Unsupported architecture: ${arch} on ${platform}`);
  }

  return url;
}

/**
 * Download a file with progress tracking
 */
function downloadFile(url, destPath, onProgress = null) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    // Ensure directory exists
    const dir = dirname(destPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const request = protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location, destPath, onProgress).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;

      const fileStream = createWriteStream(destPath);

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (onProgress && totalBytes > 0) {
          const percent = Math.floor((downloadedBytes / totalBytes) * 100);
          onProgress(percent, downloadedBytes, totalBytes);
        }
      });

      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (error) => {
        fileStream.close();
        reject(error);
      });
    });

    request.on('error', reject);
    request.end();
  });
}

/**
 * Run pip install command with progress tracking
 */
function pipInstall(packages, onProgress = null) {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath();

    if (!existsSync(pythonPath)) {
      reject(new Error('Python not installed'));
      return;
    }

    // Split packages string into args
    const packageArgs = packages.split(/\s+/).filter((p) => p);
    // Use --progress-bar on to ensure we get progress output
    const args = ['-m', 'pip', 'install', ...packageArgs, '--no-cache-dir', '--progress-bar', 'on'];

    const proc = spawn(pythonPath, args, {
      env: {
        ...getPythonEnv(),
        // Force color output which includes progress bars
        FORCE_COLOR: '1',
        PIP_PROGRESS_BAR: 'on',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let currentPackage = '';
    let lastProgressUpdate = 0;

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      const text = data.toString();

      if (onProgress) {
        // Parse pip output for progress info
        // Look for "Collecting package" or "Downloading package"
        const collectMatch = text.match(/Collecting\s+(\S+)/);
        if (collectMatch) {
          currentPackage = collectMatch[1].split('[')[0].split('>')[0].split('<')[0].split('=')[0];
          onProgress('collecting', `Collecting ${currentPackage}...`);
        }

        if (text.includes('Successfully installed')) {
          onProgress('complete', 'Installation complete');
        }
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      const text = data.toString();

      if (onProgress) {
        // pip 23+ shows download progress in stderr with format like:
        // "Downloading torch-2.0.0.whl (619.9 MB)"
        // "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100.5/619.9 MB 15.2 MB/s eta 0:00:34"

        // Match "Downloading package (size)"
        const downloadMatch = text.match(/Downloading\s+(\S+)\s+\(([^)]+)\)/);
        if (downloadMatch) {
          currentPackage = downloadMatch[1].split('-')[0];
          const totalSize = downloadMatch[2];
          onProgress('downloading', `Downloading ${currentPackage} (${totalSize})...`);
        }

        // Match progress line with downloaded/total and speed
        // Format: "   ━━━━━━━━ 100.5/619.9 MB 15.2 MB/s eta 0:00:34"
        const progressMatch = text.match(
          /(\d+\.?\d*)\s*\/\s*(\d+\.?\d*)\s*(MB|GB|KB)\s+(\d+\.?\d*)\s*(MB|GB|KB)\/s/
        );
        if (progressMatch) {
          const now = Date.now();
          // Throttle updates to every 200ms to avoid flooding
          if (now - lastProgressUpdate > 200) {
            lastProgressUpdate = now;
            const downloaded = parseFloat(progressMatch[1]);
            const total = parseFloat(progressMatch[2]);
            const unit = progressMatch[3];
            const speed = progressMatch[4];
            const speedUnit = progressMatch[5];

            if (total > 0) {
              const percent = Math.floor((downloaded / total) * 100);
              const packageName = currentPackage || 'package';
              onProgress(
                'downloading',
                `Downloading ${packageName}: ${downloaded}/${total} ${unit} (${speed} ${speedUnit}/s) - ${percent}%`
              );
            }
          }
        }

        // Also check for simpler progress format
        // "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 619.9/619.9 MB"
        const simpleProgressMatch = text.match(/(\d+\.?\d*)\s*\/\s*(\d+\.?\d*)\s*(MB|GB|KB)\s*$/);
        if (simpleProgressMatch && !progressMatch) {
          const now = Date.now();
          if (now - lastProgressUpdate > 200) {
            lastProgressUpdate = now;
            const downloaded = parseFloat(simpleProgressMatch[1]);
            const total = parseFloat(simpleProgressMatch[2]);
            const unit = simpleProgressMatch[3];

            if (total > 0) {
              const percent = Math.floor((downloaded / total) * 100);
              const packageName = currentPackage || 'package';
              onProgress(
                'downloading',
                `Downloading ${packageName}: ${downloaded}/${total} ${unit} - ${percent}%`
              );
            }
          }
        }
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, stdout });
      } else {
        reject(new Error(`pip install failed (code ${code}): ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run pip: ${err.message}`));
    });
  });
}

/**
 * Detect GPU type for PyTorch variant selection
 */
function detectGPU() {
  const platform = process.platform;

  // macOS: Check for Apple Silicon (MPS)
  if (platform === 'darwin') {
    return process.arch === 'arm64' ? 'mps' : 'cpu';
  }

  // Linux/Windows: Check for NVIDIA GPU
  try {
    execSync('nvidia-smi', { stdio: 'ignore' });
    return 'cuda';
  } catch {
    return 'cpu';
  }
}

/**
 * Download and install Python
 */
export async function downloadPython(onProgress = null) {
  const cacheDir = getCacheDir();
  const pythonDir = join(cacheDir, 'python');

  // Check if already installed
  const pythonPath = getPythonPath();
  if (existsSync(pythonPath)) {
    if (onProgress) onProgress('complete', 'Python already installed');
    return { success: true, path: pythonPath };
  }

  try {
    const url = getPythonBuildUrl();
    const tarPath = join(cacheDir, 'python.tar.gz');

    // Download
    if (onProgress) onProgress('downloading', 'Downloading Python...');
    await downloadFile(url, tarPath, (percent) => {
      if (onProgress) onProgress('downloading', `Downloading Python... ${percent}%`);
    });

    // Extract
    if (onProgress) onProgress('extracting', 'Extracting Python...');

    // Create python directory
    if (!existsSync(pythonDir)) {
      mkdirSync(pythonDir, { recursive: true });
    }

    // Use tar to extract (available on all platforms)
    const tar = await import('tar');
    await tar.extract({
      file: tarPath,
      cwd: pythonDir,
      strip: 1,
    });

    // Remove quarantine on macOS
    if (process.platform === 'darwin') {
      try {
        execSync(`xattr -cr "${pythonDir}"`, { stdio: 'ignore' });
      } catch {
        // Non-fatal
      }
    }

    // Clean up tarball
    rmSync(tarPath, { force: true });

    // Upgrade pip and setuptools, fix common conflicts
    if (onProgress) onProgress('configuring', 'Upgrading pip and setuptools...');
    await pipInstall('--upgrade pip setuptools wheel');

    // Fix coverage module conflict that can break installs
    try {
      await pipInstall('--upgrade coverage');
    } catch {
      // Non-fatal - coverage may not be installed
    }

    if (onProgress) onProgress('complete', 'Python installed successfully');
    return { success: true, path: pythonPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Download and install PyTorch
 */
export async function downloadPyTorch(variant = 'auto', onProgress = null) {
  try {
    // Detect variant if auto
    if (variant === 'auto') {
      const gpu = detectGPU();
      variant = gpu === 'cuda' ? 'cuda' : gpu === 'mps' ? 'default' : 'cpu';
    }

    let packageSpec;
    if (variant === 'cuda') {
      packageSpec =
        'torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118';
    } else if (variant === 'default' || process.platform === 'darwin') {
      packageSpec = 'torch torchvision torchaudio';
    } else {
      packageSpec = 'torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu';
    }

    if (onProgress) onProgress('installing', 'Installing PyTorch...');
    await pipInstall(packageSpec, (stage, msg) => {
      if (onProgress) onProgress(stage, msg);
    });

    if (onProgress) onProgress('complete', 'PyTorch installed');
    return { success: true, variant };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Download and install TorchCodec (required by torchaudio for audio loading)
 */
export async function downloadTorchCodec(onProgress = null) {
  try {
    if (onProgress) onProgress('installing', 'Installing TorchCodec...');
    await pipInstall('torchcodec', (stage, msg) => {
      if (onProgress) onProgress(stage, msg);
    });

    if (onProgress) onProgress('complete', 'TorchCodec installed');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Download and install Demucs
 */
export async function downloadDemucs(onProgress = null) {
  try {
    if (onProgress) onProgress('installing', 'Installing Demucs...');
    await pipInstall('demucs', (stage, msg) => {
      if (onProgress) onProgress(stage, msg);
    });

    if (onProgress) onProgress('complete', 'Demucs installed');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Download and install Whisper
 */
export async function downloadWhisper(onProgress = null) {
  try {
    if (onProgress) onProgress('installing', 'Installing Whisper...');
    await pipInstall('openai-whisper', (stage, msg) => {
      if (onProgress) onProgress(stage, msg);
    });

    if (onProgress) onProgress('complete', 'Whisper installed');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Download and install torchcrepe (CREPE pitch detection)
 */
export async function downloadCrepe(onProgress = null) {
  try {
    if (onProgress) onProgress('installing', 'Installing torchcrepe...');
    await pipInstall('torchcrepe>=0.0.12', (stage, msg) => {
      if (onProgress) onProgress(stage, msg);
    });

    if (onProgress) onProgress('complete', 'torchcrepe installed');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Download Whisper model by running a test load
 */
export function downloadWhisperModel(modelName = 'large-v3-turbo', onProgress = null) {
  const pythonPath = getPythonPath();

  if (!existsSync(pythonPath)) {
    return Promise.resolve({ success: false, error: 'Python not installed' });
  }

  return new Promise((resolve) => {
    if (onProgress) onProgress('downloading', `Downloading Whisper ${modelName} model...`);

    const script = `
import sys
import json
try:
    import whisper
    print("Loading model...", file=sys.stderr)
    model = whisper.load_model("${modelName}")
    print(json.dumps({"success": True}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

    const proc = spawn(pythonPath, ['-c', script], {
      env: getPythonEnv(),
    });

    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      // Whisper prints download progress to stderr
      if (onProgress) {
        onProgress('downloading', data.toString().trim().slice(0, 100));
      }
    });

    proc.on('close', () => {
      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          if (onProgress) onProgress('complete', `${modelName} model ready`);
          resolve({ success: true, model: modelName });
        } else {
          resolve({ success: false, error: result.error });
        }
      } catch {
        resolve({ success: false, error: 'Failed to parse output' });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Download Demucs model by running a test load
 */
export function downloadDemucsModel(modelName = 'htdemucs_ft', onProgress = null) {
  const pythonPath = getPythonPath();

  if (!existsSync(pythonPath)) {
    return Promise.resolve({ success: false, error: 'Python not installed' });
  }

  return new Promise((resolve) => {
    if (onProgress) onProgress('downloading', `Downloading Demucs ${modelName} model...`);

    const script = `
import sys
import json
try:
    old_stdout = sys.stdout
    sys.stdout = sys.stderr
    from demucs.pretrained import get_model
    model = get_model("${modelName}")
    sys.stdout = old_stdout
    print(json.dumps({"success": True}))
except Exception as e:
    sys.stdout = old_stdout if 'old_stdout' in locals() else sys.stdout
    print(json.dumps({"success": False, "error": str(e)}))
`;

    const proc = spawn(pythonPath, ['-c', script], {
      env: getPythonEnv(),
    });

    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      if (onProgress) {
        onProgress('downloading', data.toString().trim().slice(0, 100));
      }
    });

    proc.on('close', () => {
      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          if (onProgress) onProgress('complete', `${modelName} model ready`);
          resolve({ success: true, model: modelName });
        } else {
          resolve({ success: false, error: result.error });
        }
      } catch {
        resolve({ success: false, error: 'Failed to parse output' });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Download FFmpeg binary
 */
export async function downloadFFmpeg(onProgress = null) {
  const cacheDir = getCacheDir();
  const binDir = join(cacheDir, 'bin');

  if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true });
  }

  const plat = process.platform;
  const binaryName = plat === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const binaryPath = join(binDir, binaryName);

  // Check if already exists
  if (existsSync(binaryPath)) {
    if (onProgress) onProgress('complete', 'FFmpeg already downloaded');
    return { success: true, path: binaryPath };
  }

  try {
    let url;
    if (plat === 'darwin') {
      url = 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip';
    } else if (plat === 'win32') {
      url =
        'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
    } else {
      url = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz';
    }

    const archivePath = join(binDir, plat === 'linux' ? 'ffmpeg.tar.xz' : 'ffmpeg.zip');

    // Download
    if (onProgress) onProgress('downloading', 'Downloading FFmpeg...');
    await downloadFile(url, archivePath, (percent) => {
      if (onProgress) onProgress('downloading', `Downloading FFmpeg... ${percent}%`);
    });

    // Extract
    if (onProgress) onProgress('extracting', 'Extracting FFmpeg...');

    // Extract and find ffmpeg binary
    const { mkdtempSync, readdirSync, statSync, copyFileSync } = await import('fs');
    const { tmpdir } = await import('os');
    const tempDir = mkdtempSync(join(tmpdir(), 'ffmpeg-'));

    try {
      if (plat === 'linux') {
        execSync(`tar -xf "${archivePath}" -C "${tempDir}"`);
      } else {
        execSync(`unzip -q "${archivePath}" -d "${tempDir}"`);
      }

      // Find ffmpeg binary recursively
      const findBinary = (dir, name) => {
        const files = readdirSync(dir);
        for (const file of files) {
          const fullPath = join(dir, file);
          try {
            if (statSync(fullPath).isDirectory()) {
              const found = findBinary(fullPath, name);
              if (found) return found;
            } else if (file.toLowerCase() === name.toLowerCase()) {
              return fullPath;
            }
          } catch {
            continue;
          }
        }
        return null;
      };

      const ffmpegFound = findBinary(tempDir, binaryName);
      if (ffmpegFound) {
        copyFileSync(ffmpegFound, binaryPath);
        if (plat !== 'win32') {
          chmodSync(binaryPath, 0o755);
        }
      } else {
        throw new Error('FFmpeg binary not found in archive');
      }

      // Clean up
      rmSync(tempDir, { recursive: true, force: true });
      rmSync(archivePath, { force: true });

      if (onProgress) onProgress('complete', 'FFmpeg installed');
      return { success: true, path: binaryPath };
    } catch (extractError) {
      rmSync(tempDir, { recursive: true, force: true });
      throw extractError;
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Install all components in order
 */
export async function installAllComponents(onProgress = null) {
  const results = {};

  // Define steps with human-readable labels and estimated sizes
  const steps = [
    { name: 'python', label: 'Python 3.12', fn: downloadPython, weight: 10, size: '~50 MB' },
    {
      name: 'pytorch',
      label: 'PyTorch',
      fn: () => downloadPyTorch('auto'),
      weight: 35,
      size: '~2 GB',
    },
    { name: 'torchcodec', label: 'TorchCodec', fn: downloadTorchCodec, weight: 3, size: '~10 MB' },
    { name: 'demucs', label: 'Demucs', fn: downloadDemucs, weight: 8, size: '~100 MB' },
    { name: 'whisper', label: 'Whisper', fn: downloadWhisper, weight: 8, size: '~50 MB' },
    { name: 'crepe', label: 'CREPE', fn: downloadCrepe, weight: 4, size: '~20 MB' },
    { name: 'ffmpeg', label: 'FFmpeg', fn: downloadFFmpeg, weight: 5, size: '~80 MB' },
    {
      name: 'whisperModel',
      label: 'Whisper Model',
      fn: () => downloadWhisperModel('large-v3-turbo'),
      weight: 15,
      size: '~1.5 GB',
    },
    {
      name: 'demucsModel',
      label: 'Demucs Model',
      fn: () => downloadDemucsModel('htdemucs_ft'),
      weight: 15,
      size: '~300 MB',
    },
  ];

  let completedWeight = 0;
  const totalWeight = steps.reduce((sum, s) => sum + s.weight, 0);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepNumber = i + 1;
    const totalSteps = steps.length;

    if (onProgress) {
      const percent = Math.floor((completedWeight / totalWeight) * 100);
      onProgress(
        percent,
        `[${stepNumber}/${totalSteps}] Installing ${step.label} (${step.size})...`
      );
    }

    const result = await step.fn((stage, msg) => {
      if (onProgress && stage !== 'complete') {
        // Calculate sub-progress within this step
        const basePercent = Math.floor((completedWeight / totalWeight) * 100);

        // For download stages, try to extract percent from message
        let subProgress = 0;
        const percentMatch = msg.match(/(\d+)%/);
        if (percentMatch) {
          subProgress = parseInt(percentMatch[1], 10);
        }

        // Add sub-progress contribution
        const stepContribution = Math.floor((step.weight / totalWeight) * subProgress);
        const totalPercent = Math.min(basePercent + stepContribution, 99);

        onProgress(totalPercent, `[${stepNumber}/${totalSteps}] ${msg}`);
      }
    });

    results[step.name] = result;

    if (!result.success) {
      if (onProgress) {
        onProgress(
          Math.floor((completedWeight / totalWeight) * 100),
          `Failed to install ${step.label}: ${result.error}`
        );
      }
      return { success: false, failed: step.name, error: result.error, results };
    }

    completedWeight += step.weight;

    if (onProgress) {
      const percent = Math.floor((completedWeight / totalWeight) * 100);
      onProgress(percent, `[${stepNumber}/${totalSteps}] ${step.label} installed`);
    }
  }

  if (onProgress) onProgress(100, 'All components installed successfully!');
  return { success: true, results };
}

export default {
  downloadPython,
  downloadPyTorch,
  downloadTorchCodec,
  downloadDemucs,
  downloadWhisper,
  downloadCrepe,
  downloadWhisperModel,
  downloadDemucsModel,
  downloadFFmpeg,
  installAllComponents,
};

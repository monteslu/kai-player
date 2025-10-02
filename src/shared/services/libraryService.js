/**
 * Library Service - Shared business logic for library management
 *
 * Used by both IPC handlers (Electron) and REST endpoints (Web Server)
 * to ensure consistent library behavior across all interfaces.
 */

/**
 * Get the current songs folder path
 * @param {Object} mainApp - Main application instance with settings
 * @returns {Object} Result with success status and folder path
 */
export function getSongsFolder(mainApp) {
  try {
    const folder = mainApp.settings?.getSongsFolder?.();
    return {
      success: true,
      folder: folder || null
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get cached library songs
 * @param {Object} mainApp - Main application instance
 * @returns {Object} Result with success status and cached files
 */
export function getCachedSongs(mainApp) {
  if (mainApp.cachedLibrary) {
    return {
      success: true,
      files: mainApp.cachedLibrary,
      cached: true
    };
  }

  return {
    success: true,
    files: [],
    cached: false
  };
}

/**
 * Get library songs (from cache or by scanning)
 * @param {Object} mainApp - Main application instance
 * @returns {Promise<Object>} Result with success status and songs array
 */
export async function getLibrarySongs(mainApp) {
  try {
    // Return cached library if available
    if (mainApp.cachedLibrary && mainApp.cachedLibrary.length > 0) {
      return {
        success: true,
        songs: mainApp.cachedLibrary,
        fromCache: true
      };
    }

    // Otherwise scan
    const songsFolder = mainApp.settings?.getSongsFolder?.();
    if (!songsFolder) {
      return {
        success: false,
        error: 'Songs folder not set',
        songs: []
      };
    }

    const files = await mainApp.scanForKaiFiles(songsFolder);

    return {
      success: true,
      songs: files,
      fromCache: false
    };
  } catch (error) {
    console.error('Error getting library songs:', error);
    return {
      success: false,
      error: error.message,
      songs: []
    };
  }
}

/**
 * Scan library folder and cache results
 * @param {Object} mainApp - Main application instance
 * @param {Function} [progressCallback] - Optional callback for progress updates (current, total)
 * @returns {Promise<Object>} Result with success status, files, and cache info
 */
export async function scanLibrary(mainApp, progressCallback) {
  try {
    const songsFolder = mainApp.settings?.getSongsFolder?.();
    if (!songsFolder) {
      return {
        success: false,
        error: 'Songs folder not set'
      };
    }

    // Get total file count for progress
    const totalFiles = await mainApp.countFilesRecursive?.(songsFolder) || 0;

    if (progressCallback) {
      progressCallback({ current: 0, total: totalFiles });
    }

    // Scan with progress
    const files = await mainApp.scanForKaiFilesWithProgress?.(songsFolder, totalFiles) || [];

    // Cache the results
    mainApp.cachedLibrary = files;

    if (progressCallback) {
      progressCallback({ current: totalFiles, total: totalFiles });
    }

    return {
      success: true,
      files,
      count: files.length,
      cached: true
    };
  } catch (error) {
    console.error('❌ Failed to scan library:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Sync library (incremental update - only scans new/modified files)
 * @param {Object} mainApp - Main application instance
 * @param {Function} [progressCallback] - Optional callback for progress updates
 * @returns {Promise<Object>} Result with success status and updated files
 */
export async function syncLibrary(mainApp, progressCallback) {
  try {
    const songsFolder = mainApp.settings?.getSongsFolder?.();
    if (!songsFolder) {
      return {
        success: false,
        error: 'Songs folder not set'
      };
    }

    // Step 1: Load cached library from mainApp or disk
    let cachedFiles = [];
    if (mainApp.cachedLibrary && mainApp.cachedLibrary.length > 0) {
      cachedFiles = mainApp.cachedLibrary;
    }

    // Step 2: Quick filesystem scan to find all valid files (no metadata parsing)
    console.log('🔍 Scanning filesystem...');
    const filesystemScan = await mainApp.scanFilesystemForSync?.(songsFolder) || [];
    const totalFiles = filesystemScan.length;

    if (progressCallback) {
      progressCallback({ current: Math.floor(totalFiles * 0.1), total: totalFiles });
    }

    // Build a map of current filesystem state (keyed by primary file path)
    const currentFilesMap = new Map();
    for (const item of filesystemScan) {
      currentFilesMap.set(item.path, item);
    }

    // Step 3: Check cached files to see which ones are still valid
    const stillValid = [];
    const removedPaths = [];

    for (const cachedFile of cachedFiles) {
      const filePath = cachedFile.file || cachedFile.path;
      const fsItem = currentFilesMap.get(filePath);

      if (fsItem) {
        // File still exists in filesystem with correct pairing
        stillValid.push(cachedFile);
        currentFilesMap.delete(filePath); // Mark as processed
      } else {
        // File is gone or invalid
        removedPaths.push(filePath);
      }
    }

    // Step 4: Remaining items in currentFilesMap are NEW files that need metadata parsing
    const newFiles = Array.from(currentFilesMap.values());

    console.log(`🔄 Sync: ${newFiles.length} new, ${removedPaths.length} removed, ${totalFiles} total`);

    // Start with files that are still valid (already have metadata)
    let updatedFiles = stillValid;

    // Step 5: Process new files (10-100% progress)
    if (newFiles.length > 0) {
      const newFilesData = await mainApp.parseMetadataWithProgress?.(newFiles, totalFiles, 0.1) || [];
      updatedFiles = updatedFiles.concat(newFilesData);
    } else {
      // No new files, go straight to 100%
      if (progressCallback) {
        progressCallback({ current: totalFiles, total: totalFiles });
      }
    }

    // Update cache
    mainApp.cachedLibrary = updatedFiles;

    return {
      success: true,
      files: updatedFiles,
      count: updatedFiles.length,
      added: newFiles.length,
      removed: removedPaths.length,
      removedPaths
    };
  } catch (error) {
    console.error('❌ Failed to sync library:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get song info by file path
 * @param {Object} mainApp - Main application instance
 * @param {string} filePath - Path to the song file
 * @returns {Promise<Object>} Result with success status and song info
 */
export async function getSongInfo(mainApp, filePath) {
  try {
    if (!filePath) {
      return {
        success: false,
        error: 'File path is required'
      };
    }

    // Check cache first
    const cachedResult = getCachedSongs(mainApp);
    const cachedSong = cachedResult.files?.find(f => f.path === filePath);

    if (cachedSong) {
      return {
        success: true,
        song: cachedSong,
        fromCache: true
      };
    }

    // Not in cache, extract metadata directly
    const format = filePath.toLowerCase().endsWith('.kai') ? 'kai' :
                   filePath.toLowerCase().endsWith('.kar') || filePath.toLowerCase().endsWith('.zip') ? 'cdg-archive' :
                   'cdg-pair';

    let metadata;
    if (format === 'kai') {
      metadata = await mainApp.extractKaiMetadata?.(filePath);
    } else if (format === 'cdg-archive') {
      metadata = await mainApp.extractCDGArchiveMetadata?.(filePath);
    } else {
      // For CDG pairs, we'd need the CDG path too
      return {
        success: false,
        error: 'CDG pair requires both MP3 and CDG paths'
      };
    }

    return {
      success: true,
      song: {
        path: filePath,
        format,
        ...metadata
      },
      fromCache: false
    };
  } catch (error) {
    console.error('Error getting song info:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Clear the library cache
 * @param {Object} mainApp - Main application instance
 * @returns {Object} Result with success status
 */
export function clearLibraryCache(mainApp) {
  mainApp.cachedLibrary = null;
  return {
    success: true,
    message: 'Library cache cleared'
  };
}

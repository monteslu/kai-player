import yauzl from 'yauzl';
import fs from 'fs';
import path from 'path';

class CDGLoader {
  /**
   * Load CDG format (either archive or loose MP3+CDG pair)
   * @param {string} mp3Path - Path to MP3 file
   * @param {string} cdgPath - Path to CDG file (if loose pair) or null (if archive)
   * @param {string} format - 'cdg-pair' or 'cdg-archive'
   * @returns {Promise<Object>} CDG data object compatible with KAI structure
   */
  static async load(mp3Path, cdgPath, format) {
    if (format === 'cdg-pair') {
      return this.loadCDGPair(mp3Path, cdgPath);
    } else if (format === 'cdg-archive') {
      return this.loadCDGArchive(mp3Path);
    } else {
      throw new Error(`Unknown CDG format: ${format}`);
    }
  }

  /**
   * Load loose MP3+CDG pair from filesystem
   */
  static async loadCDGPair(mp3Path, cdgPath) {
    try {
      // Read MP3 file
      const mp3Buffer = await fs.promises.readFile(mp3Path);

      // Read CDG file
      const cdgBuffer = await fs.promises.readFile(cdgPath);

      // Extract metadata from filename
      const baseName = path.basename(mp3Path, path.extname(mp3Path));
      const metadata = this.parseFilenameMetadata(baseName);

      return {
        format: 'cdg',
        metadata,
        audio: {
          mp3: new Uint8Array(mp3Buffer),  // Convert to Uint8Array for IPC
          mp3Path: mp3Path  // Keep path for streaming
        },
        cdg: {
          data: new Uint8Array(cdgBuffer),  // Convert to Uint8Array for IPC
          path: cdgPath
        },
        meta: {
          duration: null,  // Will be determined when audio loads
          stems: []  // CDG has no separate stems
        },
        originalFilePath: mp3Path
      };
    } catch (error) {
      throw new Error(`Failed to load CDG pair: ${error.message}`);
    }
  }

  /**
   * Load CDG from .kar or .zip archive
   */
  static async loadCDGArchive(archivePath) {
    return new Promise((resolve, reject) => {
      yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(new Error(`Failed to open CDG archive: ${err.message}`));
          return;
        }

        const extractedData = {
          mp3: null,
          cdg: null,
          mp3FileName: null,
          cdgFileName: null
        };

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          if (entry.fileName.endsWith('/')) {
            zipfile.readEntry();
            return;
          }

          const lowerName = entry.fileName.toLowerCase();

          // Check if this is an MP3 or CDG file
          if (lowerName.endsWith('.mp3') || lowerName.endsWith('.cdg')) {
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                reject(new Error(`Failed to read entry ${entry.fileName}: ${err.message}`));
                return;
              }

              const chunks = [];
              readStream.on('data', (chunk) => chunks.push(chunk));
              readStream.on('end', () => {
                const buffer = Buffer.concat(chunks);

                if (lowerName.endsWith('.mp3')) {
                  extractedData.mp3 = buffer;
                  extractedData.mp3FileName = entry.fileName;
                } else if (lowerName.endsWith('.cdg')) {
                  extractedData.cdg = buffer;
                  extractedData.cdgFileName = entry.fileName;
                }

                zipfile.readEntry();
              });
              readStream.on('error', (err) => {
                reject(new Error(`Error reading ${entry.fileName}: ${err.message}`));
              });
            });
          } else {
            zipfile.readEntry();
          }
        });

        zipfile.on('end', () => {
          try {
            // Validate we have both files
            if (!extractedData.mp3 || !extractedData.cdg) {
              throw new Error('Archive must contain both MP3 and CDG files');
            }

            // Extract metadata from archive filename
            const baseName = path.basename(archivePath, path.extname(archivePath));
            const metadata = this.parseFilenameMetadata(baseName);

            resolve({
              format: 'cdg',
              metadata,
              audio: {
                mp3: new Uint8Array(extractedData.mp3),  // Convert to Uint8Array for IPC
                mp3Path: archivePath  // Use archive path as reference
              },
              cdg: {
                data: new Uint8Array(extractedData.cdg),  // Convert to Uint8Array for IPC
                path: archivePath
              },
              meta: {
                duration: null,
                stems: []
              },
              originalFilePath: archivePath
            });
          } catch (error) {
            reject(error);
          }
        });

        zipfile.on('error', (err) => {
          reject(new Error(`ZIP file error: ${err.message}`));
        });
      });
    });
  }

  /**
   * Parse metadata from filename "Artist - Title [variant]"
   */
  static parseFilenameMetadata(baseName) {
    const metadata = {
      title: baseName,
      artist: ''
    };

    // Try to parse "Artist - Title" format
    const dashIndex = baseName.indexOf(' - ');
    if (dashIndex > 0 && dashIndex < baseName.length - 3) {
      metadata.artist = baseName.substring(0, dashIndex).trim();
      metadata.title = baseName.substring(dashIndex + 3).trim();
    }

    return metadata;
  }
}

export default CDGLoader;
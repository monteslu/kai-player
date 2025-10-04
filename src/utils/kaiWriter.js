import yazl from 'yazl';
import yauzl from 'yauzl';
import fs from 'fs';
import path from 'path';

class KaiWriter {
  static saveLocks = new Map(); // Track ongoing save operations

  static async save(kaiData, originalFilePath) {
    // Prevent concurrent saves to the same file
    if (this.saveLocks.has(originalFilePath)) {
      console.log('KaiWriter: Save already in progress for', originalFilePath, '- skipping duplicate request');
      return this.saveLocks.get(originalFilePath);
    }

    const savePromise = this._performSave(kaiData, originalFilePath);
    this.saveLocks.set(originalFilePath, savePromise);

    try {
      const result = await savePromise;
      return result;
    } finally {
      this.saveLocks.delete(originalFilePath);
    }
  }

  static async _performSave(kaiData, originalFilePath) {
    return new Promise((resolve, reject) => {
      console.log('KaiWriter: Starting save process for', originalFilePath);
      
      // First, read the original KAI file to preserve all non-lyrics data
      yauzl.open(originalFilePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(new Error(`Failed to open original KAI file: ${err.message}`));
          return;
        }

        const originalEntries = new Map();
        let originalSongJson = null;

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          if (entry.fileName.endsWith('/')) {
            zipfile.readEntry();
            return;
          }

          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              reject(new Error(`Failed to read entry ${entry.fileName}: ${err.message}`));
              return;
            }

            const chunks = [];
            readStream.on('data', (chunk) => chunks.push(chunk));
            readStream.on('end', () => {
              const buffer = Buffer.concat(chunks);
              
              if (entry.fileName === 'song.json') {
                try {
                  originalSongJson = JSON.parse(buffer.toString('utf8'));
                  console.log('KaiWriter: Read original song.json');
                } catch (parseErr) {
                  reject(new Error(`Failed to parse original song.json: ${parseErr.message}`));
                  return;
                }
              } else {
                // Store all other files as-is
                originalEntries.set(entry.fileName, buffer);
              }
              
              zipfile.readEntry();
            });
            readStream.on('error', (err) => {
              reject(new Error(`Error reading ${entry.fileName}: ${err.message}`));
            });
          });
        });

        zipfile.on('end', () => {
          if (!originalSongJson) {
            reject(new Error('Failed to find song.json in original KAI file'));
            return;
          }

          try {
            // Update the song.json with new lyrics data and song metadata
            const updatedSongJson = { ...originalSongJson };
            
            // Only update lyrics if we have valid lyrics data, otherwise preserve original
            if (kaiData.lyrics && Array.isArray(kaiData.lyrics) && kaiData.lyrics.length > 0) {
              updatedSongJson.lyrics = kaiData.lyrics;
              console.log('KaiWriter: Updated with new lyrics data');
            } else {
              console.log('KaiWriter: Preserving original lyrics (new lyrics empty/invalid)');
            }
            
            // Update song metadata including rejections if present
            if (kaiData.song) {
              updatedSongJson.song = { ...updatedSongJson.song, ...kaiData.song };
              console.log('KaiWriter: Updated song metadata');
            }

            // Update meta object if provided (for AI corrections)
            if (kaiData.meta) {
              updatedSongJson.meta = { ...updatedSongJson.meta, ...kaiData.meta };
              console.log('KaiWriter: Updated meta object, rejections:', kaiData.meta.corrections?.rejected?.length || 0, 'suggestions:', kaiData.meta.corrections?.missing_lines_suggested?.length || 0);
            }

            console.log('KaiWriter: Updated song.json with', kaiData.lyrics.length, 'lyrics lines');

            // Create new ZIP file
            this.createUpdatedKaiFile(originalFilePath, updatedSongJson, originalEntries)
              .then(() => {
                console.log('KaiWriter: Successfully saved KAI file');
                resolve({ success: true });
              })
              .catch(reject);
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

  static createUpdatedKaiFile(originalFilePath, updatedSongJson, originalEntries) {
    return new Promise((resolve, reject) => {
      // Use unique temporary filename to prevent conflicts
      const tempFilePath = originalFilePath + '.tmp.' + Date.now() + '.' + Math.random().toString(36).substr(2, 9);
      const zipFile = new yazl.ZipFile();

      // Add updated song.json
      const songJsonBuffer = Buffer.from(JSON.stringify(updatedSongJson, null, 2), 'utf8');
      zipFile.addBuffer(songJsonBuffer, 'song.json');

      // Add all other original files
      for (const [fileName, buffer] of originalEntries) {
        zipFile.addBuffer(buffer, fileName);
      }

      zipFile.end();

      const writeStream = fs.createWriteStream(tempFilePath);
      zipFile.outputStream.pipe(writeStream);

      zipFile.outputStream.on('error', (err) => {
        reject(new Error(`Failed to create ZIP stream: ${err.message}`));
      });

      writeStream.on('error', (err) => {
        reject(new Error(`Failed to write file: ${err.message}`));
      });

      writeStream.on('close', () => {
        // Replace original file with updated file
        fs.rename(tempFilePath, originalFilePath, (err) => {
          if (err) {
            reject(new Error(`Failed to replace original file: ${err.message}`));
            return;
          }
          
          console.log('KaiWriter: File replacement completed');
          resolve();
        });
      });
    });
  }
}

export default KaiWriter;
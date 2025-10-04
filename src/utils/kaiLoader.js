import yauzl from 'yauzl';
import fs from 'fs';
import path from 'path';

class KaiLoader {
  static async load(kaiFilePath) {
    return new Promise((resolve, reject) => {
      yauzl.open(kaiFilePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(new Error(`Failed to open KAI file: ${err.message}`));
          return;
        }

        const extractedData = {
          metadata: null,
          audio: null,
          lyrics: null,
          features: {},
          audioFiles: new Map()
        };

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
              this.processEntry(entry.fileName, buffer, extractedData);
              zipfile.readEntry();
            });
            readStream.on('error', (err) => {
              reject(new Error(`Error reading ${entry.fileName}: ${err.message}`));
            });
          });
        });

        zipfile.on('end', () => {
          try {
            this.validateKaiData(extractedData);
            resolve(this.processKaiData(extractedData));
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

  static processEntry(fileName, buffer, extractedData) {
    try {
      if (fileName === 'song.json') {
        const songJson = JSON.parse(buffer.toString('utf8'));
        console.log('KAI song.json structure:', {
          keys: Object.keys(songJson),
          audio: songJson.audio ? {
            keys: Object.keys(songJson.audio),
            sources: songJson.audio.sources ? songJson.audio.sources.length : 'undefined'
          } : 'undefined',
          song: songJson.song ? Object.keys(songJson.song) : 'undefined'
        });
        
        extractedData.songJson = songJson;
        extractedData.audio = songJson.audio;
        extractedData.meta = songJson.meta;
        extractedData.song = songJson.song;
        extractedData.lyrics = songJson.lyrics || songJson.lines; // Handle both lyrics and lines
      } else if (fileName.startsWith('features/') && fileName.endsWith('.json')) {
        const featureName = path.basename(fileName, '.json');
        extractedData.features[featureName] = JSON.parse(buffer.toString('utf8'));
      } else if (fileName.endsWith('.mp3') || fileName.endsWith('.wav') || fileName.endsWith('.flac')) {
        const audioName = path.basename(fileName, path.extname(fileName));
        extractedData.audioFiles.set(audioName, buffer);
      }
    } catch (error) {
      console.warn(`Warning: Failed to process ${fileName}:`, error.message);
    }
  }

  static validateKaiData(data) {
    if (!data.songJson) {
      throw new Error('Invalid KAI file: missing song.json');
    }

    if (!data.audio || !data.audio.sources || !Array.isArray(data.audio.sources)) {
      throw new Error('Invalid KAI file: missing or invalid audio.sources');
    }

    // Check for song metadata under song.song
    if (!data.song) {
      throw new Error('Invalid KAI file: missing song object');
    }

    const requiredFields = ['title', 'artist'];
    for (const field of requiredFields) {
      if (!data.song[field]) {
        throw new Error(`Invalid KAI file: missing required field 'song.${field}'`);
      }
    }

    for (const source of data.audio.sources) {
      // Check for filename or file property
      const filename = source.filename || source.file || source.path;
      if (!filename) {
        console.warn('Audio source missing filename, skipping:', source);
        continue;
      }
      
      const audioName = path.basename(filename, path.extname(filename));
      if (!data.audioFiles.has(audioName)) {
        console.warn(`Warning: Audio file ${filename} referenced but not found in KAI archive`);
      }
    }
  }

  static processKaiData(data) {
    const processedData = {
      metadata: {
        title: data.song.title,
        artist: data.song.artist,
        album: data.song.album || '',
        duration: data.song.duration_sec || 0,
        key: data.song.key || 'C',
        tempo: data.song.tempo || 120,
        genre: data.song.genre || '',
        year: data.song.year || null
      },
      
      meta: data.meta || {},
      
      audio: {
        sources: data.audio.sources.map(source => {
          const filename = source.filename || source.file || source.path;
          if (!filename) return null;
          
          return {
            name: source.name || path.basename(filename, path.extname(filename)),
            filename: filename,
            gain: source.gain || 0,
            pan: source.pan || 0,
            solo: source.solo || false,
            mute: source.mute || false,
            audioData: data.audioFiles.get(
              path.basename(filename, path.extname(filename))
            ) || null
          };
        }).filter(source => source !== null),
        
        presets: this.generatePresets(data.audio.sources),
        
        timing: {
          offsetSec: data.audio.timing?.offset_sec || 0,
          encoderDelaySamples: data.audio.encoder_delay_samples || 0
        },
        
        profile: data.audio.profile || 'stereo'
      },
      
      // Sort lyrics by start time to ensure proper playback order
      lyrics: data.lyrics ? [...data.lyrics].sort((a, b) => {
        const aStart = a.start || a.time || a.start_time || 0;
        const bStart = b.start || b.time || b.start_time || 0;
        return aStart - bStart;
      }) : null,
      
      features: {
        notesRef: data.features.notes_ref || null,
        vocalsF0: data.features.vocals_f0 || null,
        onsets: data.features.onsets || null,
        tempo: data.features.tempo || null
      },
      
      coaching: {
        enabled: true,
        pitchTolerance: 50,
        timingTolerance: 0.1,
        stabilityThreshold: 20
      },

      // Preserve the complete song object for additional metadata like rejections
      song: data.song,

      // Preserve original song.json for editor access to all metadata
      originalSongJson: data.songJson
    };

    return processedData;
  }

  static generatePresets(sources) {
    const presets = [
      {
        id: 'original',
        name: 'Original',
        description: 'All tracks enabled',
        settings: {}
      },
      {
        id: 'karaoke',
        name: 'Karaoke',
        description: 'Vocals muted on PA, enabled on IEM',
        settings: {
          mutes: {
            PA: { vocals: true },
            IEM: { vocals: false }
          }
        }
      }
    ];

    const hasVocals = sources.some(s => 
      s.name?.toLowerCase().includes('vocal') || 
      s.filename?.toLowerCase().includes('vocal')
    );
    
    const hasDrums = sources.some(s => 
      s.name?.toLowerCase().includes('drum') || 
      s.filename?.toLowerCase().includes('drum')
    );

    if (hasVocals) {
      presets.push({
        id: 'band_only',
        name: 'Band Only',
        description: 'Vocals completely muted',
        settings: {
          mutes: {
            PA: { vocals: true },
            IEM: { vocals: true }
          }
        }
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
            IEM: { drums: true }
          }
        }
      });
    }

    return presets;
  }

  static getStemProfile(sources) {
    const stemNames = sources.map(s => s.name?.toLowerCase() || 
      path.basename(s.filename, path.extname(s.filename)).toLowerCase()
    );
    
    if (stemNames.includes('vocals') && stemNames.includes('drums') && 
        stemNames.includes('bass') && stemNames.includes('other')) {
      return 'full_band';
    } else if (stemNames.includes('vocals') && stemNames.includes('accompaniment')) {
      return 'vocal_accompaniment';
    } else {
      return 'custom';
    }
  }
}

export default KaiLoader;
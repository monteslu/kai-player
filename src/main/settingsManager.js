import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';

class SettingsManager {
  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    this.settings = null;
    this.saveTimeout = null;
    this.isDirty = false;
  }

  async load() {
    try {
      const data = await fs.readFile(this.settingsPath, 'utf8');
      this.settings = JSON.parse(data);
      console.log('📁 Settings loaded:', this.settings);
    } catch (error) {
      // Try to restore from backup if main file is corrupted
      const backupPath = this.settingsPath + '.backup';
      try {
        console.warn('⚠️ Settings file corrupted or missing, attempting backup restore...');
        const backupData = await fs.readFile(backupPath, 'utf8');
        this.settings = JSON.parse(backupData);
        console.log('✅ Settings restored from backup:', this.settings);

        // Save the restored settings back to main file
        await this.save();
      } catch (backupError) {
        // Backup also failed or doesn't exist, use defaults
        this.settings = {
          songsFolder: null,
          lastOpenedFile: null,
          windowBounds: null
        };
        console.log('📁 Using default settings (backup not available)');
      }
    }
    return this.settings;
  }

  async save() {
    if (!this.isDirty) {
      return; // No changes since last save
    }

    try {
      // Validate that settings can be serialized to JSON
      const jsonString = JSON.stringify(this.settings, null, 2);

      // Validate that it can be parsed back (catch any JSON issues)
      JSON.parse(jsonString);

      // Create backup of existing file before overwriting
      const backupPath = this.settingsPath + '.backup';
      try {
        await fs.copyFile(this.settingsPath, backupPath);
      } catch (backupError) {
        // File might not exist yet, that's okay
        if (backupError.code !== 'ENOENT') {
          console.warn('⚠️ Could not create settings backup:', backupError.message);
        }
      }

      // Write directly
      await fs.writeFile(this.settingsPath, jsonString, 'utf8');

      this.isDirty = false;
      console.log('💾 Settings saved');
    } catch (error) {
      console.error('❌ Failed to save settings:', error);
      throw error; // Propagate error so caller knows save failed
    }
  }

  get(key, defaultValue = null) {
    if (!this.settings) {
      throw new Error('Settings not loaded. Call load() first.');
    }
    return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
  }

  set(key, value) {
    if (!this.settings) {
      throw new Error('Settings not loaded. Call load() first.');
    }
    this.settings[key] = value;
    this.isDirty = true;

    // Debounce saves - wait 1 second after last change before saving
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.save();
    }, 1000);
  }

  /**
   * Force immediate save (used on app quit)
   */
  async saveNow() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    if (this.isDirty) {
      await this.save();
    }
  }

  getSongsFolder() {
    return this.get('songsFolder');
  }

  setSongsFolder(folderPath) {
    this.set('songsFolder', folderPath);
  }
}

export default SettingsManager;
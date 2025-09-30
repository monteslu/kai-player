const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

/**
 * StatePersistence - Saves and loads AppState to/from disk
 */
class StatePersistence {
  constructor(appState) {
    this.appState = appState;
    this.stateFile = path.join(app.getPath('userData'), 'app-state.json');
    this.saveInterval = null;
    this.isDirty = false;

    // Mark state as dirty when it changes (don't track playback/queue - those are ephemeral)
    this.appState.on('mixerChanged', () => { this.isDirty = true; });
    this.appState.on('effectsChanged', () => { this.isDirty = true; });
    this.appState.on('preferencesChanged', () => { this.isDirty = true; });
  }

  /**
   * Load state from disk on startup
   */
  async load() {
    try {
      const data = await fs.readFile(this.stateFile, 'utf-8');
      const savedState = JSON.parse(data);

      // Don't restore queue - it should start empty each time
      // Queue is ephemeral, only mixer/effects/preferences persist

      // Restore mixer state if available
      if (savedState.mixer) {
        this.appState.state.mixer = savedState.mixer;
        console.log('📂 Loaded mixer state');
      }

      // Restore effects state if available
      if (savedState.effects) {
        this.appState.state.effects = savedState.effects;
        console.log('📂 Loaded effects state');
      }

      // Restore preferences if available
      if (savedState.preferences) {
        this.appState.state.preferences = { ...this.appState.state.preferences, ...savedState.preferences };
        console.log('📂 Loaded preferences');
      }

      console.log('✅ State loaded from disk');
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('ℹ️ No saved state found (first run)');
        return false;
      }

      // Try to restore from backup if main file is corrupted
      const backupPath = this.stateFile + '.backup';
      try {
        console.warn('⚠️ State file corrupted, attempting backup restore...');
        const backupData = await fs.readFile(backupPath, 'utf-8');
        const savedState = JSON.parse(backupData);

        // Restore from backup
        if (savedState.mixer) {
          this.appState.state.mixer = savedState.mixer;
          console.log('📂 Loaded mixer state from backup');
        }

        if (savedState.effects) {
          this.appState.state.effects = savedState.effects;
          console.log('📂 Loaded effects state from backup');
        }

        if (savedState.preferences) {
          this.appState.state.preferences = { ...this.appState.state.preferences, ...savedState.preferences };
          console.log('📂 Loaded preferences from backup');
        }

        console.log('✅ State restored from backup');

        // Mark as dirty to save the restored state
        this.isDirty = true;
        await this.save();

        return true;
      } catch (backupError) {
        console.error('❌ Failed to load state from backup:', backupError);
        return false;
      }
    }
  }

  /**
   * Save state to disk
   */
  async save() {
    if (!this.isDirty) {
      return; // No changes since last save
    }

    try {
      const snapshot = this.appState.getSnapshot();

      // Don't save playback state (position, isPlaying) or queue - those are ephemeral
      const stateToSave = {
        mixer: snapshot.mixer,
        effects: snapshot.effects,
        preferences: snapshot.preferences,
        savedAt: new Date().toISOString()
      };

      // Validate that state can be serialized to JSON
      const jsonString = JSON.stringify(stateToSave, null, 2);

      // Validate that it can be parsed back (catch any JSON issues)
      JSON.parse(jsonString);

      // Create backup of existing file before overwriting
      const backupPath = this.stateFile + '.backup';
      try {
        await fs.copyFile(this.stateFile, backupPath);
      } catch (backupError) {
        // File might not exist yet, that's okay
        if (backupError.code !== 'ENOENT') {
          console.warn('⚠️ Could not create state backup:', backupError.message);
        }
      }

      // Write to temp file first, then rename (atomic operation)
      const tempPath = this.stateFile + '.tmp';
      await fs.writeFile(tempPath, jsonString, 'utf-8');
      await fs.rename(tempPath, this.stateFile);

      this.isDirty = false;
      console.log('💾 State saved to disk');
    } catch (error) {
      console.error('❌ Failed to save state:', error);
      throw error; // Propagate error so caller knows save failed
    }
  }

  /**
   * Start periodic saving (every 30 seconds if dirty)
   */
  startPeriodicSave() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }

    this.saveInterval = setInterval(async () => {
      if (this.isDirty) {
        await this.save();
      }
    }, 30000); // 30 seconds

    console.log('⏰ Started periodic state persistence (30s interval)');
  }

  /**
   * Stop periodic saving
   */
  stopPeriodicSave() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
      console.log('⏸️ Stopped periodic state persistence');
    }
  }

  /**
   * Save and cleanup
   */
  async cleanup() {
    this.stopPeriodicSave();
    await this.save(); // Final save
  }
}

module.exports = StatePersistence;
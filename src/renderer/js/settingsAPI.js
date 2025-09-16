// Settings API helper for renderer process
// Replaces localStorage with proper Electron IPC settings

class SettingsAPI {
    async get(key, defaultValue = null) {
        try {
            return await window.kaiAPI.settings.get(key, defaultValue);
        } catch (error) {
            console.error('Failed to get setting:', key, error);
            return defaultValue;
        }
    }

    async set(key, value) {
        try {
            return await window.kaiAPI.settings.set(key, value);
        } catch (error) {
            console.error('Failed to set setting:', key, error);
            return { success: false, error: error.message };
        }
    }

    async getAll() {
        try {
            return await window.kaiAPI.settings.getAll();
        } catch (error) {
            console.error('Failed to get all settings:', error);
            return {};
        }
    }

    async updateBatch(updates) {
        try {
            return await window.kaiAPI.settings.updateBatch(updates);
        } catch (error) {
            console.error('Failed to update settings batch:', error);
            return { success: false, error: error.message };
        }
    }

    // Convenience methods for specific setting types
    async getWaveformPreferences() {
        return await this.get('waveformPreferences', {
            enableWaveforms: true,
            micToSpeakers: true,
            enableMic: true,
            enableEffects: true,
            randomEffectOnSong: false,
            disabledEffects: [],
            overlayOpacity: 0.7,
            showUpcomingLyrics: true
        });
    }

    async setWaveformPreferences(preferences) {
        return await this.set('waveformPreferences', preferences);
    }

    async getDevicePreferences() {
        return await this.get('devicePreferences', {
            PA: null,
            IEM: null,
            input: null
        });
    }

    async setDevicePreferences(preferences) {
        return await this.set('devicePreferences', preferences);
    }

    async getAutoTunePreferences() {
        return await this.get('autoTunePreferences', {
            enabled: false,
            strength: 50,
            speed: 20
        });
    }

    async setAutoTunePreferences(preferences) {
        return await this.set('autoTunePreferences', preferences);
    }

    async getSidebarCollapsed() {
        return await this.get('sidebarCollapsed', false);
    }

    async setSidebarCollapsed(collapsed) {
        return await this.set('sidebarCollapsed', collapsed);
    }
}

// Create global instance
window.settingsAPI = new SettingsAPI();
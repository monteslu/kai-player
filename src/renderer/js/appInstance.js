/**
 * Singleton pattern for app instance access
 * Eliminates need for window.appInstance references throughout codebase
 */

let _appInstance = null;

export function setAppInstance(instance) {
    _appInstance = instance;
    // Also expose getAppInstance globally for non-module scripts (karaokeRenderer.js, etc.)
    window.getAppInstance = getAppInstance;
}

export function getAppInstance() {
    if (!_appInstance) {
        console.warn('App instance not yet initialized');
    }
    return _appInstance;
}

// Convenience getters for commonly accessed properties
export function getPlayer() {
    return _appInstance?.player;
}

export function getQueueManager() {
    return _appInstance?.queueManager;
}

export function getEffectsManager() {
    return _appInstance?.effectsManager;
}

export function getAudioEngine() {
    return _appInstance?.audioEngine;
}

export function getEditor() {
    return _appInstance?.editor;
}

export function getCurrentSong() {
    return _appInstance?.currentSong;
}

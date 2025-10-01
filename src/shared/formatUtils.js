/**
 * Shared utility functions for formatting and display
 * Used across renderer, web UI, and main process
 */

export function getFormatIcon(format) {
    switch (format) {
        case 'kai':
            return '⚡';
        case 'cdg-archive':
        case 'cdg-pair':
            return '💿';
        default:
            return '⚡'; // Default to KAI icon
    }
}

/**
 * Format duration in seconds to MM:SS format
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "3:45")
 */
export function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '-';

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Format time in seconds to MM:SS.T format (with tenths)
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time (e.g., "3:45.7")
 */
export function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00.0';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
}

/**
 * Format file size in bytes to human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size (e.g., "1.2 MB")
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

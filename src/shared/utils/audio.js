/**
 * Shared audio utility functions - pure functions with no side effects
 * Usable in browser, Electron renderer, and Node.js
 */

/**
 * Convert decibels to linear gain
 * @param {number} db - Gain in decibels
 * @returns {number} Linear gain value
 */
export function dbToLinear(db) {
  return Math.pow(10, db / 20);
}

/**
 * Convert linear gain to decibels
 * @param {number} linear - Linear gain value
 * @returns {number} Gain in decibels
 */
export function linearToDb(linear) {
  return 20 * Math.log10(linear);
}

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Check if a stem name is vocals
 * @param {string} stemName - Name of the stem
 * @returns {boolean} True if vocals stem
 */
export function isVocalStem(stemName) {
  return stemName === 'vocals' || stemName.toLowerCase().includes('vocal');
}

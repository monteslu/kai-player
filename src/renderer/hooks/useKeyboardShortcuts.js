/**
 * useKeyboardShortcuts - React hook for keyboard shortcuts
 *
 * Provides global keyboard shortcuts for player controls, vocals toggle, fullscreen, etc.
 * Follows the bridge pattern - does not use window globals.
 */

import { useEffect } from 'react';

/**
 * Hook for setting up keyboard shortcuts
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.onTogglePlayback - Called when spacebar is pressed
 * @param {Function} options.onToggleVocalsGlobal - Called when V is pressed (no modifier)
 * @param {Function} options.onToggleVocalsPA - Called when Ctrl/Cmd+V is pressed
 * @param {Function} options.onToggleStemMute - Called when 1-9 is pressed (no modifier), receives stemIndex
 * @param {Function} options.onToggleStemSolo - Called when Shift+1-9 is pressed, receives stemIndex
 */
export function useKeyboardShortcuts(options = {}) {
  const {
    onTogglePlayback,
    onToggleVocalsGlobal,
    onToggleVocalsPA,
    onToggleStemMute,
    onToggleStemSolo,
  } = options;

  useEffect(() => {
    const handleKeyDown = async (e) => {
      // Ignore keyboard shortcuts when typing in input fields
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'SELECT' ||
        e.target.tagName === 'TEXTAREA'
      ) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          // Exit fullscreen if in fullscreen mode
          if (document.fullscreenElement) {
            e.preventDefault();
            await toggleCanvasFullscreen();
          }
          break;

        case ' ':
          e.preventDefault();
          if (onTogglePlayback) {
            await onTogglePlayback();
          }
          break;

        case 'v':
        case 'V':
          if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd+V: Toggle vocals PA only
            if (onToggleVocalsPA) {
              await onToggleVocalsPA();
            }
          } else {
            // V: Toggle vocals global (PA + IEM)
            if (onToggleVocalsGlobal) {
              await onToggleVocalsGlobal();
            }
          }
          break;

        case 'a':
        case 'A':
          if (e.ctrlKey || e.metaKey) {
            // Reserved for future use (select all, etc.)
            e.preventDefault();
          }
          break;

        case 'b':
        case 'B':
          // Reserved for future use
          break;

        case 's':
        case 'S':
          if (e.ctrlKey || e.metaKey) {
            // Reserved for future use (save, etc.)
            e.preventDefault();
          }
          break;

        case 'f':
        case 'F':
          e.preventDefault();
          await toggleCanvasFullscreen();
          break;

        default:
          // Number keys 1-9 for stem mute/solo
          if (e.key >= '1' && e.key <= '9') {
            const stemIndex = parseInt(e.key) - 1;
            if (e.shiftKey) {
              if (onToggleStemSolo) {
                await onToggleStemSolo(stemIndex);
              }
            } else {
              if (onToggleStemMute) {
                await onToggleStemMute(stemIndex);
              }
            }
          }
          break;
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup on unmount
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    onTogglePlayback,
    onToggleVocalsGlobal,
    onToggleVocalsPA,
    onToggleStemMute,
    onToggleStemSolo,
  ]);
}

/**
 * Toggle canvas fullscreen
 * This is a utility function that directly manipulates the DOM
 */
export async function toggleCanvasFullscreen() {
  try {
    const karaokeCanvas = document.getElementById('karaokeCanvas');
    if (!karaokeCanvas) {
      console.warn('karaokeCanvas element not found');
      return;
    }

    if (!document.fullscreenElement) {
      // Enter fullscreen
      await karaokeCanvas.requestFullscreen();
    } else {
      // Exit fullscreen
      await document.exitFullscreen();
    }
  } catch (error) {
    console.error('❌ Canvas fullscreen toggle failed:', error);
  }
}

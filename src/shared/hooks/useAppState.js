/**
 * useAppState - React hook for subscribing to AppState changes
 *
 * This hook subscribes to state changes for a specific domain via the Bridge
 * and automatically re-renders when that state changes.
 *
 * Usage:
 *   const mixerState = useAppState('mixer');
 *   const queueState = useAppState('queue');
 *   const playbackState = useAppState('playback');
 *
 * The bridge handles the platform-specific subscription mechanism:
 * - ElectronBridge: IPC listeners
 * - WebBridge: Socket.IO listeners
 */

import { useState, useEffect } from 'react';
import { useBridge } from '../context/BridgeContext.jsx';

export function useAppState(domain, initialState = null) {
  const bridge = useBridge();
  const [state, setState] = useState(initialState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    // Fetch initial state
    const fetchInitialState = async () => {
      try {
        let initialData;

        // Fetch initial state based on domain
        switch (domain) {
          case 'mixer':
            initialData = await bridge.getMixerState();
            break;
          case 'queue':
            initialData = await bridge.getQueue();
            break;
          case 'playback':
            initialData = await bridge.getPlaybackState();
            break;
          case 'effects':
            initialData = await bridge.getEffects();
            break;
          case 'preferences':
            initialData = await bridge.getPreferences();
            break;
          case 'requests':
            initialData = await bridge.getRequests();
            break;
          default:
            console.warn(`No initial fetch method for domain: ${domain}`);
            initialData = null;
        }

        if (mounted) {
          setState(initialData);
          setLoading(false);
        }
      } catch (err) {
        console.error(`Error fetching initial ${domain} state:`, err);
        if (mounted) {
          setError(err);
          setLoading(false);
        }
      }
    };

    fetchInitialState();

    // Subscribe to updates
    const unsubscribe = bridge.onStateChange(domain, (newState) => {
      if (mounted) {
        setState(newState);
      }
    });

    // Cleanup
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [domain, bridge]);

  return { state, loading, error };
}

/**
 * Simplified version that just returns the state (no loading/error)
 */
export function useAppStateSimple(domain, initialState = null) {
  const { state } = useAppState(domain, initialState);
  return state;
}

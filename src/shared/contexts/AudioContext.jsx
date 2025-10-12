/**
 * AudioContext - Audio engine state management
 *
 * Manages audio engine instances (kaiPlayer, player controller)
 */

import { createContext, useContext, useState } from 'react';

const AudioContext = createContext(null);

export function AudioProvider({ children }) {
  const [kaiPlayer, setKaiPlayer] = useState(null);
  const [player, setPlayer] = useState(null);
  const [devices, setDevices] = useState([]);

  const value = {
    // Audio engines
    kaiPlayer,
    player,
    devices,

    // Actions
    setKaiPlayer,
    setPlayer,
    setDevices,
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within AudioProvider');
  }
  return context;
}

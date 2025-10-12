/**
 * SettingsContext - Application settings/preferences
 *
 * Manages device preferences, waveform settings, autotune settings
 */

import { createContext, useContext, useState } from 'react';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [devicePreferences, setDevicePreferences] = useState({
    PA: null,
    IEM: null,
    input: null,
  });

  const [waveformPreferences, setWaveformPreferences] = useState({
    enableWaveforms: true,
    micToSpeakers: true,
    enableMic: true,
    enableEffects: true,
    randomEffectOnSong: false,
    disabledEffects: [],
    overlayOpacity: 0.7,
    showUpcomingLyrics: true,
  });

  const [autoTunePreferences, setAutoTunePreferences] = useState({
    enabled: false,
    strength: 50,
    speed: 20,
  });

  const value = {
    // Settings
    devicePreferences,
    waveformPreferences,
    autoTunePreferences,

    // Actions
    setDevicePreferences,
    setWaveformPreferences,
    setAutoTunePreferences,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}

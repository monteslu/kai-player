import { useState, useEffect } from 'react';
import './PlayerSettingsPanel.css';

export function PlayerSettingsPanel({ socket }) {
  const [waveformSettings, setWaveformSettings] = useState({
    enableWaveforms: true,
    enableEffects: true,
    randomEffectOnSong: false,
    overlayOpacity: 0.7,
    showUpcomingLyrics: true
  });

  const [autoTuneSettings, setAutoTuneSettings] = useState({
    enabled: false,
    strength: 50,
    speed: 20
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch current settings
    Promise.all([
      fetch('/admin/settings/waveform', { credentials: 'include' }).then(res => res.json()),
      fetch('/admin/settings/autotune', { credentials: 'include' }).then(res => res.json())
    ])
      .then(([waveform, autotune]) => {
        if (waveform.settings) setWaveformSettings(waveform.settings);
        if (autotune.settings) setAutoTuneSettings(autotune.settings);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch settings:', err);
        setLoading(false);
      });
  }, []);

  // Listen for settings changes from renderer
  useEffect(() => {
    if (!socket) return;

    const handleWaveformUpdate = (settings) => {
      console.log('📥 Received waveform settings from renderer:', settings);
      setWaveformSettings(prev => ({ ...prev, ...settings }));
    };

    const handleAutoTuneUpdate = (settings) => {
      console.log('📥 Received autotune settings from renderer:', settings);
      setAutoTuneSettings(prev => ({ ...prev, ...settings }));
    };

    socket.on('settings:waveform', handleWaveformUpdate);
    socket.on('settings:autotune', handleAutoTuneUpdate);

    return () => {
      socket.off('settings:waveform', handleWaveformUpdate);
      socket.off('settings:autotune', handleAutoTuneUpdate);
    };
  }, [socket]);

  const handleWaveformChange = async (key, value) => {
    const newSettings = { ...waveformSettings, [key]: value };
    setWaveformSettings(newSettings);

    try {
      await fetch('/admin/settings/waveform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [key]: value })
      });
    } catch (err) {
      console.error('Failed to update waveform setting:', err);
    }
  };

  const handleAutoTuneChange = async (key, value) => {
    const newSettings = { ...autoTuneSettings, [key]: value };
    setAutoTuneSettings(newSettings);

    try {
      await fetch('/admin/settings/autotune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [key]: value })
      });
    } catch (err) {
      console.error('Failed to update auto-tune setting:', err);
    }
  };

  if (loading) {
    return <div className="player-settings-panel loading">Loading settings...</div>;
  }

  return (
    <div className="player-settings-panel">
      <div className="settings-section">
        <h3>Waveform & Visual Options</h3>
        
        <label className="setting-row">
          <input
            type="checkbox"
            checked={waveformSettings.enableWaveforms}
            onChange={(e) => handleWaveformChange('enableWaveforms', e.target.checked)}
          />
          <span>Enable Waveforms</span>
        </label>

        <label className="setting-row">
          <input
            type="checkbox"
            checked={waveformSettings.enableEffects}
            onChange={(e) => handleWaveformChange('enableEffects', e.target.checked)}
          />
          <span>Enable Visual Effects</span>
        </label>

        <label className="setting-row">
          <input
            type="checkbox"
            checked={waveformSettings.randomEffectOnSong}
            onChange={(e) => handleWaveformChange('randomEffectOnSong', e.target.checked)}
          />
          <span>Random Effect on Each Song</span>
        </label>

        <label className="setting-row">
          <input
            type="checkbox"
            checked={waveformSettings.showUpcomingLyrics}
            onChange={(e) => handleWaveformChange('showUpcomingLyrics', e.target.checked)}
          />
          <span>Show Upcoming Lyrics</span>
        </label>

        <div className="setting-row slider-row">
          <label>
            <span>Overlay Opacity: {Math.round(waveformSettings.overlayOpacity * 100)}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={waveformSettings.overlayOpacity}
              onChange={(e) => handleWaveformChange('overlayOpacity', parseFloat(e.target.value))}
            />
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h3>Auto-Tune</h3>

        <label className="setting-row">
          <input
            type="checkbox"
            checked={autoTuneSettings.enabled}
            onChange={(e) => handleAutoTuneChange('enabled', e.target.checked)}
          />
          <span>Enable Auto-Tune</span>
        </label>

        <div className="setting-row slider-row">
          <label>
            <span>Strength: {autoTuneSettings.strength}%</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={autoTuneSettings.strength}
              onChange={(e) => handleAutoTuneChange('strength', parseInt(e.target.value))}
              disabled={!autoTuneSettings.enabled}
            />
          </label>
        </div>

        <div className="setting-row slider-row">
          <label>
            <span>Speed: {autoTuneSettings.speed}ms</span>
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              value={autoTuneSettings.speed}
              onChange={(e) => handleAutoTuneChange('speed', parseInt(e.target.value))}
              disabled={!autoTuneSettings.enabled}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

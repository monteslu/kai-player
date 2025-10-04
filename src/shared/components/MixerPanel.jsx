/**
 * MixerPanel - Unified mixer control panel
 *
 * Based on renderer's mixer design
 * Works with both ElectronBridge and WebBridge via callbacks
 */

import './MixerPanel.css';

export function MixerPanel({
  mixer = {},         // Support both 'mixer' (web) and 'mixerState' (renderer)
  mixerState = {},
  onSetMasterGain,
  onToggleMasterMute,
  onGainChange,      // Alias for web compatibility
  onMuteToggle,      // Alias for web compatibility
  className = ''
}) {
  // Support both prop names
  const state = mixer || mixerState || {};
  const handleGainChange = onSetMasterGain || onGainChange;
  const handleMuteToggle = onToggleMasterMute || onMuteToggle;
  const buses = [
    { id: 'PA', label: 'PA (Main)', description: 'Music + Mic to audience' },
    { id: 'IEM', label: 'IEM (Monitors)', description: 'Vocals only (mono)' },
    { id: 'mic', label: 'Mic Input', description: 'Microphone gain' }
  ];

  const handleGainChangeLocal = (busId, value) => {
    if (handleGainChange) {
      handleGainChange(busId, parseFloat(value));
    }
  };

  const handleMuteToggleLocal = (busId) => {
    if (handleMuteToggle) {
      handleMuteToggle(busId);
    }
  };

  const handleDoubleClick = (busId, e) => {
    e.target.value = 0;
    handleGainChangeLocal(busId, 0);
  };

  return (
    <div className={`mixer-strips ${className}`}>
      {buses.map(bus => {
        const gain = state[bus.id]?.gain ?? 0;
        const muted = state[bus.id]?.muted ?? false;

        return (
          <div key={bus.id} className="mixer-strip master-fader" data-bus={bus.id}>
            <div className="fader-label">
              <div className="fader-name">{bus.label}</div>
              <div className="fader-description">{bus.description}</div>
            </div>

            <div className="gain-control">
              <input
                type="range"
                className="gain-slider"
                min="-60"
                max="12"
                step="0.5"
                value={gain}
                onChange={(e) => handleGainChangeLocal(bus.id, e.target.value)}
                onDoubleClick={(e) => handleDoubleClick(bus.id, e)}
                data-bus={bus.id}
              />
              <div className="gain-value">{gain.toFixed(1)} dB</div>
            </div>

            <button
              className={`mute-btn ${muted ? 'active' : ''}`}
              onClick={() => handleMuteToggleLocal(bus.id)}
              data-bus={bus.id}
            >
              MUTE
            </button>
          </div>
        );
      })}
    </div>
  );
}

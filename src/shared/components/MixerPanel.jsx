/**
 * MixerPanel - Unified mixer control panel
 *
 * Based on renderer's mixer design
 * Works with both ElectronBridge and WebBridge via callbacks
 */

import './MixerPanel.css';

export function MixerPanel({
  mixerState = {},
  onSetMasterGain,
  onToggleMasterMute
}) {
  const buses = [
    { id: 'PA', label: 'PA (Main)', description: 'Music + Mic to audience' },
    { id: 'IEM', label: 'IEM (Monitors)', description: 'Vocals only (mono)' },
    { id: 'mic', label: 'Mic Input', description: 'Microphone gain' }
  ];

  const handleGainChange = (busId, value) => {
    if (onSetMasterGain) {
      onSetMasterGain(busId, parseFloat(value));
    }
  };

  const handleMuteToggle = (busId) => {
    if (onToggleMasterMute) {
      onToggleMasterMute(busId);
    }
  };

  const handleDoubleClick = (busId, e) => {
    e.target.value = 0;
    handleGainChange(busId, 0);
  };

  // Handle null/undefined mixerState
  const state = mixerState || {};

  return (
    <div className="mixer-strips">
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
                onChange={(e) => handleGainChange(bus.id, e.target.value)}
                onDoubleClick={(e) => handleDoubleClick(bus.id, e)}
                data-bus={bus.id}
              />
              <div className="gain-value">{gain.toFixed(1)} dB</div>
            </div>

            <button
              className={`mute-btn ${muted ? 'active' : ''}`}
              onClick={() => handleMuteToggle(bus.id)}
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

import { useState, useEffect } from 'react';
import './MixerPanel.css';

function MasterFader({ bus, label, description, onGainChange, onMuteToggle }) {
  const [gain, setGain] = useState(bus.gain || 0);

  // Sync local state when bus.gain changes from external updates
  useEffect(() => {
    setGain(bus.gain || 0);
  }, [bus.gain]);

  const handleGainChange = (e) => {
    const newGain = parseFloat(e.target.value);
    setGain(newGain);
  };

  const handleGainCommit = (e) => {
    const newGain = parseFloat(e.target.value);
    console.log(`🎚️ Committing gain change: ${label} = ${newGain} dB`);
    onGainChange(label, newGain);
  };

  const handleMuteClick = () => {
    console.log(`🔇 Toggling mute for: ${label}`);
    onMuteToggle(label);
  };

  const isMuted = bus.muted || false;

  return (
    <div className="master-fader-horizontal">
      <div className="fader-info">
        <div className="fader-label-row">
          <span className="fader-name">{label}</span>
          <span className="gain-value">{gain > 0 ? '+' : ''}{gain.toFixed(1)} dB</span>
        </div>
        <div className="fader-description">{description}</div>
      </div>

      <div className="fader-control-row">
        <input
          type="range"
          min="-60"
          max="12"
          step="0.5"
          value={gain}
          onChange={handleGainChange}
          onMouseUp={handleGainCommit}
          onTouchEnd={handleGainCommit}
          className="fader-horizontal"
        />
        <button
          className={`btn btn-sm mute-btn ${isMuted ? 'btn-danger active' : ''}`}
          onClick={handleMuteClick}
          title="Mute"
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
      </div>
    </div>
  );
}

export function MixerPanel({ mixer, onGainChange, onMuteToggle }) {
  // Mixer is always available - use defaults if not yet loaded from audioEngine
  const defaultBus = { gain: 0, muted: false };

  const buses = [
    { key: 'PA', label: 'PA', description: 'Music + Mic to audience', bus: mixer?.PA || defaultBus },
    { key: 'IEM', label: 'IEM', description: 'Vocals only (mono)', bus: mixer?.IEM || defaultBus },
    { key: 'mic', label: 'Mic', description: 'Microphone gain', bus: mixer?.mic || defaultBus }
  ];

  return (
    <div className="mixer-panel">
      <div className="mixer-faders">
        {buses.map(({ key, label, description, bus }) => (
          <MasterFader
            key={key}
            bus={bus}
            label={key}
            description={description}
            onGainChange={onGainChange}
            onMuteToggle={onMuteToggle}
          />
        ))}
      </div>
    </div>
  );
}
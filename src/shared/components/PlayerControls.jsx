/**
 * PlayerControls - Unified player transport controls
 *
 * Based on renderer UI (better styling than web admin)
 * Works with both ElectronBridge and WebBridge via callbacks
 */

import { formatDuration } from '../formatUtils.js';
import './PlayerControls.css';

export function PlayerControls({
  playback,
  currentSong,
  currentEffect,
  onPlay,
  onPause,
  onRestart,
  onNext,
  onSeek,
  onPreviousEffect,
  onNextEffect,
  onOpenCanvasWindow,
  className = ''
}) {
  const { isPlaying, position = 0, duration = 0 } = playback || {};

  const handleProgressClick = (e) => {
    if (!duration || !onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, x / rect.width));
    const newPosition = progress * duration;
    onSeek(newPosition);
  };

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <div className={`transport-extended ${className}`}>
      <div className="play-controls">
        <button
          onClick={onRestart}
          title="Restart Track"
          className="transport-btn"
        >
          <span className="material-icons">replay</span>
        </button>

        <button
          onClick={isPlaying ? onPause : onPlay}
          title={isPlaying ? 'Pause' : 'Play'}
          className="transport-btn play-pause-btn"
        >
          <span className="material-icons">{isPlaying ? 'pause' : 'play_arrow'}</span>
        </button>

        <button
          onClick={onNext}
          title="Next Track"
          className="transport-btn"
        >
          <span className="material-icons">skip_next</span>
        </button>

        <div className="progress-container">
          <div
            className="progress-bar"
            onClick={handleProgressClick}
          >
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
            <div
              className="progress-handle"
              style={{ left: `${progress}%` }}
            />
          </div>
        </div>

        <div className="time-display">
          <span>{formatDuration(position)}</span>
          <span>/</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      <div className="effects-controls">
        {onPreviousEffect && (
          <button onClick={onPreviousEffect} title="Previous Effect">
            ◀ FX
          </button>
        )}
        <span className="current-effect-name">
          {currentEffect || 'Effect'}
        </span>
        {onNextEffect && (
          <button onClick={onNextEffect} title="Next Effect">
            FX ▶
          </button>
        )}
        {onOpenCanvasWindow && (
          <button onClick={onOpenCanvasWindow} className="icon-btn" title="Open Canvas Window">
            <span className="material-icons">open_in_new</span>
          </button>
        )}
      </div>
    </div>
  );
}

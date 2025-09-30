import './PlayerControls.css';

export function PlayerControls({ playback, currentSong, onPlay, onPause, onRestart, onNext, onSeek }) {
  const { isPlaying, position = 0, duration = 0 } = playback || {};

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
    <div className="player-controls">
      <div className="player-info">
        <div className="song-title">{currentSong?.title || 'No song loaded'}</div>
        <div className="song-artist">{currentSong?.artist || ''}</div>
      </div>

      <div className="player-transport">
        <button
          className="btn btn-icon"
          onClick={onRestart}
          title="Restart"
        >
          ⏮
        </button>

        <button
          className={`btn btn-icon btn-play ${isPlaying ? 'playing' : ''}`}
          onClick={isPlaying ? onPause : onPlay}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <button
          className="btn btn-icon"
          onClick={onNext}
          title="Next"
        >
          ⏭
        </button>
      </div>

      <div className="player-progress">
        <span className="time-current">{formatTime(position)}</span>
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
        <span className="time-total">{formatTime(duration)}</span>
      </div>
    </div>
  );
}
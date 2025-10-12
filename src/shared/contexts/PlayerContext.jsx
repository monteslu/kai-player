/**
 * PlayerContext - Playback state management
 *
 * Manages current song, playback state, and position
 * Syncs with main process via IPC events
 */

import { createContext, useContext, useState, useEffect } from 'react';

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  // Sync state with IPC events from main process
  useEffect(() => {
    if (!window.kaiAPI?.player || !window.kaiAPI?.song) return;

    const handlePlaybackState = (event, state) => {
      setIsPlaying(state.isPlaying);
      setCurrentPosition(state.position);
      setDuration(state.duration);
    };

    const handleSongChanged = (event, song) => {
      setCurrentSong(song);
    };

    // Subscribe to events
    window.kaiAPI.player.onPlaybackState(handlePlaybackState);
    window.kaiAPI.song.onChanged(handleSongChanged);

    // Cleanup
    return () => {
      window.kaiAPI.player.removePlaybackListener(handlePlaybackState);
      window.kaiAPI.song.removeChangedListener(handleSongChanged);
    };
  }, []);

  const value = {
    // State
    currentSong,
    isPlaying,
    currentPosition,
    duration,

    // Actions
    setCurrentSong,
    setIsPlaying,
    setCurrentPosition,
    setDuration,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayerState() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayerState must be used within PlayerProvider');
  }
  return context;
}

import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { PlayerControls } from './components/PlayerControls';
import { QueueList } from './components/QueueList';
import { MixerPanel } from './components/MixerPanel';
import { SongSearch } from './components/SongSearch';
import { EffectsPanel } from './components/EffectsPanel';
import { RequestsList } from './components/RequestsList';
import { PlayerSettingsPanel } from './components/PlayerSettingsPanel';
import './App.css';

function LoginScreen({ onLogin, error }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onLogin(password);
    setLoading(false);
  };

  return (
    <div className="login-screen">
      <div className="login-panel">
        <h1>Kai Player Admin</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loginError, setLoginError] = useState('');

  const [playback, setPlayback] = useState({
    isPlaying: false,
    position: 0,
    duration: 0
  });
  const [currentSong, setCurrentSong] = useState(null);
  const [queue, setQueue] = useState([]);
  const [mixer, setMixer] = useState(null);
  const [effects, setEffects] = useState(null);
  const [socket, setSocket] = useState(null);
  const [audioTab, setAudioTab] = useState('mixer');
  const [requests, setRequests] = useState([]);

  // Check authentication on mount
  useEffect(() => {
    fetch('/admin/check-auth', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setAuthenticated(data.authenticated);
        setChecking(false);
      })
      .catch(() => {
        setAuthenticated(false);
        setChecking(false);
      });
  }, []);

  // Fetch initial state when authenticated
  useEffect(() => {
    if (!authenticated) return;

    fetch('/api/state', { credentials: 'include' })
      .then(res => res.json())
      .then(state => {
        setPlayback(state.playback || { isPlaying: false, position: 0, duration: 0 });
        setCurrentSong(state.currentSong || null);
        setQueue(state.queue || []);
        setMixer(state.mixer || null);
      })
      .catch(err => console.error('Failed to fetch state:', err));

    // Fetch effects list
    fetch('/admin/effects', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        console.log('📊 Fetched effects data:', data);
        // The API returns { effects: [...], currentEffect: '...', disabledEffects: [...] }
        setEffects({
          list: Array.isArray(data.effects) ? data.effects : [],
          current: data.currentEffect || null,
          disabled: Array.isArray(data.disabledEffects) ? data.disabledEffects : []
        });
        console.log('📊 Set effects state:', {
          list: Array.isArray(data.effects) ? data.effects.length : 0,
          current: data.currentEffect,
          disabled: Array.isArray(data.disabledEffects) ? data.disabledEffects.length : 0
        });
      })
      .catch(err => console.error('Failed to fetch effects:', err));

    // Fetch requests
    fetch('/admin/requests', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setRequests(data.requests || []);
      })
      .catch(err => console.error('Failed to fetch requests:', err));
  }, [authenticated]);

  // Set up Socket.IO connection when authenticated
  useEffect(() => {
    if (!authenticated) return;

    const newSocket = io({
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Socket.IO connected');
    });

    newSocket.on('playback-state-update', (data) => {
      setPlayback(data);
    });

    newSocket.on('song-loaded', (data) => {
      setCurrentSong({
        title: data.title,
        artist: data.artist,
        duration: data.duration
      });
    });

    newSocket.on('queue-update', (data) => {
      setQueue(data.queue);
    });

    newSocket.on('mixer-update', (newMixer) => {
      console.log('🎚️ Received mixer-update:', newMixer);
      setMixer(newMixer);
    });

    newSocket.on('effects-update', (data) => {
      console.log('🎨 Received effects-update:', data);
      setEffects(prev => {
        const newState = {
          // Keep the existing list if the update doesn't include effects array
          list: (data.effects && Array.isArray(data.effects)) ? data.effects : (prev?.list || []),
          current: data.current !== undefined ? data.current : (data.currentEffect !== undefined ? data.currentEffect : (prev?.current || null)),
          disabled: (data.disabled && Array.isArray(data.disabled)) ? data.disabled : (prev?.disabled || [])
        };
        console.log('🎨 Setting effects state to:', newState);
        return newState;
      });
    });

    newSocket.on('effects:disabled', (data) => {
      console.log('🎨 Effect disabled:', data);
      setEffects(prev => ({
        ...prev,
        disabled: data.disabled || []
      }));
    });

    newSocket.on('effects:enabled', (data) => {
      console.log('🎨 Effect enabled:', data);
      setEffects(prev => ({
        ...prev,
        disabled: data.disabled || []
      }));
    });

    newSocket.on('song-request', (request) => {
      setRequests(prev => [request, ...prev]);
    });

    newSocket.on('request-approved', (request) => {
      setRequests(prev => prev.map(r =>
        r.id === request.id ? { ...r, status: 'queued' } : r
      ));
    });

    newSocket.on('request-rejected', (request) => {
      setRequests(prev => prev.map(r =>
        r.id === request.id ? { ...r, status: 'rejected' } : r
      ));
    });

    // Identify as admin to receive initial state
    newSocket.emit('identify', { type: 'admin' });
    console.log('📡 Identified as admin client');

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [authenticated]);

  const handleLogin = async (password) => {
    try {
      const res = await fetch('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (res.ok) {
        setAuthenticated(true);
        setLoginError('');
      } else {
        setLoginError(data.error || 'Login failed');
      }
    } catch (err) {
      setLoginError('Network error. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/admin/logout', {
        method: 'POST',
        credentials: 'include'
      });
      setAuthenticated(false);
      if (socket) socket.close();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handlePlay = async () => {
    try {
      await fetch('/admin/player/play', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (err) {
      console.error('Play failed:', err);
    }
  };

  const handlePause = async () => {
    try {
      await fetch('/admin/player/pause', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (err) {
      console.error('Pause failed:', err);
    }
  };

  const handleRestart = async () => {
    try {
      await fetch('/admin/player/restart', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (err) {
      console.error('Restart failed:', err);
    }
  };

  const handleNext = async () => {
    try {
      await fetch('/admin/player/next', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (err) {
      console.error('Next failed:', err);
    }
  };

  const handleSeek = async (position) => {
    try {
      await fetch('/admin/player/seek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ position })
      });
    } catch (err) {
      console.error('Seek failed:', err);
    }
  };

  const handleRemoveFromQueue = async (songId) => {
    try {
      await fetch(`/admin/queue/${songId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
    } catch (err) {
      console.error('Remove from queue failed:', err);
    }
  };

  const handleClearQueue = async () => {
    try {
      await fetch('/admin/queue', {
        method: 'DELETE',
        credentials: 'include'
      });
    } catch (err) {
      console.error('Clear queue failed:', err);
    }
  };

  const handleGainChange = async (bus, gain) => {
    try {
      await fetch('/admin/mixer/master-gain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bus, gainDb: gain })
      });
    } catch (err) {
      console.error('Gain change failed:', err);
    }
  };

  const handleMuteToggle = async (bus) => {
    try {
      await fetch('/admin/mixer/master-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bus })
      });
    } catch (err) {
      console.error('Mute toggle failed:', err);
    }
  };

  if (checking) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return <LoginScreen onLogin={handleLogin} error={loginError} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Kai Player Admin</h1>
        <button className="btn btn-sm" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <main className="app-main">
        <div className="left-column">
          <PlayerControls
            playback={playback}
            currentSong={currentSong}
            onPlay={handlePlay}
            onPause={handlePause}
            onRestart={handleRestart}
            onNext={handleNext}
            onSeek={handleSeek}
          />

          <SongSearch />

          <QueueList
            queue={queue}
            onRemove={handleRemoveFromQueue}
            onClear={handleClearQueue}
          />
        </div>

        <div className="right-column">
          <div className="settings-panel">
            <div className="settings-header">
              <div className="tab-buttons">
                <button
                  className={`tab-btn ${audioTab === 'mixer' ? 'active' : ''}`}
                  onClick={() => setAudioTab('mixer')}
                >
                  Audio Settings
                </button>
                <button
                  className={`tab-btn ${audioTab === 'effects' ? 'active' : ''}`}
                  onClick={() => setAudioTab('effects')}
                >
                  Visual Effects
                </button>
                <button
                  className={`tab-btn ${audioTab === 'player' ? 'active' : ''}`}
                  onClick={() => setAudioTab('player')}
                >
                  Player Settings
                </button>
                <button
                  className={`tab-btn ${audioTab === 'requests' ? 'active' : ''}`}
                  onClick={() => setAudioTab('requests')}
                >
                  Requests
                  {requests.filter(r => r.status === 'pending').length > 0 && (
                    <span className="badge">
                      {requests.filter(r => r.status === 'pending').length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div className="settings-content">
              {audioTab === 'mixer' && (
                <MixerPanel
                  mixer={mixer}
                  onGainChange={handleGainChange}
                  onMuteToggle={handleMuteToggle}
                />
              )}

              {audioTab === 'effects' && (
                <EffectsPanel effects={effects} />
              )}

              {audioTab === 'player' && (
                <PlayerSettingsPanel socket={socket} />
              )}

              {audioTab === 'requests' && (
                <RequestsList requests={requests} />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
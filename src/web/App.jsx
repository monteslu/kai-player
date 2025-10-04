import { useState, useEffect } from 'react';
import { WebBridge } from './adapters/WebBridge.js';
import { PlayerControls } from '../shared/components/PlayerControls.jsx';
import { QueueList } from '../shared/components/QueueList.jsx';
import { MixerPanel } from '../shared/components/MixerPanel.jsx';
import { EffectsPanel } from '../shared/components/EffectsPanel.jsx';
import { LibraryPanel } from '../shared/components/LibraryPanel.jsx';
import { RequestsList } from '../shared/components/RequestsList.jsx';
import { SongEditor } from '../shared/components/SongEditor.jsx';
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
  const [bridge] = useState(() => new WebBridge());
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
  const [currentTab, setCurrentTab] = useState('queue');
  const [requests, setRequests] = useState([]);
  const [effectsSearch, setEffectsSearch] = useState('');
  const [effectsCategory, setEffectsCategory] = useState('all');

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

  // Connect bridge and fetch initial state when authenticated
  useEffect(() => {
    if (!authenticated) return;

    let mounted = true;

    // Connect bridge (initializes socket)
    bridge.connect().then(() => {
      if (!mounted) return;

      // Fetch initial state
      fetch('/api/state', { credentials: 'include' })
        .then(res => res.json())
        .then(state => {
          if (!mounted) return;
          setPlayback(state.playback || { isPlaying: false, position: 0, duration: 0 });
          setCurrentSong(state.currentSong || null);
          setQueue(state.queue || []);
          setMixer(state.mixer || null);
        })
        .catch(err => console.error('Failed to fetch state:', err));

      // Fetch effects list
      bridge.getEffects()
        .then(data => {
          if (!mounted) return;
          console.log('📊 Fetched effects data:', data);
          setEffects({
            list: Array.isArray(data.effects) ? data.effects : [],
            current: data.currentEffect || null,
            disabled: Array.isArray(data.disabledEffects) ? data.disabledEffects : []
          });
        })
        .catch(err => console.error('Failed to fetch effects:', err));

      // Fetch requests
      bridge.getRequests()
        .then(requestsData => {
          if (!mounted) return;
          setRequests(requestsData);
        })
        .catch(err => console.error('Failed to fetch requests:', err));

      // Subscribe to real-time updates
      bridge.onStateChange('playback', (data) => {
        if (mounted) setPlayback(data);
      });

      bridge.onStateChange('queue', (data) => {
        if (!mounted) return;
        console.log('📥 Received queue-update:', data);
        setQueue(data.queue || []);
        // Update currentSong if provided in queue update (keeps highlighting in sync)
        if (data.currentSong) {
          console.log('✅ Updating currentSong from queue-update:', data.currentSong);
          setCurrentSong(data.currentSong);
        } else {
          console.warn('⚠️ queue-update missing currentSong!');
        }
      });

      bridge.onStateChange('mixer', (newMixer) => {
        console.log('🎚️ Received mixer-update:', newMixer);
        if (mounted) setMixer(newMixer);
      });

      bridge.onStateChange('effects', (data) => {
        console.log('🎨 Received effects-update:', data);
        if (!mounted) return;
        setEffects(prev => ({
          list: (data.effects && Array.isArray(data.effects)) ? data.effects : (prev?.list || []),
          current: data.current !== undefined ? data.current : (data.currentEffect !== undefined ? data.currentEffect : (prev?.current || null)),
          disabled: (data.disabled && Array.isArray(data.disabled)) ? data.disabled : (prev?.disabled || [])
        }));
      });

      // Additional socket events for song changes
      if (bridge.socket) {
        bridge.socket.on('song-loaded', (data) => {
          if (!mounted) return;
          console.log('🎵 song-loaded event:', data);
          setCurrentSong({
            title: data.title,
            artist: data.artist,
            duration: data.duration,
            path: data.path,
            requester: data.requester
          });
        });

        bridge.socket.on('effects:disabled', (data) => {
          console.log('🎨 Effect disabled:', data);
          if (!mounted) return;
          setEffects(prev => ({
            ...prev,
            disabled: data.disabled || []
          }));
        });

        bridge.socket.on('effects:enabled', (data) => {
          console.log('🎨 Effect enabled:', data);
          if (!mounted) return;
          setEffects(prev => ({
            ...prev,
            disabled: data.disabled || []
          }));
        });

        bridge.socket.on('song-request', (request) => {
          if (mounted) setRequests(prev => [request, ...prev]);
        });

        bridge.socket.on('request-approved', (request) => {
          if (!mounted) return;
          setRequests(prev => prev.map(r =>
            r.id === request.id ? { ...r, status: 'queued' } : r
          ));
        });

        bridge.socket.on('request-rejected', (request) => {
          if (!mounted) return;
          setRequests(prev => prev.map(r =>
            r.id === request.id ? { ...r, status: 'rejected' } : r
          ));
        });
      }
    });

    return () => {
      mounted = false;
      bridge.disconnect();
    };
  }, [authenticated, bridge]);

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
      bridge.disconnect();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // Player control handlers using bridge
  const handlePlay = () => bridge.play().catch(err => console.error('Play failed:', err));
  const handlePause = () => bridge.pause().catch(err => console.error('Pause failed:', err));
  const handleRestart = () => bridge.restart().catch(err => console.error('Restart failed:', err));
  const handleNext = () => bridge.playNext().catch(err => console.error('Next failed:', err));
  const handleSeek = (position) => bridge.seek(position).catch(err => console.error('Seek failed:', err));

  // Queue handlers using bridge
  const handlePlayFromQueue = (songId) => {
    bridge.playFromQueue(songId).catch(err => console.error('Play from queue failed:', err));
  };

  const handleRemoveFromQueue = (songId) => {
    bridge.removeFromQueue(songId).catch(err => console.error('Remove from queue failed:', err));
  };

  const handleClearQueue = () => {
    bridge.clearQueue().catch(err => console.error('Clear queue failed:', err));
  };

  // Mixer handlers using bridge
  const handleGainChange = (bus, gain) => {
    bridge.setMasterGain(bus, gain).catch(err => console.error('Gain change failed:', err));
  };

  const handleMuteToggle = (bus) => {
    bridge.toggleMasterMute(bus).catch(err => console.error('Mute toggle failed:', err));
  };

  // Effects handlers using bridge
  const handleEffectPrevious = () => {
    bridge.previousEffect().catch(err => console.error('Previous effect failed:', err));
  };

  const handleEffectNext = () => {
    bridge.nextEffect().catch(err => console.error('Next effect failed:', err));
  };

  const handleEffectRandom = () => {
    bridge.randomEffect().catch(err => console.error('Random effect failed:', err));
  };

  const handleEffectSelect = (effectName) => {
    bridge.selectEffect(effectName).catch(err => console.error('Select effect failed:', err));
  };

  const handleEffectToggle = (effectName, isDisabled) => {
    const action = isDisabled ? bridge.enableEffect(effectName) : bridge.disableEffect(effectName);
    action.catch(err => console.error('Toggle effect failed:', err));
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

      <div className="tab-nav">
        <button
          className={`tab-btn ${currentTab === 'queue' ? 'active' : ''}`}
          onClick={() => setCurrentTab('queue')}
        >
          Queue
        </button>
        <button
          className={`tab-btn ${currentTab === 'library' ? 'active' : ''}`}
          onClick={() => setCurrentTab('library')}
        >
          Library
        </button>
        <button
          className={`tab-btn ${currentTab === 'mixer' ? 'active' : ''}`}
          onClick={() => setCurrentTab('mixer')}
        >
          Audio Settings
        </button>
        <button
          className={`tab-btn ${currentTab === 'effects' ? 'active' : ''}`}
          onClick={() => setCurrentTab('effects')}
        >
          Effects
        </button>
        <button
          className={`tab-btn ${currentTab === 'requests' ? 'active' : ''}`}
          onClick={() => setCurrentTab('requests')}
        >
          Requests
          {requests.filter(r => r.status === 'pending').length > 0 && (
            <span className="badge">
              {requests.filter(r => r.status === 'pending').length}
            </span>
          )}
        </button>
        <button
          className={`tab-btn ${currentTab === 'editor' ? 'active' : ''}`}
          onClick={() => setCurrentTab('editor')}
        >
          Song Editor
        </button>
      </div>

      <main className="tab-content">
        <div className={`tab-pane ${currentTab === 'queue' ? 'active' : ''}`}>
          <PlayerControls
            playback={playback}
            currentSong={currentSong}
            currentEffect={effects?.current}
            onPlay={handlePlay}
            onPause={handlePause}
            onRestart={handleRestart}
            onNext={handleNext}
            onSeek={handleSeek}
            onPreviousEffect={handleEffectPrevious}
            onNextEffect={handleEffectNext}
          />
          <QueueList
            queue={queue}
            currentSongId={currentSong?.path}
            onLoad={handlePlayFromQueue}
            onRemove={handleRemoveFromQueue}
            onClear={handleClearQueue}
          />
        </div>

        <div className={`tab-pane ${currentTab === 'library' ? 'active' : ''}`}>
          <LibraryPanel bridge={bridge} />
        </div>

        <div className={`tab-pane ${currentTab === 'mixer' ? 'active' : ''}`}>
          <MixerPanel
            mixer={mixer}
            onGainChange={handleGainChange}
            onMuteToggle={handleMuteToggle}
          />
        </div>

        <div className={`tab-pane ${currentTab === 'effects' ? 'active' : ''}`}>
          <EffectsPanel
            effects={effects?.list || []}
            currentEffect={effects?.current}
            disabledEffects={effects?.disabled || []}
            searchTerm={effectsSearch}
            currentCategory={effectsCategory}
            onSearch={setEffectsSearch}
            onCategoryChange={setEffectsCategory}
            onSelectEffect={handleEffectSelect}
            onRandomEffect={handleEffectRandom}
            onEnableEffect={(name) => handleEffectToggle(name, true)}
            onDisableEffect={(name) => handleEffectToggle(name, false)}
          />
        </div>

        <div className={`tab-pane ${currentTab === 'requests' ? 'active' : ''}`}>
          <RequestsList
            requests={requests}
            onApprove={async (requestId) => {
              try {
                await fetch(`/admin/requests/${requestId}/approve`, {
                  method: 'POST',
                  credentials: 'include'
                });
              } catch (err) {
                console.error('Approve failed:', err);
              }
            }}
            onReject={async (requestId) => {
              try {
                await fetch(`/admin/requests/${requestId}/reject`, {
                  method: 'POST',
                  credentials: 'include'
                });
              } catch (err) {
                console.error('Reject failed:', err);
              }
            }}
          />
        </div>

        <div className={`tab-pane ${currentTab === 'editor' ? 'active' : ''}`}>
          <SongEditor bridge={bridge} />
        </div>
      </main>
    </div>
  );
}

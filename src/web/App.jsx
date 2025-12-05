import { useState, useEffect } from 'react';
import { WebBridge } from './adapters/WebBridge.js';
import { PlayerControls } from '../shared/components/PlayerControls.jsx';
import { QueueList } from '../shared/components/QueueList.jsx';
import { QuickSearch } from '../shared/components/QuickSearch.jsx';
import { MixerPanel } from '../shared/components/MixerPanel.jsx';
import { EffectsPanel } from '../shared/components/EffectsPanel.jsx';
import { LibraryPanel } from '../shared/components/LibraryPanel.jsx';
import { RequestsList } from '../shared/components/RequestsList.jsx';
import { SongEditor } from '../shared/components/SongEditor.jsx';
import { SongInfoBar } from '../shared/components/SongInfoBar.jsx';
import { VisualizationSettings } from '../shared/components/VisualizationSettings.jsx';
import { SongRequestPage } from './pages/SongRequestPage.jsx';

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 w-full max-w-md">
        <h1 className="text-center mb-6 text-3xl font-semibold text-gray-900 dark:text-white">
          Kai Player Admin
        </h1>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="password"
              className="block mb-2 text-sm font-medium text-gray-600 dark:text-gray-400"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoFocus
              className="input"
            />
          </div>
          {error && (
            <div className="mb-4 px-4 py-2 bg-red-900/20 border border-red-600 rounded text-red-500">
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
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
  const [isAdminPath, setIsAdminPath] = useState(false);

  const [playback, setPlayback] = useState({
    isPlaying: false,
    position: 0,
    duration: 0,
  });
  const [currentSong, setCurrentSong] = useState(null);
  const [queue, setQueue] = useState([]);
  const [mixer, setMixer] = useState(null);
  const [effects, setEffects] = useState(null);
  const [currentTab, setCurrentTab] = useState('queue');
  const [requests, setRequests] = useState([]);
  const [effectsSearch, setEffectsSearch] = useState('');
  const [effectsCategory, setEffectsCategory] = useState('all');
  const [waveformSettings, setWaveformSettings] = useState(null);
  const [autotuneSettings, setAutotuneSettings] = useState(null);

  // Check if we're on the admin path
  useEffect(() => {
    setIsAdminPath(window.location.pathname.startsWith('/admin'));
  }, []);

  // Check authentication on mount (only for admin path)
  useEffect(() => {
    if (!isAdminPath) {
      setChecking(false);
      return;
    }

    fetch('/admin/check-auth', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setAuthenticated(data.authenticated);
        setChecking(false);
      })
      .catch(() => {
        setAuthenticated(false);
        setChecking(false);
      });
  }, [isAdminPath]);

  // Connect bridge and fetch initial state when authenticated
  useEffect(() => {
    if (!authenticated) return;

    let mounted = true;

    // Connect bridge (initializes socket)
    bridge.connect().then(() => {
      if (!mounted) return;

      // Fetch initial state
      fetch('/api/state', { credentials: 'include' })
        .then((res) => res.json())
        .then((state) => {
          if (!mounted) return;
          setPlayback(state.playback || { isPlaying: false, position: 0, duration: 0 });
          setCurrentSong(state.currentSong || null);
          setQueue(state.queue || []);
          setMixer(state.mixer || null);
        })
        .catch((err) => console.error('Failed to fetch state:', err));

      // Fetch effects list
      bridge
        .getEffects()
        .then((data) => {
          if (!mounted) return;
          console.log('📊 Fetched effects data:', data);
          setEffects({
            list: Array.isArray(data.effects) ? data.effects : [],
            current: data.currentEffect || null,
            disabled: Array.isArray(data.disabledEffects) ? data.disabledEffects : [],
          });
        })
        .catch((err) => console.error('Failed to fetch effects:', err));

      // Fetch requests
      bridge
        .getRequests()
        .then((requestsData) => {
          if (!mounted) return;
          setRequests(requestsData);
        })
        .catch((err) => console.error('Failed to fetch requests:', err));

      // Subscribe to real-time updates
      bridge.onStateChange('playback', (data) => {
        if (mounted) setPlayback(data);
      });

      bridge.onStateChange('queue', (data) => {
        if (!mounted) return;
        console.log('📥 Received queue-update:', data);
        setQueue(data.queue || []);
        // Note: currentSong is now handled by dedicated 'current-song-update' event
        // This prevents duplicate updates that could cause wrong highlighting
      });

      // Subscribe to current song updates (includes isLoading state)
      bridge.onStateChange('currentSong', (song) => {
        if (!mounted) return;
        console.log('🎵 Received current-song-update:', song);
        setCurrentSong(song);
      });

      bridge.onStateChange('mixer', (newMixer) => {
        console.log('🎚️ Received mixer-update:', newMixer);
        if (mounted) setMixer(newMixer);
      });

      bridge.onStateChange('effects', (data) => {
        console.log('🎨 Received effects-update:', data);
        if (!mounted) return;
        setEffects((prev) => ({
          list: data.effects && Array.isArray(data.effects) ? data.effects : prev?.list || [],
          current:
            data.current !== undefined
              ? data.current
              : data.currentEffect !== undefined
                ? data.currentEffect
                : prev?.current || null,
          disabled:
            data.disabled && Array.isArray(data.disabled) ? data.disabled : prev?.disabled || [],
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
            requester: data.requester,
            queueItemId: data.queueItemId,
            isLoading: data.isLoading,
          });
        });

        bridge.socket.on('effects:disabled', (data) => {
          console.log('🎨 Effect disabled:', data);
          if (!mounted) return;
          setEffects((prev) => ({
            ...prev,
            disabled: data.disabled || [],
          }));
        });

        bridge.socket.on('effects:enabled', (data) => {
          console.log('🎨 Effect enabled:', data);
          if (!mounted) return;
          setEffects((prev) => ({
            ...prev,
            disabled: data.disabled || [],
          }));
        });

        bridge.socket.on('song-request', (request) => {
          if (mounted) setRequests((prev) => [request, ...prev]);
        });

        bridge.socket.on('request-approved', (request) => {
          if (!mounted) return;
          setRequests((prev) =>
            prev.map((r) => (r.id === request.id ? { ...r, status: 'queued' } : r))
          );
        });

        bridge.socket.on('request-rejected', (request) => {
          if (!mounted) return;
          setRequests((prev) =>
            prev.map((r) => (r.id === request.id ? { ...r, status: 'rejected' } : r))
          );
        });

        // Listen for settings changes from renderer
        bridge.socket.on('settings:waveform', (settings) => {
          console.log('🎨 Received waveform settings update:', settings);
          if (mounted) setWaveformSettings(settings);
        });

        bridge.socket.on('settings:autotune', (settings) => {
          console.log('🎵 Received autotune settings update:', settings);
          if (mounted) setAutotuneSettings(settings);
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
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok) {
        setAuthenticated(true);
        setLoginError('');
      } else {
        setLoginError(data.error || 'Login failed');
      }
    } catch {
      setLoginError('Network error. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/admin/logout', {
        method: 'POST',
        credentials: 'include',
      });
      setAuthenticated(false);
      bridge.disconnect();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // Player control handlers using bridge
  const handlePlay = () => bridge.play().catch((err) => console.error('Play failed:', err));
  const handlePause = () => bridge.pause().catch((err) => console.error('Pause failed:', err));
  const handleRestart = () =>
    bridge.restart().catch((err) => console.error('Restart failed:', err));
  const handleNext = () => bridge.playNext().catch((err) => console.error('Next failed:', err));
  const handleSeek = (position) =>
    bridge.seek(position).catch((err) => console.error('Seek failed:', err));

  // Queue handlers using bridge
  const handlePlayFromQueue = (songId) => {
    bridge.playFromQueue(songId).catch((err) => console.error('Play from queue failed:', err));
  };

  const handleRemoveFromQueue = (songId) => {
    bridge.removeFromQueue(songId).catch((err) => console.error('Remove from queue failed:', err));
  };

  const handleClearQueue = () => {
    bridge.clearQueue().catch((err) => console.error('Clear queue failed:', err));
  };

  const handleReorderQueue = (songId, newIndex) => {
    bridge
      .reorderQueue(songId, newIndex)
      .catch((err) => console.error('Reorder queue failed:', err));
  };

  // Mixer handlers using bridge
  const handleGainChange = (bus, gain) => {
    bridge.setMasterGain(bus, gain).catch((err) => console.error('Gain change failed:', err));
  };

  const handleMuteToggle = (bus) => {
    bridge.toggleMasterMute(bus).catch((err) => console.error('Mute toggle failed:', err));
  };

  // Effects handlers using bridge
  const handleEffectPrevious = () => {
    bridge.previousEffect().catch((err) => console.error('Previous effect failed:', err));
  };

  const handleEffectNext = () => {
    bridge.nextEffect().catch((err) => console.error('Next effect failed:', err));
  };

  const handleEffectRandom = () => {
    bridge.randomEffect().catch((err) => console.error('Random effect failed:', err));
  };

  const handleEffectSelect = (effectName) => {
    bridge.selectEffect(effectName).catch((err) => console.error('Select effect failed:', err));
  };

  const handleEffectToggle = (effectName, isDisabled) => {
    const action = isDisabled ? bridge.enableEffect(effectName) : bridge.disableEffect(effectName);
    action.catch((err) => console.error('Toggle effect failed:', err));
  };

  // Show public song request page if not on admin path
  if (!isAdminPath) {
    return <SongRequestPage />;
  }

  // Admin path only - check authentication
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-lg text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return <LoginScreen onLogin={handleLogin} error={loginError} />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <header className="flex justify-between items-center px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Kai Player Admin</h1>
        <button className="btn btn-sm" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <SongInfoBar currentSong={currentSong} />

      <div className="flex bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <button
          className={`relative px-6 py-3 border-b-2 transition-colors font-medium flex items-center gap-2 ${
            currentTab === 'queue'
              ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 bg-gray-50 dark:bg-gray-900'
              : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
          onClick={() => setCurrentTab('queue')}
        >
          🎵 Queue
        </button>
        <button
          className={`relative px-6 py-3 border-b-2 transition-colors font-medium flex items-center gap-2 ${
            currentTab === 'library'
              ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 bg-gray-50 dark:bg-gray-900'
              : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
          onClick={() => setCurrentTab('library')}
        >
          📚 Library
        </button>
        <button
          className={`relative px-6 py-3 border-b-2 transition-colors font-medium flex items-center gap-2 ${
            currentTab === 'mixer'
              ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 bg-gray-50 dark:bg-gray-900'
              : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
          onClick={() => setCurrentTab('mixer')}
        >
          🎛️ Audio
        </button>
        <button
          className={`relative px-6 py-3 border-b-2 transition-colors font-medium flex items-center gap-2 ${
            currentTab === 'effects'
              ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 bg-gray-50 dark:bg-gray-900'
              : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
          onClick={() => setCurrentTab('effects')}
        >
          ✨ Effects
        </button>
        <button
          className={`relative px-6 py-3 border-b-2 transition-colors font-medium flex items-center gap-2 ${
            currentTab === 'requests'
              ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 bg-gray-50 dark:bg-gray-900'
              : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
          onClick={() => setCurrentTab('requests')}
        >
          🎤 Requests
          {requests.filter((r) => r.status === 'pending').length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-red-600 text-white rounded-full text-xs font-semibold">
              {requests.filter((r) => r.status === 'pending').length}
            </span>
          )}
        </button>
        <button
          className={`relative px-6 py-3 border-b-2 transition-colors font-medium flex items-center gap-2 ${
            currentTab === 'editor'
              ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 bg-gray-50 dark:bg-gray-900'
              : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
          onClick={() => setCurrentTab('editor')}
        >
          ✏️ Edit
        </button>
      </div>

      <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div
          className={`${currentTab === 'queue' ? 'flex' : 'hidden'} flex-col h-full gap-4 p-4 overflow-auto`}
        >
          <div className="flex flex-col gap-4 h-full overflow-hidden">
            <div className="w-full flex-shrink-0">
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
            </div>
            <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
              <div className="w-[300px] flex-shrink-0 overflow-y-auto p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <VisualizationSettings
                  bridge={bridge}
                  waveformSettings={waveformSettings}
                  autotuneSettings={autotuneSettings}
                  onWaveformChange={setWaveformSettings}
                  onAutotuneChange={setAutotuneSettings}
                />
              </div>
              <div className="flex-1 flex flex-col min-w-0 overflow-auto">
                <QuickSearch bridge={bridge} requester="Web Admin" />

                <QueueList
                  queue={queue}
                  currentSongId={currentSong?.queueItemId ?? null}
                  onLoad={handlePlayFromQueue}
                  onRemove={handleRemoveFromQueue}
                  onClear={handleClearQueue}
                  onReorderQueue={handleReorderQueue}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          className={`${currentTab === 'library' ? 'flex' : 'hidden'} flex-col h-full gap-4 p-4 overflow-auto`}
        >
          <LibraryPanel bridge={bridge} />
        </div>

        <div
          className={`${currentTab === 'mixer' ? 'flex' : 'hidden'} flex-col h-full gap-4 p-4 overflow-auto`}
        >
          <MixerPanel
            mixer={mixer}
            onGainChange={handleGainChange}
            onMuteToggle={handleMuteToggle}
          />
        </div>

        <div
          className={`${currentTab === 'effects' ? 'flex' : 'hidden'} flex-col h-full gap-4 p-4 overflow-auto`}
        >
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

        <div
          className={`${currentTab === 'requests' ? 'flex' : 'hidden'} flex-col h-full gap-4 p-4 overflow-auto`}
        >
          <RequestsList
            requests={requests}
            onApprove={async (requestId) => {
              try {
                await fetch(`/admin/requests/${requestId}/approve`, {
                  method: 'POST',
                  credentials: 'include',
                });
              } catch (err) {
                console.error('Approve failed:', err);
              }
            }}
            onReject={async (requestId) => {
              try {
                await fetch(`/admin/requests/${requestId}/reject`, {
                  method: 'POST',
                  credentials: 'include',
                });
              } catch (err) {
                console.error('Reject failed:', err);
              }
            }}
          />
        </div>

        <div
          className={`${currentTab === 'editor' ? 'flex' : 'hidden'} flex-col h-full gap-4 p-4 overflow-auto`}
        >
          <SongEditor bridge={bridge} />
        </div>
      </main>
    </div>
  );
}

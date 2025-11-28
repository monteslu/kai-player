/**
 * ServerTab - Server settings and management component
 */

import React, { useState, useEffect, useCallback } from 'react';
import { generateQRCode } from '../utils/qrCodeGenerator.js';

export function ServerTab({ bridge }) {
  const [serverUrl, setServerUrl] = useState(null);
  const [serverPort, setServerPort] = useState(null);
  const [settings, setSettings] = useState({
    serverName: 'Loukai Karaoke',
    port: 3069,
    allowSongRequests: true,
    requireKJApproval: true,
    streamVocalsToClients: false,
    showQrCode: true,
    displayQueue: true,
  });
  const [adminPassword, setAdminPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [totalRequests, setTotalRequests] = useState(0);
  const [message, setMessage] = useState(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState(null);

  // Wrap in useCallback to stabilize reference
  const updateRequestsStats = useCallback(async () => {
    try {
      if (!bridge?.getRequests) return;
      const requests = await bridge.getRequests();
      const pending = requests.filter((r) => r.status === 'pending').length;
      setPendingRequests(pending);
      setTotalRequests(requests.length);
    } catch {
      // Silently fail
    }
  }, [bridge]);

  // Load initial server status and settings
  useEffect(() => {
    if (!bridge) return;

    const loadData = async () => {
      try {
        // Get server URL
        const url = await bridge.getServerUrl();
        setServerUrl(url);
        if (url) {
          const port = new URL(url).port;
          setServerPort(port);
        }

        // Get settings
        const serverSettings = await bridge.getServerSettings();
        if (serverSettings) {
          setSettings({
            serverName: serverSettings.serverName || 'Loukai Karaoke',
            port: serverSettings.port || 3069,
            allowSongRequests: serverSettings.allowSongRequests !== false,
            requireKJApproval: serverSettings.requireKJApproval !== false,
            streamVocalsToClients: serverSettings.streamVocalsToClients === true,
            showQrCode: serverSettings.showQrCode !== false,
            displayQueue: serverSettings.displayQueue !== false,
          });
        }

        // Check password status
        if (bridge.getAdminPasswordStatus) {
          const passwordSet = await bridge.getAdminPasswordStatus();
          setHasPassword(passwordSet);
        }

        // Get request stats
        updateRequestsStats();
      } catch (error) {
        console.error('Failed to load server data:', error);
      }
    };

    loadData();

    // Poll for server URL and request stats
    const pollInterval = setInterval(() => {
      if (bridge.getServerUrl) {
        bridge
          .getServerUrl()
          .then((url) => {
            setServerUrl(url);
            if (url) {
              const port = new URL(url).port;
              setServerPort(port);
              // Generate QR code when URL is available
              generateQRCode(url, { width: 300 }).then(setQrCodeDataUrl).catch(console.error);
            }
          })
          .catch(console.error);
      }
      updateRequestsStats();
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [bridge, updateRequestsStats]);

  const handleSaveSettings = async () => {
    try {
      await bridge.updateServerSettings(settings);
      showMessage('Settings saved successfully', 'success');
    } catch (error) {
      console.error('Failed to save settings:', error);
      showMessage('Failed to save settings', 'error');
    }
  };

  const handleSetPassword = async () => {
    const password = adminPassword.trim();

    if (!password) {
      showMessage('Please enter a password', 'error');
      return;
    }

    if (password.length < 6) {
      showMessage('Password must be at least 6 characters', 'error');
      return;
    }

    try {
      if (bridge.setAdminPassword) {
        await bridge.setAdminPassword(password);
        setAdminPassword('');
        setHasPassword(true);
        showMessage('Admin password set successfully', 'success');
      }
    } catch (error) {
      console.error('Failed to set password:', error);
      showMessage('Failed to set admin password', 'error');
    }
  };

  const handleOpenServer = () => {
    if (serverUrl && bridge?.openExternal) {
      bridge.openExternal(serverUrl);
    }
  };

  const handleOpenAdmin = () => {
    try {
      if (serverPort && bridge?.openExternal) {
        bridge.openExternal(`http://localhost:${serverPort}/admin`);
      }
    } catch (error) {
      console.error('Failed to open admin panel:', error);
    }
  };

  const handleClearRequests = async () => {
    if (!confirm('Are you sure you want to clear all song requests? This cannot be undone.')) {
      return;
    }

    try {
      if (bridge.clearAllRequests) {
        await bridge.clearAllRequests();
        showMessage('All requests cleared', 'success');
        updateRequestsStats();
      }
    } catch (error) {
      console.error('Failed to clear requests:', error);
      showMessage('Failed to clear requests', 'error');
    }
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSettingChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const isServerRunning = Boolean(serverUrl);

  return (
    <div className="p-5 h-full overflow-y-auto bg-white dark:bg-gray-900">
      {message && (
        <div
          className={`fixed top-5 right-5 px-5 py-3 rounded text-white font-medium z-[10000] shadow-lg animate-slide-in ${
            message.type === 'success'
              ? 'bg-green-600'
              : message.type === 'error'
                ? 'bg-red-600'
                : 'bg-blue-500'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Web Server Settings
        </h2>
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${isServerRunning ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span className="text-gray-700 dark:text-gray-300">
            {isServerRunning ? `Running on port ${serverPort}` : 'Not running'}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {/* Server Control */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Server Control
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Server Status:
              </label>
              <div className="flex items-center gap-3 flex-1">
                <span className="text-gray-900 dark:text-gray-100 flex-1">
                  {serverUrl || 'Not running'}
                </span>
                <button
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded transition-colors"
                  onClick={handleOpenServer}
                  disabled={!isServerRunning}
                >
                  <span className="material-icons text-lg">open_in_new</span>
                  Open in Browser
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Server Settings */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            General Settings
          </h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="serverName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Server Name:
              </label>
              <input
                type="text"
                id="serverName"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Loukai Karaoke"
                value={settings.serverName}
                onChange={(e) => handleSettingChange('serverName', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="serverPort"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Port:
              </label>
              <input
                type="number"
                id="serverPort"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="3069"
                min="1024"
                max="65535"
                value={settings.port}
                onChange={(e) => handleSettingChange('port', parseInt(e.target.value) || 3069)}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Server must be restarted for port changes to take effect
              </p>
            </div>

            <div className="flex items-center">
              <label className="flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="allowSongRequests"
                  className="w-4 h-4 mr-2 cursor-pointer"
                  checked={settings.allowSongRequests}
                  onChange={(e) => handleSettingChange('allowSongRequests', e.target.checked)}
                />
                <span className="text-gray-900 dark:text-gray-100">Allow Song Requests</span>
              </label>
            </div>

            <div className="flex items-center">
              <label className="flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="requireKJApproval"
                  className="w-4 h-4 mr-2 cursor-pointer"
                  checked={settings.requireKJApproval}
                  onChange={(e) => handleSettingChange('requireKJApproval', e.target.checked)}
                />
                <span className="text-gray-900 dark:text-gray-100">Require KJ Approval</span>
              </label>
            </div>

            <div className="flex items-center">
              <label className="flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="streamVocalsToClients"
                  className="w-4 h-4 mr-2 cursor-pointer"
                  checked={settings.streamVocalsToClients}
                  onChange={(e) => handleSettingChange('streamVocalsToClients', e.target.checked)}
                />
                <span className="text-gray-900 dark:text-gray-100">
                  Stream Vocals to Clients (LAN only)
                </span>
              </label>
            </div>

            <div className="flex items-center">
              <label className="flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="showQrCode"
                  className="w-4 h-4 mr-2 cursor-pointer"
                  checked={settings.showQrCode}
                  onChange={(e) => handleSettingChange('showQrCode', e.target.checked)}
                />
                <span className="text-gray-900 dark:text-gray-100">Show QR code</span>
              </label>
            </div>

            <div className="flex items-center">
              <label className="flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="displayQueue"
                  className="w-4 h-4 mr-2 cursor-pointer"
                  checked={settings.displayQueue}
                  onChange={(e) => handleSettingChange('displayQueue', e.target.checked)}
                />
                <span className="text-gray-900 dark:text-gray-100">Display queue</span>
              </label>
            </div>

            <button
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              onClick={handleSaveSettings}
            >
              <span className="material-icons text-lg">save</span>
              Save Settings
            </button>
          </div>
        </div>

        {/* Admin Password */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Admin Security
          </h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="adminPassword"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Admin Password:
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  id="adminPassword"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter new admin password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                />
                <button
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                  onClick={handleSetPassword}
                >
                  <span className="material-icons text-lg">security</span>
                  Set Password
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                KJs will need this password to access the admin panel
              </p>
            </div>

            <div
              className={`px-4 py-2 rounded ${hasPassword ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
            >
              {hasPassword ? 'Admin password is set' : 'No admin password set'}
            </div>
          </div>
        </div>

        {/* Song Requests */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Song Requests
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-700 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {pendingRequests}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Pending</div>
              </div>
              <div className="bg-white dark:bg-gray-700 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-gray-700 dark:text-gray-300">
                  {totalRequests}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Total</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex-1"
                onClick={handleOpenAdmin}
              >
                <span className="material-icons text-lg">admin_panel_settings</span>
                Open Admin Panel
              </button>
              <button
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors flex-1"
                onClick={handleClearRequests}
              >
                <span className="material-icons text-lg">delete_sweep</span>
                Clear All Requests
              </button>
            </div>
          </div>
        </div>

        {/* QR Code */}
        {qrCodeDataUrl && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
              Quick Access QR Code
            </h3>
            <div className="flex flex-col items-center gap-4">
              <img
                src={qrCodeDataUrl}
                alt="Server URL QR Code"
                className="border-4 border-white rounded-lg shadow-lg"
                style={{ width: '300px', height: '300px' }}
              />
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                Scan this QR code to access the song request page
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 text-center font-mono">
                {serverUrl}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

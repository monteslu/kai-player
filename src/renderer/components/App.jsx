/**
 * App - Main application component
 *
 * Contains the complete UI layout with all tabs and components
 */

import { useState, useEffect } from 'react';
import { LibraryPanel } from '../../shared/components/LibraryPanel.jsx';
import { EffectsPanelWrapper } from './EffectsPanelWrapper.jsx';
import { RequestsListWrapper } from './RequestsListWrapper.jsx';
import { SongEditor } from '../../shared/components/SongEditor.jsx';
import { MixerTab } from './MixerTab.jsx';
import { QueueTab } from './QueueTab.jsx';
import { SongInfoBarWrapper } from './SongInfoBarWrapper.jsx';
import { TransportControlsWrapper } from './TransportControlsWrapper.jsx';
import { StatusBar } from './StatusBar.jsx';
import { TabNavigation } from './TabNavigation.jsx';
import { ServerTab } from './ServerTab.jsx';
import { VisualizationSettings } from '../../shared/components/VisualizationSettings.jsx';
import { toggleCanvasFullscreen } from '../hooks/useKeyboardShortcuts.js';
import { CreateTab } from './creator/CreateTab.jsx';

export function App({ bridge }) {
  const [requests, setRequests] = useState([]);

  // Update QR code on players when server URL or settings change
  useEffect(() => {
    let retryInterval;
    let retryCount = 0;
    const maxRetries = 20; // 10 seconds at 500ms intervals

    const updateQRCode = async () => {
      try {
        // Get server URL and settings
        const url = await window.kaiAPI?.webServer?.getUrl?.();
        const settings = await window.kaiAPI?.webServer?.getSettings?.();
        const showQrCode = settings?.showQrCode !== false; // Default to true

        // Update both players
        const player = window.app?.player;
        if (player && url) {
          if (player.karaokeRenderer) {
            await player.karaokeRenderer.setServerQRCode(url, showQrCode);
          }
          if (player.cdgPlayer) {
            await player.cdgPlayer.setServerQRCode(url, showQrCode);
          }
          // Stop retry once we have URL
          if (retryInterval) {
            clearInterval(retryInterval);
            retryInterval = null;
          }
        }
      } catch (error) {
        console.error('Error updating QR code:', error);
      }
    };

    // Initial update
    updateQRCode();

    // Retry every 500ms for first 10 seconds (in case server isn't ready)
    retryInterval = setInterval(() => {
      retryCount++;
      updateQRCode();
      if (retryCount >= maxRetries && retryInterval) {
        clearInterval(retryInterval);
        retryInterval = null;
      }
    }, 500);

    // Listen for settings changes (event-based, no polling)
    if (window.kaiAPI?.events) {
      window.kaiAPI.events.on('settings-update', updateQRCode);
    }

    return () => {
      if (retryInterval) clearInterval(retryInterval);
      if (window.kaiAPI?.events) {
        window.kaiAPI.events.off?.('settings-update', updateQRCode);
      }
    };
  }, []);

  // Update queue display on players when queue or settings change
  useEffect(() => {
    const updateQueueDisplay = async () => {
      try {
        // Get queue and settings
        const queueData = await window.kaiAPI?.queue?.get?.();
        const settings = await window.kaiAPI?.webServer?.getSettings?.();
        const displayQueue = settings?.displayQueue !== false; // Default to true

        // Extract next 1-3 songs (excluding currently loaded/playing song)
        // queueData is an object like { queue: [...], currentSong: {...} }
        const queue = queueData?.queue || [];

        // If there's a loaded song in the player, skip the first queue item
        // (because that's the currently loaded song)
        let queueToDisplay = queue;
        const player = window.app?.player;
        const hasLoadedSong = player?.karaokeRenderer?.songMetadata || player?.cdgPlayer?.cdgData;

        if (hasLoadedSong && queue.length > 0) {
          // Skip first item - it's the currently loaded song
          queueToDisplay = queue.slice(1);
        }

        const nextSongs = queueToDisplay.slice(0, 3); // Get next 3 songs at most

        // Update both players
        if (player) {
          if (player.karaokeRenderer) {
            player.karaokeRenderer.setQueueDisplay(nextSongs, displayQueue);
          }
          if (player.cdgPlayer) {
            player.cdgPlayer.setQueueDisplay(nextSongs, displayQueue);
          }
        }
      } catch (error) {
        console.error('Error updating queue display:', error);
      }
    };

    // Initial update
    updateQueueDisplay();

    // Listen for queue changes (event-based, no polling)
    if (window.kaiAPI?.queue) {
      window.kaiAPI.queue.onUpdated?.(updateQueueDisplay);
    }

    // Listen for settings changes (event-based, no polling)
    if (window.kaiAPI?.events) {
      window.kaiAPI.events.on('settings-update', updateQueueDisplay);
    }

    // Listen for song loads (so we update when a song from queue is loaded)
    if (window.kaiAPI?.song) {
      window.kaiAPI.song.onChanged?.(updateQueueDisplay);
    }

    return () => {
      if (window.kaiAPI?.queue) {
        window.kaiAPI.queue.removeUpdatedListener?.(updateQueueDisplay);
      }
      if (window.kaiAPI?.events) {
        window.kaiAPI.events.off?.('settings-update', updateQueueDisplay);
      }
      if (window.kaiAPI?.song) {
        window.kaiAPI.song.removeChangedListener?.(updateQueueDisplay);
      }
    };
  }, []);

  // Load and subscribe to requests
  useEffect(() => {
    const loadRequests = async () => {
      try {
        const requestsList = await window.kaiAPI.webServer.getSongRequests();
        setRequests(requestsList || []);
      } catch (error) {
        console.error('Failed to load requests:', error);
      }
    };

    loadRequests();

    // Auto-refresh every 5 seconds
    const interval = setInterval(loadRequests, 5000);

    // Listen for real-time updates
    if (window.kaiAPI?.events) {
      const onNewRequest = (event, request) => {
        console.log('📨 New song request:', request);
        loadRequests();
      };

      const onApproved = (event, request) => {
        console.log('✅ Request approved:', request);
        loadRequests();
      };

      const onRejected = (event, request) => {
        console.log('❌ Request rejected:', request);
        loadRequests();
      };

      window.kaiAPI.events.on('songRequest:new', onNewRequest);
      window.kaiAPI.events.on('songRequest:approved', onApproved);
      window.kaiAPI.events.on('songRequest:rejected', onRejected);

      return () => {
        clearInterval(interval);
        window.kaiAPI.events.removeListener('songRequest:new', onNewRequest);
        window.kaiAPI.events.removeListener('songRequest:approved', onApproved);
        window.kaiAPI.events.removeListener('songRequest:rejected', onRejected);
      };
    }

    return () => clearInterval(interval);
  }, []);

  // Calculate pending requests count
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Song Info Bar */}
      <SongInfoBarWrapper bridge={bridge} />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div
          id="app-sidebar"
          className="w-80 bg-white dark:bg-gray-800 p-4 overflow-y-auto border-r border-gray-200 dark:border-gray-700 transition-all duration-300"
        >
          <VisualizationSettings bridge={bridge} />
        </div>

        {/* Center Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab Navigation */}
          <TabNavigation requestsCount={pendingCount} />

          {/* Tab Content */}
          <div className="flex-1 overflow-auto">
            {/* Library Tab */}
            <div id="library-tab" className="hidden h-full">
              <LibraryPanel bridge={bridge} showSetFolder={true} showFullRefresh={true} />
            </div>

            {/* Mixer Tab */}
            <div id="mixer-tab" className="hidden h-full overflow-auto">
              <MixerTab bridge={bridge} />
            </div>

            {/* Player Tab */}
            <div id="player-tab" className="h-full flex flex-col">
              {/* Top Section: Queue Sidebar + Canvas */}
              <div className="flex flex-1 gap-1 min-h-0">
                {/* Queue Sidebar (Left 30%) */}
                <div className="w-[30%] min-w-[280px] flex flex-col min-h-0">
                  <QueueTab bridge={bridge} />
                </div>

                {/* Canvas Area (Right 70%) */}
                <div className="flex-1 flex flex-col p-0 m-0 min-w-0">
                  <div
                    className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900 cursor-pointer"
                    onClick={toggleCanvasFullscreen}
                  >
                    <canvas
                      id="karaokeCanvas"
                      width="1920"
                      height="1080"
                      className="max-w-full max-h-full w-auto h-auto"
                    />
                    <div id="lyricsContainer" className="hidden">
                      <div className="text-center text-gray-500">No lyrics available</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Section: Transport Controls */}
              <TransportControlsWrapper bridge={bridge} />
            </div>

            {/* Effects Tab */}
            <div id="effects-tab" className="hidden h-full">
              <EffectsPanelWrapper bridge={bridge} />
            </div>

            {/* Song Requests Tab */}
            <div id="requests-tab" className="hidden h-full">
              <RequestsListWrapper />
            </div>

            {/* Server Tab */}
            <div id="server-tab" className="hidden h-full overflow-auto">
              <ServerTab bridge={bridge} />
            </div>

            {/* Lyrics Editor Tab */}
            <div id="editor-tab" className="hidden h-full">
              <SongEditor bridge={bridge} />
            </div>

            {/* Create Tab */}
            <div id="create-tab" className="hidden h-full overflow-auto">
              <CreateTab bridge={bridge} />
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar bridge={bridge} />
    </div>
  );
}

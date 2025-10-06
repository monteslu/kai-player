/**
 * React Entry Point for Electron Renderer
 *
 * Single entry point for the entire application.
 * Initializes both vanilla JS app and React components.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import '../shared/styles/theme.css';
import { ElectronBridge } from './adapters/ElectronBridge.js';
import { LibraryPanel } from '../shared/components/LibraryPanel.jsx';
import { EffectsPanelWrapper } from './components/EffectsPanelWrapper.jsx';
import { RequestsListWrapper } from './components/RequestsListWrapper.jsx';
import { SongEditor } from '../shared/components/SongEditor.jsx';
import { MixerTab } from './components/MixerTab.jsx';
import { QueueTab } from './components/QueueTab.jsx';
import { SongInfoBarWrapper } from './components/SongInfoBarWrapper.jsx';
import { TransportControlsWrapper } from './components/TransportControlsWrapper.jsx';
import { StatusBar } from './components/StatusBar.jsx';
import { onWindowBeforeUnload, onDOMReady } from './js/utils/window-events.js';
import { TabNavigation } from './components/TabNavigation.jsx';
import { ServerTab } from './components/ServerTab.jsx';
import { VisualizationSettings } from '../shared/components/VisualizationSettings.jsx';
import { verifyButterchurn } from './js/butterchurnVerify.js';
import { KaiPlayerApp } from './js/main.js';
import { AppRoot } from './components/AppRoot.jsx';

console.log('🚀 Initializing application...');

// Get the ElectronBridge singleton instance
const bridge = ElectronBridge.getInstance();

// Initialize the main app when DOM is ready
onDOMReady(async () => {
  console.log('📱 DOM ready, initializing app...');

  // Verify Butterchurn libraries loaded correctly
  verifyButterchurn();

  // Create app instance
  const app = new KaiPlayerApp();

  // Expose for debugging in dev tools only
  if (process.env.NODE_ENV === 'development') {
    window.kaiApp = app;
  }

  // Wait for bridge to connect, then mount React components
  await bridge.connect();
  console.log('✅ ElectronBridge connected');

  mountReactComponents();
});

function mountReactComponents() {
  console.log('⚛️ Mounting React components...');

  // Mount React Library Panel in library tab
  const libraryRoot = document.getElementById('react-library-root');
  if (libraryRoot) {
    const libraryPanelRoot = ReactDOM.createRoot(libraryRoot);
    libraryPanelRoot.render(
      <React.StrictMode>
        <AppRoot>
          <LibraryPanel bridge={bridge} showSetFolder={true} showFullRefresh={true} />
        </AppRoot>
      </React.StrictMode>
    );
    console.log('✅ LibraryPanel mounted in library tab');
  }

  // Mount React Effects Panel in effects tab
  const effectsRoot = document.getElementById('react-effects-root');
  if (effectsRoot) {
    const effectsPanelRoot = ReactDOM.createRoot(effectsRoot);
    effectsPanelRoot.render(
      <React.StrictMode>
        <EffectsPanelWrapper bridge={bridge} />
      </React.StrictMode>
    );
    console.log('✅ EffectsPanel mounted in effects tab');
  }

  // Mount React Requests List in requests tab
  const requestsRoot = document.getElementById('react-requests-root');
  if (requestsRoot) {
    const requestsListRoot = ReactDOM.createRoot(requestsRoot);
    requestsListRoot.render(
      <React.StrictMode>
        <RequestsListWrapper />
      </React.StrictMode>
    );
    console.log('✅ RequestsList mounted in requests tab');
  }

  // Mount React Song Editor in editor tab
  const editorRoot = document.getElementById('react-editor-root');
  if (editorRoot) {
    const songEditorRoot = ReactDOM.createRoot(editorRoot);
    songEditorRoot.render(
      <React.StrictMode>
        <SongEditor bridge={bridge} />
      </React.StrictMode>
    );
    console.log('✅ SongEditor mounted in editor tab');
  }

  // Mount React Queue in player sidebar (replaces vanilla queue.js)
  const queueRoot = document.getElementById('react-queue-root');
  if (queueRoot) {
    const queuePanelRoot = ReactDOM.createRoot(queueRoot);
    queuePanelRoot.render(
      <React.StrictMode>
        <QueueTab bridge={bridge} />
      </React.StrictMode>
    );
    console.log('✅ QueueTab mounted in player sidebar');
  }

  // Mount React Mixer Tab in mixer tab (replaces vanilla mixer.js)
  const mixerTab = document.getElementById('mixer-tab');
  if (mixerTab) {
    // Clear vanilla HTML
    mixerTab.innerHTML = '<div id="react-mixer-root"></div>';
    const mixerRoot = ReactDOM.createRoot(document.getElementById('react-mixer-root'));
    mixerRoot.render(
      <React.StrictMode>
        <MixerTab bridge={bridge} />
      </React.StrictMode>
    );
    console.log('✅ MixerTab mounted in mixer tab');
  }

  // Mount React Server Tab in server tab (replaces vanilla server.js)
  const serverTab = document.getElementById('server-tab');
  if (serverTab) {
    // Clear vanilla HTML
    serverTab.innerHTML = '<div id="react-server-root"></div>';
    const serverRoot = ReactDOM.createRoot(document.getElementById('react-server-root'));
    serverRoot.render(
      <React.StrictMode>
        <ServerTab bridge={bridge} />
      </React.StrictMode>
    );
    console.log('✅ ServerTab mounted in server tab');
  }

  // Mount React SongInfoBar (replaces vanilla song-info-bar)
  const songInfoBar = document.getElementById('react-song-info-root');
  if (songInfoBar) {
    const songInfoRoot = ReactDOM.createRoot(songInfoBar);
    songInfoRoot.render(
      <React.StrictMode>
        <SongInfoBarWrapper bridge={bridge} />
      </React.StrictMode>
    );
    console.log('✅ SongInfoBar mounted');
  }

  // Mount React TransportControls (replaces vanilla playControls)
  const transportRoot = document.getElementById('react-transport-root');
  if (transportRoot) {
    const transportControlsRoot = ReactDOM.createRoot(transportRoot);
    transportControlsRoot.render(
      <React.StrictMode>
        <TransportControlsWrapper bridge={bridge} />
      </React.StrictMode>
    );
    console.log('✅ TransportControls mounted');
  }

  // Mount React TabNavigation (replaces vanilla tab navigation)
  const tabNavRoot = document.getElementById('react-tab-nav-root');
  if (tabNavRoot) {
    const tabNavigationRoot = ReactDOM.createRoot(tabNavRoot);
    tabNavigationRoot.render(
      <React.StrictMode>
        <TabNavigation requestsCount={0} />
      </React.StrictMode>
    );
    console.log('✅ TabNavigation mounted');
  }

  // Mount React StatusBar (replaces vanilla status bar)
  const statusBarRoot = document.getElementById('react-status-bar-root');
  if (statusBarRoot) {
    const statusRoot = ReactDOM.createRoot(statusBarRoot);
    statusRoot.render(
      <React.StrictMode>
        <StatusBar bridge={bridge} />
      </React.StrictMode>
    );
    console.log('✅ StatusBar mounted');
  }

  // Mount React VisualizationSettings (replaces vanilla sidebar)
  const visualizationRoot = document.getElementById('react-visualization-root');
  if (visualizationRoot) {
    const vizRoot = ReactDOM.createRoot(visualizationRoot);
    vizRoot.render(
      <React.StrictMode>
        <VisualizationSettings bridge={bridge} />
      </React.StrictMode>
    );
    console.log('✅ VisualizationSettings mounted');
  }

  console.log('✅ React mounted successfully!');
}

// Cleanup on window unload
onWindowBeforeUnload(() => {
  bridge.disconnect();
});

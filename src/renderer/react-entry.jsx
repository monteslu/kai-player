/**
 * React Entry Point for Electron Renderer
 *
 * This initializes React in the Electron renderer process.
 * It runs alongside the existing vanilla JS code.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import '../shared/styles/theme.css';
import { ElectronBridge } from './adapters/ElectronBridge.js';
import { LibraryPanel } from '../shared/components/LibraryPanel.jsx';
import { EffectsPanelWrapper } from './components/EffectsPanelWrapper.jsx';
import { RequestsListWrapper } from './components/RequestsListWrapper.jsx';
import { SongEditor } from '../shared/components/SongEditor.jsx';

console.log('🚀 Initializing React in Electron renderer...');

// Get the ElectronBridge singleton instance
const bridge = ElectronBridge.getInstance();

// Connect the bridge
bridge.connect().then(() => {
  console.log('✅ ElectronBridge connected');

  // Mount React Library Panel in library tab
  const libraryRoot = document.getElementById('react-library-root');
  if (libraryRoot) {
    const libraryPanelRoot = ReactDOM.createRoot(libraryRoot);
    libraryPanelRoot.render(
      <React.StrictMode>
        <LibraryPanel bridge={bridge} showSetFolder={true} showFullRefresh={true} />
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

  console.log('✅ React mounted successfully!');
}).catch((err) => {
  console.error('❌ Failed to connect ElectronBridge:', err);
});

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
  bridge.disconnect();
});

/**
 * React Entry Point for Electron Renderer
 *
 * This initializes React in the Electron renderer process.
 * It runs alongside the existing vanilla JS code.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BridgeProvider } from '../shared/context/BridgeContext.jsx';
import { ElectronBridge } from './adapters/ElectronBridge.js';
import App from './components/App.jsx';

console.log('🚀 Initializing React in Electron renderer...');

// Create the ElectronBridge instance
const bridge = new ElectronBridge();

// Connect the bridge
bridge.connect().then(() => {
  console.log('✅ ElectronBridge connected');

  // Mount React app
  const rootElement = document.getElementById('react-root');

  if (!rootElement) {
    console.error('❌ React mount point #react-root not found!');
    return;
  }

  const root = ReactDOM.createRoot(rootElement);

  root.render(
    <React.StrictMode>
      <BridgeProvider bridge={bridge}>
        <App />
      </BridgeProvider>
    </React.StrictMode>
  );

  console.log('✅ React mounted successfully!');
}).catch((err) => {
  console.error('❌ Failed to connect ElectronBridge:', err);
});

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
  bridge.disconnect();
});

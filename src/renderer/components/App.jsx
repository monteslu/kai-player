/**
 * Renderer App - React UI for Electron renderer process
 *
 * This runs alongside the existing vanilla JS code.
 * Eventually, React components will replace vanilla JS UI elements.
 */

import React from 'react';
import './App.css';

export default function App() {
  return (
    <div className="react-root-container">
      <div className="react-test-banner">
        <h3>✅ React Mounted Successfully!</h3>
        <p>This proves React is running in the Electron renderer.</p>
        <p className="react-test-note">
          (Vanilla JS UI still working below)
        </p>
      </div>
    </div>
  );
}

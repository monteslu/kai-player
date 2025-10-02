/**
 * BridgeContext - Provides Bridge instance to React components
 *
 * This allows components to access the bridge without knowing whether
 * they're running in Electron (ElectronBridge) or Web (WebBridge).
 *
 * Usage:
 *   const bridge = useBridge();
 *   await bridge.play();
 */

import React, { createContext, useContext } from 'react';

const BridgeContext = createContext(null);

export function BridgeProvider({ bridge, children }) {
  if (!bridge) {
    throw new Error('BridgeProvider requires a bridge instance');
  }

  return (
    <BridgeContext.Provider value={bridge}>
      {children}
    </BridgeContext.Provider>
  );
}

export function useBridge() {
  const bridge = useContext(BridgeContext);

  if (!bridge) {
    throw new Error('useBridge must be used within a BridgeProvider');
  }

  return bridge;
}

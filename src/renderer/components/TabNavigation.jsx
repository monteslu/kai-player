/**
 * TabNavigation - Renderer tab navigation component
 *
 * Manages tab switching between different app sections
 */

import React, { useState } from 'react';

export function TabNavigation({ requestsCount = 0 }) {
  const [activeTab, setActiveTab] = useState('player');

  const tabs = [
    { id: 'player', label: '🎵 Player' },
    { id: 'library', label: '📚 Library' },
    { id: 'mixer', label: '🎛️ Audio' },
    { id: 'effects', label: '✨ Effects' },
    { id: 'requests', label: '🎤 Requests', badge: requestsCount },
    { id: 'server', label: '🌐 Server' },
    { id: 'create', label: '⚡ Create' },
    { id: 'editor', label: '✏️ Edit' },
  ];

  const handleTabClick = (tabId) => {
    // Hide all tab panes
    document.querySelectorAll('[id$="-tab"]').forEach((pane) => {
      pane.classList.add('hidden');
      pane.classList.remove('block', 'flex');
    });

    // Show selected tab pane
    const targetPane = document.getElementById(`${tabId}-tab`);
    if (targetPane) {
      targetPane.classList.remove('hidden');
      // Use flex for player tab to maintain layout
      if (tabId === 'player') {
        targetPane.classList.add('flex');
      } else {
        targetPane.classList.add('block');
      }
    }

    setActiveTab(tabId);

    // Handle resize for player tab to update canvas styling
    if (tabId === 'player' && window.kaiPlayerApp?.player?.karaokeRenderer?.resizeHandler) {
      setTimeout(() => {
        window.kaiPlayerApp.player.karaokeRenderer.resizeHandler();
      }, 10);
    }
  };

  return (
    <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`
            px-6 py-3 font-medium transition-colors relative inline-flex items-center gap-2
            ${
              activeTab === tab.id
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-gray-50 dark:bg-gray-900'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
            }
          `}
          onClick={() => handleTabClick(tab.id)}
        >
          {tab.label}
          {tab.badge > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-red-600 text-white rounded-full text-xs font-semibold">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

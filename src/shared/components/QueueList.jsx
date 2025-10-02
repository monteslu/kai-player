/**
 * QueueList - Unified queue display component
 *
 * Based on renderer's player-queue-sidebar design
 * Works with both ElectronBridge and WebBridge via callbacks
 */

import { getFormatIcon, formatDuration } from '../formatUtils.js';
import './QueueList.css';

export function QueueList({
  queue = [],
  currentIndex = -1,
  onPlayFromQueue,
  onRemoveFromQueue,
  onClearQueue,
  onShuffleQueue,
  onQuickSearch
}) {

  if (queue.length === 0) {
    return (
      <div className="player-queue-section">
        {onQuickSearch && (
          <div className="quick-search-controls">
            <input
              type="text"
              id="quickLibrarySearch"
              placeholder="Search..."
              onInput={(e) => onQuickSearch(e.target.value)}
            />
            <div className="quick-search-dropdown" id="quickSearchResults" style={{display: 'none'}}>
              <div className="no-search-message">Type to search your library</div>
            </div>
          </div>
        )}

        <div className="player-queue-header">
          <h4>Queue</h4>
          <div className="queue-actions">
            {onClearQueue && (
              <button onClick={onClearQueue} className="queue-action-btn" title="Clear Queue">
                <span className="material-icons">delete</span>
              </button>
            )}
            {onShuffleQueue && (
              <button onClick={onShuffleQueue} className="queue-action-btn" title="Shuffle">
                <span className="material-icons">shuffle</span>
              </button>
            )}
          </div>
        </div>

        <div className="player-queue-list">
          <div className="player-queue-empty">
            <span className="material-icons empty-icon">queue_music</span>
            <div className="empty-message">Queue is empty</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="player-queue-section">
      {onQuickSearch && (
        <div className="quick-search-controls">
          <input
            type="text"
            id="quickLibrarySearch"
            placeholder="Search..."
            onInput={(e) => onQuickSearch(e.target.value)}
          />
          <div className="quick-search-dropdown" id="quickSearchResults" style={{display: 'none'}}>
            <div className="no-search-message">Type to search your library</div>
          </div>
        </div>
      )}

      <div className="player-queue-header">
        <h4>Queue</h4>
        <div className="queue-actions">
          {onClearQueue && (
            <button onClick={onClearQueue} className="queue-action-btn" title="Clear Queue">
              <span className="material-icons">delete</span>
            </button>
          )}
          {onShuffleQueue && (
            <button onClick={onShuffleQueue} className="queue-action-btn" title="Shuffle">
              <span className="material-icons">shuffle</span>
            </button>
          )}
        </div>
      </div>

      <div className="player-queue-list">
        {queue.map((item, index) => {
          const isCurrentSong = index === currentIndex;
          const itemClass = isCurrentSong ? 'player-queue-item current' : 'player-queue-item';
          const requesterText = item.requester ? ` • Singer: ${item.requester}` : '';

          return (
            <div key={item.id} className={itemClass} data-item-id={item.id}>
              <div className="queue-item-number">{index + 1}</div>
              <div className="queue-item-info">
                <div className="queue-item-title" title={item.title}>{item.title}</div>
                <div className="queue-item-artist" title={`${item.artist}${requesterText}`}>
                  {item.artist}{requesterText}
                </div>
              </div>
              <div className="queue-item-actions">
                {onPlayFromQueue && (
                  <button
                    onClick={() => onPlayFromQueue(item.id)}
                    className="queue-item-btn"
                    title="Load Song"
                  >
                    <span className="material-icons">queue_play_next</span>
                  </button>
                )}
                {onRemoveFromQueue && (
                  <button
                    onClick={() => onRemoveFromQueue(item.id)}
                    className="queue-item-btn"
                    title="Remove"
                  >
                    <span className="material-icons">close</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

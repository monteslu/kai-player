import './QueueList.css';
import { formatDuration } from '../../shared/formatUtils.js';

export function QueueList({ queue = [], onRemove, onClear }) {
  return (
    <div className="queue-list">
      <div className="queue-header">
        <h2>Queue ({queue.length})</h2>
        {queue.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={onClear}>
            Clear Queue
          </button>
        )}
      </div>

      {queue.length === 0 ? (
        <div className="queue-empty">
          <p>No songs in queue</p>
          <p className="text-muted">Songs will appear here when added</p>
        </div>
      ) : (
        <div className="queue-items">
          {queue.map((item, index) => (
            <div key={item.id || index} className="queue-item">
              <div className="queue-item-number">{index + 1}</div>
              <div className="queue-item-info">
                <div className="queue-item-title">{item.title}</div>
                <div className="queue-item-meta">
                  <span className="queue-item-artist">{item.artist}</span>
                  {item.requester && (
                    <>
                      <span className="queue-item-separator">•</span>
                      <span className="queue-item-requester">👤 {item.requester}</span>
                    </>
                  )}
                  {item.duration && (
                    <>
                      <span className="queue-item-separator">•</span>
                      <span className="queue-item-duration">⏱ {formatDuration(item.duration)}</span>
                    </>
                  )}
                </div>
              </div>
              {onRemove && (
                <button
                  className="btn btn-icon btn-sm queue-item-remove"
                  onClick={() => onRemove(item.id)}
                  title="Remove from queue"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
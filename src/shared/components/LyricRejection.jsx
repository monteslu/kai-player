/**
 * LyricRejection - AI correction rejection display component
 *
 * Features:
 * - Shows old vs new text comparison
 * - Displays rejection reason and retention rate
 * - Copy, Accept, Delete actions
 */

import './LyricRejection.css';

export function LyricRejection({ rejection, rejectionIndex, onAccept, onDelete }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rejection.new_text);
      // Could show temporary "Copied!" feedback
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  return (
    <div className="lyric-rejection-box">
      <div className="rejection-header">
        <span className="rejection-label">
          <span className="material-icons">block</span>
          Rejected Update (Line {rejection.line_num})
        </span>
        <button
          className="rejection-delete-btn"
          title="Delete this rejection"
          onClick={() => onDelete(rejectionIndex)}
        >
          <span className="material-icons">delete</span>
        </button>
      </div>
      <div className="rejection-content">
        <div className="rejection-text-pair">
          <div className="rejection-text old-text">
            <label>Original:</label>
            <div className="text-content">{rejection.old_text}</div>
          </div>
          <div className="rejection-text new-text">
            <label>Proposed:</label>
            <div className="text-content">{rejection.new_text}</div>
            <div className="rejection-actions">
              <button className="copy-text-btn" title="Copy proposed text" onClick={handleCopy}>
                <span className="material-icons">content_copy</span>
                Copy
              </button>
              <button
                className="accept-text-btn"
                title="Accept proposed text and replace current lyric"
                onClick={() => onAccept(rejectionIndex)}
              >
                <span className="material-icons">check_circle</span>
                Accept
              </button>
            </div>
          </div>
        </div>
        <div className="rejection-details">
          <span className="rejection-reason">Reason: {rejection.reason}</span>
          {rejection.retention_rate !== undefined && (
            <span className="rejection-retention">
              Retention: {(rejection.retention_rate * 100).toFixed(1)}%
              (min: {(rejection.min_required * 100).toFixed(1)}%)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * LyricSuggestion - AI missing line suggestion display component
 *
 * Features:
 * - Shows suggested missing line with timing
 * - Displays confidence, reason, pitch activity
 * - Add as New Line, Copy, Delete actions
 */

import './LyricSuggestion.css';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function LyricSuggestion({ suggestion, suggestionIndex, onAccept, onDelete }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(suggestion.suggested_text);
      // Could show temporary "Copied!" feedback
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  const startTime = formatTime(suggestion.start_time);
  const endTime = formatTime(suggestion.end_time);

  return (
    <div className="lyric-suggestion-box">
      <div className="suggestion-header">
        <span className="suggestion-label">
          <span className="material-icons">lightbulb</span>
          Suggested Missing Line ({startTime} - {endTime})
        </span>
        <button
          className="suggestion-delete-btn"
          title="Delete this suggestion"
          onClick={() => onDelete(suggestionIndex)}
        >
          <span className="material-icons">delete</span>
        </button>
      </div>
      <div className="suggestion-content">
        <div className="suggestion-text-display">
          <label>Suggested Text:</label>
          <div className="suggested-text-content">{suggestion.suggested_text}</div>
        </div>
        <div className="suggestion-details">
          <span className="suggestion-confidence">Confidence: {suggestion.confidence}</span>
          <span className="suggestion-reason">Reason: {suggestion.reason}</span>
          {suggestion.pitch_activity && (
            <span className="suggestion-pitch">Pitch Activity: {suggestion.pitch_activity}</span>
          )}
        </div>
        <div className="suggestion-actions">
          <button
            className="accept-suggestion-btn"
            title="Add this as a new lyric line"
            onClick={() => onAccept(suggestionIndex)}
          >
            <span className="material-icons">add_circle</span>
            Add as New Line
          </button>
          <button
            className="copy-suggestion-btn"
            title="Copy suggested text"
            onClick={handleCopy}
          >
            <span className="material-icons">content_copy</span>
            Copy Text
          </button>
        </div>
      </div>
    </div>
  );
}

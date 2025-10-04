/**
 * LyricLine - Individual lyric line editor component
 *
 * Features:
 * - Editable timing (start/end)
 * - Editable text
 * - Enable/disable toggle
 * - Backup singer checkbox
 * - Delete button
 * - Add line after button
 * - Click line number to play that section
 */

import './LyricLine.css';

export function LyricLine({
  line,
  index,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onAddAfter,
  onPlaySection,
  canAddAfter
}) {
  const startTime = line.start || line.startTimeSec || 0;
  const endTime = line.end || line.endTimeSec || (startTime + 3);
  const text = line.text || '';
  const disabled = line.disabled === true;
  const backup = line.backup === true;

  const handleStartTimeChange = (e) => {
    const value = parseFloat(e.target.value) || 0;
    onUpdate(index, { ...line, start: value, startTimeSec: value });
  };

  const handleEndTimeChange = (e) => {
    const value = parseFloat(e.target.value) || 0;
    onUpdate(index, { ...line, end: value, endTimeSec: value });
  };

  const handleTextChange = (e) => {
    onUpdate(index, { ...line, text: e.target.value });
  };

  const handleBackupChange = (e) => {
    onUpdate(index, { ...line, backup: e.target.checked });
  };

  const handleToggleDisabled = () => {
    onUpdate(index, { ...line, disabled: !disabled });
  };

  const handleLineNumberClick = (e) => {
    e.stopPropagation();
    onSelect(index); // Select the line
    onPlaySection(startTime, endTime); // And play it
  };

  return (
    <div
      className={`lyric-line-editor ${disabled ? 'disabled' : ''} ${backup ? 'backup' : ''} ${isSelected ? 'selected' : ''}`}
      data-index={index}
      data-start-time={startTime}
      data-end-time={endTime}
      onClick={() => onSelect(index)}
    >
      <span className="line-number" onClick={handleLineNumberClick}>
        {index + 1}
      </span>

      <div className="time-inputs">
        <input
          type="number"
          className="time-input start-time"
          value={startTime.toFixed(1)}
          onChange={handleStartTimeChange}
          step="0.1"
          min="0"
          onClick={(e) => e.stopPropagation()}
        />
        <span className="time-separator">—</span>
        <input
          type="number"
          className="time-input end-time"
          value={endTime.toFixed(1)}
          onChange={handleEndTimeChange}
          step="0.1"
          min="0"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <input
        type="text"
        className="text-input"
        value={text}
        onChange={handleTextChange}
        placeholder="Enter lyrics..."
        onClick={(e) => e.stopPropagation()}
      />

      <div className="line-controls">
        <label className="checkbox-label" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="backup-checkbox"
            checked={backup}
            onChange={handleBackupChange}
          />
          <span className="checkbox-custom"></span>
          Backup
        </label>
      </div>

      <div className="line-actions">
        <button
          className={`btn-icon toggle-btn ${!disabled ? 'toggle-enabled' : 'toggle-disabled'}`}
          title={!disabled ? 'Disable line' : 'Enable line'}
          onClick={(e) => {
            e.stopPropagation();
            handleToggleDisabled();
          }}
        >
          <span className="material-icons">{!disabled ? 'visibility' : 'visibility_off'}</span>
        </button>
        <button
          className="btn-icon delete-btn"
          title="Delete line"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('Delete this lyric line?')) {
              onDelete(index);
            }
          }}
        >
          <span className="material-icons">delete</span>
        </button>
        <button
          className="btn-icon add-after-btn"
          title={canAddAfter ? 'Add line after' : 'Not enough space (need 0.6s gap)'}
          disabled={!canAddAfter}
          onClick={(e) => {
            e.stopPropagation();
            onAddAfter(index);
          }}
        >
          <span className="material-icons">add</span>
        </button>
      </div>
    </div>
  );
}

/**
 * LyricsEditorCanvas - Canvas-based lyrics timeline visualization
 *
 * Features:
 * - Waveform visualization from vocals track
 * - Lyric lines rendered as colored rectangles
 * - Playhead showing current playback position
 * - Click-to-select lyric lines
 * - Backup vs lead singer color coding
 */

import { useEffect, useRef } from 'react';

export function LyricsEditorCanvas({
  lyricsData,
  selectedLineIndex,
  onLineSelect,
  vocalsWaveform,
  songDuration,
  currentPosition,
  isPlaying
}) {
  const canvasRef = useRef(null);
  const lyricRectanglesRef = useRef([]);

  const CANVAS_WIDTH = 3800;
  const CANVAS_HEIGHT = 120;

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform if available
    if (vocalsWaveform && vocalsWaveform.length > 0) {
      drawWaveform(ctx, vocalsWaveform, width, height);
    }

    // Draw lyric rectangles
    if (songDuration > 0 && lyricsData && lyricsData.length > 0) {
      lyricRectanglesRef.current = [];

      // Separate backup and regular lines for rendering order
      const backupLines = [];
      const regularLines = [];

      lyricsData.forEach((line, index) => {
        // Skip disabled lines
        if (line.disabled === true) return;

        if (line.backup === true) {
          backupLines.push({ line, index });
        } else {
          regularLines.push({ line, index });
        }
      });

      // Draw backup lines first (yellow, behind)
      backupLines.forEach(({ line, index }) => {
        drawLyricRectangle(
          ctx,
          line,
          index,
          songDuration,
          width,
          height,
          'rgba(255, 200, 0, 0.35)',
          'rgba(255, 200, 0, 0.7)',
          selectedLineIndex === index
        );
      });

      // Draw regular lines second (blue, in front)
      regularLines.forEach(({ line, index }) => {
        drawLyricRectangle(
          ctx,
          line,
          index,
          songDuration,
          width,
          height,
          'rgba(0, 100, 255, 0.35)',
          'rgba(0, 255, 255, 0.9)',
          selectedLineIndex === index
        );
      });
    }

    // Draw playhead if playing or paused with position
    if (currentPosition > 0 && songDuration > 0) {
      const playheadX = (currentPosition / songDuration) * width;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Draw triangular tic marks (relative to height)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';

      const triangleHeight = height * 0.1; // 10% of canvas height
      const triangleWidth = 6;

      // Top triangle (pointing down)
      ctx.beginPath();
      ctx.moveTo(playheadX, triangleHeight); // Bottom point
      ctx.lineTo(playheadX - triangleWidth, 0); // Top left
      ctx.lineTo(playheadX + triangleWidth, 0); // Top right
      ctx.closePath();
      ctx.fill();

      // Bottom triangle (pointing up)
      ctx.beginPath();
      ctx.moveTo(playheadX, height - triangleHeight); // Top point
      ctx.lineTo(playheadX - triangleWidth, height); // Bottom left
      ctx.lineTo(playheadX + triangleWidth, height); // Bottom right
      ctx.closePath();
      ctx.fill();
    }
  }, [lyricsData, selectedLineIndex, vocalsWaveform, songDuration, currentPosition, isPlaying]);

  // Draw waveform
  const drawWaveform = (ctx, waveform, width, height) => {
    const centerY = height / 2;
    const scale = height / 256;

    // Draw waveform
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 0; i < waveform.length; i++) {
      const x = (i / waveform.length) * width;
      const value = waveform[i];
      const y = centerY - (value * scale);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Mirror for bottom half
    ctx.beginPath();
    for (let i = 0; i < waveform.length; i++) {
      const x = (i / waveform.length) * width;
      const value = waveform[i];
      const y = centerY + (value * scale);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
  };

  // Draw lyric rectangle
  const drawLyricRectangle = (ctx, lineData, lineIndex, songDuration, width, height, fillColor, outlineColor, isSelected) => {
    const startTime = lineData.start || lineData.startTimeSec || 0;
    const endTime = lineData.end || lineData.endTimeSec || (startTime + 3);
    const duration = endTime - startTime;

    if (duration > 0) {
      const startX = (startTime / songDuration) * width;
      const rectWidth = (duration / songDuration) * width;

      // Rectangle dimensions relative to canvas height
      const rectMargin = height * 0.05; // 5% margin from top/bottom
      const rectHeight = height - (rectMargin * 2); // Use most of canvas height

      // Store rectangle bounds for click detection
      lyricRectanglesRef.current.push({
        x: startX,
        y: rectMargin,
        width: rectWidth,
        height: rectHeight,
        lineIndex: lineIndex
      });

      // Draw rectangle
      ctx.fillStyle = fillColor;
      ctx.fillRect(startX, rectMargin, rectWidth, rectHeight);

      // Draw outline if selected
      if (isSelected) {
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, rectMargin, rectWidth, rectHeight);
      }
    }
  };

  // Handle canvas click
  const handleCanvasClick = (e) => {
    if (!lyricRectanglesRef.current.length || !songDuration) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check if click is inside any rectangle (reverse order)
    for (let i = lyricRectanglesRef.current.length - 1; i >= 0; i--) {
      const r = lyricRectanglesRef.current[i];
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
        onLineSelect(r.lineIndex);

        // Scroll the corresponding line into view
        const lineElement = document.querySelector(`.lyric-line-editor[data-index="${r.lineIndex}"]`);
        if (lineElement) {
          lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        break;
      }
    }
  };

  return (
    <div className="lyrics-waveform-container">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onClick={handleCanvasClick}
        style={{
          width: '100%',
          height: 'auto',
          cursor: 'pointer',
          display: 'block'
        }}
      />
    </div>
  );
}

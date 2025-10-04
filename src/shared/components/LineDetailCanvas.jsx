/**
 * LineDetailCanvas - Zoomed waveform view for selected lyric line
 *
 * Features:
 * - Shows waveform for just the selected line's time range
 * - Stretched to fill canvas width for detailed editing
 * - Displays word timing markers (if available)
 * - Playhead for current position within the line
 */

import { useEffect, useRef } from 'react';

export function LineDetailCanvas({
  selectedLine,
  vocalsWaveform,
  songDuration,
  currentPosition,
  isPlaying
}) {
  const canvasRef = useRef(null);

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

    // Draw black background (always, like full song canvas)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, width, height);

    // If no line selected or no waveform, just show empty canvas
    if (!selectedLine || !vocalsWaveform) return;

    const lineStart = selectedLine.start || selectedLine.startTimeSec || 0;
    const lineEnd = selectedLine.end || selectedLine.endTimeSec || lineStart + 3;
    const lineDuration = lineEnd - lineStart;

    // Draw waveform segment for this line (stretched to full width)
    drawWaveformSegment(ctx, vocalsWaveform, lineStart, lineEnd, songDuration, width, height);

    // Draw word timing rectangles if available
    if (selectedLine.word_timing && Array.isArray(selectedLine.word_timing)) {
      drawWordRectangles(ctx, selectedLine.word_timing, lineDuration, width, height);
    }

    // Draw playhead if playing and within this line's range
    if (isPlaying && currentPosition >= lineStart && currentPosition <= lineEnd) {
      const relativePosition = currentPosition - lineStart;
      const x = (relativePosition / lineDuration) * width;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

  }, [selectedLine, vocalsWaveform, songDuration, currentPosition, isPlaying]);

  // Draw waveform segment for the selected line (stretched to full canvas width)
  const drawWaveformSegment = (ctx, waveform, startTime, endTime, totalDuration, width, height) => {
    if (!waveform || waveform.length === 0) return;

    const lineDuration = endTime - startTime;
    const samplesPerSecond = waveform.length / totalDuration;
    const startSample = Math.floor(startTime * samplesPerSecond);
    const endSample = Math.floor(endTime * samplesPerSecond);
    const lineWaveform = waveform.slice(startSample, endSample);

    if (lineWaveform.length === 0) return;

    const centerY = height / 2;
    const scale = height / 256;

    // Draw waveform (top half)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 0; i < lineWaveform.length; i++) {
      const x = (i / lineWaveform.length) * width;
      const value = lineWaveform[i];
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
    for (let i = 0; i < lineWaveform.length; i++) {
      const x = (i / lineWaveform.length) * width;
      const value = lineWaveform[i];
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

  // Draw word timing rectangles (similar to line rectangles in song canvas)
  const drawWordRectangles = (ctx, wordTimings, lineDuration, width, height) => {
    if (!wordTimings || wordTimings.length === 0) return;

    // Rectangle dimensions relative to canvas height (same as song canvas)
    const rectMargin = height * 0.05; // 5% margin from top/bottom
    const rectHeight = height - (rectMargin * 2); // Use most of canvas height

    // Use green color for word rectangles (different from line colors)
    const fillColor = 'rgba(0, 255, 100, 0.35)';
    const outlineColor = 'rgba(0, 255, 100, 0.7)';

    wordTimings.forEach(([wordStart, wordEnd]) => {
      // Word timings are relative to line start (0 to lineDuration)
      const startX = (wordStart / lineDuration) * width;
      const rectWidth = ((wordEnd - wordStart) / lineDuration) * width;

      // Draw filled rectangle
      ctx.fillStyle = fillColor;
      ctx.fillRect(startX, rectMargin, rectWidth, rectHeight);

      // Draw outline
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(startX, rectMargin, rectWidth, rectHeight);
    });
  };

  return (
    <div className="lyrics-waveform-container">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{
          width: '100%',
          height: 'auto',
          cursor: 'crosshair',
          display: 'block'
        }}
      />
    </div>
  );
}

/**
 * Lyrics utility functions - pure JavaScript utilities for lyric manipulation
 * No Node.js dependencies - safe for browser/renderer contexts
 */

/**
 * Check if a line can be split
 * @param {Object} line - Line to check (with text)
 * @returns {boolean} True if line can be split
 */
export function canSplitLine(line) {
  if (!line || !line.text) {
    return false;
  }

  const text = line.text.trim();

  // Find first sentence-ending punctuation (. ! ?)
  const punctuationMatch = text.match(/[.!?]/);

  if (!punctuationMatch) {
    return false;
  }

  const splitIndex = punctuationMatch.index + 1;
  const firstLineText = text.substring(0, splitIndex).trim();
  const secondLineText = text.substring(splitIndex).trim();

  // Must have text on both sides (prevents splitting if punctuation is at the end)
  // Example: "Hello world." → false (only one sentence)
  // Example: "Hello world. Hi" → true (two sentences)
  return firstLineText.length > 0 && secondLineText.length > 0;
}

/**
 * Split a lyric line at the first sentence-ending punctuation
 * @param {Object} line - Line to split (with start, end, text, word_timing)
 * @param {number} lineIndex - Index of the line (for logging)
 * @returns {Array<Object>|null} Two new lines, or null if cannot split
 */
export function splitLine(line, lineIndex = 0) {
  if (!line || !line.text) {
    console.warn('Cannot split line: missing text');
    return null;
  }

  const text = line.text.trim();

  // Find first sentence-ending punctuation (. ! ?)
  const punctuationMatch = text.match(/[.!?]/);

  if (!punctuationMatch) {
    console.log(`Line ${lineIndex}: No punctuation found, cannot split`);
    return null;
  }

  const splitIndex = punctuationMatch.index + 1; // Include the punctuation
  const firstLineText = text.substring(0, splitIndex).trim();
  const secondLineText = text.substring(splitIndex).trim();

  if (!firstLineText || !secondLineText) {
    console.log(`Line ${lineIndex}: Split would create empty line, aborting`);
    return null;
  }

  const duration = line.end - line.start;

  // Try to use word-level timing if available and accurate
  if (line.word_timing && Array.isArray(line.word_timing)) {
    console.log(`Line ${lineIndex}: Attempting word-timing based split`);

    // Validate word timing matches the text
    const textWords = text.split(/\s+/);
    const timingWordCount = line.word_timing.length;

    if (timingWordCount !== textWords.length) {
      console.warn(
        `Line ${lineIndex}: Word count mismatch (timing: ${timingWordCount}, text: ${textWords.length}), falling back to percentage split`
      );
    } else {
      // Word counts match, try to find the split point
      const firstLineWords = firstLineText.split(/\s+/);
      const splitWordIndex = firstLineWords.length;

      if (splitWordIndex > 0 && splitWordIndex < line.word_timing.length) {
        // Get timing of the word just before the split
        const lastWordOfFirstLine = line.word_timing[splitWordIndex - 1];
        const splitTime = line.start + lastWordOfFirstLine[1]; // end time of last word (relative to line start)

        // First line: same start, new end
        const firstLine = {
          ...line,
          text: firstLineText,
          end: splitTime,
          word_timing: line.word_timing.slice(0, splitWordIndex),
        };

        // Second line: new start, same end
        // Adjust word_timing to be relative to new line start
        const newLineStart = splitTime;
        const secondLineWordTiming = line.word_timing.slice(splitWordIndex).map((timing) => {
          const absoluteStart = line.start + timing[0];
          const absoluteEnd = line.start + timing[1];
          return [absoluteStart - newLineStart, absoluteEnd - newLineStart];
        });

        const secondLine = {
          ...line,
          text: secondLineText,
          start: newLineStart,
          end: line.end,
          word_timing: secondLineWordTiming,
        };

        console.log(`✅ Line ${lineIndex}: Split using word-timing at ${splitTime.toFixed(2)}s`);
        console.log(
          `   Line 1: ${firstLine.start.toFixed(2)}-${firstLine.end.toFixed(2)}s "${firstLineText}"`
        );
        console.log(
          `   Line 2: ${secondLine.start.toFixed(2)}-${secondLine.end.toFixed(2)}s "${secondLineText}"`
        );

        return [firstLine, secondLine];
      }
    }
  }

  // Fallback: split time based on text length percentage
  console.log(`Line ${lineIndex}: Using percentage-based time split`);

  const firstLineRatio = firstLineText.length / text.length;
  const splitTime = line.start + duration * firstLineRatio;

  const firstLine = {
    ...line,
    text: firstLineText,
    end: splitTime,
    // Remove word_timing since it's no longer accurate
    word_timing: undefined,
  };

  const secondLine = {
    ...line,
    text: secondLineText,
    start: splitTime,
    end: line.end,
    // Remove word_timing since it's no longer accurate
    word_timing: undefined,
  };

  console.log(
    `✅ Line ${lineIndex}: Split using percentage (${(firstLineRatio * 100).toFixed(1)}% / ${((1 - firstLineRatio) * 100).toFixed(1)}%)`
  );
  console.log(
    `   Line 1: ${firstLine.start.toFixed(2)}-${firstLine.end.toFixed(2)}s "${firstLineText}"`
  );
  console.log(
    `   Line 2: ${secondLine.start.toFixed(2)}-${secondLine.end.toFixed(2)}s "${secondLineText}"`
  );

  return [firstLine, secondLine];
}

/**
 * LRCLIB Service - Lyrics lookup from lrclib.net
 *
 * Provides:
 * - Lyrics search by title/artist
 * - Vocabulary extraction for Whisper hints
 * - Synced lyrics (LRC format) when available
 */

const LRCLIB_API_BASE = 'https://lrclib.net/api';

// Common words to filter out of vocabulary hints
const COMMON_WORDS = new Set([
  'this',
  'that',
  'with',
  'will',
  'were',
  'when',
  'where',
  'what',
  'they',
  'them',
  'then',
  'than',
  'like',
  'just',
  'have',
  'from',
  'been',
  'your',
  'come',
  'said',
  'would',
  'could',
  'should',
  'there',
  'their',
  'these',
  'those',
  'through',
  'before',
  'after',
  'about',
  'dont',
  'cant',
  'wont',
  'isnt',
  'arent',
  'wasnt',
  'werent',
  'doesnt',
]);

/**
 * Search LRCLIB for lyrics
 * @param {string} title - Song title
 * @param {string} artist - Artist name
 * @returns {Promise<Object|null>} Lyrics result or null
 */
export async function searchLyrics(title, artist) {
  if (!title) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      track_name: title,
    });

    if (artist) {
      params.set('artist_name', artist);
    }

    const url = `${LRCLIB_API_BASE}/search?${params}`;
    console.log(`Searching LRCLIB for: ${title} by ${artist || 'unknown'}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Loukai/1.0',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`LRCLIB search failed: ${response.status}`);
      return null;
    }

    const results = await response.json();

    if (!results || results.length === 0) {
      console.warn('No lyrics found on LRCLIB');
      return null;
    }

    // Find first non-instrumental result with plain lyrics
    for (const result of results) {
      if (!result.instrumental && result.plainLyrics) {
        console.log(
          `Found lyrics: ${result.name || 'Unknown'} from ${result.albumName || 'Unknown'}`
        );
        return {
          id: result.id,
          name: result.name,
          artist: result.artistName,
          album: result.albumName,
          duration: result.duration,
          plainLyrics: result.plainLyrics,
          syncedLyrics: result.syncedLyrics || null,
        };
      }
    }

    console.warn('No suitable lyrics found (all instrumental or missing plainLyrics)');
    return null;
  } catch (error) {
    console.error('Failed to fetch lyrics from LRCLIB:', error.message);
    return null;
  }
}

/**
 * Get lyrics by LRCLIB ID
 * @param {number} id - LRCLIB track ID
 * @returns {Promise<Object|null>} Lyrics result or null
 */
export async function getLyricsById(id) {
  try {
    const url = `${LRCLIB_API_BASE}/get/${id}`;
    console.log(`Fetching LRCLIB track: ${id}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Loukai/1.0',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`LRCLIB get failed: ${response.status}`);
      return null;
    }

    const result = await response.json();

    if (result.instrumental) {
      console.warn('Track is marked as instrumental');
      return null;
    }

    if (!result.plainLyrics) {
      console.warn('No plain lyrics in response');
      return null;
    }

    return {
      id: result.id,
      name: result.name,
      artist: result.artistName,
      album: result.albumName,
      duration: result.duration,
      plainLyrics: result.plainLyrics,
      syncedLyrics: result.syncedLyrics || null,
    };
  } catch (error) {
    console.error('Failed to fetch lyrics by ID:', error.message);
    return null;
  }
}

/**
 * Extract vocabulary hints from lyrics for Whisper context
 *
 * @param {string} lyrics - Full lyrics text
 * @param {number} maxTokens - Maximum tokens for vocabulary hints (default 150)
 * @returns {string} Comma-separated list of vocabulary words
 */
export function extractVocabularyHints(lyrics, maxTokens = 150) {
  if (!lyrics) {
    return '';
  }

  // Keep only letters (English + common accented characters)
  const wordsOnly = lyrics.replace(/[^a-zA-ZáéíóúñüÁÉÍÓÚÑÜ\s]/g, ' ');

  // Split into words, filter meaningful ones (> 3 chars)
  const words = wordsOnly
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 3);

  // Count word frequency with boost for opening words
  const wordCounts = new Map();
  words.forEach((word, i) => {
    if (!COMMON_WORDS.has(word)) {
      let count = (wordCounts.get(word) || 0) + 1;

      // Boost first 3 meaningful words
      if (i < 3) {
        count += 1;
      }

      wordCounts.set(word, count);
    }
  });

  // Get words with at least 2 occurrences (frequent)
  const frequentWords = [...wordCounts.entries()]
    .filter(([_word, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word);

  // Build candidate list
  const candidates = [...frequentWords];

  // Add single-occurrence words if we have room
  if (frequentWords.length < 15) {
    const singleWords = [...wordCounts.entries()]
      .filter(([_word, count]) => count === 1)
      .map(([word]) => word)
      .sort();

    const remaining = 15 - candidates.length;
    candidates.push(...singleWords.slice(0, remaining));
  }

  // Build vocabulary list respecting token budget
  const selectedWords = [];
  let estimatedTokens = 0;

  for (const word of candidates) {
    // Rough estimate: 1 token per 4 characters + 1 for separator
    const wordTokens = Math.ceil(word.length / 4) + 1;

    if (estimatedTokens + wordTokens <= maxTokens) {
      selectedWords.push(word);
      estimatedTokens += wordTokens;
    } else {
      break;
    }
  }

  return selectedWords.join(', ');
}

/**
 * Prepare Whisper context with LRCLIB vocabulary enhancement
 *
 * @param {string} title - Song title
 * @param {string} artist - Artist name
 * @param {string} existingLyrics - Optional pre-fetched lyrics
 * @returns {Promise<Object>} Object with initialPrompt and lyrics
 */
export async function prepareWhisperContext(title, artist, existingLyrics = null) {
  let lyrics = existingLyrics;

  // Fetch lyrics if not provided
  if (!lyrics) {
    const result = await searchLyrics(title, artist);
    lyrics = result?.plainLyrics || null;
  }

  // Build initial prompt
  let initialPrompt = null;

  if (lyrics) {
    // Calculate available tokens for vocabulary hints
    // Whisper limit: 224 tokens total
    // Reserve 30 tokens for safety buffer
    const basePrompt = title ? `${title}. ` : '';
    const baseTokens = Math.ceil(basePrompt.length / 4) + 2; // +2 for safety
    const safetyBuffer = 30;
    const maxVocabTokens = 224 - baseTokens - safetyBuffer;

    // Extract vocabulary hints
    const vocabularyHints = extractVocabularyHints(lyrics, maxVocabTokens);

    if (vocabularyHints) {
      initialPrompt = `${title}. ${vocabularyHints}`;
      console.log(`Whisper initial prompt: ${initialPrompt.substring(0, 100)}...`);
    } else {
      initialPrompt = title;
    }
  } else if (title) {
    initialPrompt = title;
  } else if (artist) {
    initialPrompt = artist;
  }

  return {
    initialPrompt,
    lyrics,
    hasLyrics: Boolean(lyrics),
  };
}

/**
 * Parse synced lyrics (LRC format) into timed segments
 *
 * @param {string} syncedLyrics - LRC format lyrics
 * @returns {Array<{time: number, text: string}>} Array of timed lyrics
 */
export function parseSyncedLyrics(syncedLyrics) {
  if (!syncedLyrics) {
    return [];
  }

  const lines = syncedLyrics.split('\n');
  const result = [];

  // LRC format: [mm:ss.xx]lyrics
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const hundredths = parseInt(match[3].padEnd(3, '0').slice(0, 3), 10);

      const time = minutes * 60 + seconds + hundredths / 1000;
      const text = line.replace(timeRegex, '').trim();

      if (text) {
        result.push({ time, text });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

export default {
  searchLyrics,
  getLyricsById,
  extractVocabularyHints,
  prepareWhisperContext,
  parseSyncedLyrics,
};

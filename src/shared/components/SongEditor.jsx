/**
 * SongEditor - Comprehensive song metadata and lyrics editor
 *
 * Features:
 * - Search and load any song from library
 * - Edit ID3 metadata for CDG+MP3 files
 * - Edit ID3 metadata + lyrics for KAI files
 * - Edit metadata + lyrics for M4A Stems files
 * - Auto-detects file format and shows appropriate editing options
 * - Supports both Electron (IPC) and Web (REST) environments
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getFormatIcon } from '../formatUtils.js';
import { LyricsEditorCanvas } from './LyricsEditorCanvas.jsx';
import { LineDetailCanvas } from './LineDetailCanvas.jsx';
import { LyricLine } from './LyricLine.jsx';
import { Toast } from './Toast.jsx';
import { LyricRejection } from './LyricRejection.jsx';
import { LyricSuggestion } from './LyricSuggestion.jsx';
import { splitLine, canSplitLine } from '../utils/lyricsUtils.js';

export function SongEditor({ bridge }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loadedSong, setLoadedSong] = useState(null);
  const [songData, setSongData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('metadata'); // 'metadata' or 'lyrics'

  // Metadata form state
  const [metadata, setMetadata] = useState({
    title: '',
    artist: '',
    album: '',
    year: '',
    genre: '',
    key: '',
  });

  // Lyrics state (for KAI files) - now array format for full editing
  const [lyricsData, setLyricsData] = useState([]);
  const [originalLyricsData, setOriginalLyricsData] = useState([]);
  const [selectedLineIndex, setSelectedLineIndex] = useState(null);
  const [songDuration, setSongDuration] = useState(0);
  const [rejections, setRejections] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Audio playback state (for KAI files)
  const [audioElements, setAudioElements] = useState([]);
  const [audioContext, setAudioContext] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [playingLineEndTime, setPlayingLineEndTime] = useState(null);

  // Waveform visualization
  const [vocalsWaveform, setVocalsWaveform] = useState(null);

  // Animation frame ref for smooth playhead
  const animationFrameRef = useRef(null);

  // Toast notification state
  const [toast, setToast] = useState(null);

  // Check if a line overlaps with the previous line (for same singer)
  const checkOverlap = useCallback(
    (index) => {
      if (index === 0 || index >= lyricsData.length) {
        return false; // First line can't overlap, or invalid index
      }

      const currentLine = lyricsData[index];
      const previousLine = lyricsData[index - 1];

      // Get singer type (backup vs lead)
      const currentIsBackup = currentLine.backup === true;
      const previousIsBackup = previousLine.backup === true;

      // Only check overlap if same singer type
      if (currentIsBackup !== previousIsBackup) {
        return false;
      }

      // Get timing values
      const currentStart = currentLine.start || currentLine.startTimeSec || 0;
      const previousEnd = previousLine.end || previousLine.endTimeSec || 0;

      // Overlap occurs when current starts before previous ends
      return currentStart < previousEnd;
    },
    [lyricsData]
  );

  // Lyrics editing handlers - wrap in useCallback for stable references
  const handleLineUpdate = useCallback((index, updatedLine) => {
    setLyricsData((prev) => prev.map((line, i) => (i === index ? updatedLine : line)));
    setHasChanges(true);
  }, []);

  const handlePlayLineSection = useCallback(
    async (startTime, endTime) => {
      if (!audioElements.length) {
        console.warn('No audio elements available for playback');
        return;
      }

      console.log(`🎵 Playing section: ${startTime}s - ${endTime}s`);

      // Clear end time first to prevent premature stop
      setPlayingLineEndTime(null);

      // Set audio position
      audioElements.forEach(({ audio }) => {
        audio.currentTime = startTime;
      });

      // Immediately update currentPosition state so canvas shows correct position
      setCurrentPosition(startTime);

      // Start playback with error handling
      try {
        const playPromises = audioElements.map(({ audio }) => audio.play());
        await Promise.all(playPromises);
        setIsPlaying(true);
        console.log('✅ Audio playback started');
      } catch (error) {
        console.error('Failed to play audio:', error);
        setToast({
          message: `Failed to play audio: ${error.message}`,
          type: 'error',
        });
        return;
      }

      // Set end time after position has been set
      // Use a small timeout to ensure currentTime has updated
      setTimeout(() => {
        setPlayingLineEndTime(endTime);
      }, 50);
    },
    [audioElements]
  );

  // Cleanup audio on unmount or song change
  const cleanupAudio = useCallback(() => {
    // Stop and cleanup existing audio
    audioElements.forEach(({ audio, source }) => {
      audio.pause();
      audio.currentTime = 0;
      try {
        source.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    });

    if (audioContext) {
      audioContext.close();
    }

    setAudioElements([]);
    setAudioContext(null);
    setIsPlaying(false);
  }, [audioElements, audioContext]);

  // Navigate to previous enabled line
  const selectPreviousEnabledLine = useCallback(() => {
    if (selectedLineIndex === null || selectedLineIndex === 0) {
      return; // Already at first line
    }

    // Find previous enabled line
    for (let i = selectedLineIndex - 1; i >= 0; i--) {
      if (!lyricsData[i].disabled) {
        setSelectedLineIndex(i);
        return;
      }
    }
  }, [selectedLineIndex, lyricsData]);

  // Navigate to next enabled line
  const selectNextEnabledLine = useCallback(() => {
    if (selectedLineIndex === null) {
      // No selection, select first enabled line
      for (let i = 0; i < lyricsData.length; i++) {
        if (!lyricsData[i].disabled) {
          setSelectedLineIndex(i);
          return;
        }
      }
      return;
    }

    if (selectedLineIndex >= lyricsData.length - 1) {
      return; // Already at last line
    }

    // Find next enabled line
    for (let i = selectedLineIndex + 1; i < lyricsData.length; i++) {
      if (!lyricsData[i].disabled) {
        setSelectedLineIndex(i);
        return;
      }
    }
  }, [selectedLineIndex, lyricsData]);

  // Play currently selected line
  const playCurrentLine = useCallback(() => {
    if (selectedLineIndex === null || !lyricsData[selectedLineIndex]) {
      return;
    }

    const line = lyricsData[selectedLineIndex];
    const startTime = line.start || line.startTimeSec || 0;
    const endTime = line.end || line.endTimeSec || startTime + 3;
    handlePlayLineSection(startTime, endTime);
  }, [selectedLineIndex, lyricsData, handlePlayLineSection]);

  // Adjust start time of selected line
  const adjustStartTime = useCallback(
    (delta) => {
      if (selectedLineIndex === null || !lyricsData[selectedLineIndex]) {
        return;
      }

      const line = lyricsData[selectedLineIndex];
      const currentStart = line.start || line.startTimeSec || 0;
      const newStart = Math.max(0, currentStart + delta); // Don't go below 0

      const updatedLine = {
        ...line,
        start: newStart,
        startTimeSec: newStart,
      };

      handleLineUpdate(selectedLineIndex, updatedLine);
    },
    [selectedLineIndex, lyricsData, handleLineUpdate]
  );

  // Adjust end time of selected line
  const adjustEndTime = useCallback(
    (delta) => {
      if (selectedLineIndex === null || !lyricsData[selectedLineIndex]) {
        return;
      }

      const line = lyricsData[selectedLineIndex];
      const currentEnd = line.end || line.endTimeSec || 0;
      const newEnd = Math.max(0, currentEnd + delta); // Don't go below 0

      const updatedLine = {
        ...line,
        end: newEnd,
        endTimeSec: newEnd,
      };

      handleLineUpdate(selectedLineIndex, updatedLine);
    },
    [selectedLineIndex, lyricsData, handleLineUpdate]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in an input field
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Only apply shortcuts when on lyrics tab with a song loaded
      if (activeTab !== 'lyrics' || !lyricsData.length) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'q': // Previous enabled line
          e.preventDefault();
          selectPreviousEnabledLine();
          break;
        case 'o': // Next enabled line
          e.preventDefault();
          selectNextEnabledLine();
          break;
        case 'p': // Play current line
          e.preventDefault();
          playCurrentLine();
          break;
        case 'a': // Decrease start time by 0.1s
          e.preventDefault();
          adjustStartTime(-0.1);
          break;
        case 's': // Increase start time by 0.1s
          e.preventDefault();
          adjustStartTime(0.1);
          break;
        case 'k': // Decrease end time by 0.1s
          e.preventDefault();
          adjustEndTime(-0.1);
          break;
        case 'l': // Increase end time by 0.1s
          e.preventDefault();
          adjustEndTime(0.1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTab,
    lyricsData,
    selectedLineIndex,
    audioElements,
    selectPreviousEnabledLine,
    selectNextEnabledLine,
    playCurrentLine,
    adjustStartTime,
    adjustEndTime,
  ]);

  // Search for songs
  const handleSearch = async (term) => {
    setSearchTerm(term);

    if (!term.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setIsSearching(true);
      const result = await bridge.searchSongs(term);
      setSearchResults(result.songs || []);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Load a song for editing
  const handleLoadSong = async (song) => {
    try {
      console.log('🔍 Loading song for editing:', song.path);
      const result = await bridge.loadSongForEditing(song.path);

      if (result.success) {
        setLoadedSong(song);
        setSongData(result.data);

        // Populate metadata form
        setMetadata({
          title: result.data.metadata?.title || song.title || '',
          artist: result.data.metadata?.artist || song.artist || '',
          album: result.data.metadata?.album || song.album || '',
          year: result.data.metadata?.year || song.year || '',
          genre: result.data.metadata?.genre || song.genre || '',
          key: result.data.metadata?.key || song.key || '',
        });

        // Populate lyrics if KAI or M4A file - server sends actual array with timing
        const hasLyrics = result.data.format === 'kai' || result.data.format === 'm4a-stems';
        if (hasLyrics) {
          const lyrics = result.data.lyrics || [];
          // Sort lyrics by start time to ensure proper order
          const sortedLyrics = [...lyrics].sort((a, b) => {
            const aStart = a.start || a.startTimeSec || 0;
            const bStart = b.start || b.startTimeSec || 0;
            return aStart - bStart;
          });
          setLyricsData(JSON.parse(JSON.stringify(sortedLyrics)));
          setOriginalLyricsData(JSON.parse(JSON.stringify(sortedLyrics)));
          setSongDuration(
            result.data.metadata?.duration || result.data.songJson?.duration_sec || 0
          );

          // Load AI corrections if available
          const kaiRejections = result.data.songJson?.meta?.corrections?.rejected || [];
          setRejections(
            kaiRejections.map((rejection) => ({
              line_num: rejection.line,
              start_time: rejection.start,
              end_time: rejection.end,
              old_text: rejection.old,
              new_text: rejection.new,
              reason: rejection.reason,
              retention_rate: rejection.word_retention,
              min_required: 0.5,
            }))
          );

          const kaiSuggestions =
            result.data.songJson?.meta?.corrections?.missing_lines_suggested || [];
          setSuggestions(
            kaiSuggestions.map((suggestion) => ({
              suggested_text: suggestion.suggested_text,
              start_time: suggestion.start,
              end_time: suggestion.end,
              confidence: suggestion.confidence,
              reason: suggestion.reason,
              pitch_activity: suggestion.pitch_activity,
            }))
          );

          setHasChanges(false);
        } else {
          setLyricsData([]);
          setOriginalLyricsData([]);
          setSongDuration(0);
          setRejections([]);
          setSuggestions([]);
          setHasChanges(false);
        }

        // Clear search
        setSearchResults([]);
        setSearchTerm('');

        // Default to lyrics tab for KAI/M4A files, metadata for others
        setActiveTab(hasLyrics ? 'lyrics' : 'metadata');

        // Load audio if KAI or M4A file
        if (hasLyrics && result.data.audioFiles) {
          loadAudioFiles(result.data.audioFiles);
        }
      }
    } catch (error) {
      console.error('Failed to load song:', error);
    }
  };

  // Load audio files for KAI and M4A songs
  const loadAudioFiles = (audioFiles) => {
    try {
      // Clean up existing audio
      cleanupAudio();

      // Create new AudioContext (using default device)
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      setAudioContext(ctx);

      // Create audio elements for each source
      const elements = audioFiles.map((file) => {
        const audio = new Audio(file.downloadUrl);
        audio.crossOrigin = 'anonymous'; // For CORS if needed
        audio.preload = 'auto';
        audio.volume = 1.0;

        // Create media element source for the audio context
        const source = ctx.createMediaElementSource(audio);
        const gainNode = ctx.createGain();

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Only vocals unmuted by default
        const isVocals = file.name.toLowerCase().includes('vocal');
        const muted = !isVocals;
        gainNode.gain.value = muted ? 0 : 1;

        return {
          name: file.name,
          audio: audio,
          source: source,
          gainNode: gainNode,
          muted: muted,
          audioData: file.audioData, // Keep reference to raw audio data (Electron only)
        };
      });

      setAudioElements(elements);
      console.log(`🎵 Loaded ${elements.length} audio sources for playback`);

      // Find vocals track and analyze waveform
      const vocalsFile = audioFiles.find((file) => file.name.toLowerCase().includes('vocal'));
      const vocalsElement = elements.find((el) => el.name.toLowerCase().includes('vocal'));

      if (vocalsElement) {
        setupAudioPlaybackMonitoring(vocalsElement.audio);
        // Pass both audio element and raw data (if available)
        analyzeVocalsWaveform(vocalsElement.audio, vocalsFile?.audioData);
      } else if (elements[0]) {
        // Fallback to first track if no vocals
        setupAudioPlaybackMonitoring(elements[0].audio);
        analyzeVocalsWaveform(elements[0].audio, audioFiles[0]?.audioData);
      }
    } catch (error) {
      console.error('Failed to load audio files:', error);
    }
  };

  // Setup audio playback monitoring for playhead
  const setupAudioPlaybackMonitoring = (audio) => {
    const handlePause = () => {
      setPlayingLineEndTime(null);
      setIsPlaying(false);
    };

    audio.addEventListener('pause', handlePause);
  };

  // Smooth playhead animation using requestAnimationFrame
  useEffect(() => {
    if (isPlaying && audioElements.length > 0) {
      const updatePosition = () => {
        const audio = audioElements[0]?.audio;
        if (audio && !audio.paused) {
          setCurrentPosition(audio.currentTime);
          animationFrameRef.current = requestAnimationFrame(updatePosition);
        }
      };

      animationFrameRef.current = requestAnimationFrame(updatePosition);

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [isPlaying, audioElements]);

  // Check if playback should stop at line end time
  useEffect(() => {
    if (playingLineEndTime !== null && currentPosition >= playingLineEndTime) {
      // Pause all audio elements
      audioElements.forEach(({ audio }) => audio.pause());
      setPlayingLineEndTime(null);
      setIsPlaying(false);
    }
  }, [currentPosition, playingLineEndTime, audioElements]);

  // Analyze vocals waveform
  const analyzeVocalsWaveform = async (audioElement, rawAudioData) => {
    try {
      let arrayBuffer;

      // Try to use raw audio data first (Electron with Buffer data)
      if (rawAudioData) {
        if (rawAudioData instanceof ArrayBuffer) {
          arrayBuffer = rawAudioData;
        } else if (rawAudioData.buffer instanceof ArrayBuffer) {
          // It's a typed array (like Uint8Array or Buffer)
          arrayBuffer = rawAudioData.buffer.slice(
            rawAudioData.byteOffset,
            rawAudioData.byteOffset + rawAudioData.byteLength
          );
        }
      }

      // Fall back to fetching from audio element src (Web with blob URLs)
      if (!arrayBuffer && audioElement?.src) {
        const response = await fetch(audioElement.src);
        arrayBuffer = await response.arrayBuffer();
      }

      if (!arrayBuffer) {
        throw new Error('No audio data available for waveform analysis');
      }

      // Create temporary audio context for analysis
      const tempContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await tempContext.decodeAudioData(arrayBuffer);

      // Get channel data
      const channelData = audioBuffer.getChannelData(0);
      const targetSamples = 3800;
      const downsampleFactor = Math.floor(channelData.length / targetSamples);

      // Create waveform data
      const waveform = new Int8Array(targetSamples);

      for (let i = 0; i < targetSamples; i++) {
        const start = i * downsampleFactor;
        const end = Math.min(start + downsampleFactor, channelData.length);

        let max = 0;
        for (let j = start; j < end; j++) {
          max = Math.max(max, Math.abs(channelData[j]));
        }

        waveform[i] = Math.floor(max * 127);
      }

      setVocalsWaveform(waveform);
      tempContext.close();

      console.log('✅ Waveform analysis complete');
    } catch (error) {
      console.error('Failed to analyze waveform:', error);
    }
  };

  // Play/pause audio
  const togglePlayback = () => {
    if (!audioElements.length) return;

    if (isPlaying) {
      audioElements.forEach(({ audio }) => audio.pause());
      setIsPlaying(false);
    } else {
      audioElements.forEach(({ audio }) => audio.play());
      setIsPlaying(true);
    }
  };

  // Toggle mute for individual source
  const toggleMute = (index) => {
    setAudioElements((prev) =>
      prev.map((el, i) => {
        if (i === index) {
          const newMuted = !el.muted;
          el.gainNode.gain.value = newMuted ? 0 : 1;
          return { ...el, muted: newMuted };
        }
        return el;
      })
    );
  };

  // Cleanup on component unmount only (not when cleanupAudio changes)
  useEffect(() => {
    return () => {
      // Direct cleanup without using the callback (to avoid dependency issues)
      audioElements.forEach(({ audio, source }) => {
        audio.pause();
        audio.currentTime = 0;
        try {
          source.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      });

      if (audioContext) {
        audioContext.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on unmount

  // Show toast notification
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const handleLineDelete = (index) => {
    setLyricsData((prev) => prev.filter((_, i) => i !== index));
    setSelectedLineIndex(null);
    setHasChanges(true);
  };

  const handleAddLineAfter = (index) => {
    const currentLine = lyricsData[index];
    const nextLine = lyricsData[index + 1];

    const currentEndTime = currentLine.end || currentLine.endTimeSec || 0;
    const nextStartTime = nextLine
      ? nextLine.start || nextLine.startTimeSec || currentEndTime + 3
      : currentEndTime + 3;

    const gap = nextStartTime - currentEndTime;
    const usableGap = gap * 0.8;
    const margin = gap * 0.1;

    const newLine = {
      start: currentEndTime + margin,
      startTimeSec: currentEndTime + margin,
      end: currentEndTime + margin + usableGap,
      endTimeSec: currentEndTime + margin + usableGap,
      text: '',
    };

    setLyricsData((prev) => [...prev.slice(0, index + 1), newLine, ...prev.slice(index + 1)]);
    setHasChanges(true);
  };

  const handleLineSplit = (index) => {
    const line = lyricsData[index];

    // Try to split the line
    const splitResult = splitLine(line, index);

    if (!splitResult) {
      // Show toast if split failed
      showToast('Cannot split line: no punctuation found or would create empty line', 'error');
      return;
    }

    const [firstLine, secondLine] = splitResult;

    // Replace the line at index with the two new lines
    setLyricsData((prev) => [
      ...prev.slice(0, index),
      firstLine,
      secondLine,
      ...prev.slice(index + 1),
    ]);

    // Select the second line
    setSelectedLineIndex(index + 1);
    setHasChanges(true);
    showToast('Line split successfully', 'success');
  };

  const handleAddLineAtStart = () => {
    const firstLine = lyricsData[0];
    if (!firstLine) {
      // No lines exist, create a default one
      const newLine = {
        start: 0,
        startTimeSec: 0,
        end: 3,
        endTimeSec: 3,
        text: '',
      };
      setLyricsData([newLine]);
      setHasChanges(true);
      return;
    }

    const firstLineStart = firstLine.start || firstLine.startTimeSec || 0;

    // Create a line from 0 to 80% of available space
    const gap = firstLineStart;
    const usableGap = gap * 0.8;

    const newLine = {
      start: 0,
      startTimeSec: 0,
      end: usableGap,
      endTimeSec: usableGap,
      text: '',
    };

    setLyricsData((prev) => [newLine, ...prev]);
    setHasChanges(true);
  };

  const canAddLineAtStart = () => {
    const firstLine = lyricsData[0];
    if (!firstLine) return true;
    const firstLineStart = firstLine.start || firstLine.startTimeSec || 0;
    return firstLineStart >= 0.6;
  };

  const canAddLineAfter = (index) => {
    const currentLine = lyricsData[index];
    const nextLine = lyricsData[index + 1];

    if (!nextLine) return true;

    const currentEndTime = currentLine.end || currentLine.endTimeSec || 0;
    const nextStartTime = nextLine.start || nextLine.startTimeSec || 0;
    const gap = nextStartTime - currentEndTime;

    return gap >= 0.6;
  };

  const canSplit = (index) => {
    if (index < 0 || index >= lyricsData.length) return false;
    return canSplitLine(lyricsData[index]);
  };

  // Handle metadata field changes
  const handleMetadataChange = (field, value) => {
    setMetadata((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Save changes
  const handleSave = async () => {
    if (!loadedSong || !songData) return;

    try {
      setIsSaving(true);

      // Sort lyrics by start time before saving
      const sortedLyrics = [...lyricsData].sort((a, b) => {
        const aStart = a.start || a.startTimeSec || 0;
        const bStart = b.start || b.startTimeSec || 0;
        return aStart - bStart;
      });

      const updates = {
        path: loadedSong.path,
        format: songData.format,
        metadata: {
          ...metadata,
          // Include rejections and suggestions so they can be saved to meta object
          rejections,
          suggestions,
        },
        // Include lyrics for both KAI and M4A formats
        ...((songData.format === 'kai' || songData.format === 'm4a-stems') && {
          lyrics: sortedLyrics,
        }),
      };

      const result = await bridge.saveSongEdits(updates);

      if (result.success) {
        console.log('✅ Song saved successfully');
        showToast('Song saved successfully', 'success');
        setHasChanges(false);
        // Update original data after successful save
        setOriginalLyricsData(JSON.parse(JSON.stringify(lyricsData)));
      } else {
        console.error('❌ Save failed:', result.error);
        showToast(`Save failed: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('Failed to save song:', error);
      showToast(`Save failed: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Close editor
  const handleClose = () => {
    setLoadedSong(null);
    setSongData(null);
    setMetadata({
      title: '',
      artist: '',
      album: '',
      year: '',
      genre: '',
      key: '',
    });
    setLyricsData([]);
  };

  // Add to queue
  const handleAddToQueue = async () => {
    if (!loadedSong) return;

    try {
      await bridge.addToQueue(loadedSong);
      console.log('✅ Added to queue:', loadedSong.path);
      showToast(`Added "${metadata.title || loadedSong.title}" to queue`, 'success');
    } catch (error) {
      console.error('Failed to add to queue:', error);
      showToast('Failed to add to queue', 'error');
    }
  };

  // Export lyrics as text file
  const handleExportLyrics = () => {
    if (!lyricsData || lyricsData.length === 0) return;

    const lyricsText = lyricsData.map((line) => line.text || '').join('\n');
    const blob = new Blob([lyricsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadata.title || loadedSong?.title || 'lyrics'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
    showToast('Lyrics exported successfully', 'success');
  };

  // Reset to original lyrics
  const handleResetLyrics = () => {
    if (!confirm('Reset all changes to original lyrics?')) return;

    setLyricsData(JSON.parse(JSON.stringify(originalLyricsData)));
    setHasChanges(false);
    showToast('Reset to original lyrics', 'success');
  };

  // Handle rejection acceptance
  const handleAcceptRejection = (rejectionIndex) => {
    const rejection = rejections[rejectionIndex];
    if (!rejection) return;

    // Find the lyric line to update by matching timing
    let targetLineIndex = -1;

    for (let i = 0; i < lyricsData.length; i++) {
      const line = lyricsData[i];
      const lineStart = line.start || line.startTimeSec || 0;
      const lineEnd = line.end || line.endTimeSec || 0;

      // Match by timing
      if (rejection.start_time !== undefined && rejection.end_time !== undefined) {
        if (
          Math.abs(lineStart - rejection.start_time) < 0.1 &&
          Math.abs(lineEnd - rejection.end_time) < 0.1
        ) {
          targetLineIndex = i;
          break;
        }
      } else if (rejection.old_text && line.text === rejection.old_text) {
        // Fallback: match by old text content
        targetLineIndex = i;
        break;
      }
    }

    // If no timing match found, fallback to line number approach
    if (targetLineIndex === -1) {
      const lineIndex = rejection.line_num - 1;
      if (lineIndex >= 0 && lineIndex < lyricsData.length) {
        targetLineIndex = lineIndex;
      }
    }

    if (targetLineIndex >= 0 && targetLineIndex < lyricsData.length) {
      // Update the lyric text with the proposed text
      const updatedLine = { ...lyricsData[targetLineIndex], text: rejection.new_text };
      setLyricsData((prev) => prev.map((line, i) => (i === targetLineIndex ? updatedLine : line)));

      // Remove the rejection from the list
      setRejections((prev) => prev.filter((_, i) => i !== rejectionIndex));
      setHasChanges(true);
      showToast('Accepted proposed text', 'success');
    } else {
      showToast('Could not find matching lyric line', 'error');
    }
  };

  // Handle rejection deletion
  const handleDeleteRejection = (rejectionIndex) => {
    setRejections((prev) => prev.filter((_, i) => i !== rejectionIndex));
    setHasChanges(true);
  };

  // Handle suggestion acceptance
  const handleAcceptSuggestion = (suggestionIndex) => {
    const suggestion = suggestions[suggestionIndex];
    if (!suggestion) return;

    // Find the best insertion point based on timing
    let insertionIndex = lyricsData.length; // Default to end

    for (let i = 0; i < lyricsData.length; i++) {
      const line = lyricsData[i];
      const lineStart = line.start || line.startTimeSec || 0;

      if (suggestion.start_time < lineStart) {
        insertionIndex = i;
        break;
      }
    }

    // Create new lyric line from suggestion
    const newLine = {
      start: suggestion.start_time,
      startTimeSec: suggestion.start_time,
      end: suggestion.end_time,
      endTimeSec: suggestion.end_time,
      text: suggestion.suggested_text,
    };

    // Insert the new line at the correct position
    setLyricsData((prev) => [
      ...prev.slice(0, insertionIndex),
      newLine,
      ...prev.slice(insertionIndex),
    ]);

    // Remove the suggestion from the list
    setSuggestions((prev) => prev.filter((_, i) => i !== suggestionIndex));
    setHasChanges(true);
    showToast('Added suggested line', 'success');
  };

  // Handle suggestion deletion
  const handleDeleteSuggestion = (suggestionIndex) => {
    setSuggestions((prev) => prev.filter((_, i) => i !== suggestionIndex));
    setHasChanges(true);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-gray-900 p-4">
      {!loadedSong ? (
        // Search view
        <div className="flex flex-col gap-6 max-w-[800px] mx-auto w-full">
          <div className="relative flex items-center">
            <input
              type="text"
              className="w-full px-5 py-4 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-base transition-colors focus:outline-none focus:border-blue-600"
              placeholder="Search by title, artist, or album..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {isSearching && <span className="absolute right-5 text-xl animate-spin">🔍</span>}

            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 max-h-[400px] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-[100] mt-1">
                {searchResults.map((song, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleLoadSong(song)}
                  >
                    <span className="text-xl flex-shrink-0">{getFormatIcon(song.format)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold text-gray-900 dark:text-white mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                        {song.title}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis">
                        {song.artist} {song.album && `• ${song.album}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {searchTerm && !isSearching && searchResults.length === 0 && (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <div className="text-6xl mb-4 opacity-50">🔍</div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                No songs found
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Try a different search term
              </div>
            </div>
          )}

          {!searchTerm && (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <div className="text-6xl mb-4 opacity-50">🎵</div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Search for a song to get started
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                You can edit metadata and lyrics for any song in your library
              </div>
            </div>
          )}
        </div>
      ) : (
        // Edit view
        <div className="flex flex-col gap-3 h-full overflow-hidden">
          <div className="flex items-center justify-between gap-4 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold m-0 text-gray-900 dark:text-white whitespace-nowrap overflow-hidden text-ellipsis">
                {loadedSong.title}
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 m-0 mt-0.5">
                {loadedSong.artist} • {songData.format?.toUpperCase()}
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={handleAddToQueue}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white cursor-pointer text-sm transition-colors hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <span className="material-icons text-lg">playlist_add</span>
                Add to Queue
              </button>
              <button
                onClick={handleClose}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white cursor-pointer text-sm transition-colors hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <span className="material-icons text-lg">close</span>
                Close
              </button>
              <button
                onClick={handleSave}
                className={`flex items-center gap-1.5 px-3 py-2 rounded text-white cursor-pointer text-sm transition-colors ${hasChanges ? 'bg-blue-600 border-blue-600 hover:bg-blue-700' : 'bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
                disabled={isSaving}
              >
                <span className="material-icons text-lg">save</span>
                {isSaving ? 'Saving...' : hasChanges ? 'Save*' : 'Save'}
              </button>
            </div>
          </div>

          {/* Tab navigation for KAI and M4A files */}
          {(songData.format === 'kai' || songData.format === 'm4a-stems') && (
            <div className="flex gap-1 border-b-2 border-gray-200 dark:border-gray-700 pb-0">
              <button
                className={`px-6 py-3 bg-transparent border-none border-b-[3px] font-semibold text-[15px] cursor-pointer transition-all -mb-0.5 ${activeTab === 'lyrics' ? 'text-blue-600 border-b-blue-600' : 'text-gray-600 dark:text-gray-400 border-b-transparent hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                onClick={() => setActiveTab('lyrics')}
              >
                Lyrics
              </button>
              <button
                className={`px-6 py-3 bg-transparent border-none border-b-[3px] font-semibold text-[15px] cursor-pointer transition-all -mb-0.5 ${activeTab === 'metadata' ? 'text-blue-600 border-b-blue-600' : 'text-gray-600 dark:text-gray-400 border-b-transparent hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                onClick={() => setActiveTab('metadata')}
              >
                Metadata
              </button>
            </div>
          )}

          {/* Metadata form */}
          {(activeTab === 'metadata' ||
            (songData.format !== 'kai' && songData.format !== 'm4a-stems')) && (
            <div className="flex flex-col gap-6 overflow-y-auto flex-1 pb-6">
              <h3 className="text-lg font-semibold m-0 text-gray-900 dark:text-white">Metadata</h3>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-5">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    Title
                  </label>
                  <input
                    type="text"
                    className="px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white text-[15px] transition-colors focus:outline-none focus:border-blue-600"
                    value={metadata.title}
                    onChange={(e) => handleMetadataChange('title', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    Artist
                  </label>
                  <input
                    type="text"
                    className="px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white text-[15px] transition-colors focus:outline-none focus:border-blue-600"
                    value={metadata.artist}
                    onChange={(e) => handleMetadataChange('artist', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    Album
                  </label>
                  <input
                    type="text"
                    className="px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white text-[15px] transition-colors focus:outline-none focus:border-blue-600"
                    value={metadata.album}
                    onChange={(e) => handleMetadataChange('album', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    Year
                  </label>
                  <input
                    type="text"
                    className="px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white text-[15px] transition-colors focus:outline-none focus:border-blue-600"
                    value={metadata.year}
                    onChange={(e) => handleMetadataChange('year', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    Genre
                  </label>
                  <input
                    type="text"
                    className="px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white text-[15px] transition-colors focus:outline-none focus:border-blue-600"
                    value={metadata.genre}
                    onChange={(e) => handleMetadataChange('genre', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    Key
                  </label>
                  <input
                    type="text"
                    className="px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white text-[15px] transition-colors focus:outline-none focus:border-blue-600"
                    value={metadata.key}
                    onChange={(e) => handleMetadataChange('key', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Lyrics editor for KAI and M4A files */}
          {(songData.format === 'kai' || songData.format === 'm4a-stems') &&
            activeTab === 'lyrics' && (
              <>
                {/* Waveform canvas */}
                <LyricsEditorCanvas
                  lyricsData={lyricsData}
                  selectedLineIndex={selectedLineIndex}
                  onLineSelect={setSelectedLineIndex}
                  vocalsWaveform={vocalsWaveform}
                  songDuration={songDuration}
                  currentPosition={currentPosition}
                  isPlaying={isPlaying}
                />

                {/* Line detail canvas - zoomed view of selected line */}
                <LineDetailCanvas
                  selectedLine={selectedLineIndex !== null ? lyricsData[selectedLineIndex] : null}
                  vocalsWaveform={vocalsWaveform}
                  songDuration={songDuration}
                  currentPosition={currentPosition}
                  isPlaying={isPlaying}
                />

                {/* Audio playback controls */}
                {audioElements.length > 0 && (
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded flex-shrink-0">
                    <button
                      onClick={togglePlayback}
                      className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 border-blue-600 rounded text-white cursor-pointer text-xs transition-colors hover:bg-blue-700"
                    >
                      <span className="material-icons text-base">
                        {isPlaying ? 'pause' : 'play_arrow'}
                      </span>
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>
                    <div className="flex gap-1.5 flex-wrap flex-1 items-center">
                      {audioElements.map((el, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
                        >
                          <span className="text-[11px] font-semibold text-gray-900 dark:text-white min-w-[45px]">
                            {el.name}
                          </span>
                          <button
                            onClick={() => toggleMute(index)}
                            className={`flex items-center justify-center w-6 h-6 p-0.5 rounded cursor-pointer transition-colors ${el.muted ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'}`}
                            title={el.muted ? 'Unmute' : 'Mute'}
                          >
                            <span className="material-icons text-sm">
                              {el.muted ? 'volume_off' : 'volume_up'}
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleExportLyrics}
                      className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white cursor-pointer text-xs transition-colors hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!lyricsData || lyricsData.length === 0}
                      title="Export lyrics as text file"
                    >
                      <span className="material-icons text-base">download</span>
                      Export
                    </button>
                    <button
                      onClick={handleResetLyrics}
                      className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white cursor-pointer text-xs transition-colors hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!hasChanges}
                      title="Reset to original lyrics"
                    >
                      <span className="material-icons text-base">restore</span>
                      Reset
                    </button>
                    <button
                      onClick={handleAddLineAtStart}
                      className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white cursor-pointer text-xs transition-colors hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!canAddLineAtStart()}
                      title={
                        canAddLineAtStart()
                          ? 'Add line at beginning'
                          : 'Not enough space (need 0.6s gap)'
                      }
                    >
                      <span className="material-icons text-base">add</span>
                      Add First Line
                    </button>
                  </div>
                )}

                {/* Scrollable container for lyrics and corrections */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
                  {/* Lyrics lines */}
                  <div className="flex flex-col gap-0 p-3 overflow-y-auto flex-1">
                    {lyricsData && lyricsData.length > 0 ? (
                      lyricsData.map((line, index) => (
                        <LyricLine
                          key={`lyric-${index}`}
                          line={line}
                          index={index}
                          isSelected={selectedLineIndex === index}
                          onSelect={setSelectedLineIndex}
                          onUpdate={handleLineUpdate}
                          onDelete={handleLineDelete}
                          onAddAfter={handleAddLineAfter}
                          onSplit={handleLineSplit}
                          onPlaySection={handlePlayLineSection}
                          canAddAfter={canAddLineAfter(index)}
                          canSplit={canSplit(index)}
                          hasOverlap={checkOverlap(index)}
                        />
                      ))
                    ) : (
                      <div className="text-center p-10 text-gray-500 dark:text-gray-400 text-base">
                        No lyrics available. Load a KAI file with lyrics to edit.
                      </div>
                    )}
                  </div>

                  {/* AI Corrections Section */}
                  {(rejections.length > 0 || suggestions.length > 0) && (
                    <div className="mb-6 p-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md">
                      <h3 className="text-base font-semibold m-0 mb-4 text-gray-900 dark:text-white">
                        AI Corrections & Suggestions
                      </h3>

                      {rejections.map((rejection, rejectionIndex) => (
                        <LyricRejection
                          key={`rejection-${rejectionIndex}`}
                          rejection={rejection}
                          rejectionIndex={rejectionIndex}
                          onAccept={handleAcceptRejection}
                          onDelete={handleDeleteRejection}
                        />
                      ))}

                      {suggestions.map((suggestion, suggestionIndex) => (
                        <LyricSuggestion
                          key={`suggestion-${suggestionIndex}`}
                          suggestion={suggestion}
                          suggestionIndex={suggestionIndex}
                          onAccept={handleAcceptSuggestion}
                          onDelete={handleDeleteSuggestion}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
        </div>
      )}

      {/* Toast notification */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

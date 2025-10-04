/**
 * SongEditor - Comprehensive song metadata and lyrics editor
 *
 * Features:
 * - Search and load any song from library
 * - Edit ID3 metadata for CDG+MP3 files
 * - Edit ID3 metadata + lyrics for KAI files
 * - Auto-detects file format and shows appropriate editing options
 * - Supports both Electron (IPC) and Web (REST) environments
 */

import { useState, useEffect, useRef } from 'react';
import './SongEditor.css';
import { getFormatIcon } from '../formatUtils.js';
import { LyricsEditorCanvas } from './LyricsEditorCanvas.jsx';
import { LineDetailCanvas } from './LineDetailCanvas.jsx';
import { LyricLine } from './LyricLine.jsx';
import { Toast } from './Toast.jsx';
import { LyricRejection } from './LyricRejection.jsx';
import { LyricSuggestion } from './LyricSuggestion.jsx';

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
  }, [activeTab, lyricsData, selectedLineIndex, audioElements]);

  // Navigate to previous enabled line
  const selectPreviousEnabledLine = () => {
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
  };

  // Navigate to next enabled line
  const selectNextEnabledLine = () => {
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
  };

  // Play currently selected line
  const playCurrentLine = () => {
    if (selectedLineIndex === null || !lyricsData[selectedLineIndex]) {
      return;
    }

    const line = lyricsData[selectedLineIndex];
    const startTime = line.start || line.startTimeSec || 0;
    const endTime = line.end || line.endTimeSec || (startTime + 3);
    handlePlayLineSection(startTime, endTime);
  };

  // Adjust start time of selected line
  const adjustStartTime = (delta) => {
    if (selectedLineIndex === null || !lyricsData[selectedLineIndex]) {
      return;
    }

    const line = lyricsData[selectedLineIndex];
    const currentStart = line.start || line.startTimeSec || 0;
    const newStart = Math.max(0, currentStart + delta); // Don't go below 0

    const updatedLine = {
      ...line,
      start: newStart,
      startTimeSec: newStart
    };

    handleLineUpdate(selectedLineIndex, updatedLine);
  };

  // Adjust end time of selected line
  const adjustEndTime = (delta) => {
    if (selectedLineIndex === null || !lyricsData[selectedLineIndex]) {
      return;
    }

    const line = lyricsData[selectedLineIndex];
    const currentEnd = line.end || line.endTimeSec || 0;
    const newEnd = Math.max(0, currentEnd + delta); // Don't go below 0

    const updatedLine = {
      ...line,
      end: newEnd,
      endTimeSec: newEnd
    };

    handleLineUpdate(selectedLineIndex, updatedLine);
  };

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

        // Populate lyrics if KAI file - server sends actual array with timing
        if (result.data.format === 'kai') {
          const lyrics = result.data.lyrics || [];
          // Sort lyrics by start time to ensure proper order
          const sortedLyrics = [...lyrics].sort((a, b) => {
            const aStart = a.start || a.startTimeSec || 0;
            const bStart = b.start || b.startTimeSec || 0;
            return aStart - bStart;
          });
          setLyricsData(JSON.parse(JSON.stringify(sortedLyrics)));
          setOriginalLyricsData(JSON.parse(JSON.stringify(sortedLyrics)));
          setSongDuration(result.data.metadata?.duration || result.data.songJson?.duration_sec || 0);

          // Load AI corrections if available
          const kaiRejections = result.data.songJson?.meta?.corrections?.rejected || [];
          setRejections(kaiRejections.map(rejection => ({
            line_num: rejection.line,
            start_time: rejection.start,
            end_time: rejection.end,
            old_text: rejection.old,
            new_text: rejection.new,
            reason: rejection.reason,
            retention_rate: rejection.word_retention,
            min_required: 0.5
          })));

          const kaiSuggestions = result.data.songJson?.meta?.corrections?.missing_lines_suggested || [];
          setSuggestions(kaiSuggestions.map(suggestion => ({
            suggested_text: suggestion.suggested_text,
            start_time: suggestion.start,
            end_time: suggestion.end,
            confidence: suggestion.confidence,
            reason: suggestion.reason,
            pitch_activity: suggestion.pitch_activity
          })));

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

        // Default to lyrics tab for KAI files, metadata for others
        setActiveTab(result.data.format === 'kai' ? 'lyrics' : 'metadata');

        // Load audio if KAI file
        if (result.data.format === 'kai' && result.data.audioFiles) {
          loadAudioFiles(result.data.audioFiles);
        }
      }
    } catch (error) {
      console.error('Failed to load song:', error);
    }
  };

  // Load audio files for KAI songs
  const loadAudioFiles = async (audioFiles) => {
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
          audioData: file.audioData // Keep reference to raw audio data (Electron only)
        };
      });

      setAudioElements(elements);
      console.log(`🎵 Loaded ${elements.length} audio sources for playback`);

      // Find vocals track and analyze waveform
      const vocalsFile = audioFiles.find(file =>
        file.name.toLowerCase().includes('vocal')
      );
      const vocalsElement = elements.find(el =>
        el.name.toLowerCase().includes('vocal')
      );

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
          arrayBuffer = rawAudioData.buffer.slice(rawAudioData.byteOffset, rawAudioData.byteOffset + rawAudioData.byteLength);
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

  // Cleanup audio on unmount or song change
  const cleanupAudio = () => {
    // Stop and cleanup existing audio
    audioElements.forEach(({ audio, source }) => {
      audio.pause();
      audio.currentTime = 0;
      try {
        source.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    });

    if (audioContext) {
      audioContext.close();
    }

    setAudioElements([]);
    setAudioContext(null);
    setIsPlaying(false);
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
    setAudioElements(prev => prev.map((el, i) => {
      if (i === index) {
        const newMuted = !el.muted;
        el.gainNode.gain.value = newMuted ? 0 : 1;
        return { ...el, muted: newMuted };
      }
      return el;
    }));
  };

  // Cleanup on component unmount
  useEffect(() => {
    return () => cleanupAudio();
  }, []);

  // Show toast notification
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  // Lyrics editing handlers
  const handleLineUpdate = (index, updatedLine) => {
    setLyricsData(prev => prev.map((line, i) => i === index ? updatedLine : line));
    setHasChanges(true);
  };

  const handleLineDelete = (index) => {
    setLyricsData(prev => prev.filter((_, i) => i !== index));
    setSelectedLineIndex(null);
    setHasChanges(true);
  };

  const handleAddLineAfter = (index) => {
    const currentLine = lyricsData[index];
    const nextLine = lyricsData[index + 1];

    const currentEndTime = currentLine.end || currentLine.endTimeSec || 0;
    const nextStartTime = nextLine ? (nextLine.start || nextLine.startTimeSec || currentEndTime + 3) : currentEndTime + 3;

    const gap = nextStartTime - currentEndTime;
    const usableGap = gap * 0.8;
    const margin = gap * 0.1;

    const newLine = {
      start: currentEndTime + margin,
      startTimeSec: currentEndTime + margin,
      end: currentEndTime + margin + usableGap,
      endTimeSec: currentEndTime + margin + usableGap,
      text: ''
    };

    setLyricsData(prev => [
      ...prev.slice(0, index + 1),
      newLine,
      ...prev.slice(index + 1)
    ]);
    setHasChanges(true);
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
        text: ''
      };
      setLyricsData([newLine]);
      setHasChanges(true);
      return;
    }

    const firstLineStart = firstLine.start || firstLine.startTimeSec || 0;

    // Create a line from 0 to 80% of available space
    const gap = firstLineStart;
    const usableGap = gap * 0.8;
    const margin = gap * 0.1;

    const newLine = {
      start: 0,
      startTimeSec: 0,
      end: usableGap,
      endTimeSec: usableGap,
      text: ''
    };

    setLyricsData(prev => [newLine, ...prev]);
    setHasChanges(true);
  };

  const canAddLineAtStart = () => {
    const firstLine = lyricsData[0];
    if (!firstLine) return true;
    const firstLineStart = firstLine.start || firstLine.startTimeSec || 0;
    return firstLineStart >= 0.6;
  };

  const handlePlayLineSection = async (startTime, endTime) => {
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
        type: 'error'
      });
      return;
    }

    // Set end time after position has been set
    // Use a small timeout to ensure currentTime has updated
    setTimeout(() => {
      setPlayingLineEndTime(endTime);
    }, 50);
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

  // Handle metadata field changes
  const handleMetadataChange = (field, value) => {
    setMetadata(prev => ({
      ...prev,
      [field]: value
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
          suggestions
        },
        ...(songData.format === 'kai' && { lyrics: sortedLyrics })
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

    const lyricsText = lyricsData.map(line => line.text || '').join('\n');
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
        if (Math.abs(lineStart - rejection.start_time) < 0.1 &&
            Math.abs(lineEnd - rejection.end_time) < 0.1) {
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
      setLyricsData(prev => prev.map((line, i) => i === targetLineIndex ? updatedLine : line));

      // Remove the rejection from the list
      setRejections(prev => prev.filter((_, i) => i !== rejectionIndex));
      setHasChanges(true);
      showToast('Accepted proposed text', 'success');
    } else {
      showToast('Could not find matching lyric line', 'error');
    }
  };

  // Handle rejection deletion
  const handleDeleteRejection = (rejectionIndex) => {
    setRejections(prev => prev.filter((_, i) => i !== rejectionIndex));
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
      text: suggestion.suggested_text
    };

    // Insert the new line at the correct position
    setLyricsData(prev => [
      ...prev.slice(0, insertionIndex),
      newLine,
      ...prev.slice(insertionIndex)
    ]);

    // Remove the suggestion from the list
    setSuggestions(prev => prev.filter((_, i) => i !== suggestionIndex));
    setHasChanges(true);
    showToast('Added suggested line', 'success');
  };

  // Handle suggestion deletion
  const handleDeleteSuggestion = (suggestionIndex) => {
    setSuggestions(prev => prev.filter((_, i) => i !== suggestionIndex));
    setHasChanges(true);
  };

  return (
    <div className="song-editor">
      {!loadedSong ? (
        // Search view
        <div className="editor-search-view">
          <div className="editor-search-bar">
            <input
              type="text"
              placeholder="Search by title, artist, or album..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="editor-search-input"
            />
            {isSearching && <span className="editor-search-spinner">🔍</span>}

            {searchResults.length > 0 && (
              <div className="editor-search-dropdown">
                {searchResults.map((song, index) => (
                  <div
                    key={index}
                    className="search-dropdown-item"
                    onClick={() => handleLoadSong(song)}
                  >
                    <span className="search-format-icon">{getFormatIcon(song.format)}</span>
                    <div className="search-dropdown-info">
                      <div className="search-dropdown-title">{song.title}</div>
                      <div className="search-dropdown-meta">
                        {song.artist} {song.album && `• ${song.album}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {searchTerm && !isSearching && searchResults.length === 0 && (
            <div className="editor-empty-state">
              <div className="empty-icon">🔍</div>
              <div className="empty-message">No songs found</div>
              <div className="empty-detail">Try a different search term</div>
            </div>
          )}

          {!searchTerm && (
            <div className="editor-empty-state">
              <div className="empty-icon">🎵</div>
              <div className="empty-message">Search for a song to get started</div>
              <div className="empty-detail">You can edit metadata and lyrics for any song in your library</div>
            </div>
          )}
        </div>
      ) : (
        // Edit view
        <div className="editor-edit-view">
          <div className="editor-header">
            <div className="editor-title-section">
              <h2>{loadedSong.title}</h2>
              <p className="editor-subtitle">
                {loadedSong.artist} • {songData.format?.toUpperCase()}
              </p>
            </div>
            <div className="editor-actions">
              <button onClick={handleAddToQueue} className="btn btn-secondary">
                <span className="material-icons">playlist_add</span>
                Add to Queue
              </button>
              <button onClick={handleClose} className="btn btn-secondary">
                <span className="material-icons">close</span>
                Close
              </button>
              <button
                onClick={handleSave}
                className="btn btn-primary"
                disabled={isSaving}
                style={hasChanges ? { background: '#007acc' } : {}}
              >
                <span className="material-icons">save</span>
                {isSaving ? 'Saving...' : hasChanges ? 'Save*' : 'Save'}
              </button>
            </div>
          </div>

          {/* Tab navigation for KAI files */}
          {songData.format === 'kai' && (
            <div className="editor-tabs">
              <button
                className={`editor-tab ${activeTab === 'lyrics' ? 'active' : ''}`}
                onClick={() => setActiveTab('lyrics')}
              >
                Lyrics
              </button>
              <button
                className={`editor-tab ${activeTab === 'metadata' ? 'active' : ''}`}
                onClick={() => setActiveTab('metadata')}
              >
                Metadata
              </button>
            </div>
          )}

          {/* Metadata form */}
          {(activeTab === 'metadata' || songData.format !== 'kai') && (
            <div className="editor-form">
              <h3>Metadata</h3>
              <div className="form-grid">
                <div className="form-field">
                  <label>Title</label>
                  <input
                    type="text"
                    value={metadata.title}
                    onChange={(e) => handleMetadataChange('title', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Artist</label>
                  <input
                    type="text"
                    value={metadata.artist}
                    onChange={(e) => handleMetadataChange('artist', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Album</label>
                  <input
                    type="text"
                    value={metadata.album}
                    onChange={(e) => handleMetadataChange('album', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Year</label>
                  <input
                    type="text"
                    value={metadata.year}
                    onChange={(e) => handleMetadataChange('year', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Genre</label>
                  <input
                    type="text"
                    value={metadata.genre}
                    onChange={(e) => handleMetadataChange('genre', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Key</label>
                  <input
                    type="text"
                    value={metadata.key}
                    onChange={(e) => handleMetadataChange('key', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Lyrics editor for KAI files */}
          {songData.format === 'kai' && activeTab === 'lyrics' && (
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
                <div className="audio-playback-controls">
                  <button onClick={togglePlayback} className="btn btn-primary">
                    <span className="material-icons">{isPlaying ? 'pause' : 'play_arrow'}</span>
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <div className="audio-mixer">
                    {audioElements.map((el, index) => (
                      <div key={index} className="mixer-channel">
                        <span className="channel-name">{el.name}</span>
                        <button
                          onClick={() => toggleMute(index)}
                          className={`btn btn-sm ${el.muted ? 'btn-danger' : 'btn-success'}`}
                        >
                          <span className="material-icons">{el.muted ? 'volume_off' : 'volume_up'}</span>
                          {el.muted ? 'Muted' : 'On'}
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleExportLyrics}
                    className="btn btn-secondary"
                    disabled={!lyricsData || lyricsData.length === 0}
                    title="Export lyrics as text file"
                  >
                    <span className="material-icons">download</span>
                    Export
                  </button>
                  <button
                    onClick={handleResetLyrics}
                    className="btn btn-secondary"
                    disabled={!hasChanges}
                    title="Reset to original lyrics"
                  >
                    <span className="material-icons">restore</span>
                    Reset
                  </button>
                  <button
                    onClick={handleAddLineAtStart}
                    className="btn"
                    disabled={!canAddLineAtStart()}
                    title={canAddLineAtStart() ? "Add line at beginning" : "Not enough space (need 0.6s gap)"}
                  >
                    <span className="material-icons">add</span>
                    Add First Line
                  </button>
                </div>
              )}

              {/* Scrollable container for lyrics and corrections */}
              <div className="lyrics-editor-scroll-container">
                {/* Lyrics lines */}
                <div className="lyrics-lines">
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
                        onPlaySection={handlePlayLineSection}
                        canAddAfter={canAddLineAfter(index)}
                      />
                    ))
                  ) : (
                    <div className="no-lyrics-message">
                      No lyrics available. Load a KAI file with lyrics to edit.
                    </div>
                  )}
                </div>

                {/* AI Corrections Section */}
                {(rejections.length > 0 || suggestions.length > 0) && (
                  <div className="ai-corrections-section">
                    <h3>AI Corrections & Suggestions</h3>

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
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

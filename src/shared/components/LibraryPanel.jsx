/**
 * LibraryPanel - Full library browser with alphabet filtering and pagination
 *
 * Features:
 * - Alphabet navigation (A-Z, #)
 * - Pagination (100 songs per page)
 * - Search functionality
 * - Table view with sorting
 * - Add to queue / Load song actions
 */

import { useState, useEffect, useCallback } from 'react';
import { getFormatIcon, formatDuration } from '../formatUtils.js';

function SongInfoModal({ song, onClose }) {
  if (!song) return null;

  console.log('🎵 SongInfoModal rendering for:', song.title);

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000]"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 dark:bg-gray-900 border border-gray-600 dark:border-gray-700 rounded-lg w-[90%] max-w-[500px] max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-700 dark:border-gray-800">
          <h2 className="m-0 text-lg font-semibold text-white">Song Information</h2>
          <button
            className="bg-none border-none text-white text-[32px] leading-none cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-colors hover:bg-gray-700 dark:hover:bg-gray-800"
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          <div className="space-y-0">
            <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 border-b border-gray-700/50 dark:border-gray-800/50">
              <span className="font-semibold text-gray-300 dark:text-gray-400">Title:</span>
              <span className="text-white">{song.title}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 border-b border-gray-700/50 dark:border-gray-800/50">
              <span className="font-semibold text-gray-300 dark:text-gray-400">Artist:</span>
              <span className="text-white">{song.artist}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 border-b border-gray-700/50 dark:border-gray-800/50">
              <span className="font-semibold text-gray-300 dark:text-gray-400">Album:</span>
              <span className="text-white">{song.album || 'N/A'}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 border-b border-gray-700/50 dark:border-gray-800/50">
              <span className="font-semibold text-gray-300 dark:text-gray-400">Genre:</span>
              <span className="text-white">{song.genre || 'N/A'}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 border-b border-gray-700/50 dark:border-gray-800/50">
              <span className="font-semibold text-gray-300 dark:text-gray-400">Key:</span>
              <span className="text-white">{song.key || 'N/A'}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 border-b border-gray-700/50 dark:border-gray-800/50">
              <span className="font-semibold text-gray-300 dark:text-gray-400">Year:</span>
              <span className="text-white">{song.year || 'N/A'}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 border-b border-gray-700/50 dark:border-gray-800/50">
              <span className="font-semibold text-gray-300 dark:text-gray-400">Duration:</span>
              <span className="text-white">{formatDuration(song.duration)}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 border-b border-gray-700/50 dark:border-gray-800/50">
              <span className="font-semibold text-gray-300 dark:text-gray-400">Format:</span>
              <span className="text-white">{song.format || 'N/A'}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5">
              <span className="font-semibold text-gray-300 dark:text-gray-400">Path:</span>
              <span className="text-white break-all text-[11px]">{song.path}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LibraryPanel({ bridge, showSetFolder = false, showFullRefresh = false }) {
  const [songs, setSongs] = useState([]);
  const [filteredSongs, setFilteredSongs] = useState([]);
  const [currentLetter, setCurrentLetter] = useState(null);
  const [availableLetters, setAvailableLetters] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [songsFolder, setSongsFolder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalSong, setModalSong] = useState(null);
  const [scanProgress, setScanProgress] = useState(null); // { current, total }

  const pageSize = 100;

  // Wrap functions in useCallback to stabilize references for useEffect dependencies
  const loadLetterPage = useCallback((letter, page, songsList) => {
    setCurrentLetter(letter);
    setCurrentPage(page);
    setSearchTerm('');

    // Filter songs by first letter of artist
    const letterSongs = songsList.filter((song) => {
      const artist = song.artist || song.title || song.name;
      if (!artist) return false;

      const firstChar = artist.trim()[0].toUpperCase();
      if (letter === '#') {
        return !/[A-Z]/.test(firstChar);
      }
      return firstChar === letter;
    });

    // Sort and paginate
    const sortedSongs = letterSongs.sort((a, b) => {
      const artistA = (a.artist || a.title || '').toLowerCase();
      const artistB = (b.artist || b.title || '').toLowerCase();
      return artistA.localeCompare(artistB);
    });

    setFilteredSongs(sortedSongs);
  }, []);

  const calculateAvailableLetters = useCallback(
    (songsList, shouldAutoSelect = true) => {
      const letterSet = new Set();

      songsList.forEach((song) => {
        const artist = song.artist || song.title || song.name;
        if (artist) {
          const firstChar = artist.trim()[0].toUpperCase();
          if (/[A-Z]/.test(firstChar)) {
            letterSet.add(firstChar);
          } else {
            letterSet.add('#');
          }
        }
      });

      let letters = Array.from(letterSet).sort();
      // Put '#' at the end
      if (letters.includes('#')) {
        letters = letters.filter((l) => l !== '#');
        letters.push('#');
      }

      setAvailableLetters(letters);

      // Auto-select first letter if requested and songs exist
      if (shouldAutoSelect && letters.length > 0) {
        const firstLetter = letters.includes('A') ? 'A' : letters[0];
        loadLetterPage(firstLetter, 1, songsList);
      }
    },
    [loadLetterPage]
  );

  const loadLibrary = useCallback(async () => {
    try {
      setLoading(true);
      const folder = await bridge.getSongsFolder();
      console.log('📁 Songs folder:', folder);
      setSongsFolder(folder);

      if (folder) {
        const result = await bridge.getCachedLibrary();
        console.log('📚 Cached library result:', result);
        const librarySongs = result.files || [];
        console.log('🎵 Library songs count:', librarySongs.length);
        setSongs(librarySongs);
        calculateAvailableLetters(librarySongs); // This will auto-select first letter
      } else {
        console.log('❌ No songs folder set');
      }
    } catch (error) {
      console.error('Failed to load library:', error);
    } finally {
      setLoading(false);
    }
  }, [bridge, calculateAvailableLetters]);

  // Listen for scan progress events (Electron renderer only)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.kaiAPI?.events) {
      const handleScanProgress = (event, data) => {
        setScanProgress({ current: data.current, total: data.total });
      };

      const handleScanComplete = (event, data) => {
        console.log(`📚 Background scan complete: ${data.count} songs`);
        setScanProgress(null);
        loadLibrary(); // Reload library with new scanned songs
      };

      const handleFolderSet = (event, folder) => {
        console.log(`📁 Songs folder updated: ${folder}`);
        setSongsFolder(folder);
        loadLibrary(); // Reload library with new folder
      };

      const handleSongUpdated = (event, data) => {
        console.log(`🎵 Song updated: ${data.path}`);
        // Update the song in the songs list
        setSongs((prevSongs) => {
          const songIndex = prevSongs.findIndex((s) => s.path === data.path);
          if (songIndex !== -1) {
            const updatedSongs = [...prevSongs];
            updatedSongs[songIndex] = { ...updatedSongs[songIndex], ...data.metadata };
            return updatedSongs;
          }
          return prevSongs;
        });

        // Update filtered songs if they're currently displayed
        setFilteredSongs((prevFiltered) => {
          const songIndex = prevFiltered.findIndex((s) => s.path === data.path);
          if (songIndex !== -1) {
            const updatedFiltered = [...prevFiltered];
            updatedFiltered[songIndex] = { ...updatedFiltered[songIndex], ...data.metadata };
            return updatedFiltered;
          }
          return prevFiltered;
        });
      };

      window.kaiAPI.events.on('library:scanProgress', handleScanProgress);
      window.kaiAPI.events.on('library:scanComplete', handleScanComplete);
      window.kaiAPI.events.on('library:folderSet', handleFolderSet);
      window.kaiAPI.events.on('library:songUpdated', handleSongUpdated);

      return () => {
        window.kaiAPI.events.removeListener('library:scanProgress', handleScanProgress);
        window.kaiAPI.events.removeListener('library:scanComplete', handleScanComplete);
        window.kaiAPI.events.removeListener('library:folderSet', handleFolderSet);
        window.kaiAPI.events.removeListener('library:songUpdated', handleSongUpdated);
      };
    }
  }, [loadLibrary]);

  // Listen for library updates from socket (Web admin only)
  useEffect(() => {
    if (bridge?.socket) {
      const handleLibraryRefreshed = (data) => {
        console.log(`📚 Library refreshed from remote: ${data.count} songs`);
        loadLibrary(); // Reload library
      };

      const handleSongUpdated = (data) => {
        console.log(`🎵 Song updated: ${data.path}`);
        // Update the song in the songs list
        setSongs((prevSongs) => {
          const songIndex = prevSongs.findIndex((s) => s.path === data.path);
          if (songIndex !== -1) {
            const updatedSongs = [...prevSongs];
            updatedSongs[songIndex] = { ...updatedSongs[songIndex], ...data.metadata };
            return updatedSongs;
          }
          return prevSongs;
        });

        // Update filtered songs if they're currently displayed
        setFilteredSongs((prevFiltered) => {
          const songIndex = prevFiltered.findIndex((s) => s.path === data.path);
          if (songIndex !== -1) {
            const updatedFiltered = [...prevFiltered];
            updatedFiltered[songIndex] = { ...updatedFiltered[songIndex], ...data.metadata };
            return updatedFiltered;
          }
          return prevFiltered;
        });
      };

      bridge.socket.on('library-refreshed', handleLibraryRefreshed);
      bridge.socket.on('library:songUpdated', handleSongUpdated);

      return () => {
        bridge.socket.off('library-refreshed', handleLibraryRefreshed);
        bridge.socket.off('library:songUpdated', handleSongUpdated);
      };
    }
  }, [bridge, loadLibrary]);

  // Load library on mount
  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const handleSearch = (term) => {
    setSearchTerm(term);
    setCurrentLetter(null);
    setCurrentPage(1);

    if (!term.trim()) {
      setFilteredSongs([]);
      return;
    }

    const searchLower = term.toLowerCase();
    const results = songs.filter((song) => {
      return (
        (song.title || '').toLowerCase().includes(searchLower) ||
        (song.artist || '').toLowerCase().includes(searchLower) ||
        (song.album || '').toLowerCase().includes(searchLower)
      );
    });

    setFilteredSongs(results);
  };

  const handleSetFolder = async () => {
    try {
      const folder = await bridge.setSongsFolder();
      if (folder) {
        setSongsFolder(folder);
        await loadLibrary();
      }
    } catch (error) {
      console.error('Failed to set folder:', error);
    }
  };

  const handleSync = async () => {
    if (!songsFolder) return;

    try {
      setLoading(true);
      await bridge.syncLibrary();
      await loadLibrary();
    } catch (error) {
      console.error('Failed to sync:', error);
    } finally {
      setLoading(false);
      setScanProgress(null); // Clear progress when done
    }
  };

  const handleRefresh = async () => {
    if (!songsFolder) return;

    try {
      setLoading(true);
      await bridge.scanLibrary();
      await loadLibrary();
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setLoading(false);
      setScanProgress(null); // Clear progress when done
    }
  };

  const handleAddToQueue = async (song) => {
    try {
      await bridge.addToQueue({
        path: song.path,
        title: song.title,
        artist: song.artist,
        duration: song.duration,
      });
    } catch (error) {
      console.error('Failed to add to queue:', error);
    }
  };

  const handleShowInfo = (song) => {
    console.log('📋 Opening song info modal for:', song.title);
    setModalSong(song);
  };

  // Pagination
  const totalPages = Math.ceil(filteredSongs.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentPageSongs = filteredSongs.slice(startIndex, endIndex);

  // Smart pagination - show limited page numbers around current page
  const getPageNumbers = () => {
    const maxButtons = 7; // Show max 7 page buttons
    if (totalPages <= maxButtons) {
      // Show all pages if total is small
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = [];
    const halfRange = Math.floor((maxButtons - 3) / 2); // Reserve 3 for first, last, and ellipsis

    // Always show first page
    pages.push(1);

    let startPage = Math.max(2, currentPage - halfRange);
    let endPage = Math.min(totalPages - 1, currentPage + halfRange);

    // Adjust if we're near the beginning
    if (currentPage <= halfRange + 2) {
      endPage = Math.min(maxButtons - 1, totalPages - 1);
    }

    // Adjust if we're near the end
    if (currentPage >= totalPages - halfRange - 1) {
      startPage = Math.max(2, totalPages - maxButtons + 2);
    }

    // Add ellipsis if needed before
    if (startPage > 2) {
      pages.push('...');
    }

    // Add middle pages
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    // Add ellipsis if needed after
    if (endPage < totalPages - 1) {
      pages.push('...');
    }

    // Always show last page
    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  };

  const allLetters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '#'];

  return (
    <div className="flex flex-col h-full gap-1 overflow-hidden">
      {/* Header Controls */}
      <div className="flex flex-col gap-1.5 pb-1 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex gap-2 flex-wrap items-center">
          {showSetFolder && (
            <button
              onClick={handleSetFolder}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-white cursor-pointer text-sm hover:bg-gray-200 dark:hover:bg-gray-750 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-icons text-lg">folder_open</span>
              Set Songs Folder
            </button>
          )}
          <button
            onClick={handleSync}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-white cursor-pointer text-sm hover:bg-gray-200 dark:hover:bg-gray-750 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!songsFolder || loading}
          >
            <span className="material-icons text-lg">sync</span>
            Sync
          </button>
          {showFullRefresh && (
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-white cursor-pointer text-sm hover:bg-gray-200 dark:hover:bg-gray-750 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!songsFolder || loading}
            >
              <span className="material-icons text-lg">refresh</span>
              Full Refresh
            </button>
          )}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="Search songs..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span>{songs.length} songs</span>
          {songsFolder && <span>{songsFolder}</span>}
        </div>
        {scanProgress && (
          <div className="flex flex-col gap-1 py-2">
            <div className="w-full h-5 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{
                  width: `${scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0}%`,
                }}
              />
            </div>
            <div className="text-xs text-gray-700 dark:text-gray-300 text-center">
              Scanning: {scanProgress.current} / {scanProgress.total} files (
              {scanProgress.total > 0
                ? Math.round((scanProgress.current / scanProgress.total) * 100)
                : 0}
              %)
            </div>
          </div>
        )}
      </div>

      {/* Alphabet Navigation */}
      {!searchTerm && !scanProgress && (
        <div className="flex flex-col gap-1 py-1 px-2 bg-gray-100 dark:bg-gray-800/50 rounded-md shrink-0">
          <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            Browse by Artist:
          </div>
          <div className="flex flex-wrap gap-1">
            {allLetters.map((letter) => {
              const isAvailable = availableLetters.includes(letter);
              const isActive = currentLetter === letter;

              return (
                <button
                  key={letter}
                  className={`w-8 h-8 p-0 rounded text-sm font-semibold cursor-pointer transition-all ${isActive ? 'bg-blue-600 border-blue-600 text-white' : isAvailable ? 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-750 hover:scale-105' : 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600 opacity-30 cursor-not-allowed'}`}
                  onClick={() => isAvailable && loadLetterPage(letter, 1, songs)}
                  disabled={!isAvailable}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Library Table */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-16 text-center text-base text-gray-700 dark:text-gray-300">
          Loading library...
        </div>
      ) : filteredSongs.length > 0 ? (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 border-b-2 border-gray-200 dark:border-gray-700">
                    Title
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 border-b-2 border-gray-200 dark:border-gray-700">
                    Artist
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 border-b-2 border-gray-200 dark:border-gray-700">
                    Album
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 border-b-2 border-gray-200 dark:border-gray-700">
                    Genre
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 border-b-2 border-gray-200 dark:border-gray-700">
                    Key
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 border-b-2 border-gray-200 dark:border-gray-700">
                    Duration
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 border-b-2 border-gray-200 dark:border-gray-700">
                    Year
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 border-b-2 border-gray-200 dark:border-gray-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                {currentPageSongs.map((song, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-3 py-1.5 text-xs leading-relaxed border-b border-gray-200 dark:border-gray-800/50">
                      <span className="mr-1.5 text-base">{getFormatIcon(song.format)}</span>
                      {song.title}
                    </td>
                    <td className="px-3 py-1.5 text-xs leading-relaxed border-b border-gray-200 dark:border-gray-800/50">
                      {song.artist}
                    </td>
                    <td className="px-3 py-1.5 text-xs leading-relaxed border-b border-gray-200 dark:border-gray-800/50">
                      {song.album || '-'}
                    </td>
                    <td className="px-3 py-1.5 text-xs leading-relaxed border-b border-gray-200 dark:border-gray-800/50">
                      {song.genre || '-'}
                    </td>
                    <td className="px-3 py-1.5 text-xs leading-relaxed border-b border-gray-200 dark:border-gray-800/50">
                      {song.key || '-'}
                    </td>
                    <td className="px-3 py-1.5 text-xs leading-relaxed border-b border-gray-200 dark:border-gray-800/50">
                      {formatDuration(song.duration)}
                    </td>
                    <td className="px-3 py-1.5 text-xs leading-relaxed border-b border-gray-200 dark:border-gray-800/50">
                      {song.year || '-'}
                    </td>
                    <td className="px-3 py-1.5 text-xs leading-relaxed border-b border-gray-200 dark:border-gray-800/50">
                      <div className="flex flex-row gap-1 items-center">
                        <button
                          className="w-7 h-7 min-w-[28px] min-h-[28px] max-w-[28px] max-h-[28px] p-0 flex items-center justify-center bg-transparent border border-gray-200 dark:border-gray-700 rounded text-gray-700 dark:text-white cursor-pointer transition-all flex-shrink-0 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-blue-600"
                          onClick={() => handleAddToQueue(song)}
                          title="Add to Queue"
                        >
                          <span className="material-icons text-base leading-none">
                            playlist_add
                          </span>
                        </button>
                        <button
                          className="w-7 h-7 min-w-[28px] min-h-[28px] max-w-[28px] max-h-[28px] p-0 flex items-center justify-center bg-transparent border border-gray-200 dark:border-gray-700 rounded text-gray-700 dark:text-white cursor-pointer transition-all flex-shrink-0 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-blue-600"
                          onClick={() => handleShowInfo(song)}
                          title="Song Info"
                        >
                          <span className="material-icons text-base leading-none">info</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && !scanProgress && (
            <div className="flex items-center justify-center gap-3 py-1.5 px-2 bg-gray-100 dark:bg-gray-800/50 rounded-md text-sm shrink-0">
              <button
                className="px-4 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-white cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-750 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <div className="flex gap-1 items-center">
                {getPageNumbers().map((page, index) => {
                  if (page === '...') {
                    return (
                      <span
                        key={`ellipsis-${index}`}
                        className="px-2 py-1.5 text-gray-700 dark:text-gray-300 select-none"
                      >
                        ...
                      </span>
                    );
                  }
                  return (
                    <button
                      key={page}
                      className={`min-w-[36px] px-2 py-1.5 rounded cursor-pointer ${page === currentPage ? 'bg-blue-600 border-blue-600 font-semibold text-white' : 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-750'}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({filteredSongs.length} songs)
              </span>
              <button
                className="px-4 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-white cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-750 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-16 text-center">
          <div className="text-5xl opacity-50">🎵</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {songsFolder ? 'No songs found' : 'No songs library set'}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {songsFolder
              ? 'Try syncing or refreshing your library'
              : 'Click "Set Songs Folder" to choose your music library'}
          </div>
        </div>
      )}

      {/* Song Info Modal */}
      {modalSong && <SongInfoModal song={modalSong} onClose={() => setModalSong(null)} />}
    </div>
  );
}

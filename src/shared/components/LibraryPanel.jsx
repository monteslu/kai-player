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

import { useState, useEffect } from 'react';
import { getFormatIcon, formatDuration } from '../formatUtils.js';
import './LibraryPanel.css';

function SongInfoModal({ song, onClose }) {
  if (!song) return null;

  console.log('🎵 SongInfoModal rendering for:', song.title);

  return (
    <div className="song-info-modal-overlay" onClick={onClose}>
      <div className="song-info-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="song-info-modal-header">
          <h2>Song Information</h2>
          <button className="song-info-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="song-info-modal-body">
          <div className="song-info-grid">
            <div className="info-row">
              <span className="info-label">Title:</span>
              <span className="info-value">{song.title}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Artist:</span>
              <span className="info-value">{song.artist}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Album:</span>
              <span className="info-value">{song.album || 'N/A'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Genre:</span>
              <span className="info-value">{song.genre || 'N/A'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Key:</span>
              <span className="info-value">{song.key || 'N/A'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Year:</span>
              <span className="info-value">{song.year || 'N/A'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Duration:</span>
              <span className="info-value">{formatDuration(song.duration)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Format:</span>
              <span className="info-value">{song.format || 'N/A'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Path:</span>
              <span className="info-value" style={{ wordBreak: 'break-all', fontSize: '11px' }}>{song.path}</span>
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
        setSongs(prevSongs => {
          const songIndex = prevSongs.findIndex(s => s.path === data.path);
          if (songIndex !== -1) {
            const updatedSongs = [...prevSongs];
            updatedSongs[songIndex] = { ...updatedSongs[songIndex], ...data.metadata };
            return updatedSongs;
          }
          return prevSongs;
        });

        // Update filtered songs if they're currently displayed
        setFilteredSongs(prevFiltered => {
          const songIndex = prevFiltered.findIndex(s => s.path === data.path);
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
  }, []);

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
        setSongs(prevSongs => {
          const songIndex = prevSongs.findIndex(s => s.path === data.path);
          if (songIndex !== -1) {
            const updatedSongs = [...prevSongs];
            updatedSongs[songIndex] = { ...updatedSongs[songIndex], ...data.metadata };
            return updatedSongs;
          }
          return prevSongs;
        });

        // Update filtered songs if they're currently displayed
        setFilteredSongs(prevFiltered => {
          const songIndex = prevFiltered.findIndex(s => s.path === data.path);
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
  }, [bridge]);

  // Load library on mount
  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
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
  };

  const calculateAvailableLetters = (songsList) => {
    const letterSet = new Set();

    songsList.forEach(song => {
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
      letters = letters.filter(l => l !== '#');
      letters.push('#');
    }

    setAvailableLetters(letters);

    // Auto-select first letter if none selected and songs exist
    if (!currentLetter && letters.length > 0) {
      const firstLetter = letters.includes('A') ? 'A' : letters[0];
      loadLetterPage(firstLetter, 1, songsList);
    }
  };

  const loadLetterPage = (letter, page, songsList = songs) => {
    setCurrentLetter(letter);
    setCurrentPage(page);
    setSearchTerm('');

    // Filter songs by first letter of artist
    const letterSongs = songsList.filter(song => {
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
  };

  const handleSearch = (term) => {
    setSearchTerm(term);
    setCurrentLetter(null);
    setCurrentPage(1);

    if (!term.trim()) {
      setFilteredSongs([]);
      return;
    }

    const searchLower = term.toLowerCase();
    const results = songs.filter(song => {
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
        duration: song.duration
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
    <div className="library-panel">
      {/* Header Controls */}
      <div className="library-header">
        <div className="library-controls">
          {showSetFolder && (
            <button onClick={handleSetFolder} className="library-btn">
              <span className="material-icons">folder_open</span>
              Set Songs Folder
            </button>
          )}
          <button onClick={handleSync} className="library-btn" disabled={!songsFolder || loading}>
            <span className="material-icons">sync</span>
            Sync
          </button>
          {showFullRefresh && (
            <button onClick={handleRefresh} className="library-btn" disabled={!songsFolder || loading}>
              <span className="material-icons">refresh</span>
              Full Refresh
            </button>
          )}
          <div className="library-search">
            <input
              type="text"
              placeholder="Search songs..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="library-info">
          <span>{songs.length} songs</span>
          {songsFolder && <span>{songsFolder}</span>}
        </div>
        {scanProgress && (
          <div className="library-scan-progress">
            <div className="scan-progress-bar">
              <div
                className="scan-progress-fill"
                style={{ width: `${scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0}%` }}
              />
            </div>
            <div className="scan-progress-text">
              Scanning: {scanProgress.current} / {scanProgress.total} files ({scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0}%)
            </div>
          </div>
        )}
      </div>

      {/* Alphabet Navigation */}
      {!searchTerm && !scanProgress && (
        <div className="alphabet-nav">
          <div className="alphabet-title">Browse by Artist:</div>
          <div className="alphabet-buttons">
            {allLetters.map(letter => {
              const isAvailable = availableLetters.includes(letter);
              const isActive = currentLetter === letter;

              return (
                <button
                  key={letter}
                  className={`alphabet-btn ${isActive ? 'active' : ''} ${!isAvailable ? 'disabled' : ''}`}
                  onClick={() => isAvailable && loadLetterPage(letter, 1)}
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
        <div className="library-loading">Loading library...</div>
      ) : filteredSongs.length > 0 ? (
        <>
          <div className="library-table-container">
            <table className="library-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Artist</th>
                  <th>Album</th>
                  <th>Genre</th>
                  <th>Key</th>
                  <th>Duration</th>
                  <th>Year</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentPageSongs.map((song, index) => (
                  <tr key={index}>
                    <td>
                      <span className="format-icon">{getFormatIcon(song.format)}</span>
                      {song.title}
                    </td>
                    <td>{song.artist}</td>
                    <td>{song.album || '-'}</td>
                    <td>{song.genre || '-'}</td>
                    <td>{song.key || '-'}</td>
                    <td>{formatDuration(song.duration)}</td>
                    <td>{song.year || '-'}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="library-action-btn queue-btn"
                          onClick={() => handleAddToQueue(song)}
                          title="Add to Queue"
                        >
                          <span className="material-icons">playlist_add</span>
                        </button>
                        <button
                          className="library-action-btn info-btn"
                          onClick={() => handleShowInfo(song)}
                          title="Song Info"
                        >
                          <span className="material-icons">info</span>
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
            <div className="library-pagination">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <div className="page-numbers">
                {getPageNumbers().map((page, index) => {
                  if (page === '...') {
                    return (
                      <span key={`ellipsis-${index}`} className="page-ellipsis">
                        ...
                      </span>
                    );
                  }
                  return (
                    <button
                      key={page}
                      className={`page-number ${page === currentPage ? 'active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>
              <span className="page-info">
                ({filteredSongs.length} songs)
              </span>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="library-empty">
          <div className="empty-icon">🎵</div>
          <div className="empty-message">
            {songsFolder ? 'No songs found' : 'No songs library set'}
          </div>
          <div className="empty-detail">
            {songsFolder ? 'Try syncing or refreshing your library' : 'Click "Set Songs Folder" to choose your music library'}
          </div>
        </div>
      )}

      {/* Song Info Modal */}
      {modalSong && <SongInfoModal song={modalSong} onClose={() => setModalSong(null)} />}
    </div>
  );
}

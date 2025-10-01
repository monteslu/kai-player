import { useState, useEffect, useRef } from 'react';
import './SongSearch.css';
import { getFormatIcon, formatDuration } from '../../../shared/formatUtils.js';

export function SongSearch({ onAddToQueue }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (searchTerm.trim().length >= 2) {
        setLoading(true);
        try {
          const response = await fetch(
            `/api/songs?search=${encodeURIComponent(searchTerm)}&limit=20`,
            { credentials: 'include' }
          );
          const data = await response.json();
          setResults(data.songs || []);
          setShowDropdown(true);
        } catch (error) {
          console.error('Search failed:', error);
          setResults([]);
        } finally {
          setLoading(false);
        }
      } else {
        setResults([]);
        setShowDropdown(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const handleLoadSong = async (song) => {
    try {
      const response = await fetch('/admin/player/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ path: song.path })
      });

      if (response.ok) {
        setSearchTerm('');
        setShowDropdown(false);
      }
    } catch (error) {
      console.error('Load song failed:', error);
    }
  };

  const handleAddToQueue = async (song) => {
    try {
      const response = await fetch('/admin/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          song: {
            path: song.path,
            title: song.title,
            artist: song.artist,
            duration: song.duration
          },
          requester: 'Admin'
        })
      });

      if (response.ok) {
        if (onAddToQueue) onAddToQueue(song);
        setSearchTerm('');
        setShowDropdown(false);
      }
    } catch (error) {
      console.error('Add to queue failed:', error);
    }
  };

  return (
    <div className="song-search" ref={searchRef}>
      <input
        type="text"
        className="song-search-input"
        placeholder="Search songs to queue..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setShowDropdown(true);
        }}
      />

      {showDropdown && (
        <div className="song-search-dropdown" ref={dropdownRef}>
          {loading ? (
            <div className="search-loading">Searching...</div>
          ) : results.length > 0 ? (
            <div className="search-results">
              {results.map((song, index) => (
                <div key={index} className="search-result-item">
                  <div className="result-info">
                    <div className="result-title">
                      <span className="format-icon">{getFormatIcon(song.format)}</span> {song.title}
                    </div>
                    <div className="result-meta">
                      <span className="result-artist">{song.artist}</span>
                      {song.duration && (
                        <>
                          <span className="result-separator">•</span>
                          <span className="result-duration">
                            {formatDuration(song.duration)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="result-actions">
                    <button
                      className="btn btn-sm result-btn"
                      onClick={() => handleLoadSong(song)}
                      title="Load & Play Now"
                    >
                      ▶
                    </button>
                    <button
                      className="btn btn-sm result-btn"
                      onClick={() => handleAddToQueue(song)}
                      title="Add to Queue"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : searchTerm.trim().length >= 2 ? (
            <div className="search-no-results">No songs found</div>
          ) : (
            <div className="search-no-results">Type to search your library</div>
          )}
        </div>
      )}
    </div>
  );
}
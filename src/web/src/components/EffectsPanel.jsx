import { useState, useEffect } from 'react';
import './EffectsPanel.css';

export function EffectsPanel({ effects, onEffectChange }) {
  const [currentEffect, setCurrentEffect] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    console.log('🎨 EffectsPanel received effects:', effects);
    if (effects?.current) {
      setCurrentEffect(effects.current);

      // Scroll to the active effect
      setTimeout(() => {
        const activeElement = document.querySelector('.effect-item.active');
        if (activeElement) {
          activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [effects]);

  const handlePrevious = async () => {
    try {
      await fetch('/admin/effects/previous', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Previous effect failed:', error);
    }
  };

  const handleNext = async () => {
    try {
      await fetch('/admin/effects/next', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Next effect failed:', error);
    }
  };

  const handleRandom = async () => {
    try {
      await fetch('/admin/effects/random', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Random effect failed:', error);
    }
  };

  const sanitizeFilename = (name) => {
    // Match exactly what the screenshot generator uses
    return name.replace(/[^a-zA-Z0-9-_\s]/g, '_');
  };

  const formatEffectName = (effect) => {
    if (!effect) return 'None';
    // If effect is an object with displayName, use that
    if (typeof effect === 'object' && effect.displayName) {
      return effect.displayName;
    }
    // If it's a string, format it
    if (typeof effect === 'string') {
      const parts = effect.split(' - ');
      return parts.length > 1 ? parts[1] : effect;
    }
    return 'None';
  };

  const getEffectCategory = (effect) => {
    // If effect is an object with category, use that
    if (typeof effect === 'object' && effect.category) {
      return effect.category;
    }
    // Fall back to string parsing
    const name = typeof effect === 'string' ? effect : effect?.name || '';
    if (!name) return 'other';
    const lowerName = name.toLowerCase();
    if (lowerName.includes('geiss')) return 'geiss';
    if (lowerName.includes('martin')) return 'martin';
    if (lowerName.includes('flexi')) return 'flexi';
    if (lowerName.includes('shifter')) return 'shifter';
    return 'other';
  };

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'geiss', label: 'Geiss' },
    { id: 'martin', label: 'Martin' },
    { id: 'flexi', label: 'Flexi' },
    { id: 'shifter', label: 'Shifter' },
    { id: 'other', label: 'Other' }
  ];

  const effectsList = effects?.list || [];
  console.log('🎨 Effects list length:', effectsList.length, 'effects:', effects);

  const filteredEffects = effectsList.filter(effect => {
    if (!effect) return false;

    // Get searchable text (displayName for objects, the string itself for strings)
    const searchText = typeof effect === 'object'
      ? (effect.displayName || effect.name || '')
      : effect;

    const matchesSearch = !searchTerm ||
      searchText.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' ||
      getEffectCategory(effect) === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="effects-panel">
      <div className="effects-header">
        <h2>Visual Effects</h2>
        <div className="effects-current">
          <span className="current-effect-label">Current:</span>
          <span className="current-effect-name">
            {currentEffect ? formatEffectName(currentEffect) : 'None'}
          </span>
        </div>
      </div>

      <div className="effects-controls">
        <button className="btn btn-sm" onClick={handlePrevious} title="Previous Effect">
          ◀ Previous
        </button>
        <button className="btn btn-sm btn-primary" onClick={handleRandom} title="Random Effect">
          🎲 Random
        </button>
        <button className="btn btn-sm" onClick={handleNext} title="Next Effect">
          Next ▶
        </button>
      </div>

      <div className="effects-search">
        <input
          type="text"
          placeholder="Search effects..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="effects-search-input"
        />
      </div>

      <div className="effects-categories">
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`category-btn ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="effects-list">
        {filteredEffects.length === 0 ? (
          <div className="effects-empty">
            {searchTerm ? 'No effects found' : 'Loading effects...'}
          </div>
        ) : (
          filteredEffects.map((effect, index) => {
            // Skip if effect is null/undefined
            if (!effect) return null;

            const effectName = typeof effect === 'object' && effect !== null ? effect.name : effect;
            const isActive = currentEffect === effectName ||
              (typeof currentEffect === 'object' && currentEffect !== null && currentEffect.name === effectName);

            // Debug: log the first active effect found
            if (isActive && index === 0) {
              console.log('🎨 Found active effect:', effectName, 'currentEffect:', currentEffect);
            }

            // Create thumbnail URL using same sanitization as renderer
            const thumbnailName = sanitizeFilename(effectName);
            const thumbnailUrl = `/screenshots/${encodeURIComponent(thumbnailName)}.png`;
            const isDisabled = effects?.disabled?.includes(effectName);

            const handleToggleDisabled = async (e) => {
              e.stopPropagation(); // Prevent triggering the select effect
              try {
                const endpoint = isDisabled ? '/admin/effects/enable' : '/admin/effects/disable';
                await fetch(endpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ effectName })
                });
              } catch (error) {
                console.error('Toggle disabled failed:', error);
              }
            };

            return (
              <div
                key={index}
                className={`effect-item ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                onClick={async () => {
                  // Don't allow selecting disabled effects
                  if (isDisabled) return;

                  try {
                    await fetch('/admin/effects/select', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ effectName })
                    });
                    setCurrentEffect(effectName);
                    if (onEffectChange) onEffectChange(effectName);
                  } catch (error) {
                    console.error('Select effect failed:', error);
                  }
                }}
              >
                <img
                  src={thumbnailUrl}
                  alt={formatEffectName(effect)}
                  className="effect-thumbnail"
                  loading="lazy"
                  onError={(e) => {
                    // Hide image if it fails to load
                    e.target.style.display = 'none';
                  }}
                />
                <span className="effect-name">{formatEffectName(effect)}</span>
                <button
                  className={`btn btn-xs effect-toggle ${isDisabled ? 'btn-secondary' : 'btn-success'}`}
                  onClick={handleToggleDisabled}
                  title={isDisabled ? 'Enable effect' : 'Disable effect'}
                >
                  {isDisabled ? 'Disabled' : 'Enabled'}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="effects-count">
        {filteredEffects.length} effect{filteredEffects.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
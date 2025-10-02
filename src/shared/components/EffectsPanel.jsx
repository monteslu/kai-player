/**
 * EffectsPanel - Unified effects browser and control panel
 *
 * Based on renderer's effects design (grid layout with categories)
 * Works with both ElectronBridge and WebBridge via callbacks
 */

import './EffectsPanel.css';

export function EffectsPanel({
  effects = [],
  currentEffect = null,
  disabledEffects = [],
  searchTerm = '',
  currentCategory = 'all',
  onSearch,
  onCategoryChange,
  onSelectEffect,
  onRandomEffect,
  onEnableEffect,
  onDisableEffect
}) {
  // Filter effects based on category and search
  let filteredEffects = [...effects];

  if (currentCategory !== 'all') {
    filteredEffects = filteredEffects.filter(effect => effect.category === currentCategory);
  }

  if (searchTerm.trim()) {
    const searchLower = searchTerm.toLowerCase();
    filteredEffects = filteredEffects.filter(effect =>
      effect.name?.toLowerCase().includes(searchLower) ||
      effect.displayName?.toLowerCase().includes(searchLower) ||
      effect.author?.toLowerCase().includes(searchLower)
    );
  }

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'geiss', label: 'Geiss' },
    { id: 'martin', label: 'Martin' },
    { id: 'flexi', label: 'Flexi' },
    { id: 'shifter', label: 'Shifter' },
    { id: 'other', label: 'Other' }
  ];

  const sanitizeFilename = (name) => {
    return name.replace(/[^a-zA-Z0-9-_\s]/g, '_');
  };

  return (
    <div className="effects-container">
      <div className="effects-header">
        <div className="effects-search">
          <input
            type="text"
            placeholder="Search effects..."
            value={searchTerm}
            onChange={(e) => onSearch && onSearch(e.target.value)}
          />
        </div>
        <div className="effects-info">
          <span id="effectsCount">
            {currentCategory === 'all' && !searchTerm.trim()
              ? `${effects.length} effects`
              : `${filteredEffects.length} of ${effects.length} effects`}
          </span>
          {onRandomEffect && (
            <button onClick={onRandomEffect} className="effects-btn">
              <span className="material-icons">casino</span>
              Random
            </button>
          )}
        </div>
      </div>

      <div className="effects-content">
        <div className="effects-categories">
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`category-btn ${currentCategory === cat.id ? 'active' : ''}`}
              onClick={() => onCategoryChange && onCategoryChange(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="effects-list">
          {filteredEffects.length === 0 ? (
            <div className="effects-loading">
              <span className="material-icons loading-icon">search_off</span>
              <div className="loading-message">No effects found</div>
            </div>
          ) : (
            <div className="effects-grid">
              {filteredEffects.map(effect => {
                const isActive = currentEffect === effect.name;
                const isDisabled = disabledEffects.includes(effect.name);
                const sanitizedName = sanitizeFilename(effect.name);
                const screenshotPath = `../../static/images/butterchurn-screenshots/${sanitizedName}.png`;

                return (
                  <div
                    key={effect.name}
                    className={`effect-item ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                    onClick={() => !isDisabled && onSelectEffect && onSelectEffect(effect.name)}
                  >
                    <div className="effect-preview">
                      <img
                        src={screenshotPath}
                        alt={effect.displayName}
                        className="effect-screenshot"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextElementSibling.style.display = 'flex';
                        }}
                      />
                      <div className="effect-fallback" style={{ display: 'none' }}>
                        <span className="material-icons">image_not_supported</span>
                      </div>
                    </div>
                    <div className={`effect-info ${isDisabled ? 'disabled' : ''}`}>
                      <div className="effect-category">{effect.category}</div>
                      <div className="effect-name">{effect.displayName}</div>
                      <div className="effect-author">by {effect.author}</div>
                      <div className="effect-actions">
                        <button
                          className="effect-action-btn primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            !isDisabled && onSelectEffect && onSelectEffect(effect.name);
                          }}
                          disabled={isDisabled}
                        >
                          Use
                        </button>
                        <button
                          className="effect-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isDisabled) {
                              onEnableEffect && onEnableEffect(effect.name);
                            } else {
                              onDisableEffect && onDisableEffect(effect.name);
                            }
                          }}
                        >
                          {isDisabled ? 'Enable' : 'Disable'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

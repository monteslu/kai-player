class EffectsManager {
    constructor() {
        this.presets = [];
        this.filteredPresets = [];
        this.currentCategory = 'all';
        this.currentSearch = '';
        this.currentEffect = null;
        this.disabledEffects = new Set(); // Track disabled effects
        this.loadedFromMainPrefs = false; // Track if we loaded from main preferences
        
        this.setupEventListeners();
        this.loadPresets();
        this.loadDisabledEffects();
        
        // Retry loading from main preferences after a delay if we haven't loaded from main prefs yet
        setTimeout(() => {
            if (!this.loadedFromMainPrefs) {
                this.reloadFromMainPreferences();
            }
        }, 1000);
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('effectsSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.currentSearch = e.target.value.toLowerCase();
                this.filterAndDisplayPresets();
            });
        }

        // Category buttons
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentCategory = btn.dataset.category;
                this.filterAndDisplayPresets();
            });
        });

        // Random effect button
        const randomBtn = document.getElementById('randomEffectBtn');
        if (randomBtn) {
            randomBtn.addEventListener('click', () => {
                this.selectRandomEffect();
            });
        }

    }

    async loadPresets() {
        try {
            // Check if Butterchurn presets are available
            if (!window.butterchurnPresets || typeof window.butterchurnPresets.getPresets !== 'function') {
                throw new Error('Butterchurn presets not available');
            }

            const presets = window.butterchurnPresets.getPresets();
            this.presets = Object.keys(presets).map(name => {
                const preset = presets[name];
                const metadata = this.parsePresetMetadata(name, preset);
                
                return {
                    name,
                    displayName: metadata.displayName,
                    author: metadata.author,
                    category: metadata.category,
                    preset: preset
                };
            });

            console.log('Loaded', this.presets.length, 'Butterchurn presets');
            this.filterAndDisplayPresets();
            
        } catch (error) {
            console.error('Failed to load Butterchurn presets:', error);
            this.showError('Failed to load effects: ' + error.message);
        }
    }

    parsePresetMetadata(name, preset) {
        // Parse preset name to extract author and category information
        let author = 'Unknown';
        let displayName = name;
        let category = 'other';

        // Common author patterns
        if (name.includes(' - ')) {
            const parts = name.split(' - ');
            if (parts.length >= 2) {
                author = parts[0].trim();
                displayName = parts.slice(1).join(' - ').trim();
            }
        } else if (name.includes('_')) {
            const parts = name.split('_');
            if (parts.length >= 2 && parts[0].length < 20) {
                author = parts[0].trim();
                displayName = parts.slice(1).join('_').replace(/_/g, ' ').trim();
            }
        }

        // Categorize by author or name patterns
        const nameLower = name.toLowerCase();
        if (nameLower.includes('geiss') || author.toLowerCase().includes('geiss')) {
            category = 'geiss';
        } else if (nameLower.includes('martin') || author.toLowerCase().includes('martin')) {
            category = 'martin';
        } else if (nameLower.includes('flexi') || author.toLowerCase().includes('flexi')) {
            category = 'flexi';
        } else if (nameLower.includes('shifter') || author.toLowerCase().includes('shifter')) {
            category = 'shifter';
        }

        return {
            author,
            displayName: displayName || name,
            category
        };
    }

    filterAndDisplayPresets() {
        let filtered = [...this.presets];

        // Filter by category
        if (this.currentCategory !== 'all') {
            filtered = filtered.filter(preset => preset.category === this.currentCategory);
        }

        // Filter by search term
        if (this.currentSearch.trim()) {
            filtered = filtered.filter(preset => 
                preset.name.toLowerCase().includes(this.currentSearch) ||
                preset.displayName.toLowerCase().includes(this.currentSearch) ||
                preset.author.toLowerCase().includes(this.currentSearch)
            );
        }

        this.filteredPresets = filtered;
        this.displayPresets();
        this.updateEffectsCount();
    }

    displayPresets() {
        const effectsList = document.getElementById('effectsList');
        if (!effectsList) return;

        if (this.filteredPresets.length === 0) {
            effectsList.innerHTML = `
                <div class="effects-loading">
                    <div class="loading-icon">🔍</div>
                    <div class="loading-message">No effects found</div>
                </div>
            `;
            return;
        }

        const effectsGrid = document.createElement('div');
        effectsGrid.className = 'effects-grid';

        this.filteredPresets.forEach(preset => {
            const effectItem = document.createElement('div');
            effectItem.className = 'effect-item';
            effectItem.dataset.effectName = preset.name;
            
            if (this.currentEffect && this.currentEffect.name === preset.name) {
                effectItem.classList.add('active');
            }
            
            if (this.disabledEffects.has(preset.name)) {
                effectItem.classList.add('disabled');
            }

            // Use direct file path for screenshots with proper filename conversion
            const sanitizedName = this.sanitizeFilename(preset.name);
            const screenshotPath = `../../static/images/butterchurn-screenshots/${sanitizedName}.png`;

            effectItem.innerHTML = `
                <div class="effect-preview">
                    <img src="${screenshotPath}" alt="${preset.displayName}" class="effect-screenshot"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="effect-fallback" style="display: none;">
                        <span class="material-icons">image_not_supported</span>
                    </div>
                </div>
                <div class="effect-info ${this.disabledEffects.has(preset.name) ? 'disabled' : ''}">
                    <div class="effect-category">${preset.category}</div>
                    <div class="effect-name">${preset.displayName}</div>
                    <div class="effect-author">by ${preset.author}</div>
                    <div class="effect-actions">
                        <button class="effect-action-btn primary use-effect-btn" data-effect-name="${preset.name}" ${this.disabledEffects.has(preset.name) ? 'disabled' : ''}>
                            Use
                        </button>
                        <button class="effect-action-btn ${this.disabledEffects.has(preset.name) ? 'enable' : 'disable'}-effect-btn" data-effect-name="${preset.name}">
                            ${this.disabledEffects.has(preset.name) ? 'Enable' : 'Disable'}
                        </button>
                    </div>
                </div>
            `;

            effectsGrid.appendChild(effectItem);
        });

        effectsList.innerHTML = '';
        effectsList.appendChild(effectsGrid);

        // Attach event listeners
        this.attachEffectListeners();
    }

    attachEffectListeners() {
        // Use effect buttons
        document.querySelectorAll('.use-effect-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const effectName = btn.dataset.effectName;
                this.selectEffect(effectName);
            });
        });

        // Disable/Enable effect buttons
        document.querySelectorAll('.disable-effect-btn, .enable-effect-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const effectName = btn.dataset.effectName;
                this.toggleEffectDisabled(effectName);
            });
        });

        // Click on effect item to use (only if not disabled)
        document.querySelectorAll('.effect-item').forEach(item => {
            item.addEventListener('click', () => {
                const effectName = item.dataset.effectName;
                if (!this.disabledEffects.has(effectName)) {
                    this.selectEffect(effectName);
                }
            });
        });
    }

    selectEffect(effectName) {
        const preset = this.presets.find(p => p.name === effectName);
        if (!preset) return;

        // Update current effect
        this.currentEffect = preset;

        // Update UI to show selected effect
        document.querySelectorAll('.effect-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-effect-name="${effectName}"]`)?.closest('.effect-item')?.classList.add('active');

        // Apply the effect to the karaoke renderer if available
        if (window.appInstance && window.appInstance.player && window.appInstance.player.karaokeRenderer) {
            const renderer = window.appInstance.player.karaokeRenderer;
            if (renderer.setButterchurnPreset) {
                console.log('🎨 Applying effect to karaoke renderer:', preset.displayName);
                renderer.setButterchurnPreset(preset.preset);
            }
        } else {
            console.warn('Karaoke renderer not available for effect:', preset.displayName);
        }

        // Update the main app's effect display
        if (window.appInstance && typeof window.appInstance.updateEffectDisplay === 'function') {
            setTimeout(() => window.appInstance.updateEffectDisplay(), 100);
        }

        // Report effect change to main process (for AppState and web admin sync)
        if (window.kaiAPI?.renderer) {
            window.kaiAPI.renderer.updateEffectsState({
                current: preset.name
            });
        }

        console.log('🎨 Selected effect:', preset.displayName, 'by', preset.author, '(' + preset.name + ')');
    }

    toggleEffectDisabled(effectName) {
        const preset = this.presets.find(p => p.name === effectName);
        if (!preset) return;

        if (this.disabledEffects.has(effectName)) {
            // Enable the effect
            this.disabledEffects.delete(effectName);
            console.log('🎨 Enabled effect:', preset.displayName);
        } else {
            // Disable the effect
            this.disabledEffects.add(effectName);
            console.log('🎨 Disabled effect:', preset.displayName);

            // If the currently selected effect is being disabled, don't change it
            // The user should manually select a different effect
        }

        // Save the updated disabled effects
        this.saveDisabledEffects();

        // Refresh the display to update button states
        this.displayPresets();
    }

    selectRandomEffect() {
        if (this.filteredPresets.length === 0) return;
        
        // Filter out disabled effects
        const enabledPresets = this.filteredPresets.filter(preset => !this.disabledEffects.has(preset.name));
        
        if (enabledPresets.length === 0) {
            console.warn('No enabled effects available for random selection');
            return;
        }
        
        const randomIndex = Math.floor(Math.random() * enabledPresets.length);
        const randomPreset = enabledPresets[randomIndex];
        
        console.log('🎲 Randomly selected from', enabledPresets.length, 'enabled presets:', randomPreset.displayName, 'by', randomPreset.author);
        this.selectEffect(randomPreset.name);
    }

    updateEffectsCount() {
        const countElement = document.getElementById('effectsCount');
        if (countElement) {
            const total = this.presets.length;
            const filtered = this.filteredPresets.length;
            
            if (this.currentCategory === 'all' && !this.currentSearch.trim()) {
                countElement.textContent = `${total} effects`;
            } else {
                countElement.textContent = `${filtered} of ${total} effects`;
            }
        }
    }

    showError(message) {
        const effectsList = document.getElementById('effectsList');
        if (effectsList) {
            effectsList.innerHTML = `
                <div class="effects-loading">
                    <div class="loading-icon">❌</div>
                    <div class="loading-message">${message}</div>
                </div>
            `;
        }
    }

    sanitizeFilename(name) {
        // Match exactly what the screenshot generator uses
        return name.replace(/[^a-zA-Z0-9-_\s]/g, '_');
    }

    async loadDisabledEffects() {
        try {
            // Load from settings (waveformPreferences) - the ONLY source of truth
            if (window.settingsAPI) {
                const waveformPrefs = await window.settingsAPI.getWaveformPreferences();
                if (waveformPrefs && waveformPrefs.disabledEffects) {
                    const disabledArray = waveformPrefs.disabledEffects;
                    this.disabledEffects = new Set(disabledArray);
                    this.loadedFromMainPrefs = true;
                    console.log('🎨 Loaded disabled effects from settings:', disabledArray);
                    return;
                }
            }

            // Fallback to appInstance.waveformPreferences if settingsAPI not ready
            if (window.appInstance && window.appInstance.waveformPreferences && window.appInstance.waveformPreferences.disabledEffects) {
                const disabledArray = window.appInstance.waveformPreferences.disabledEffects;
                this.disabledEffects = new Set(disabledArray);
                this.loadedFromMainPrefs = true;
                console.log('🎨 Loaded disabled effects from appInstance.waveformPreferences:', disabledArray);
                return;
            }

            // Fallback to localStorage for backwards compatibility
            const stored = localStorage.getItem('disabledEffects');
            if (stored) {
                const disabledArray = JSON.parse(stored);
                this.disabledEffects = new Set(disabledArray);
                console.log('🎨 Loaded disabled effects from localStorage (migrating)');
                // Save to settings
                this.saveDisabledEffects();
                // Remove old localStorage entry
                localStorage.removeItem('disabledEffects');
            }
        } catch (error) {
            console.error('🎨 Failed to load disabled effects:', error);
            this.disabledEffects = new Set();
        }
    }

    async saveDisabledEffects() {
        try {
            const disabledArray = Array.from(this.disabledEffects);

            // Save to settings (waveformPreferences)
            if (window.settingsAPI) {
                const waveformPrefs = await window.settingsAPI.getWaveformPreferences();
                waveformPrefs.disabledEffects = disabledArray;
                await window.settingsAPI.setWaveformPreferences(waveformPrefs);
                console.log('🎨 Saved disabled effects to settings');
            } else {
                console.warn('🎨 settingsAPI not available, cannot save disabled effects');
            }
        } catch (error) {
            console.error('🎨 Failed to save disabled effects:', error);
        }
    }

    // Reload disabled effects from main app preferences (called after main app is initialized)
    reloadFromMainPreferences() {
        if (window.appInstance && window.appInstance.waveformPreferences && window.appInstance.waveformPreferences.disabledEffects) {
            const disabledArray = window.appInstance.waveformPreferences.disabledEffects;
            this.disabledEffects = new Set(disabledArray);
            this.loadedFromMainPrefs = true;
            console.log('🎨 Reloaded disabled effects from waveformPreferences:', disabledArray);

            // Refresh the display to show disabled state
            this.displayPresets();
        }
    }

    // Get current effect info for external use
    getCurrentEffect() {
        return this.currentEffect;
    }

    // Set effect by name (for external use)
    setEffectByName(effectName) {
        this.selectEffect(effectName);
    }

    // Sync UI with current karaoke renderer state
    syncWithRenderer() {
        if (!window.appInstance || !window.appInstance.player || !window.appInstance.player.karaokeRenderer) return;

        const renderer = window.appInstance.player.karaokeRenderer;
        const currentPresetName = renderer.currentPreset;
        if (currentPresetName && currentPresetName !== this.currentEffect?.name) {
            const preset = this.presets.find(p => p.name === currentPresetName);
            if (preset) {
                this.currentEffect = preset;
                this.updateEffectSelectionDisplay();

                // Report to AppState for web admin sync
                if (window.kaiAPI?.renderer) {
                    window.kaiAPI.renderer.updateEffectsState({
                        current: currentPresetName
                    });
                }
            }
        }
    }

    // Update just the selection display without changing the effect
    updateEffectSelectionDisplay() {
        // Update active state in UI
        document.querySelectorAll('.effect-item').forEach(item => {
            item.classList.remove('active');
        });
        
        if (this.currentEffect) {
            const activeItem = document.querySelector(`[data-effect-name="${this.currentEffect.name}"]`)?.closest('.effect-item');
            if (activeItem) {
                activeItem.classList.add('active');
                // Scroll into view if needed
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    // Navigate to next effect
    nextEffect() {
        // Filter out disabled effects
        const enabledPresets = this.filteredPresets.filter(p => !this.disabledEffects.has(p.name));

        if (!enabledPresets || enabledPresets.length === 0) {
            console.log('🎨 No enabled effects available');
            return;
        }

        let currentIndex = -1;
        if (this.currentEffect) {
            currentIndex = enabledPresets.findIndex(p => p.name === this.currentEffect.name);
        }

        const nextIndex = (currentIndex + 1) % enabledPresets.length;
        const nextEffect = enabledPresets[nextIndex];

        console.log(`🎨 Next effect: ${nextEffect.name}`);
        this.selectEffect(nextEffect.name);
    }

    // Navigate to previous effect
    previousEffect() {
        // Filter out disabled effects
        const enabledPresets = this.filteredPresets.filter(p => !this.disabledEffects.has(p.name));

        if (!enabledPresets || enabledPresets.length === 0) {
            console.log('🎨 No enabled effects available');
            return;
        }

        let currentIndex = 0;
        if (this.currentEffect) {
            currentIndex = enabledPresets.findIndex(p => p.name === this.currentEffect.name);
            if (currentIndex === -1) currentIndex = 0;
        }

        const prevIndex = currentIndex === 0 ? enabledPresets.length - 1 : currentIndex - 1;
        const prevEffect = enabledPresets[prevIndex];

        console.log(`🎨 Previous effect: ${prevEffect.name}`);
        this.selectEffect(prevEffect.name);
    }

}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.effectsManager = new EffectsManager();

    // Sync with renderer after a short delay to ensure everything is loaded
    setTimeout(() => {
        if (window.effectsManager) {
            window.effectsManager.syncWithRenderer();
            console.log('🎨 EffectsManager initialized. Disabled effects:', Array.from(window.effectsManager.disabledEffects));
        }
    }, 500);
});
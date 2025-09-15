class EffectsManager {
    constructor() {
        this.presets = [];
        this.filteredPresets = [];
        this.currentCategory = 'all';
        this.currentSearch = '';
        this.currentEffect = null;
        
        this.setupEventListeners();
        this.loadPresets();
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

            effectItem.innerHTML = `
                <div class="effect-category">${preset.category}</div>
                <div class="effect-name">${preset.displayName}</div>
                <div class="effect-author">by ${preset.author}</div>
                <div class="effect-actions">
                    <button class="effect-action-btn primary select-effect-btn" data-effect-name="${preset.name}">
                        Select
                    </button>
                    <button class="effect-action-btn preview-effect-btn" data-effect-name="${preset.name}">
                        Preview
                    </button>
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
        // Select effect buttons
        document.querySelectorAll('.select-effect-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const effectName = btn.dataset.effectName;
                this.selectEffect(effectName);
            });
        });

        // Preview effect buttons
        document.querySelectorAll('.preview-effect-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const effectName = btn.dataset.effectName;
                this.previewEffect(effectName);
            });
        });

        // Click on effect item to select
        document.querySelectorAll('.effect-item').forEach(item => {
            item.addEventListener('click', () => {
                const effectName = item.dataset.effectName;
                this.selectEffect(effectName);
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
        if (window.karaokeRenderer && window.karaokeRenderer.setButterchurnPreset) {
            window.karaokeRenderer.setButterchurnPreset(preset.preset);
        }

        // Update the main app's effect display
        if (window.appInstance && typeof window.appInstance.updateEffectDisplay === 'function') {
            setTimeout(() => window.appInstance.updateEffectDisplay(), 100);
        }

        console.log('Selected effect:', preset.displayName, 'by', preset.author);
    }

    previewEffect(effectName) {
        // For preview, we could temporarily apply the effect for a few seconds
        // then revert to the previous effect
        const preset = this.presets.find(p => p.name === effectName);
        if (!preset) return;

        const previousEffect = this.currentEffect;
        
        // Apply preview effect
        if (window.karaokeRenderer && window.karaokeRenderer.setButterchurnPreset) {
            window.karaokeRenderer.setButterchurnPreset(preset.preset);
        }

        // Revert after 3 seconds
        setTimeout(() => {
            if (previousEffect && window.karaokeRenderer && window.karaokeRenderer.setButterchurnPreset) {
                window.karaokeRenderer.setButterchurnPreset(previousEffect.preset);
            }
        }, 3000);

        console.log('Previewing effect:', preset.displayName, 'for 3 seconds');
    }

    selectRandomEffect() {
        if (this.filteredPresets.length === 0) return;
        
        const randomIndex = Math.floor(Math.random() * this.filteredPresets.length);
        const randomPreset = this.filteredPresets[randomIndex];
        
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
        if (!window.karaokeRenderer) return;
        
        const currentPresetName = window.karaokeRenderer.currentPreset;
        if (currentPresetName && currentPresetName !== this.currentEffect?.name) {
            const preset = this.presets.find(p => p.name === currentPresetName);
            if (preset) {
                this.currentEffect = preset;
                this.updateEffectSelectionDisplay();
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

}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.effectsManager = new EffectsManager();
});
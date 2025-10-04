/**
 * EffectsPanelWrapper - State management wrapper for shared EffectsPanel
 * Loads effects directly from butterchurnPresets (like vanilla effects.js did)
 */

import { useState, useEffect } from 'react';
import { EffectsPanel } from '../../shared/components/EffectsPanel.jsx';

export function EffectsPanelWrapper({ bridge }) {
  const [effects, setEffects] = useState([]);
  const [currentEffect, setCurrentEffect] = useState(null);
  const [disabledEffects, setDisabledEffects] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentCategory, setCurrentCategory] = useState('all');

  // Expose effects data to window.app for IPC handlers
  useEffect(() => {
    if (window.app) {
      window.app.effectsData = {
        effects,
        currentEffect,
        disabledEffects
      };
    }
  }, [effects, currentEffect, disabledEffects]);

  useEffect(() => {
    loadEffects();
    loadDisabledEffects();
  }, []);

  // Listen for effects commands from web admin
  useEffect(() => {
    if (!window.kaiAPI?.events || effects.length === 0) return;

    const onSelectFromAdmin = (event, effectName) => {
      console.log('🎨 Received effects:select from admin:', effectName);
      selectEffect(effectName);
    };

    const onNextFromAdmin = () => {
      console.log('🎨 Received effects:next from admin');
      const enabledEffects = effects.filter(e => !disabledEffects.includes(e.name));
      if (enabledEffects.length === 0) return;

      const currentIndex = enabledEffects.findIndex(e => e.name === currentEffect);
      const nextIndex = (currentIndex + 1) % enabledEffects.length;
      selectEffect(enabledEffects[nextIndex].name);
    };

    const onPreviousFromAdmin = () => {
      console.log('🎨 Received effects:previous from admin');
      const enabledEffects = effects.filter(e => !disabledEffects.includes(e.name));
      if (enabledEffects.length === 0) return;

      const currentIndex = enabledEffects.findIndex(e => e.name === currentEffect);
      const prevIndex = currentIndex <= 0 ? enabledEffects.length - 1 : currentIndex - 1;
      selectEffect(enabledEffects[prevIndex].name);
    };

    const onRandomFromAdmin = () => {
      console.log('🎨 Received effects:random from admin');
      randomEffect();
    };

    const onDisableFromAdmin = (event, effectName) => {
      console.log('🎨 Received effects:disable from admin:', effectName);
      disableEffect(effectName);
    };

    const onEnableFromAdmin = (event, effectName) => {
      console.log('🎨 Received effects:enable from admin:', effectName);
      enableEffect(effectName);
    };

    window.kaiAPI.events.on('effects:select', onSelectFromAdmin);
    window.kaiAPI.events.on('effects:next', onNextFromAdmin);
    window.kaiAPI.events.on('effects:previous', onPreviousFromAdmin);
    window.kaiAPI.events.on('effects:random', onRandomFromAdmin);
    window.kaiAPI.events.on('effects:disable', onDisableFromAdmin);
    window.kaiAPI.events.on('effects:enable', onEnableFromAdmin);

    return () => {
      window.kaiAPI.events.removeListener('effects:select', onSelectFromAdmin);
      window.kaiAPI.events.removeListener('effects:next', onNextFromAdmin);
      window.kaiAPI.events.removeListener('effects:previous', onPreviousFromAdmin);
      window.kaiAPI.events.removeListener('effects:random', onRandomFromAdmin);
      window.kaiAPI.events.removeListener('effects:disable', onDisableFromAdmin);
      window.kaiAPI.events.removeListener('effects:enable', onEnableFromAdmin);
    };
  }, [effects, currentEffect, disabledEffects]);

  const parsePresetMetadata = (name) => {
    let author = 'Unknown';
    let displayName = name;
    let category = 'other';

    if (name.includes(' - ')) {
      const parts = name.split(' - ');
      if (parts.length >= 2) {
        author = parts[0].trim();
        displayName = parts.slice(1).join(' - ').trim();
      }
    }

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

    return { author, displayName, category };
  };

  const loadEffects = () => {
    try {
      if (!window.butterchurnPresets || typeof window.butterchurnPresets.getPresets !== 'function') {
        console.error('Butterchurn presets not available');
        return;
      }

      const presets = window.butterchurnPresets.getPresets();
      const effectsList = Object.keys(presets).map(name => {
        const metadata = parsePresetMetadata(name);
        return {
          name,
          displayName: metadata.displayName,
          author: metadata.author,
          category: metadata.category,
          preset: presets[name]
        };
      });

      console.log('🎨 Loaded', effectsList.length, 'Butterchurn presets');
      setEffects(effectsList);
    } catch (error) {
      console.error('Failed to load effects:', error);
    }
  };

  const loadDisabledEffects = async () => {
    try {
      if (window.kaiAPI?.settings) {
        const waveformPrefs = await window.kaiAPI.settings.get('waveformPreferences');
        if (waveformPrefs?.disabledEffects) {
          setDisabledEffects(waveformPrefs.disabledEffects);
        }
      }
    } catch (error) {
      console.error('Failed to load disabled effects:', error);
    }
  };

  const selectEffect = (effectName) => {
    const preset = effects.find(e => e.name === effectName);
    if (!preset) return;

    setCurrentEffect(effectName);

    // Apply effect directly to karaoke renderer (like vanilla effects.js)
    try {
      const app = window.app; // KaiPlayerApp instance
      if (app && app.player && app.player.karaokeRenderer) {
        const renderer = app.player.karaokeRenderer;
        if (renderer.setButterchurnPreset) {
          console.log('🎨 Applying effect:', preset.displayName);
          renderer.setButterchurnPreset(preset.preset);
        }
      }

      // Update main app's effect display
      if (app && typeof app.updateEffectDisplay === 'function') {
        setTimeout(() => app.updateEffectDisplay(), 100);
      }

      // Report to AppState for web admin sync
      if (window.kaiAPI?.renderer) {
        window.kaiAPI.renderer.updateEffectsState({ current: effectName });
      }
    } catch (error) {
      console.error('Failed to apply effect:', error);
    }
  };

  const randomEffect = () => {
    const enabledEffects = effects.filter(e => !disabledEffects.includes(e.name));
    if (enabledEffects.length === 0) return;

    const randomIndex = Math.floor(Math.random() * enabledEffects.length);
    const randomEffect = enabledEffects[randomIndex];
    console.log('🎲 Random effect:', randomEffect.displayName);
    selectEffect(randomEffect.name);
  };

  const enableEffect = async (effectName) => {
    const updated = disabledEffects.filter(e => e !== effectName);
    setDisabledEffects(updated);

    // Save to settings
    try {
      if (window.kaiAPI?.settings) {
        const waveformPrefs = await window.kaiAPI.settings.get('waveformPreferences') || {};
        waveformPrefs.disabledEffects = updated;
        await window.kaiAPI.settings.set('waveformPreferences', waveformPrefs);
      }
    } catch (error) {
      console.error('Failed to save disabled effects:', error);
    }
  };

  const disableEffect = async (effectName) => {
    const updated = [...disabledEffects, effectName];
    setDisabledEffects(updated);

    // Save to settings
    try {
      if (window.kaiAPI?.settings) {
        const waveformPrefs = await window.kaiAPI.settings.get('waveformPreferences') || {};
        waveformPrefs.disabledEffects = updated;
        await window.kaiAPI.settings.set('waveformPreferences', waveformPrefs);
      }
    } catch (error) {
      console.error('Failed to save disabled effects:', error);
    }
  };

  return (
    <EffectsPanel
      effects={effects}
      currentEffect={currentEffect}
      disabledEffects={disabledEffects}
      searchTerm={searchTerm}
      currentCategory={currentCategory}
      onSearch={setSearchTerm}
      onCategoryChange={setCurrentCategory}
      onSelectEffect={selectEffect}
      onRandomEffect={randomEffect}
      onEnableEffect={enableEffect}
      onDisableEffect={disableEffect}
    />
  );
}

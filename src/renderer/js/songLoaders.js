/**
 * Song Loading Utilities
 * Extracted from main.js to simplify song loading logic
 */

/**
 * Load CDG format song
 */
export async function loadCDGSong(app, songData, metadata) {
  app.player.currentFormat = 'cdg';
  app.player.currentPlayer = app.player.cdgPlayer;

  // Set song end callback
  app.player.currentPlayer.onSongEnded(() => app.handleSongEnded());

  // Set up audio context for CDG renderer (PA output only)
  if (!app.kaiPlayer) {
    console.error('💿 Audio engine not initialized');
    app.updateStatus('Error: Audio engine not ready');
    return;
  }

  // Get PA audio context for playback
  const paContext = app.kaiPlayer.audioContexts.PA;
  const paMasterGain = app.kaiPlayer.outputNodes.PA.masterGain;

  // Create gain node for CDG audio in PA context
  const cdgGainNode = paContext.createGain();
  cdgGainNode.connect(paMasterGain);

  // Create analyser in PA context
  const analyserNode = paContext.createAnalyser();
  analyserNode.fftSize = 2048;
  // Analyser taps the signal but doesn't affect routing
  cdgGainNode.connect(analyserNode);

  // Set audio context in CDG renderer (PA context for playback)
  app.player.cdgPlayer.setAudioContext(paContext, cdgGainNode, analyserNode);

  // Load CDG data
  await app.player.cdgPlayer.loadSong(songData);

  // Load microphone settings for CDG (after micEngine is initialized)
  if (app.player.cdgPlayer.micEngine) {
    const micToSpeakers = await window.kaiAPI.settings.get('micToSpeakers', true);
    const enableMic = await window.kaiAPI.settings.get('enableMic', true);
    const autoTunePrefs = await window.kaiAPI.settings.get('autoTunePreferences', {});

    // Apply settings to microphone engine
    app.player.cdgPlayer.micEngine.micToSpeakers = micToSpeakers;
    app.player.cdgPlayer.micEngine.enableMic = enableMic;

    if (autoTunePrefs.enabled !== undefined) {
      app.player.cdgPlayer.micEngine.autotuneSettings.enabled = autoTunePrefs.enabled;
    }
    if (autoTunePrefs.strength !== undefined) {
      app.player.cdgPlayer.micEngine.autotuneSettings.strength = autoTunePrefs.strength;
    }
    if (autoTunePrefs.speed !== undefined) {
      app.player.cdgPlayer.micEngine.autotuneSettings.speed = autoTunePrefs.speed;
    }

    // Start microphone if enabled
    if (enableMic) {
      const devicePrefs = await window.kaiAPI.settings.get('devicePreferences', {});
      const inputDeviceId = devicePrefs?.input?.id || 'default';
      await app.player.cdgPlayer.startMicrophoneInput(inputDeviceId);
    }
  }

  // Load and apply waveform preferences from settings for CDG
  const waveformPrefs = await window.kaiAPI.settings.get('waveformPreferences', {
    enableEffects: true,
    randomEffectOnSong: false,
    overlayOpacity: 0.7,
  });

  // Load device preferences for microphone
  await app.player.karaokeRenderer.ensureInputDeviceSelection();

  // Apply preferences to CDG player
  app.player.cdgPlayer.setOverlayOpacity(waveformPrefs.overlayOpacity);
  app.player.cdgPlayer.setEffectsEnabled(waveformPrefs.enableEffects);

  // Set Butterchurn effects canvas for CDG background
  await setupButterchurnForCDG(app, songData, waveformPrefs);

  // CDG doesn't use audio engine or lyrics
  // Include requester from songData if not in metadata
  const fullMetadata = {
    ...metadata,
    requester: metadata.requester || songData.requester || app.currentSong?.requester,
  };
  app.player.onSongLoaded(fullMetadata);

  // Broadcast that CDG is ready (clear loading state)
  if (window.kaiAPI?.renderer) {
    window.kaiAPI.renderer.songLoaded({
      path: app.currentSong?.originalFilePath || app.currentSong?.filePath,
      metadata: metadata,
      isLoading: false,
      title: metadata?.title || 'CDG Song',
      artist: metadata?.artist || 'Unknown Artist',
      format: 'cdg',
      duration: app.player.cdgPlayer?.getDuration() || 0,
      requester: app.currentSong?.requester || 'KJ',
    });
  }

  // Controls now managed by React TransportControlsWrapper
  app.updateStatus(`Loaded: ${metadata?.title || 'CDG Song'}`);
}

/**
 * Load KAI format song
 */
export async function loadKAISong(app, songData, metadata) {
  app.player.currentFormat = 'kai';
  app.player.currentPlayer = app.kaiPlayer;

  // Set song end callback
  app.player.currentPlayer.onSongEnded(() => app.handleSongEnded());

  // CLEAN SLATE APPROACH: Reinitialize audio engine
  if (app.kaiPlayer && app.currentSong) {
    // Create a backup copy of the song data BEFORE reinitialize
    const songDataBackup = {
      ...app.currentSong,
      audio: app.currentSong.audio
        ? {
            ...app.currentSong.audio,
            sources: app.currentSong.audio.sources ? [...app.currentSong.audio.sources] : [],
          }
        : null,
    };

    await app.kaiPlayer.reinitialize();
    await app.kaiPlayer.loadSong(songDataBackup);

    // Restore the original song data if it was corrupted
    if (!app.currentSong.audio && songDataBackup.audio) {
      app.currentSong.audio = songDataBackup.audio;
    }
    if (!app.currentSong.lyrics && songDataBackup.lyrics) {
      app.currentSong.lyrics = songDataBackup.lyrics;
    }
  }

  // CLEAN SLATE APPROACH: Reinitialize karaoke renderer
  if (app.player && app.currentSong) {
    if (app.player.karaokeRenderer) {
      app.player.karaokeRenderer.reinitialize();
    }

    // Pass full song data which includes lyrics, audio sources, and updated duration from audio engine
    const fullMetadata = {
      ...metadata,
      lyrics: app.currentSong.lyrics,
      duration: app.kaiPlayer
        ? app.kaiPlayer.getDuration()
        : app.currentSong.metadata?.duration || 0,
      audio: app.currentSong.audio, // Include audio sources for vocals waveform
      requester: metadata.requester || songData.requester || app.currentSong.requester,
    };
    app.player.onSongLoaded(fullMetadata);

    // Load and apply waveform preferences from settings for KAI
    const waveformPrefs = await window.kaiAPI.settings.get('waveformPreferences', {
      enableWaveforms: true,
      enableEffects: true,
      randomEffectOnSong: false,
      showUpcomingLyrics: true,
      overlayOpacity: 0.7,
    });

    // Apply preferences to karaokeRenderer
    if (app.player.karaokeRenderer) {
      app.player.karaokeRenderer.setWaveformsEnabled(waveformPrefs.enableWaveforms);
      app.player.karaokeRenderer.setEffectsEnabled(waveformPrefs.enableEffects);
      app.player.karaokeRenderer.setShowUpcomingLyrics(waveformPrefs.showUpcomingLyrics);
      app.player.karaokeRenderer.waveformPreferences.overlayOpacity = waveformPrefs.overlayOpacity;

      // Connect butterchurn to PA analyser for visualization (KAI format)
      if (app.kaiPlayer?.outputNodes?.PA?.analyser) {
        app.player.karaokeRenderer.setVisualizationAnalyser(app.kaiPlayer.outputNodes.PA.analyser);
      }

      // Restart microphone capture if waveforms are enabled
      if (waveformPrefs.enableWaveforms) {
        setTimeout(() => {
          app.player.karaokeRenderer.startMicrophoneCapture();
        }, 100);
      }

      // Update effect display with current preset
      setTimeout(() => app.updateEffectDisplay(), 100);

      // Apply random effect if enabled
      await applyRandomEffectIfEnabled(app, waveformPrefs);
    }
  }

  // Wait for all contexts and buffers to be ready
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Clear pending metadata
  app._pendingMetadata = null;
}

/**
 * Setup Butterchurn for CDG visualization
 */
async function setupButterchurnForCDG(app, songData, waveformPrefs) {
  if (app.player.karaokeRenderer.effectsCanvas && app.player.karaokeRenderer.butterchurn) {
    app.player.cdgPlayer.setEffectsCanvas(
      app.player.karaokeRenderer.effectsCanvas,
      app.player.karaokeRenderer.butterchurn
    );

    // Connect butterchurn to CDG's PA analyser (already connected to CDG audio source)
    if (app.player.cdgPlayer.analyserNode) {
      app.player.karaokeRenderer.setVisualizationAnalyser(app.player.cdgPlayer.analyserNode);
    }

    // Apply random effect if enabled
    await applyRandomEffectIfEnabled(app, waveformPrefs);
  }
}

/**
 * Load M4A Stems format song
 */
export async function loadM4ASong(app, songData, metadata) {
  app.player.currentFormat = 'm4a-stems';
  app.player.currentPlayer = app.kaiPlayer;

  // Set song end callback
  app.player.currentPlayer.onSongEnded(() => app.handleSongEnded());

  // CLEAN SLATE APPROACH: Reinitialize audio engine (same as KAI)
  if (app.kaiPlayer && app.currentSong) {
    // Create a backup copy of the song data BEFORE reinitialize
    const songDataBackup = {
      ...app.currentSong,
      audio: app.currentSong.audio
        ? {
            ...app.currentSong.audio,
            sources: app.currentSong.audio.sources ? [...app.currentSong.audio.sources] : [],
          }
        : null,
    };

    await app.kaiPlayer.reinitialize();
    await app.kaiPlayer.loadSong(songDataBackup);

    // Restore the original song data if it was corrupted
    if (!app.currentSong.audio && songDataBackup.audio) {
      app.currentSong.audio = songDataBackup.audio;
    }
    if (!app.currentSong.lyrics && songDataBackup.lyrics) {
      app.currentSong.lyrics = songDataBackup.lyrics;
    }
  }

  // CLEAN SLATE APPROACH: Reinitialize karaoke renderer
  if (app.player && app.currentSong) {
    if (app.player.karaokeRenderer) {
      app.player.karaokeRenderer.reinitialize();
    }

    // Pass full song data which includes lyrics, audio sources, and updated duration
    const fullMetadata = {
      ...metadata,
      lyrics: app.currentSong.lyrics,
      duration: app.kaiPlayer
        ? app.kaiPlayer.getDuration()
        : app.currentSong.metadata?.duration || 0,
      audio: app.currentSong.audio, // Include audio sources for vocals waveform
      requester: metadata.requester || songData.requester || app.currentSong.requester,
    };
    app.player.onSongLoaded(fullMetadata);

    // Load and apply waveform preferences from settings
    const waveformPrefs = await window.kaiAPI.settings.get('waveformPreferences', {
      enableWaveforms: true,
      enableEffects: true,
      randomEffectOnSong: false,
      showUpcomingLyrics: true,
      overlayOpacity: 0.7,
    });

    // Apply preferences to karaokeRenderer
    if (app.player.karaokeRenderer) {
      app.player.karaokeRenderer.setWaveformsEnabled(waveformPrefs.enableWaveforms);
      app.player.karaokeRenderer.setEffectsEnabled(waveformPrefs.enableEffects);
      app.player.karaokeRenderer.setShowUpcomingLyrics(waveformPrefs.showUpcomingLyrics);
      app.player.karaokeRenderer.waveformPreferences.overlayOpacity = waveformPrefs.overlayOpacity;

      // Connect butterchurn to PA analyser for visualization (M4A format)
      if (app.kaiPlayer?.outputNodes?.PA?.analyser) {
        app.player.karaokeRenderer.setVisualizationAnalyser(app.kaiPlayer.outputNodes.PA.analyser);
      }

      // Restart microphone capture if waveforms are enabled
      if (waveformPrefs.enableWaveforms) {
        setTimeout(() => {
          app.player.karaokeRenderer.startMicrophoneCapture();
        }, 100);
      }

      // Update effect display with current preset
      setTimeout(() => app.updateEffectDisplay(), 100);

      // Apply random effect if enabled
      await applyRandomEffectIfEnabled(app, waveformPrefs);
    }
  }

  // Wait for all contexts and buffers to be ready
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Clear pending metadata
  app._pendingMetadata = null;
}

/**
 * Apply random Butterchurn effect if enabled (with debouncing)
 */
function applyRandomEffectIfEnabled(app, waveformPrefs) {
  if (waveformPrefs.randomEffectOnSong && app.player.karaokeRenderer.butterchurn) {
    // Clear any existing timeout
    if (app.randomEffectTimeout) {
      clearTimeout(app.randomEffectTimeout);
    }

    app.randomEffectTimeout = setTimeout(async () => {
      try {
        await window.kaiAPI.effects.random();
      } catch (error) {
        console.error('Failed to apply random effect:', error);
      }
    }, 500);
  }
}

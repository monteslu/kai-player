/**
 * MixerTab - Complete audio settings tab for renderer
 *
 * Combines:
 * - MixerPanel (shared gain controls)
 * - AudioDeviceSettings (renderer-only device selection)
 */

import React, { useState, useEffect } from 'react';
import { MixerPanel } from '../../shared/components/MixerPanel.jsx';
import { AudioDeviceSettings } from './AudioDeviceSettings.jsx';

export function MixerTab({ bridge }) {
  const [mixerState, setMixerState] = useState({
    PA: { gain: 0, muted: false },
    IEM: { gain: 0, muted: false },
    mic: { gain: 0, muted: false },
  });
  const [audioDevices, setAudioDevices] = useState({ pa: [], iem: [], input: [] });
  const [selectedDevices, setSelectedDevices] = useState({ pa: '', iem: '', input: '' });
  const [audioSettings, setAudioSettings] = useState({
    iemMonoVocals: true,
    micToSpeakers: true,
    enableMic: true,
  });

  // Subscribe to mixer state updates
  useEffect(() => {
    if (!bridge) return;

    const unsubscribe = bridge.onMixerChanged?.((mixer) => {
      // Extract only bus-level mixer (PA, IEM, mic) - ignore stem mixer properties
      const busLevelMixer = {
        PA: mixer.PA || { gain: 0, muted: false },
        IEM: mixer.IEM || { gain: 0, muted: false },
        mic: mixer.mic || { gain: 0, muted: false },
      };

      setMixerState(busLevelMixer);
    });

    // Fetch initial state
    bridge
      .getMixerState?.()
      .then((state) => {
        // Extract only bus-level mixer (PA, IEM, mic)
        const busLevelMixer = {
          PA: state.PA || { gain: 0, muted: false },
          IEM: state.IEM || { gain: 0, muted: false },
          mic: state.mic || { gain: 0, muted: false },
        };

        setMixerState(busLevelMixer);
      })
      .catch(console.error);

    return () => unsubscribe && unsubscribe();
  }, [bridge]);

  // Fetch audio devices on mount
  useEffect(() => {
    if (!bridge) return;

    const loadDevicesAndPreferences = async () => {
      try {
        // Load audio settings
        const settings = await bridge.getAudioSettings?.();
        if (settings) {
          setAudioSettings(settings);
        }

        // Enumerate devices
        const devices = await bridge.getAudioDevices?.();
        const outputDevices = devices.filter((d) => d.maxOutputChannels > 0);
        const inputDevices = devices.filter((d) => d.maxInputChannels > 0);

        setAudioDevices({
          pa: outputDevices,
          iem: outputDevices,
          input: inputDevices,
        });

        // Load saved device preferences
        const preferences = await bridge.getDevicePreferences?.();

        // Restore device selections
        const restored = {};
        for (const [type, savedDevice] of Object.entries(preferences || {})) {
          if (!savedDevice) continue;

          const deviceList = type === 'input' ? inputDevices : outputDevices;

          // Try to match by ID first
          let matchedDevice = deviceList.find((d) => d.deviceId === savedDevice.id);

          // If no ID match, try matching by name
          if (!matchedDevice && savedDevice.name) {
            matchedDevice = deviceList.find(
              (d) => d.label === savedDevice.name || d.name === savedDevice.name
            );
          }

          if (matchedDevice) {
            const lowerType = type.toLowerCase();
            restored[lowerType] = matchedDevice.deviceId;

            // Set the device via bridge - sequential initialization to ensure proper device setup
            // eslint-disable-next-line no-await-in-loop
            await bridge.setAudioDevice?.(type, matchedDevice.deviceId);
          }
        }

        if (Object.keys(restored).length > 0) {
          setSelectedDevices((prev) => ({ ...prev, ...restored }));
        }
      } catch (error) {
        console.error('Failed to load devices and preferences:', error);
      }
    };

    loadDevicesAndPreferences();
  }, [bridge]);

  // Mixer gain/mute controls
  const handleSetMasterGain = (bus, gain) => {
    bridge?.setMasterGain?.(bus, gain);
  };

  const handleToggleMasterMute = (bus) => {
    bridge?.toggleMasterMute?.(bus);
  };

  // Device selection
  const handleDeviceChange = async (type, deviceId) => {
    // Map type to uppercase for bridge (pa -> PA, iem -> IEM, input -> input)
    const deviceType = type === 'pa' ? 'PA' : type === 'iem' ? 'IEM' : type;

    try {
      await bridge?.setAudioDevice?.(deviceType, deviceId);
      setSelectedDevices((prev) => ({ ...prev, [type]: deviceId }));

      // Save device preference
      const deviceList =
        type === 'input' ? audioDevices.input : type === 'iem' ? audioDevices.iem : audioDevices.pa;
      const device = deviceList.find((d) => d.deviceId === deviceId);

      if (device) {
        const preferences = (await bridge.getDevicePreferences?.()) || {};
        preferences[deviceType] = {
          id: deviceId,
          name: device.label || device.name,
          deviceKind: device.deviceKind,
        };
        console.log(`💾 Saving device preference for ${deviceType}:`, preferences[deviceType]);
        await bridge.saveDevicePreferences?.(preferences);
        console.log(`✅ Device preferences saved successfully`);
      } else {
        console.warn(`⚠️ Device not found in list for ${type}:`, deviceId);
      }
    } catch (error) {
      console.error('Failed to change device:', error);
    }
  };

  // Audio settings
  const handleSettingChange = async (setting, value) => {
    setAudioSettings((prev) => ({ ...prev, [setting]: value }));

    // Save audio setting
    try {
      await bridge.saveAudioSettings?.({ [setting]: value });
    } catch (error) {
      console.error('Failed to save audio setting:', error);
    }
  };

  // Refresh devices
  const handleRefreshDevices = () => {
    bridge
      ?.getAudioDevices?.()
      .then((devices) => {
        const outputDevices = devices.filter((d) => d.maxOutputChannels > 0);
        const inputDevices = devices.filter((d) => d.maxInputChannels > 0);

        setAudioDevices({
          pa: outputDevices,
          iem: outputDevices,
          input: inputDevices,
        });
      })
      .catch(console.error);
  };

  return (
    <div className="p-5 h-full overflow-y-auto">
      <div className="mb-8">
        <h2 className="m-0 mb-5 text-2xl text-gray-900 dark:text-gray-100">Audio Mixer</h2>
        <MixerPanel
          mixerState={mixerState}
          onSetMasterGain={handleSetMasterGain}
          onToggleMasterMute={handleToggleMasterMute}
        />
      </div>

      <AudioDeviceSettings
        devices={audioDevices}
        selected={selectedDevices}
        settings={audioSettings}
        onDeviceChange={handleDeviceChange}
        onSettingChange={handleSettingChange}
        onRefreshDevices={handleRefreshDevices}
      />
    </div>
  );
}

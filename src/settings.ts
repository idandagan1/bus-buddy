import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { milesToMeters } from './geo';

export type ToneId = 'default' | 'beacon' | 'rise' | 'marimba' | 'pulse' | 'bells';

export const TONES: { id: ToneId; name: string; description: string; file: string | null; source: number | null }[] = [
  { id: 'default', name: 'iPhone alarm', description: 'The standard system alarm sound', file: null, source: null },
  { id: 'rise', name: 'Rise', description: 'Bright chimes that climb up', file: 'rise.wav', source: require('../assets/sounds/rise.wav') },
  { id: 'marimba', name: 'Marimba', description: 'Warm wooden melody', file: 'marimba.wav', source: require('../assets/sounds/marimba.wav') },
  { id: 'bells', name: 'Bells', description: 'Slow, deep bell strikes', file: 'bells.wav', source: require('../assets/sounds/bells.wav') },
  { id: 'beacon', name: 'Beacon', description: 'Two-tone beeping', file: 'beacon.wav', source: require('../assets/sounds/beacon.wav') },
  { id: 'pulse', name: 'Pulse', description: 'Urgent digital triple beep', file: 'pulse.wav', source: require('../assets/sounds/pulse.wav') },
];

// Measured along the route through the trip's stops (see distanceAlongPath).
export const RADII_M = [0.5, 1, 1.5, 2].map(milesToMeters);
export const BACKUP_OPTIONS_MIN = [0, 5, 10, 15];

export type Settings = { tone: ToneId; radiusM: number; backupMin: number; vibrateOnly: boolean };

const DEFAULTS: Settings = { tone: 'rise', radiusM: milesToMeters(1), backupMin: 5, vibrateOnly: false };
const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(KEY).catch(() => null);
  const settings: Settings = { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  // Older versions offered distances in km; those fall back to the default.
  return RADII_M.includes(settings.radiusM) ? settings : { ...settings, radiusM: DEFAULTS.radiusM };
}

export async function saveSettings(settings: Settings) {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}

// AlarmKit has no vibration setting; a silent sound leaves only the system's alarm vibration.
export const alarmSound = (s: Settings) => (s.vibrateOnly ? 'silent.wav' : (TONES.find((t) => t.id === s.tone)?.file ?? null));

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);
  async function update(patch: Partial<Settings>) {
    const next = { ...(settings ?? DEFAULTS), ...patch };
    setSettings(next);
    await saveSettings(next);
  }
  return [settings, update] as const;
}

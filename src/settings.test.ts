import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { milesToMeters } from './geo';
import { alarmSound, loadSettings, RADII_M, saveSettings, useSettings, type Settings, type ToneId } from './settings';

const DEFAULTS: Settings = { tone: 'rise', radiusM: milesToMeters(1), backupMin: 5, vibrateOnly: false };
const stored = async () => JSON.parse((await AsyncStorage.getItem('settings'))!);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('loadSettings', () => {
  it('uses the defaults on first launch', async () => {
    await expect(loadSettings()).resolves.toEqual(DEFAULTS);
  });

  it('fills in settings added since they were saved', async () => {
    await AsyncStorage.setItem('settings', JSON.stringify({ tone: 'bells' }));
    await expect(loadSettings()).resolves.toEqual({ ...DEFAULTS, tone: 'bells' });
  });

  it('replaces a distance from the km days with the default, keeping the rest', async () => {
    await AsyncStorage.setItem('settings', JSON.stringify({ tone: 'pulse', radiusM: 2000, backupMin: 10 }));
    await expect(loadSettings()).resolves.toEqual({ ...DEFAULTS, tone: 'pulse', backupMin: 10 });
  });

  it('keeps each offered distance', async () => {
    for (const radiusM of RADII_M) {
      await saveSettings({ ...DEFAULTS, radiusM });
      expect((await loadSettings()).radiusM).toBe(radiusM);
    }
  });

  it('uses the defaults when storage fails or holds null', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('locked'));
    await expect(loadSettings()).resolves.toEqual(DEFAULTS);
    await AsyncStorage.setItem('settings', 'null');
    await expect(loadSettings()).resolves.toEqual(DEFAULTS);
  });

  it('uses the defaults when the saved settings are corrupt', async () => {
    await AsyncStorage.setItem('settings', '{"tone":');
    await expect(loadSettings()).resolves.toEqual(DEFAULTS);
  });
});

describe('alarmSound', () => {
  it('plays the chosen tone’s file', () => {
    expect(alarmSound({ ...DEFAULTS, tone: 'marimba' })).toBe('marimba.wav');
  });

  it('uses the system sound for the iPhone alarm', () => {
    expect(alarmSound({ ...DEFAULTS, tone: 'default' })).toBeNull();
  });

  it('is silent for vibrate only, whatever the tone', () => {
    expect(alarmSound({ ...DEFAULTS, tone: 'default', vibrateOnly: true })).toBe('silent.wav');
    expect(alarmSound({ ...DEFAULTS, tone: 'bells', vibrateOnly: true })).toBe('silent.wav');
  });

  it('falls back to the system sound for a tone that no longer exists', () => {
    expect(alarmSound({ ...DEFAULTS, tone: 'chirp' as ToneId })).toBeNull();
  });
});

describe('useSettings', () => {
  it('is null until loaded', async () => {
    let release!: (v: string | null) => void;
    (AsyncStorage.getItem as jest.Mock).mockReturnValueOnce(new Promise((r) => (release = r)));
    const { result } = await renderHook(() => useSettings());
    expect(result.current[0]).toBeNull();
    await act(async () => release(JSON.stringify({ backupMin: 15 })));
    expect(result.current[0]).toEqual({ ...DEFAULTS, backupMin: 15 });
  });

  it('applies and saves a change', async () => {
    const { result } = await renderHook(() => useSettings());
    await act(() => result.current[1]({ vibrateOnly: true }));
    expect(result.current[0]).toEqual({ ...DEFAULTS, vibrateOnly: true });
    await expect(stored()).resolves.toEqual({ ...DEFAULTS, vibrateOnly: true });
  });

  it('builds on the defaults for a change made before loading finishes', async () => {
    (AsyncStorage.getItem as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    const { result } = await renderHook(() => useSettings());
    await act(() => result.current[1]({ tone: 'beacon' }));
    expect(result.current[0]).toEqual({ ...DEFAULTS, tone: 'beacon' });
    await expect(stored()).resolves.toEqual({ ...DEFAULTS, tone: 'beacon' });
  });
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { setAudioModeAsync } from 'expo-audio';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import SettingsScreen from '@/app/settings';
import { loadSettings, TONES } from '@/settings';

jest.mock('react-native-reanimated', () => jest.requireActual('./reanimatedMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) } }));
const mockPlayer = { replace: jest.fn(), seekTo: jest.fn(), play: jest.fn(), pause: jest.fn() };
const mockStatus = { playing: false };
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
}));

const source = (id: string) => TONES.find((t) => t.id === id)!.source;
// The chip or tone row's label; the chosen one is drawn in white on blue.
const chipOn = (label: string) => screen.getByText(label).props.style.some((s: unknown) => s && (s as { color?: string }).color === '#fff');

async function open(saved?: object) {
  if (saved) await AsyncStorage.setItem('settings', JSON.stringify(saved));
  await render(<SettingsScreen />);
  await act(async () => {});
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockStatus.playing = false;
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Settings screen', () => {
  it('shows every section with the saved choices marked', async () => {
    await open({ tone: 'bells', radiusM: 3219, backupMin: 10, vibrateOnly: false });
    expect(screen.getByText('Wake-up settings')).toBeOnTheScreen();
    for (const t of TONES) expect(screen.getByText(t.name)).toBeOnTheScreen();
    expect(screen.getByText('no preview')).toBeOnTheScreen();
    expect(screen.getAllByText('▶')).toHaveLength(TONES.length - 1);
    expect(chipOn('Sound + vibration')).toBe(true);
    expect(chipOn('Vibration only')).toBe(false);
    expect(chipOn('2 mi')).toBe(true);
    expect(chipOn('0.5 mi')).toBe(false);
    expect(chipOn('10 min before')).toBe(true);
    expect(screen.getByText('Off')).toBeOnTheScreen();
    // Native: no note about the alarm only ringing on iPhone.
    expect(screen.queryByText(/runs in the iPhone app/)).toBeNull();
    // Previews ring through the silent switch.
    expect(setAudioModeAsync).toHaveBeenCalledWith({ playsInSilentMode: true });
  });

  it('picks a tone and plays a preview of it', async () => {
    await open();
    await fireEvent.press(screen.getByText('Marimba'));
    expect(mockPlayer.replace).toHaveBeenCalledWith(source('marimba'));
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(mockPlayer.play).toHaveBeenCalled();
    expect((await loadSettings()).tone).toBe('marimba');
  });

  it('picks the system tone without a preview', async () => {
    await open();
    await fireEvent.press(screen.getByText('iPhone alarm'));
    expect(mockPlayer.play).not.toHaveBeenCalled();
    expect((await loadSettings()).tone).toBe('default');
  });

  it('stops a playing preview when its play button is tapped again', async () => {
    await open();
    const play = () => screen.getAllByText('▶')[0];
    await fireEvent.press(play());
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);

    // While it plays the button pulses instead of showing ▶.
    mockStatus.playing = true;
    await fireEvent.press(screen.getByText('Beacon'));
    expect(screen.getAllByText('▶')).toHaveLength(TONES.length - 2);
    await fireEvent.press(screen.getByText('Beacon'));
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('▶')).toHaveLength(TONES.length - 1);
    // Tapping the row also chose that tone.
    expect((await loadSettings()).tone).toBe('beacon');
  });

  it('switches to vibration only and dims the tones', async () => {
    await open();
    await fireEvent.press(screen.getByText('Vibration only'));
    expect(chipOn('Vibration only')).toBe(true);
    expect((await loadSettings()).vibrateOnly).toBe(true);
    let row = screen.getByText('Rise').parent;
    while (row && row.props.pointerEvents === undefined) row = row.parent;
    expect(row?.props.pointerEvents).toBe('none');

    await fireEvent.press(screen.getByText('Sound + vibration'));
    expect((await loadSettings()).vibrateOnly).toBe(false);
  });

  it('saves the ring distance and backup alarm', async () => {
    await open();
    await fireEvent.press(screen.getByText('1.5 mi'));
    await fireEvent.press(screen.getByText('Off'));
    expect(chipOn('1.5 mi')).toBe(true);
    expect(chipOn('Off')).toBe(true);
    const saved = await loadSettings();
    expect(saved.radiusM).toBe(2414);
    expect(saved.backupMin).toBe(0);
  });

  it('explains on the website that the alarm runs in the iPhone app', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    await open();
    expect(screen.getByText('The wake-up alarm runs in the iPhone app. You can preview tones here.')).toBeOnTheScreen();
  });

  it('goes back, or home when there is no history', async () => {
    await open();
    await fireEvent.press(screen.getByText('‹ Back'));
    expect(router.back).toHaveBeenCalled();
    jest.mocked(router.canGoBack).mockReturnValue(false);
    await fireEvent.press(screen.getByText('‹ Back'));
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('keeps working when the audio session can’t be set', async () => {
    jest.mocked(setAudioModeAsync).mockRejectedValueOnce(new Error('no audio'));
    await open();
    expect(screen.getByText('Alarm tone')).toBeOnTheScreen();
  });
});

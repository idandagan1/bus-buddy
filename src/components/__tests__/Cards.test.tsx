import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { handoffRoutesForIos, useInstall } from '@/install';
import type { Advisory } from '@/types';
import { Advisories } from '../Advisories';
import { DayTabs } from '../DayTabs';
import { InstallCard } from '../InstallCard';
import { showToast, Toast } from '../Toast';

jest.mock('react-native-reanimated', () => jest.requireActual('./reanimatedMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }) }));
jest.mock('@/install', () => ({ useInstall: jest.fn(), handoffRoutesForIos: jest.fn() }));

describe('DayTabs', () => {
  const tabs = [
    { key: '2026-11-19', label: 'Today' },
    { key: '2026-11-20', label: 'Fri' },
    { key: '2026-11-21', label: 'Sat' },
  ];

  it('lists the days and picks one on tap', async () => {
    const onSelect = jest.fn();
    await render(<DayTabs tabs={tabs} selected="2026-11-19" onSelect={onSelect} />);
    expect(screen.getByText('Today')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Sat'));
    expect(onSelect).toHaveBeenCalledWith('2026-11-21');
  });

  it('copes with no selection and with a selection that isn’t a tab', async () => {
    await render(<DayTabs tabs={tabs} selected={undefined} onSelect={jest.fn()} />);
    await fireEvent(screen.getByText('Fri'), 'layout', { nativeEvent: { layout: { width: 50 } } });
    await render(<DayTabs tabs={tabs} selected="2027-01-01" onSelect={jest.fn()} />);
    expect(screen.getByText('Fri')).toBeOnTheScreen();
  });

  it('renders no tabs for an empty list', async () => {
    await render(<DayTabs tabs={[]} selected={undefined} onSelect={jest.fn()} />);
    expect(screen.queryByText(/./)).toBeNull();
  });
});

describe('Advisories', () => {
  const advisory = (id: string, severity: Advisory['severity'], heading: string, paragraphs: string[] = []): Advisory => ({
    id,
    severity,
    heading,
    paragraphs,
    updated: null,
  });

  it('shows nothing without alerts', async () => {
    await render(<Advisories advisories={[]} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('lists the most severe first', async () => {
    await render(
      <Advisories
        advisories={[advisory('a', 'info', 'Holiday schedule'), advisory('b', 'high', 'Detour on Route 4'), advisory('c', 'low', 'Elevator out')]}
      />,
    );
    expect(screen.getAllByText(/Holiday|Detour|Elevator/).map((t) => t.props.children)).toEqual([
      'Detour on Route 4',
      'Elevator out',
      'Holiday schedule',
    ]);
  });

  it('previews the first paragraph and expands to all of them on tap', async () => {
    await render(<Advisories advisories={[advisory('a', 'high', 'Detour', ['Buses skip Main St.', 'Use Engle St instead.'])]} />);
    expect(screen.getByText('Buses skip Main St.')).toBeOnTheScreen();
    expect(screen.queryByText('Use Engle St instead.')).toBeNull();

    await fireEvent.press(screen.getByText('Detour'));
    expect(screen.getByText('Use Engle St instead.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Detour'));
    expect(screen.queryByText('Use Engle St instead.')).toBeNull();
  });

  it('opens one alert at a time', async () => {
    await render(<Advisories advisories={[advisory('a', 'high', 'First', ['', 'A body']), advisory('b', 'low', 'Second', ['', 'B body'])]} />);
    await fireEvent.press(screen.getByText('First'));
    await fireEvent.press(screen.getByText('Second'));
    expect(screen.queryByText('A body')).toBeNull();
    expect(screen.getByText('B body')).toBeOnTheScreen();
  });

  it('shows a heading with no text under it', async () => {
    await render(<Advisories advisories={[advisory('a', 'low', 'Just a heading')]} />);
    expect(screen.getByText('Just a heading')).toBeOnTheScreen();
    expect(screen.getByText('ℹ️')).toBeOnTheScreen();
  });
});

describe('Toast', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows a message for a few seconds', async () => {
    await render(<Toast />);
    expect(screen.toJSON()).toBeNull();

    await act(async () => showToast('Route saved'));
    expect(screen.getByText('Route saved')).toBeOnTheScreen();

    await act(async () => jest.advanceTimersByTime(2499));
    expect(screen.getByText('Route saved')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(1));
    expect(screen.queryByText('Route saved')).toBeNull();
  });

  it('replaces the message and restarts the clock for a new one', async () => {
    await render(<Toast />);
    await act(async () => showToast('First'));
    await act(async () => jest.advanceTimersByTime(2000));
    await act(async () => showToast('Second'));
    expect(screen.queryByText('First')).toBeNull();
    await act(async () => jest.advanceTimersByTime(2000));
    expect(screen.getByText('Second')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(500));
    expect(screen.queryByText('Second')).toBeNull();
  });

  it('shows the same text again when sent twice', async () => {
    await render(<Toast />);
    await act(async () => showToast('Saved'));
    await act(async () => jest.advanceTimersByTime(2000));
    await act(async () => showToast('Saved'));
    await act(async () => jest.advanceTimersByTime(2000));
    expect(screen.getByText('Saved')).toBeOnTheScreen();
  });

  it('is quiet when no Toast is mounted', () => {
    expect(() => showToast('Nobody listening')).not.toThrow();
  });
});

describe('InstallCard', () => {
  const install = jest.fn();
  const dismiss = jest.fn();
  const mockInstall = (mode: 'prompt' | 'steps' | null, steps: string[] = []) =>
    jest.mocked(useInstall).mockReturnValue({ mode, steps, install, dismiss });

  beforeEach(() => jest.clearAllMocks());

  it('shows nothing when the app is installed or native', async () => {
    mockInstall(null);
    await render(<InstallCard />);
    expect(screen.toJSON()).toBeNull();
  });

  it('installs through the browser’s prompt when it offers one', async () => {
    mockInstall('prompt');
    await render(<InstallCard />);
    await fireEvent.press(screen.getByText('Install'));
    expect(install).toHaveBeenCalledTimes(1);
    expect(handoffRoutesForIos).not.toHaveBeenCalled();
  });

  it('shows numbered steps where there is no prompt', async () => {
    mockInstall('steps', ['Tap Share', 'Tap Add to Home Screen']);
    await render(<InstallCard />);
    expect(screen.queryByText('1. Tap Share')).toBeNull();
    await fireEvent.press(screen.getByText('Show me how'));
    expect(handoffRoutesForIos).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1. Tap Share')).toBeOnTheScreen();
    expect(screen.getByText('2. Tap Add to Home Screen')).toBeOnTheScreen();
    expect(screen.queryByText('Show me how')).toBeNull();
  });

  it('can be dismissed', async () => {
    mockInstall('steps');
    await render(<InstallCard />);
    await fireEvent.press(screen.getByLabelText('Not now'));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});

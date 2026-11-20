import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Platform, Text } from 'react-native';
import type { LiveSummary } from '@/live';
import { useOnline } from '@/network';
import { Collapsible, Hero, Page, PressableScale, PulseDot, Skeleton, tapFeedback, ToggleIcon } from '@/ui';
import { LiveStatus } from '../LiveStatus';
import { OfflineBanner } from '../OfflineBanner';

jest.mock('react-native-reanimated', () => jest.requireActual('./reanimatedMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 30, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/network', () => ({ useOnline: jest.fn() }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

const summary = (over: Partial<LiveSummary> = {}): LiveSummary => ({
  text: 'Leaving 5 min late',
  tone: 'warn',
  stage: 'upcoming',
  live: true,
  departure: '2026-11-19T17:05:00Z',
  arrival: '2026-11-19T17:52:00Z',
  arrivalDelayMin: 7,
  vehicle: null,
  ...over,
});

describe('LiveStatus', () => {
  it('adds the expected arrival to a late upcoming bus', async () => {
    await render(<LiveStatus summary={summary()} />);
    expect(screen.getByText('Leaving 5 min late · ≈ 12:52 PM')).toBeOnTheScreen();
  });

  it('keeps to the summary line when compact, and adds the arrival inline', async () => {
    await render(<LiveStatus summary={summary()} compact />);
    expect(screen.getByText('Leaving 5 min late')).toBeOnTheScreen();
    await render(<LiveStatus summary={summary()} inline />);
    expect(screen.getByText('Leaving 5 min late · ≈ 12:52 PM')).toBeOnTheScreen();
  });

  it('shows an on-time or past status as is', async () => {
    await render(<LiveStatus summary={summary({ text: 'On time', tone: 'good', arrivalDelayMin: null })} />);
    expect(screen.getByText('On time')).toBeOnTheScreen();
    await render(<LiveStatus summary={summary({ text: 'Departed 12:05 PM', stage: 'departed', live: false })} />);
    expect(screen.getByText('Departed 12:05 PM')).toBeOnTheScreen();
  });
});

describe('OfflineBanner', () => {
  it('says so while offline', async () => {
    jest.mocked(useOnline).mockReturnValue(false);
    await render(<OfflineBanner />);
    expect(screen.getByText('No internet · showing saved data')).toBeOnTheScreen();
  });

  it('stays hidden online and while the connection is unknown', async () => {
    jest.mocked(useOnline).mockReturnValue(true);
    await render(<OfflineBanner />);
    expect(screen.queryByText(/No internet/)).toBeNull();
    jest.mocked(useOnline).mockReturnValue(null);
    await render(<OfflineBanner />);
    expect(screen.queryByText(/No internet/)).toBeNull();
  });
});

describe('ui', () => {
  const scroll = (y: number) => ({
    nativeEvent: { layoutMeasurement: { height: 800 }, contentOffset: { y }, contentSize: { height: 3000 } },
  });

  it('renders a page with its hero and content', async () => {
    await render(
      <Page hero={<Hero overlap={false}><Text>Hero title</Text></Hero>} overlap={false}>
        <Text>Body</Text>
      </Page>,
    );
    expect(screen.getByText('Hero title')).toBeOnTheScreen();
    expect(screen.getByText('Body')).toBeOnTheScreen();
  });

  it('asks for more once scrolled near the end', async () => {
    const onEndReached = jest.fn();
    await render(
      <Page onEndReached={onEndReached}>
        <Text>Rows</Text>
      </Page>,
    );
    let scroller = screen.getByText('Rows');
    while (scroller.type !== 'RCTScrollView') scroller = scroller.parent!;
    await fireEvent(scroller, 'scroll', scroll(100));
    expect(onEndReached).not.toHaveBeenCalled();
    await fireEvent(scroller, 'scroll', scroll(1700));
    expect(onEndReached).toHaveBeenCalledTimes(1);
  });

  it('presses through with haptic feedback', async () => {
    const onPress = jest.fn();
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    await render(
      <PressableScale onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} accessibilityRole="button">
        <Text>Tap</Text>
      </PressableScale>,
    );
    const button = screen.getByRole('button');
    await fireEvent(button, 'pressIn');
    await fireEvent(button, 'pressOut');
    await fireEvent.press(button);
    expect(onPressIn).toHaveBeenCalled();
    expect(onPressOut).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalled();
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it('presses without handlers', async () => {
    await render(
      <PressableScale accessibilityRole="button">
        <Text>Tap</Text>
      </PressableScale>,
    );
    const button = screen.getByRole('button');
    await fireEvent(button, 'pressIn');
    await fireEvent(button, 'pressOut');
    await fireEvent.press(button);
    expect(button).toBeOnTheScreen();
  });

  it('skips haptics on the web', () => {
    jest.mocked(Haptics.selectionAsync).mockClear();
    const os = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      tapFeedback();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    }
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('draws the pulse dot and skeleton placeholders', async () => {
    await render(
      <>
        <PulseDot />
        <PulseDot color="#f00" size={6} />
        <Skeleton />
        <Skeleton height={40} width={120} />
      </>,
    );
    expect(screen.toJSON()).toBeTruthy();
  });

  it('measures a collapsible body and hides it from screen readers while closed', async () => {
    await render(
      <Collapsible expanded={false}>
        <Text>Details</Text>
      </Collapsible>,
    );
    const body = screen.getByText('Details', { includeHiddenElements: true }).parent!;
    await fireEvent(body, 'layout', { nativeEvent: { layout: { height: 120 } } });
    expect(screen.queryByText('Details')).toBeNull();
  });

  it('shows the open/close toggle either way', async () => {
    await render(<ToggleIcon open={false} color="#000" />);
    expect(screen.getByText('+')).toBeOnTheScreen();
    await render(<ToggleIcon open color="#000" />);
    expect(screen.getByText('+')).toBeOnTheScreen();
  });
});

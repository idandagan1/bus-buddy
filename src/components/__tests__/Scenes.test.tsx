import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { finishWelcome, useFirstRun } from '@/firstRun';
import { Moon, NightSky } from '@/components/NightSky';
import { RouteSketch } from '@/components/RouteSketch';
import { Welcome } from '@/components/Welcome';

// Reduced motion is switchable so both the still and the animated scene get rendered.
let mockStill = true;
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('./reanimatedMock'), useReducedMotion: () => mockStill }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 10, left: 0, right: 0 }) }));
jest.mock('@/firstRun', () => ({ useFirstRun: jest.fn(), finishWelcome: jest.fn() }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockStill = true;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Welcome', () => {
  it('shows nothing until storage is read, or once welcomed', async () => {
    jest.mocked(useFirstRun).mockReturnValue(null);
    await render(<Welcome />);
    expect(screen.queryByLabelText('Meet Bus Buddy')).toBeNull();
    jest.mocked(useFirstRun).mockReturnValue({ welcome: false, nudge: true });
    await render(<Welcome />);
    expect(screen.queryByLabelText('Meet Bus Buddy')).toBeNull();
  });

  it.each([true, false])('rides off and finishes the welcome once (reduced motion: %s)', async (still) => {
    mockStill = still;
    jest.mocked(useFirstRun).mockReturnValue({ welcome: true, nudge: true });
    await render(<Welcome />);
    expect(screen.getByLabelText('Meet Bus Buddy')).toBeTruthy();
    expect(screen.getByText('Commuting')).toBeTruthy();
    expect(screen.getByLabelText('A bus driving on a sunny day')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button'));
    // The bus drives off first unless motion is reduced, then the scene fades.
    const total = (still ? 0 : 1100) + 450;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(total - 1);
    });
    expect(finishWelcome).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(finishWelcome).toHaveBeenCalledTimes(1);
  });

  it('ignores a second tap while leaving', async () => {
    jest.mocked(useFirstRun).mockReturnValue({ welcome: true, nudge: true });
    await render(<Welcome />);
    const button = screen.getByRole('button');
    await fireEvent.press(button);
    await fireEvent.press(button);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });
    expect(finishWelcome).toHaveBeenCalledTimes(1);
  });
});

describe('NightSky', () => {
  it('renders its content over the stars', async () => {
    await render(
      <NightSky>
        <Text>Sleep well</Text>
      </NightSky>,
    );
    expect(screen.getByText('Sleep well')).toBeTruthy();
  });

  it('sizes the moon from its prop, 140 by default', async () => {
    const box = (size: number) => ({ width: size * 1.6, height: size * 1.6 });
    await render(<Moon />);
    expect(screen.toJSON()).toMatchObject({ props: { style: expect.objectContaining(box(140)) } });
    await render(<Moon size={100} />);
    expect(screen.toJSON()).toMatchObject({ props: { style: expect.objectContaining(box(100)) } });
  });
});

describe('RouteSketch', () => {
  const path = [
    { latitude: 40.76, longitude: -73.99 },
    { latitude: 40.85, longitude: -73.97 },
    { latitude: 40.92, longitude: -73.96 },
  ];
  const layout = (width: number) => fireEvent(screen.getByTestId('sketch').children[0] as never, 'layout', { nativeEvent: { layout: { width } } });
  const host = () => screen.getByTestId('sketch');
  const json = () => JSON.stringify(screen.toJSON());

  const renderSketch = (me: { latitude: number; longitude: number } | null, p = path) =>
    render(
      <View testID="sketch">
        <RouteSketch path={p} me={me} />
      </View>,
    );

  it('draws nothing until it knows its width', async () => {
    await renderSketch(null);
    expect(json()).not.toContain('a7b4fc');
    expect(host().children).toHaveLength(1);
  });

  type Node = { type: string; props: Record<string, unknown>; children: Node[] | null };
  const nodes = (type: string) => {
    const out: Node[] = [];
    const walk = (n: Node | string) => {
      if (typeof n === 'string') return;
      if (n.type === type) out.push(n);
      n.children?.forEach(walk);
    };
    walk(screen.toJSON() as Node);
    return out;
  };
  // Small stop dots (the destination is drawn bigger), and their fill as react-native-svg stores it (ARGB).
  const stopFills = () => nodes('RNSVGCircle').filter((c) => c.props.r === 2.5).map((c) => (c.props.fill as { payload: number }).payload);
  const INDIGO = 0xffa5b4fc;
  const FAINT = 0x73ffffff;

  it('draws the stops without the rider when there is no position', async () => {
    await renderSketch(null);
    await layout(300);
    // The dashed route only, the two stops before the destination, and the destination's dot and halo.
    expect(nodes('RNSVGPath')).toHaveLength(1);
    expect(stopFills()).toEqual([FAINT, FAINT]);
    expect(nodes('RNSVGCircle').filter((c) => c.props.r !== 2.5)).toHaveLength(2);
    expect(json()).not.toContain('6366f1');
  });

  it('marks the rider and the stretch already travelled', async () => {
    // Just past the first stop: only it counts as travelled.
    await renderSketch({ latitude: 40.77, longitude: -73.99 });
    await layout(300);
    expect(json()).toContain('6366f1');
    expect(nodes('RNSVGPath')).toHaveLength(2);
    expect(stopFills()).toEqual([INDIGO, FAINT]);
  });

  it('counts every stop as travelled once the rider is near the end', async () => {
    await renderSketch({ latitude: 40.91, longitude: -73.96 });
    await layout(300);
    expect(stopFills()).toEqual([INDIGO, INDIGO]);
  });

  it('copes with a degenerate path where every point is the same', async () => {
    const p = [path[2], path[2]];
    await renderSketch(path[2], p);
    await layout(300);
    expect(json()).not.toContain('NaN');
  });
});

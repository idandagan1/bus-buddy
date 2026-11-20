import { fireEvent, render, screen } from '@testing-library/react-native';
import { track } from '@/analytics';
import { formatTime } from '@/api';
import type { Stop, Trip } from '@/types';
import { CarrierTag } from '../CarrierTag';
import { ErrorState, StaleNote } from '../ErrorState';
import { GateBadge } from '../GateBadge';
import { RouteBadge } from '../RouteBadge';

jest.mock('react-native-reanimated', () => jest.requireActual('./reanimatedMock'));
jest.mock('@/analytics', () => ({ track: jest.fn() }));

const stop = (carrier?: 'NJT') => ({ id: 's', name: 'Stop', town: 'Tenafly', state: 'NJ', latitude: 0, longitude: 0, carrier }) as Stop;
const trip = (route: string, carrierCode = 'NJT') => ({ route, carrierCode }) as Trip;

describe('GateBadge', () => {
  it('names the gate', async () => {
    await render(<GateBadge gate="410" />);
    expect(screen.getByText('Gate 410')).toBeOnTheScreen();
  });
});

describe('CarrierTag', () => {
  it('names NJ Transit for its stops', async () => {
    await render(<CarrierTag stop={stop('NJT')} />);
    expect(screen.getByText('NJ Transit')).toBeOnTheScreen();
  });

  it('names Coach USA when the stop has no carrier', async () => {
    await render(<CarrierTag stop={stop()} onDark />);
    expect(screen.getByText('Coach USA')).toBeOnTheScreen();
  });
});

describe('RouteBadge', () => {
  it('shows just the line, and spells out NJ Transit variants for screen readers', async () => {
    const routes = ['166', '166T', '166X'];
    await render(
      <>
        <RouteBadge trip={trip('166')} routes={routes} />
        <RouteBadge trip={trip('166T')} routes={routes} />
        <RouteBadge trip={trip('166X')} routes={routes} />
      </>,
    );
    expect(screen.getByText('166X')).toBeOnTheScreen();
    expect(screen.queryByText('166X Express')).toBeNull();
    expect(screen.getByLabelText('166 Local')).toBeOnTheScreen();
    expect(screen.getByLabelText('166T Turnpike')).toBeOnTheScreen();
    expect(screen.getByLabelText('166X Express')).toBeOnTheScreen();
  });

  it('leaves a lone local plain', async () => {
    await render(<RouteBadge trip={trip('166')} routes={[]} />);
    expect(screen.getByText('166')).toBeOnTheScreen();
  });

  it('marks Coach USA routes as Coach', async () => {
    await render(<RouteBadge trip={trip('20', 'CUSA')} routes={['20', '166']} />);
    expect(screen.getByText('20')).toBeOnTheScreen();
    expect(screen.getByLabelText('Coach 20')).toBeOnTheScreen();
  });
});

describe('CarrierTag removal', () => {
  it('offers an ✕ that takes the added carrier off', async () => {
    const onRemove = jest.fn();
    await render(<CarrierTag stop={{ id: 'c', name: 'c', town: '', state: '', latitude: 0, longitude: 0 }} onRemove={onRemove} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Coach USA' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe('ErrorState', () => {
  it('reports each time a rider sees it, and each Try again', async () => {
    jest.mocked(track).mockClear();
    const onRetry = jest.fn();
    const message = "Couldn't load the schedule: Coach USA isn't responding.";
    await render(<ErrorState offline={false} message={message} onRetry={onRetry} compact />);
    expect(track).toHaveBeenCalledWith('error_shown', { message, offline: false, compact: true });
    await fireEvent.press(screen.getByText('Try again'));
    expect(track).toHaveBeenCalledWith('error_retry', { message, offline: false });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('reports being offline, without a message', async () => {
    jest.mocked(track).mockClear();
    await render(<ErrorState offline onRetry={jest.fn()} />);
    expect(track).toHaveBeenCalledWith('error_shown', { message: null, offline: true, compact: false });
  });

  it('explains being offline and ignores the message', async () => {
    await render(<ErrorState offline message="Boom" onRetry={jest.fn()} />);
    expect(screen.getByText('No internet connection')).toBeOnTheScreen();
    expect(screen.getByText(/Connect to Wi-Fi or mobile data/)).toBeOnTheScreen();
    expect(screen.queryByText(/Boom/)).toBeNull();
  });

  it('shows the error message when online', async () => {
    await render(<ErrorState offline={false} message="Couldn't load stops: Coach USA isn't responding." onRetry={jest.fn()} />);
    expect(screen.getByText("Couldn't load data")).toBeOnTheScreen();
    expect(screen.getByText("Couldn't load stops: Coach USA isn't responding. Try again in a moment.")).toBeOnTheScreen();
  });

  it('falls back to a general message when there is none', async () => {
    await render(<ErrorState offline={false} message={null} onRetry={jest.fn()} compact />);
    expect(screen.getByText('The server is not responding right now. Try again in a moment.')).toBeOnTheScreen();
  });

  it('retries on tap', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState offline={false} onRetry={onRetry} />);
    await fireEvent.press(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('StaleNote', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-19T17:00:00Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows nothing for a fresh schedule', async () => {
    await render(<StaleNote cachedAt={null} offline={false} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('says it’s offline even without a saved time', async () => {
    await render(<StaleNote cachedAt={null} offline />);
    expect(screen.getByText('📡 Offline · Showing saved schedule')).toBeOnTheScreen();
  });

  it('gives the time for a copy saved today', async () => {
    const at = Date.now() - 60 * 60000;
    await render(<StaleNote cachedAt={at} offline={false} />);
    expect(screen.getByText(`↻ Showing saved schedule from ${formatTime(new Date(at).toISOString())}`)).toBeOnTheScreen();
  });

  it('adds the date for an older copy', async () => {
    const at = Date.now() - 3 * 24 * 60 * 60000;
    await render(<StaleNote cachedAt={at} offline />);
    expect(screen.getByText(/^📡 Offline · Showing saved schedule from Nov 16, /)).toBeOnTheScreen();
  });
});

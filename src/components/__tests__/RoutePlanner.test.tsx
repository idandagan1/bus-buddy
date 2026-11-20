import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { RoutePlanner } from '../RoutePlanner';
import type { Stop } from '@/types';

jest.mock('react-native-reanimated', () => jest.requireActual('./reanimatedMock'));

const stop = (id: string, name: string, extra: Partial<Stop> = {}): Stop => ({
  id,
  name,
  town: 'Tenafly',
  state: 'NJ',
  latitude: 40.9,
  longitude: -73.9,
  ...extra,
});

const pabt = stop('c1', 'Port Authority Bus Terminal', { town: 'New York', state: 'NY' });
const tenafly = stop('c2', 'Tenafly Ave & Main St');
const teaneck = stop('c3', 'Teaneck Rd & Cedar Ln', { town: 'Teaneck' });
const njtCorner = stop('njt:1', 'Port Authority Bus Terminal', {
  town: 'New York',
  state: 'NY',
  carrier: 'NJT',
  sameCorner: true,
  code: '3511',
  routes: ['166', '166X'],
});

type Reply = { status?: number; body: unknown } | Error;
let reply: (q: string, origin: string | null) => Reply;
const fetchMock = jest.fn();

// Each call answers from `reply`, by the query and origin the search sent.
beforeEach(() => {
  jest.useFakeTimers();
  reply = () => ({ body: [pabt, tenafly, teaneck] });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const params = new URLSearchParams(url.split('?')[1]);
    const r = reply(params.get('q') ?? '', params.get('origin'));
    if (r instanceof Error) throw r;
    const status = r.status ?? 200;
    return { ok: status < 400, status, json: async () => r.body };
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

const searches = () =>
  fetchMock.mock.calls.map(([url]: [string]) => {
    const p = new URLSearchParams(url.split('?')[1]);
    return { q: p.get('q'), origin: p.get('origin') };
  });

const wait = (ms: number) => act(async () => {
  await jest.advanceTimersByTimeAsync(ms);
});

// The picked stop's name can also show in a field, so the result row is the last match.
const pressResult = async (name: string) => {
  await wait(250);
  await fireEvent.press(screen.getAllByText(name).at(-1)!);
};

const type = (placeholder: string, text: string) => fireEvent.changeText(screen.getByPlaceholderText(placeholder), text);

describe('RoutePlanner search', () => {
  it('opens on From and lists stops for an empty query', async () => {
    await render(<RoutePlanner onSave={jest.fn()} />);
    expect(screen.getByPlaceholderText('Stop, town, or stop #')).toBeOnTheScreen();
    expect(await screen.findByText('Tenafly Ave & Main St')).toBeOnTheScreen();
    expect(searches()).toEqual([{ q: '', origin: null }]);
  });

  it('waits for typing to pause before searching', async () => {
    await render(<RoutePlanner onSave={jest.fn()} />);
    await wait(250);
    fetchMock.mockClear();

    await type('Stop, town, or stop #', 'T');
    await wait(100);
    await type('Stop, town, or stop #', 'Te');
    await wait(100);
    await type('Stop, town, or stop #', 'Ten');
    await wait(249);
    expect(fetchMock).not.toHaveBeenCalled();

    await wait(1);
    expect(searches()).toEqual([{ q: 'Ten', origin: null }]);
  });

  it('sends a whitespace-only query as typed', async () => {
    await render(<RoutePlanner onSave={jest.fn()} />);
    await type('Stop, town, or stop #', '   ');
    await wait(250);
    expect(searches().at(-1)).toEqual({ q: '   ', origin: null });
  });

  it('says so when nothing matches', async () => {
    reply = (q) => ({ body: q === 'zzz' ? [] : [pabt] });
    await render(<RoutePlanner onSave={jest.fn()} />);
    await type('Stop, town, or stop #', 'zzz');
    expect(await screen.findByText('No stops match “zzz”.')).toBeOnTheScreen();
    expect(screen.queryByText('Port Authority Bus Terminal')).toBeNull();
  });

  it('shows at most 25 results', async () => {
    reply = () => ({ body: Array.from({ length: 30 }, (_, i) => stop(`s${i}`, `Stop number ${i}`)) });
    await render(<RoutePlanner onSave={jest.fn()} />);
    expect(await screen.findByText('Stop number 24')).toBeOnTheScreen();
    expect(screen.queryByText('Stop number 25')).toBeNull();
  });

  it('shows the offline state when the request never leaves the phone, and retries', async () => {
    let online = false;
    reply = () => (online ? { body: [tenafly] } : new TypeError('Network request failed'));
    await render(<RoutePlanner onSave={jest.fn()} />);
    expect(await screen.findByText('No internet connection')).toBeOnTheScreen();

    online = true;
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Tenafly Ave & Main St')).toBeOnTheScreen();
    expect(screen.queryByText('No internet connection')).toBeNull();
  });

  it('names the failing carrier when the server says which one', async () => {
    reply = () => ({ status: 502, body: { source: 'coachusa' } });
    await render(<RoutePlanner onSave={jest.fn()} />);
    await wait(250 + 1000);
    expect(screen.getByText("Couldn't load data")).toBeOnTheScreen();
    expect(screen.getByText("Couldn't load stops: Coach USA isn't responding. Try again in a moment.")).toBeOnTheScreen();
    // A server error gets one quiet retry before the error shows.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('blames our own server when the error has no body', async () => {
    reply = () => ({ status: 404, body: null });
    await render(<RoutePlanner onSave={jest.fn()} />);
    expect(
      await screen.findByText("Couldn't load stops: the Bus Buddy server had a hiccup. Try again in a moment."),
    ).toBeOnTheScreen();
  });

  it('shows a Coach USA stop by town and state', async () => {
    reply = () => ({ body: [pabt] });
    await render(<RoutePlanner onSave={jest.fn()} />);
    expect(await screen.findByText('New York, NY')).toBeOnTheScreen();
    expect(screen.getByText('Coach USA')).toBeOnTheScreen();
  });

  it('shows a same-corner NJ Transit stop under the Coach USA one, with its number and buses', async () => {
    reply = () => ({ body: [pabt, njtCorner] });
    await render(<RoutePlanner onSave={jest.fn()} />);
    expect(await screen.findByText('Same corner as above · New York, NY · Stop #3511 · Buses 166, 166X')).toBeOnTheScreen();
    expect(screen.getByText('NJ Transit')).toBeOnTheScreen();
    // Listed in the order the server gave: the Coach USA stop first.
    const names = screen.getAllByText('Port Authority Bus Terminal');
    expect(names).toHaveLength(2);
    expect(screen.getAllByText(/Coach USA|NJ Transit/).map((t) => t.props.children)).toEqual(['Coach USA', 'NJ Transit']);
  });

  it('describes an NJ Transit stop with no town, no number or no routes', async () => {
    reply = () => ({
      body: [
        stop('njt:2', 'Bare stop', { carrier: 'NJT', town: '', state: '' }),
        stop('njt:3', 'One-bus stop', { carrier: 'NJT', town: '', state: '', code: '42', routes: ['20'] }),
        stop('njt:4', 'Empty routes stop', { carrier: 'NJT', town: 'Dumont', routes: [] }),
      ],
    });
    await render(<RoutePlanner onSave={jest.fn()} />);
    expect(await screen.findByText('NJ Transit bus')).toBeOnTheScreen();
    expect(screen.getByText('Stop #42 · Bus 20')).toBeOnTheScreen();
    expect(screen.getByText('Dumont, NJ · NJ Transit bus')).toBeOnTheScreen();
  });

  it('keeps the newest query’s results when an older answer arrives late', async () => {
    const pending: Record<string, (body: Stop[]) => void> = {};
    fetchMock.mockImplementation((url: string) => {
      const q = new URLSearchParams(url.split('?')[1]).get('q') ?? '';
      return new Promise((resolve) => {
        pending[q] = (body) => resolve({ ok: true, status: 200, json: async () => body });
      });
    });
    await render(<RoutePlanner onSave={jest.fn()} />);
    await type('Stop, town, or stop #', 'te');
    await wait(250);
    await type('Stop, town, or stop #', 'tenafly');
    await wait(250);

    await act(async () => pending.tenafly([tenafly]));
    await act(async () => pending.te([teaneck]));
    expect(screen.getByText('Tenafly Ave & Main St')).toBeOnTheScreen();
    expect(screen.queryByText('Teaneck Rd & Cedar Ln')).toBeNull();
  });
});

describe('RoutePlanner choosing a route', () => {
  it('asks for To after From, searching only stops reachable from the origin', async () => {
    reply = (_q, origin) => ({ body: origin ? [tenafly] : [pabt, tenafly, teaneck] });
    await render(<RoutePlanner onSave={jest.fn()} />);
    await fireEvent.press(await screen.findByText('Port Authority Bus Terminal'));

    expect(screen.getByPlaceholderText('Where to, buddy?')).toBeOnTheScreen();
    expect(screen.getByText('New York, NY')).toBeOnTheScreen();
    expect(await screen.findByText('Tenafly Ave & Main St')).toBeOnTheScreen();
    expect(screen.queryByText('Teaneck Rd & Cedar Ln')).toBeNull();
    expect(searches().at(-1)).toEqual({ q: '', origin: 'c1' });
  });

  it('clears the typed query when a stop is chosen', async () => {
    await render(<RoutePlanner onSave={jest.fn()} />);
    await type('Stop, town, or stop #', 'port');
    await fireEvent.press(await screen.findByText('Port Authority Bus Terminal'));
    expect(screen.getByPlaceholderText('Where to, buddy?').props.value).toBe('');
  });

  it('saves the chosen pair', async () => {
    const onSave = jest.fn();
    await render(<RoutePlanner onSave={onSave} saveLabel="Add route" />);
    await fireEvent.press(await screen.findByText('Port Authority Bus Terminal'));
    await fireEvent.press(await screen.findByText('Tenafly Ave & Main St'));

    expect(screen.queryByPlaceholderText(/./)).toBeNull();
    await fireEvent.press(screen.getByText('Add route  →'));
    expect(onSave).toHaveBeenCalledWith(pabt, tenafly);
  });

  it('labels the button "Save route" by default and hides it until both ends are set', async () => {
    await render(<RoutePlanner onSave={jest.fn()} />);
    expect(screen.queryByText('Save route  →')).toBeNull();
    await fireEvent.press(await screen.findByText('Port Authority Bus Terminal'));
    expect(screen.queryByText('Save route  →')).toBeNull();
    await fireEvent.press(await screen.findByText('Tenafly Ave & Main St'));
    expect(screen.getByText('Save route  →')).toBeOnTheScreen();
  });

  it("won't open To before there's an origin", async () => {
    await render(<RoutePlanner onSave={jest.fn()} nudge="waiting" />);
    await fireEvent.press(screen.getByText('Where to, buddy?'));
    expect(screen.queryByPlaceholderText('Where to, buddy?')).toBeNull();
    await wait(300);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('starts closed with an existing route and edits either end on tap', async () => {
    await render(<RoutePlanner onSave={jest.fn()} initialFrom={pabt} initialTo={tenafly} />);
    expect(screen.getByText('Save route  →')).toBeOnTheScreen();
    expect(screen.queryByPlaceholderText(/./)).toBeNull();

    await fireEvent.press(screen.getByText('Tenafly Ave & Main St'));
    // The picked stop's name becomes the hint while searching again.
    expect(screen.getByPlaceholderText('Tenafly Ave & Main St')).toBeOnTheScreen();
    expect(screen.queryByText('Save route  →')).toBeNull();
    await wait(250);
    expect(searches().at(-1)).toEqual({ q: '', origin: 'c1' });
  });

  it('keeps To when a different From is chosen', async () => {
    await render(<RoutePlanner onSave={jest.fn()} initialFrom={pabt} initialTo={tenafly} />);
    await fireEvent.press(screen.getByText('Port Authority Bus Terminal'));
    await fireEvent.press(await screen.findByText('Teaneck Rd & Cedar Ln'));
    expect(screen.getByText('Teaneck Rd & Cedar Ln')).toBeOnTheScreen();
    expect(screen.getByText('Tenafly Ave & Main St')).toBeOnTheScreen();
    expect(screen.getByText('Save route  →')).toBeOnTheScreen();
  });

  it('drops To when From is changed to the same stop', async () => {
    await render(<RoutePlanner onSave={jest.fn()} initialFrom={pabt} initialTo={tenafly} />);
    await fireEvent.press(screen.getByText('Port Authority Bus Terminal'));
    await pressResult('Tenafly Ave & Main St');
    expect(screen.queryByText('Save route  →')).toBeNull();
    expect(screen.getAllByText('Tenafly Ave & Main St')).toHaveLength(1);
  });

  it('asks for a new To after dropping the old one', async () => {
    await render(<RoutePlanner onSave={jest.fn()} initialFrom={pabt} initialTo={tenafly} />);
    await fireEvent.press(screen.getByText('Port Authority Bus Terminal'));
    await pressResult('Tenafly Ave & Main St');
    expect(screen.getByPlaceholderText('Where to, buddy?')).toBeOnTheScreen();
  });

  it('doesn’t quote an empty query when an origin reaches nowhere', async () => {
    reply = (_q, origin) => ({ body: origin ? [] : [pabt] });
    await render(<RoutePlanner onSave={jest.fn()} />);
    await fireEvent.press(await screen.findByText('Port Authority Bus Terminal'));
    await wait(250);
    expect(screen.queryByText('No stops match “”.')).toBeNull();
  });

  it('nudges a first-time user at From instead of opening the keyboard', async () => {
    const onNudged = jest.fn();
    await render(<RoutePlanner onSave={jest.fn()} nudge="now" onNudged={onNudged} />);
    expect(screen.queryByPlaceholderText(/./)).toBeNull();
    expect(screen.getByText('Where do you catch the bus?')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Where do you catch the bus?'));
    expect(onNudged).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText('Where do you catch the bus?')).toBeOnTheScreen();
  });
});

describe('RoutePlanner swap', () => {
  const swapButton = () => screen.getByLabelText('Swap from and to');

  it('is disabled with neither end chosen', async () => {
    await render(<RoutePlanner onSave={jest.fn()} nudge="waiting" />);
    expect(swapButton()).toBeDisabled();
  });

  it('swaps both ends and saves them the other way round', async () => {
    const onSave = jest.fn();
    await render(<RoutePlanner onSave={onSave} initialFrom={pabt} initialTo={tenafly} />);
    await fireEvent.press(swapButton());
    await fireEvent.press(screen.getByText('Save route  →'));
    expect(onSave).toHaveBeenCalledWith(tenafly, pabt);
  });

  it('moves a lone origin to To and asks for a new From', async () => {
    await render(<RoutePlanner onSave={jest.fn()} />);
    await fireEvent.press(await screen.findByText('Port Authority Bus Terminal'));
    fetchMock.mockClear();

    await fireEvent.press(swapButton());
    expect(screen.getByPlaceholderText('Stop, town, or stop #')).toBeOnTheScreen();
    expect(screen.getByText('New York, NY')).toBeOnTheScreen();
    await wait(250);
    // From searches every stop, not ones reachable from anything.
    expect(searches()).toEqual([{ q: '', origin: null }]);
  });

  it('keeps the field being typed in on the same stop after a swap', async () => {
    await render(<RoutePlanner onSave={jest.fn()} initialFrom={pabt} initialTo={tenafly} />);
    await fireEvent.press(screen.getByText('Tenafly Ave & Main St'));
    await type('Tenafly Ave & Main St', 'ten');
    fetchMock.mockClear();

    await fireEvent.press(swapButton());
    // Tenafly is now From, and From is the open field; the typed text is cleared.
    const input = screen.getByPlaceholderText('Tenafly Ave & Main St');
    expect(input.props.value).toBe('');
    await wait(250);
    expect(searches()).toEqual([{ q: '', origin: null }]);
  });
});

// Pulling a page down on the website (a home-screen app has no reload of its own): far enough reloads it.
import { act, render, screen } from '@testing-library/react-native';
import { useRef, type ComponentRef } from 'react';
import type { ScrollView } from 'react-native';
import { TRIGGER_PX, useRefresh } from './refresh.web';

jest.mock('@/insets', () => ({ useInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

// The page's scrolling element, which takes the finger's touches.
const handlers = new Map<string, (e?: unknown) => void>();
const node = {
  scrollTop: 0,
  addEventListener: (type: string, fn: (e?: unknown) => void) => handlers.set(type, fn),
  removeEventListener: (type: string) => handlers.delete(type),
};
const reload = jest.fn();
(globalThis as Record<string, unknown>).window = { location: { reload } };

function Page({ enabled = true }: { enabled?: boolean }) {
  const scroll = useRef({ getScrollableNode: () => node } as unknown as ComponentRef<typeof ScrollView>);
  return useRefresh(enabled, scroll).indicator;
}

const touch = (y: number) => ({ touches: [{ clientY: y }] });
// A finger drags twice as far as the page moves.
async function pull(by: number) {
  await act(() => handlers.get('touchstart')!(touch(100)));
  await act(() => handlers.get('touchmove')!(touch(100 + by * 2)));
}
const release = () => act(() => handlers.get('touchend')!());

beforeEach(() => {
  handlers.clear();
  node.scrollTop = 0;
  reload.mockClear();
});

it('shows the arrow while pulling and reloads once let go past the mark', async () => {
  await render(<Page />);
  await pull(TRIGGER_PX / 2);
  expect(screen.getByLabelText('Pull to reload')).toBeOnTheScreen();
  await pull(TRIGGER_PX + 5);
  expect(screen.getByLabelText('Release to reload')).toBeOnTheScreen();
  await release();
  expect(reload).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Reloading')).toBeOnTheScreen();
});

it('springs back without reloading when let go too early', async () => {
  await render(<Page />);
  await pull(TRIGGER_PX - 10);
  await release();
  expect(reload).not.toHaveBeenCalled();
  expect(screen.queryByLabelText(/reload/i)).toBeNull();
});

it('ignores a drag that starts scrolled down, or scrolls away mid-pull', async () => {
  await render(<Page />);
  node.scrollTop = 200;
  await pull(TRIGGER_PX + 20);
  await release();
  expect(reload).not.toHaveBeenCalled();

  node.scrollTop = 0;
  await act(() => handlers.get('touchstart')!(touch(100)));
  node.scrollTop = 30;
  await act(() => handlers.get('touchmove')!(touch(400)));
  await release();
  expect(reload).not.toHaveBeenCalled();
  expect(screen.queryByLabelText(/reload/i)).toBeNull();
});

it('ignores dragging up', async () => {
  await render(<Page />);
  await pull(-50);
  await release();
  expect(reload).not.toHaveBeenCalled();
});

it('doesn’t listen on pages that aren’t refreshable, and stops listening when the page closes', async () => {
  await render(<Page enabled={false} />);
  expect(handlers.size).toBe(0);
  const { unmount } = await render(<Page />);
  expect(handlers.size).toBe(4);
  await unmount();
  expect(handlers.size).toBe(0);
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import { DayTabs } from '../DayTabs';

jest.mock('react-native-reanimated', () => jest.requireActual('./reanimatedMock'));

const tabs = [
  { key: 'thu', label: 'Thu, Nov 19' },
  { key: 'fri', label: 'Fri, Nov 20' },
  { key: 'sat', label: 'Sat, Nov 21' },
];

// The highlight pill: the first view in the bar, before the tabs.
const pill = () => {
  let bar = screen.getByText('Thu, Nov 19').parent!;
  while (!bar.props.horizontal) bar = bar.parent!;
  let first = bar;
  while (first.children.length && typeof first.children[0] !== 'string' && !first.props.style?.some?.((s: { position?: string }) => s?.position === 'absolute')) {
    first = first.children[0] as typeof bar;
  }
  return first.props.style.flat().reduce((a: object, s: object) => ({ ...a, ...s }), {});
};

const layout = async (label: string, width: number) =>
  fireEvent(screen.getByText(label), 'layout', { nativeEvent: { layout: { width, height: 36, x: 0, y: 0 } } });

describe('DayTabs highlight', () => {
  it('stays hidden until the tabs up to the selected one are measured, then sits under it', async () => {
    await render(<DayTabs tabs={tabs} selected="fri" onSelect={jest.fn()} />);
    await layout('Thu, Nov 19', 90);
    expect(pill().opacity).toBe(0);

    await layout('Fri, Nov 20', 100);
    // Re-measuring the same width changes nothing.
    await layout('Fri, Nov 20', 100);
    await screen.rerender(<DayTabs tabs={tabs} selected="fri" onSelect={jest.fn()} />);
    expect(pill()).toMatchObject({ opacity: 1, width: 100, transform: [{ translateX: 6 + 90 + 4 }] });
  });

  it('glides to a newly selected day', async () => {
    await render(<DayTabs tabs={tabs} selected="thu" onSelect={jest.fn()} />);
    await layout('Thu, Nov 19', 90);
    await layout('Fri, Nov 20', 100);
    await layout('Sat, Nov 21', 80);
    await screen.rerender(<DayTabs tabs={tabs} selected="thu" onSelect={jest.fn()} />);
    expect(pill()).toMatchObject({ width: 90, transform: [{ translateX: 6 }] });

    await screen.rerender(<DayTabs tabs={tabs} selected="sat" onSelect={jest.fn()} />);
    await screen.rerender(<DayTabs tabs={tabs} selected="sat" onSelect={jest.fn()} />);
    expect(pill()).toMatchObject({ width: 80, transform: [{ translateX: 6 + 90 + 4 + 100 + 4 }] });
  });
});

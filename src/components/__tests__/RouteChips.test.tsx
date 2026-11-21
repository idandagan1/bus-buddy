import { fireEvent, render, screen } from '@testing-library/react-native';
import { RouteChips } from '../RouteChips';
import type { Trip } from '@/types';

jest.mock('react-native-reanimated', () => jest.requireActual('./reanimatedMock'));

const trip = (route: string, carrierCode = 'NJT') => ({ id: `${route}-${Math.random()}`, route, carrierCode }) as Trip;
const njt = [trip('166'), trip('166X'), trip('166T'), trip('166')];
const chip = (name: string) => screen.getByRole('button', { name });

describe('RouteChips', () => {
  it('offers All and each line, in number order, labeled by kind', async () => {
    await render(<RouteChips trips={njt} onChange={jest.fn()} />);
    expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual([
      'All',
      '166 Local',
      '166T Turnpike',
      '166X Express',
    ]);
    expect(screen.getByText('166X')).toBeOnTheScreen();
  });

  it('marks All as chosen when nothing is chosen', async () => {
    await render(<RouteChips trips={njt} onChange={jest.fn()} />);
    expect(chip('All')).toBeSelected();
    expect(chip('166X Express')).not.toBeSelected();
  });

  it('marks the chosen lines', async () => {
    await render(<RouteChips trips={njt} only={['166X']} onChange={jest.fn()} />);
    expect(chip('All')).not.toBeSelected();
    expect(chip('166X Express')).toBeSelected();
    expect(chip('166 Local')).not.toBeSelected();
  });

  it('puts an ✕ on chosen lines only, so a filter that’s on reads as one', async () => {
    await render(<RouteChips trips={njt} only={['166T']} onChange={jest.fn()} />);
    expect(screen.getByText('166T  ✕')).toBeOnTheScreen();
    expect(screen.getByText('166X')).toBeOnTheScreen();
    expect(screen.getByText('All')).toBeOnTheScreen();
  });

  it('adds a line to the choice', async () => {
    const onChange = jest.fn();
    await render(<RouteChips trips={njt} only={['166X']} onChange={onChange} />);
    await fireEvent.press(chip('166 Local'));
    expect(onChange).toHaveBeenCalledWith(['166', '166X']);
  });

  it('removes a chosen line, back to every line when none is left', async () => {
    const onChange = jest.fn();
    await render(<RouteChips trips={njt} only={['166X']} onChange={onChange} />);
    await fireEvent.press(chip('166X Express'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('treats choosing every line as choosing none', async () => {
    const onChange = jest.fn();
    await render(<RouteChips trips={njt} only={['166', '166T']} onChange={onChange} />);
    await fireEvent.press(chip('166X Express'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('clears the choice from All', async () => {
    const onChange = jest.fn();
    await render(<RouteChips trips={njt} only={['166T']} onChange={onChange} />);
    await fireEvent.press(chip('All'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('marks Coach USA lines as Coach and leaves a lone NJ Transit line plain', async () => {
    await render(<RouteChips trips={[trip('20', 'CUSA'), trip('166')]} onChange={jest.fn()} />);
    expect(chip('Coach 20')).toBeOnTheScreen();
    expect(chip('166')).toBeOnTheScreen();
  });

  it('keeps a chosen line that has no trips right now, so it can be unchosen', async () => {
    const onChange = jest.fn();
    await render(<RouteChips trips={[trip('166')]} only={['166X']} onChange={onChange} />);
    expect(chip('166X Express')).toBeSelected();
    await fireEvent.press(chip('166X Express'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('shows nothing when there is only one line and no offer', async () => {
    await render(<RouteChips trips={[trip('166'), trip('166')]} onChange={jest.fn()} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows nothing while trips are loading', async () => {
    await render(<RouteChips trips={null} onChange={jest.fn()} offer={null} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows just the offer when there are no lines to choose', async () => {
    const onPress = jest.fn();
    await render(<RouteChips trips={[trip('20', 'CUSA')]} onChange={jest.fn()} offer={{ label: '+ 166 / 166X NJT', onPress }} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText('All')).toBeNull();
    await fireEvent.press(screen.getByText('+ 166 / 166X NJT'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('puts the offer after the lines, and choosing it doesn’t change the choice', async () => {
    const onChange = jest.fn();
    const onPress = jest.fn();
    await render(<RouteChips trips={njt} onChange={onChange} offer={{ label: '+ Coach USA', onPress }} />);
    expect(screen.getAllByRole('button').at(-1)).toHaveTextContent('+ Coach USA');
    await fireEvent.press(screen.getByText('+ Coach USA'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('works the same on the dark header', async () => {
    const onChange = jest.fn();
    await render(<RouteChips trips={njt} only={['166T']} onChange={onChange} onDark />);
    expect(chip('166T Turnpike')).toBeSelected();
    await fireEvent.press(chip('166X Express'));
    expect(onChange).toHaveBeenCalledWith(['166T', '166X']);
  });
});

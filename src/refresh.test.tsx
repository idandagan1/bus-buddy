// Pulling a page down in the iPhone app: a newer version installs if one is out, otherwise the page loads again.
import { act, render, screen } from '@testing-library/react-native';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { RefreshControl, Text } from 'react-native';
import { Page } from './ui';

jest.mock('react-native-reanimated', () => jest.requireActual('./components/__tests__/reanimatedMock'));
jest.mock('expo-updates', () => ({ checkForUpdateAsync: jest.fn(), fetchUpdateAsync: jest.fn(), reloadAsync: jest.fn() }));

let mounts = 0;
function Schedule() {
  useEffect(() => {
    mounts++;
  }, []);
  return <Text>buses</Text>;
}

const pullControl = () => screen.getByTestId('page').props.refreshControl as React.ReactElement<React.ComponentProps<typeof RefreshControl>> | undefined;

beforeEach(() => {
  mounts = 0;
  jest.mocked(Updates.checkForUpdateAsync).mockReset();
  jest.mocked(Updates.fetchUpdateAsync).mockReset();
  jest.mocked(Updates.reloadAsync).mockReset();
});

it('only pages that ask for it can be pulled', async () => {
  await render(<Page>{<Schedule />}</Page>);
  expect(pullControl()).toBeUndefined();
});

it('loads the page again when there’s no new version', async () => {
  jest.mocked(Updates.checkForUpdateAsync).mockResolvedValue({ isAvailable: false } as never);
  await render(<Page refreshable>{<Schedule />}</Page>);
  expect(mounts).toBe(1);
  await act(() => pullControl()!.props.onRefresh!());
  expect(mounts).toBe(2);
  expect(Updates.reloadAsync).not.toHaveBeenCalled();
  expect(pullControl()!.props.refreshing).toBe(false);
  expect(screen.getByText('buses')).toBeOnTheScreen();
});

it('installs a new version when one is out', async () => {
  jest.mocked(Updates.checkForUpdateAsync).mockResolvedValue({ isAvailable: true } as never);
  await render(<Page refreshable>{<Schedule />}</Page>);
  await act(() => pullControl()!.props.onRefresh!());
  expect(Updates.fetchUpdateAsync).toHaveBeenCalled();
  expect(Updates.reloadAsync).toHaveBeenCalled();
});

it('still loads the page again when checking for a version fails (no connection, dev build)', async () => {
  jest.mocked(Updates.checkForUpdateAsync).mockRejectedValue(new Error('offline'));
  await render(<Page refreshable>{<Schedule />}</Page>);
  await act(() => pullControl()!.props.onRefresh!());
  expect(mounts).toBe(2);
  expect(pullControl()!.props.refreshing).toBe(false);
});

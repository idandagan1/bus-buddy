import { renderHook } from '@testing-library/react-native';
import { useNetworkState } from 'expo-network';
import { useOnline } from './network';

jest.mock('expo-network', () => ({ useNetworkState: jest.fn() }));
const networkState = useNetworkState as jest.Mock;

const online = async (state: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => {
  networkState.mockReturnValue(state);
  return (await renderHook(() => useOnline())).result.current;
};

describe('useOnline', () => {
  it('is null while the first check is pending', async () => {
    expect(await online({})).toBeNull();
    expect(await online({ isConnected: null, isInternetReachable: null })).toBeNull();
  });

  it('is online when connected, even before reachability is known', async () => {
    expect(await online({ isConnected: true, isInternetReachable: true })).toBe(true);
    expect(await online({ isConnected: true })).toBe(true);
  });

  it('is offline when not connected', async () => {
    expect(await online({ isConnected: false })).toBe(false);
  });

  it('is offline on Wi-Fi with no internet behind it', async () => {
    expect(await online({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it('is offline once the internet is known unreachable, even if the connection is unknown', async () => {
    expect(await online({ isConnected: null, isInternetReachable: false })).toBe(false);
  });
});

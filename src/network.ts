import { useNetworkState } from 'expo-network';

// true/false once known, null while the first check is pending.
export function useOnline(): boolean | null {
  const { isConnected, isInternetReachable } = useNetworkState();
  if (isConnected === false || isInternetReachable === false) return false;
  return isConnected ?? null;
}

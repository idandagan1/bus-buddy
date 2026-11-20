// Pull-to-refresh for a page. The iPhone app uses the system's pull: it installs a newer version of the app if
// one is out, and otherwise remounts the page so every schedule on it loads again.
import * as Updates from 'expo-updates';
import { useState, type ComponentRef, type RefObject } from 'react';
import { RefreshControl, type ScrollView } from 'react-native';

export type ScrollRef = RefObject<ComponentRef<typeof ScrollView> | null>;

// `scroll` is the page's ScrollView, which the web version listens to for the pull.
export function useRefresh(enabled: boolean, scroll: ScrollRef) {
  const [key, setKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
        return;
      }
    } catch {} // dev builds and no connection: just reload the page
    setKey((k) => k + 1);
    setRefreshing(false);
  }

  return {
    key,
    control: enabled ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" /> : undefined,
    indicator: null,
  };
}

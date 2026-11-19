import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { syncTracking } from '@/alarm';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Toast } from '@/components/Toast';
import { Welcome } from '@/components/Welcome';
// On the web: home-screen icons and the install prompt, and saved routes handed over to a new home-screen app.
import '@/install';
import { colors } from '@/ui';

export default function RootLayout() {
  useEffect(() => {
    syncTracking().catch(() => {});
    const sub = AppState.addEventListener('change', (state) => state === 'active' && syncTracking().catch(() => {}));
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1 }}>
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'My routes', headerShown: false }} />
      <Stack.Screen name="add" options={{ title: 'Add route', headerShown: false }} />
      <Stack.Screen name="route/[id]" options={{ title: 'Schedule', headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: 'Settings', headerShown: false }} />
      <Stack.Screen name="map" options={{ title: 'Trip map', headerShown: false }} />
      <Stack.Screen name="alarm" options={{ title: 'Wake-up alarm', headerShown: false }} />
    </Stack>
    <OfflineBanner />
    <Toast />
    <Welcome />
    </View>
  );
}

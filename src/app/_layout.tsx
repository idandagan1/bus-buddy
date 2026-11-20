import { Stack, useSegments } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { syncTracking } from '@/alarm';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Toast } from '@/components/Toast';
import { Welcome } from '@/components/Welcome';
// On the web: home-screen icons and the install prompt, and saved routes handed over to a new home-screen app.
import '@/install';
import { colors } from '@/ui';
import { trackScreen } from '@/analytics';

export default function RootLayout() {
  // Screens by their route ("/route/[id]"), not each route's id.
  const screen = `/${useSegments().join('/')}`;
  useEffect(() => trackScreen(screen), [screen]);

  useEffect(() => {
    syncTracking().catch(() => {});
    const sub = AppState.addEventListener('change', (state) => state === 'active' && syncTracking().catch(() => {}));
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1 }}>
    {/* Web: rendered into the page's first HTML, which is when an iPhone reads them for a home-screen app.
        It then draws under the status bar (black-translucent + viewport-fit=cover), so the blue header runs to
        the top edge instead of under a pale strip; headers pad themselves by the safe area. */}
    <Head>
      <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="Bus Buddy" />
      <meta name="theme-color" content="#0b1f4d" />
      <link rel="apple-touch-icon" href="/icons/icon-180.png" />
    </Head>
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

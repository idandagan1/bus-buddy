import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { syncTracking } from '@/alarm';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Toast } from '@/components/Toast';
import { colors } from '@/ui';

export default function RootLayout() {
  useEffect(() => {
    syncTracking().catch(() => {});
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
    </View>
  );
}

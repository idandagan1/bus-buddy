import { Stack } from 'expo-router';
import { colors } from '@/ui';

export default function RootLayout() {
  return (
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
      <Stack.Screen name="alarm" options={{ title: 'Wake-up alarm' }} />
    </Stack>
  );
}

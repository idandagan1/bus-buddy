import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { loadRoutes, saveRoutes } from '@/api';
import { RoutePlanner } from '@/components/RoutePlanner';
import type { SavedRoute, Stop } from '@/types';
import { EASE_OUT, Hero, Page } from '@/ui';

export default function AddRoute() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const [editing, setEditing] = useState<SavedRoute | null | undefined>(edit ? undefined : null);

  useEffect(() => {
    if (edit) loadRoutes().then((routes) => setEditing(routes.find((r) => r.id === edit) ?? null));
  }, [edit]);

  async function save(from: Stop, to: Stop) {
    const routes = await loadRoutes();
    const next = editing
      ? routes.map((r) => (r.id === editing.id ? { ...r, from, to } : r))
      : [...routes, { id: String(Date.now()), from, to }];
    await saveRoutes(next);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <>
      <Page
        hero={
          <Hero>
            <Animated.Text entering={FadeInDown.duration(400)} style={styles.back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
              ‹ Back
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(60).duration(400)} style={styles.title}>
              {edit ? 'Edit route' : 'New route'}
            </Animated.Text>
          </Hero>
        }
      >
        {editing !== undefined && (
          <Animated.View entering={FadeInDown.delay(100).duration(350).easing(EASE_OUT)}>
            <RoutePlanner
              initialFrom={editing?.from}
              initialTo={editing?.to}
              saveLabel={editing ? 'Save changes' : 'Save route'}
              onSave={save}
            />
          </Animated.View>
        )}
      </Page>
    </>
  );
}

const styles = StyleSheet.create({
  back: { color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
});

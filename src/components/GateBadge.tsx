import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/ui';

export function GateBadge({ gate }: { gate: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>Gate {gate}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { backgroundColor: colors.text, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  text: { color: '#fff', fontWeight: '700', fontSize: 12 },
});

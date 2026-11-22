import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { radius, spacing } from '@/constants/theme';
import { useContactsVersion } from '@/services/dataEvents';
import { endEventMode, getActiveEvent, type EventWithCount } from '@/services/activityService';

/**
 * Pink strip shown on Home, Scan and Planner while Event mode is on:
 * "Event mode · TechSparks — new cards go here". Tap = open event, ✕ = end.
 */
export default function EventModeBanner({ style, compact }: { style?: ViewStyle; compact?: boolean }) {
  const version = useContactsVersion();
  const [event, setEvent] = useState<EventWithCount | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getActiveEvent()
        .then((e) => live && setEvent(e))
        .catch(() => live && setEvent(null));
      return () => {
        live = false;
      };
    }, [version]),
  );

  if (!event) return null;

  const end = () =>
    Alert.alert('End event mode?', `New cards will no longer be added to "${event.name}".`, [
      { text: 'Keep on', style: 'cancel' },
      { text: 'End', style: 'destructive', onPress: endEventMode },
    ]);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}
      style={[styles.banner, style]}
      accessibilityRole="button"
      accessibilityLabel={`Event mode on for ${event.name}`}
    >
      <View style={styles.pulse}>
        <Ionicons name="radio" size={16} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>Event mode · {event.name}</Text>
        {!compact && (
          <Text style={styles.sub} numberOfLines={1}>
            New cards are added here · {event.contactCount} so far
          </Text>
        )}
      </View>
      <Pressable onPress={end} hitSlop={10} accessibilityLabel="End event mode" style={styles.end}>
        <Text style={styles.endText}>End</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#FDF2F8',
    borderColor: '#F9A8D4',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  pulse: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#DB2777', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: '#9D174D' },
  sub: { fontSize: 12, color: '#BE185D', marginTop: 1 },
  end: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: '#fff' },
  endText: { color: '#BE185D', fontWeight: '700', fontSize: 13 },
});

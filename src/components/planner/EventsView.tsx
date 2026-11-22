import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import EmptyState from '@/components/EmptyState';
import CustomButton from '@/components/CustomButton';
import EventEditorSheet from '@/components/EventEditorSheet';
import EventModeBanner from '@/components/EventModeBanner';
import { useContactsVersion } from '@/services/dataEvents';
import { getEvents, type EventWithCount } from '@/services/activityService';
import { eventDates, isPastEvent } from '@/components/eventFormat';

/** Planner → Events: create events, see who you met at each, start Event mode. */
export default function EventsView() {
  const version = useContactsVersion();
  const [events, setEvents] = useState<EventWithCount[] | null>(null);
  const [creating, setCreating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getEvents()
        .then(setEvents)
        .catch(() => setEvents([]));
    }, [version]),
  );

  if (!events) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />;

  const current = events.filter((e) => !isPastEvent(e));
  const past = events.filter(isPastEvent);

  const list = (title: string, items: EventWithCount[]) =>
    items.length > 0 && (
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.group}>
          {items.map((e, i) => (
            <Pressable
              key={e.id}
              onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
              style={({ pressed }) => [styles.row, i < items.length - 1 && styles.divider, pressed && { backgroundColor: colors.surfaceMuted }]}
              accessibilityRole="button"
            >
              <View style={styles.icon}>
                <Ionicons name="calendar" size={20} color="#DB2777" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{e.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[eventDates(e), e.location].filter(Boolean).join(' · ') || 'No date'}
                </Text>
              </View>
              <View style={styles.count}>
                <Text style={styles.countText}>{e.contactCount}</Text>
                <Ionicons name="people-outline" size={13} color={colors.textMuted} />
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    );

  return (
    <View>
      <EventModeBanner />
      <CustomButton title="New event" icon="add" variant="secondary" onPress={() => setCreating(true)} />

      {events.length === 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <EmptyState
            icon="calendar-outline"
            title="No events yet"
            message="Going to an expo or conference? Create the event, turn on Event mode and every card you scan there is grouped under it."
          />
        </View>
      ) : (
        <>
          {list('Upcoming & ongoing', current)}
          {list('Past', past)}
        </>
      )}

      <EventEditorSheet
        visible={creating}
        event={null}
        onClose={() => setCreating(false)}
        onSaved={(e) => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...typography.label, marginTop: spacing.xl, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingHorizontal: spacing.lg },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: '#FDF2F8', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { ...typography.caption, marginTop: 2 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  countText: { fontSize: 12, fontWeight: '700', color: colors.text },
});

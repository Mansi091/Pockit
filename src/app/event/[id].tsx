import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import EmptyState from '@/components/EmptyState';
import ContactCard from '@/components/ContactCard';
import ContactPickerSheet from '@/components/ContactPickerSheet';
import EventEditorSheet from '@/components/EventEditorSheet';
import { eventDates } from '@/components/eventFormat';
import { useContactsVersion } from '@/services/dataEvents';
import { scanSession } from '@/services/scanSession';
import {
  addContactsToEvent,
  endEventMode,
  getActiveEvent,
  getEvent,
  getEventContacts,
  removeContactFromEvent,
  startEventMode,
  type EventWithCount,
} from '@/services/activityService';
import type { Contact } from '@/types/contact';

/** Event page: details, Event mode on/off, scan cards here, and everyone you met at it. */
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const version = useContactsVersion();
  const [event, setEvent] = useState<EventWithCount | null | undefined>(undefined);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [active, setActive] = useState(false);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const [e, people, current] = await Promise.all([getEvent(id), getEventContacts(id), getActiveEvent()]);
        if (!live) return;
        setEvent(e);
        setContacts(people);
        setActive(current?.id === id);
      })().catch(() => live && setEvent(null));
      return () => {
        live = false;
      };
    }, [id, version]),
  );

  if (event === undefined) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />;
  if (event === null) {
    return (
      <EmptyState
        icon="calendar-outline"
        title="Event not found"
        message="It may have been deleted."
        action={<CustomButton title="Go back" variant="outline" onPress={() => router.back()} />}
      />
    );
  }

  const toggleMode = async () => {
    if (active) await endEventMode();
    else await startEventMode(event.id);
  };

  const scanHere = async () => {
    if (!active) await startEventMode(event.id);
    scanSession.clear();
    router.push('/scan');
  };

  const confirmRemove = (c: Contact) =>
    Alert.alert(`Remove ${c.personName} from this event?`, 'The contact itself stays in Pockit.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeContactFromEvent(event.id, c.id) },
    ]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: 'Event',
          headerRight: () => (
            <Pressable onPress={() => setEditing(true)} hitSlop={10} accessibilityLabel="Edit event">
              <Ionicons name="create-outline" size={22} color={colors.primary} />
            </Pressable>
          ),
        }}
      />

      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="calendar" size={26} color="#DB2777" />
        </View>
        <Text style={styles.name}>{event.name}</Text>
        {!!eventDates(event) && <Text style={styles.meta}>{eventDates(event)}</Text>}
        {!!event.location && (
          <View style={styles.locRow}>
            <Ionicons name="location-outline" size={14} color={colors.textMuted} />
            <Text style={styles.meta}>{event.location}</Text>
          </View>
        )}
        <Text style={styles.count}>{event.contactCount} {event.contactCount === 1 ? 'person' : 'people'} met here</Text>
      </View>

      {/* Event mode */}
      <Pressable onPress={toggleMode} style={[styles.mode, active && styles.modeOn]} accessibilityRole="switch" accessibilityState={{ checked: active }}>
        <Ionicons name={active ? 'radio' : 'radio-outline'} size={22} color={active ? '#DB2777' : colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.modeTitle, active && { color: '#9D174D' }]}>Event mode {active ? 'is on' : 'is off'}</Text>
          <Text style={styles.modeSub}>
            {active ? 'Every card you scan is added to this event automatically.' : 'Turn on while you are at the event — new cards go straight here.'}
          </Text>
        </View>
        <View style={[styles.switch, active && styles.switchOn]}>
          <View style={[styles.knob, active && styles.knobOn]} />
        </View>
      </Pressable>

      <View style={styles.actions}>
        <CustomButton title="Scan cards for this event" icon="scan" onPress={scanHere} />
        <CustomButton title="Add people already in Pockit" icon="person-add-outline" variant="outline" onPress={() => setPicking(true)} />
      </View>

      <Text style={styles.sectionTitle}>People you met · {contacts.length}</Text>
      {contacts.length === 0 ? (
        <View style={styles.group}>
          <EmptyState icon="people-outline" title="No one yet" message="Scan cards here, or add people you've already saved." />
        </View>
      ) : (
        <View style={styles.group}>
          {contacts.map((c, i) => (
            <ContactCard
              key={c.id}
              contact={c}
              last={i === contacts.length - 1}
              onPress={() => router.push({ pathname: '/contact/[id]', params: { id: c.id } })}
              onLongPress={() => confirmRemove(c)}
            />
          ))}
        </View>
      )}
      {contacts.length > 0 && <Text style={styles.tip}>Long-press someone to remove them from this event.</Text>}

      <EventEditorSheet visible={editing} event={event} onClose={() => setEditing(false)} onDeleted={() => router.back()} />
      <ContactPickerSheet
        visible={picking}
        title="Add people to this event"
        multi
        exclude={contacts.map((c) => c.id)}
        onClose={() => setPicking(false)}
        onPick={(people) => addContactsToEvent(event.id, people.map((p) => p.id))}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  hero: { alignItems: 'center', paddingVertical: spacing.md },
  heroIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FDF2F8', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  name: { ...typography.title, textAlign: 'center' },
  meta: { ...typography.body, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: { ...typography.caption, marginTop: spacing.sm, fontWeight: '600' },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeOn: { backgroundColor: '#FDF2F8', borderColor: '#F9A8D4' },
  modeTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  modeSub: { ...typography.caption, marginTop: 2, lineHeight: 17 },
  switch: { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.border, padding: 3 },
  switchOn: { backgroundColor: '#DB2777' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  knobOn: { transform: [{ translateX: 18 }] },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  sectionTitle: { ...typography.label, marginTop: spacing.xl, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow },
  tip: { ...typography.caption, textAlign: 'center', marginTop: spacing.md },
});

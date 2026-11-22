import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import EmptyState from '@/components/EmptyState';
import CustomButton from '@/components/CustomButton';
import FollowUpRow from '@/components/FollowUpRow';
import FollowUpEditorSheet from '@/components/FollowUpEditorSheet';
import OptionSheet from '@/components/OptionSheet';
import { useContactsVersion } from '@/services/dataEvents';
import { deleteFollowUp, getAllFollowUps, setFollowUpDone, snoozeFollowUp, type ReminderWithContact } from '@/services/activityService';
import { bucketReminders } from '@/utils/dates';

type MenuOption = 'snooze1' | 'snooze7' | 'edit' | 'delete';
const MENU_LABEL: Record<MenuOption, string> = {
  snooze1: 'Snooze until tomorrow',
  snooze7: 'Snooze for a week',
  edit: 'Edit',
  delete: 'Delete',
};

/** Planner → Follow-ups: Overdue · Today · Upcoming · Done. */
export default function FollowUpsView() {
  const version = useContactsVersion();
  const [items, setItems] = useState<ReminderWithContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReminderWithContact | null>(null);
  const [creating, setCreating] = useState(false);
  const [menuFor, setMenuFor] = useState<ReminderWithContact | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await getAllFollowUps());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load follow-ups.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, version]),
  );

  const onMenu = async (o: MenuOption) => {
    const r = menuFor;
    if (!r) return;
    if (o === 'snooze1') await snoozeFollowUp(r, 1);
    if (o === 'snooze7') await snoozeFollowUp(r, 7);
    if (o === 'edit') setTimeout(() => setEditing(r), 250);
    if (o === 'delete') await deleteFollowUp(r.id);
  };

  if (error) {
    return <EmptyState icon="warning-outline" title="Something went wrong" message={error} action={<CustomButton title="Try again" variant="outline" onPress={load} />} />;
  }
  if (!items) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />;

  const b = bucketReminders(items);
  const open = b.overdue.length + b.today.length + b.upcoming.length;

  const section = (title: string, list: ReminderWithContact[], tone?: 'danger') =>
    list.length > 0 && (
      <View key={title}>
        <Text style={[styles.sectionTitle, tone === 'danger' && { color: colors.danger }]}>
          {title} · {list.length}
        </Text>
        <View style={styles.group}>
          {list.map((r, i) => (
            <FollowUpRow
              key={r.id}
              reminder={r}
              last={i === list.length - 1}
              onToggle={() => setFollowUpDone(r, !r.completedAt)}
              onPress={() => router.push({ pathname: '/contact/[id]', params: { id: r.contactId, tab: 'followups' } })}
              onLongPress={() => setMenuFor(r)}
            />
          ))}
        </View>
      </View>
    );

  return (
    <View>
      <CustomButton title="New follow-up" icon="add" variant="secondary" onPress={() => setCreating(true)} />

      {open === 0 && (
        <View style={styles.empty}>
          <EmptyState
            icon="alarm-outline"
            title="Nothing to follow up"
            message="Add a reminder when you meet someone — while saving a card, from their contact page, or with the button above."
          />
        </View>
      )}

      {section('Overdue', b.overdue, 'danger')}
      {section('Today', b.today)}
      {section('Upcoming', b.upcoming)}

      {b.done.length > 0 && (
        <>
          <Pressable onPress={() => setShowDone((v) => !v)} style={styles.doneToggle} accessibilityRole="button">
            <Text style={styles.doneToggleText}>{showDone ? 'Hide' : 'Show'} completed ({b.done.length})</Text>
            <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
          </Pressable>
          {showDone && section('Completed', b.done)}
        </>
      )}

      <Text style={styles.tip}>Tip: long-press a follow-up to snooze, edit or delete it.</Text>

      <FollowUpEditorSheet visible={creating || !!editing} contact={null} reminder={editing} onClose={() => { setCreating(false); setEditing(null); }} />
      <OptionSheet
        visible={!!menuFor}
        title={menuFor?.title ?? ''}
        options={['snooze1', 'snooze7', 'edit', 'delete'] as const}
        labelOf={(o) => MENU_LABEL[o]}
        onSelect={onMenu}
        onClose={() => setMenuFor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...typography.label, marginTop: spacing.xl, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow },
  empty: { marginTop: spacing.xl },
  doneToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.xl, padding: spacing.sm },
  doneToggleText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  tip: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
});

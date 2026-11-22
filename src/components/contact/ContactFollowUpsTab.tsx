import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import EmptyState from '@/components/EmptyState';
import FollowUpRow from '@/components/FollowUpRow';
import FollowUpEditorSheet from '@/components/FollowUpEditorSheet';
import OptionSheet from '@/components/OptionSheet';
import { deleteFollowUp, setFollowUpDone, snoozeFollowUp, type ReminderWithContact } from '@/services/activityService';

type MenuOption = 'snooze1' | 'snooze7' | 'delete';
const MENU_LABEL: Record<MenuOption, string> = { snooze1: 'Snooze until tomorrow', snooze7: 'Snooze for a week', delete: 'Delete' };

/** Contact → Follow-ups: reminders for this person (open first, then done). */
export default function ContactFollowUpsTab({
  contact,
  reminders,
}: {
  contact: { id: string; personName: string };
  reminders: ReminderWithContact[];
}) {
  const [editing, setEditing] = useState<ReminderWithContact | null>(null);
  const [adding, setAdding] = useState(false);
  const [menuFor, setMenuFor] = useState<ReminderWithContact | null>(null);

  const open = reminders.filter((r) => !r.completedAt);
  const done = reminders.filter((r) => r.completedAt);

  const group = (title: string, list: ReminderWithContact[]) =>
    list.length > 0 && (
      <>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.group}>
          {list.map((r, i) => (
            <FollowUpRow
              key={r.id}
              reminder={r}
              showName={false}
              last={i === list.length - 1}
              onToggle={() => setFollowUpDone(r, !r.completedAt)}
              onPress={() => setEditing(r)}
              onLongPress={() => setMenuFor(r)}
            />
          ))}
        </View>
      </>
    );

  return (
    <View style={styles.wrap}>
      <CustomButton title="Add a follow-up" icon="alarm-outline" variant="secondary" onPress={() => setAdding(true)} />
      {reminders.length === 0 ? (
        <View style={{ marginTop: spacing.lg }}>
          <EmptyState
            icon="alarm-outline"
            title="No follow-ups"
            message={`Set a reminder to call, email or meet ${contact.personName.split(' ')[0]} — your phone will remind you.`}
          />
        </View>
      ) : (
        <>
          {group('To do', open)}
          {group('Done', done)}
        </>
      )}

      <FollowUpEditorSheet
        visible={adding || !!editing}
        contact={contact}
        reminder={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
      <OptionSheet
        visible={!!menuFor}
        title={menuFor?.title ?? ''}
        options={['snooze1', 'snooze7', 'delete'] as const}
        labelOf={(o) => MENU_LABEL[o]}
        onSelect={async (o) => {
          const r = menuFor;
          if (!r) return;
          if (o === 'snooze1') await snoozeFollowUp(r, 1);
          if (o === 'snooze7') await snoozeFollowUp(r, 7);
          if (o === 'delete') await deleteFollowUp(r.id);
        }}
        onClose={() => setMenuFor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg },
  sectionTitle: { ...typography.label, marginTop: spacing.xl, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow },
});

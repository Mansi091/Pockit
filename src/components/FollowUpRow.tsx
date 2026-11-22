import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography } from '@/constants/theme';
import { formatDue } from '@/utils/dates';
import type { ReminderWithContact } from '@/services/activityService';

/** One follow-up: tick circle · title · "Name · due". Tap = open, long-press = more options. */
export default function FollowUpRow({
  reminder: r,
  showName = true,
  last,
  onToggle,
  onPress,
  onLongPress,
}: {
  reminder: ReminderWithContact;
  showName?: boolean;
  last?: boolean;
  onToggle: () => void;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const done = !!r.completedAt;
  const overdue = !done && new Date(r.dueAt).getTime() < Date.now();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && { backgroundColor: colors.surfaceMuted }]}
      accessibilityRole="button"
      accessibilityHint="Long-press for snooze, edit or delete"
    >
      <Pressable
        onPress={onToggle}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? 'Mark as not done' : 'Mark as done'}
      >
        <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={done ? colors.success : overdue ? colors.danger : colors.textSubtle} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, done && styles.doneText]} numberOfLines={2}>{r.title}</Text>
        <Text style={[styles.meta, overdue && { color: colors.danger, fontWeight: '600' }]} numberOfLines={1}>
          {showName ? `${r.personName} · ` : ''}
          {done ? 'Done' : formatDue(r.dueAt)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14, paddingHorizontal: spacing.lg },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  doneText: { color: colors.textSubtle, textDecorationLine: 'line-through' },
  meta: { ...typography.caption, marginTop: 2 },
});

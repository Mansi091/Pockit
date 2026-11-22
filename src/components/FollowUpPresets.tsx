import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';
import { dayKey, FOLLOW_UP_PRESETS, presetDate } from '@/utils/dates';

/** Quick picks: Tomorrow · In 3 days · Next week · In a month (all 10:00 AM). */
export default function FollowUpPresets({
  value,
  onChange,
  allowNone,
}: {
  value: Date | null;
  onChange: (d: Date | null) => void;
  /** Adds a "No reminder" chip (review screen). */
  allowNone?: boolean;
}) {
  const valueDay = value ? dayKey(value) : null;
  const isPreset = (d: Date) => !!value && valueDay === dayKey(d) && value.getHours() === 10 && value.getMinutes() === 0;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
      {allowNone && (
        <Chip label="No reminder" on={!value} onPress={() => onChange(null)} />
      )}
      {FOLLOW_UP_PRESETS.map((p) => {
        const d = presetDate(p.key);
        return <Chip key={p.key} label={p.label} on={isPreset(d)} onPress={() => onChange(d)} />;
      })}
    </ScrollView>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.text, on && styles.textOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  text: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  textOn: { color: colors.primaryDark },
});

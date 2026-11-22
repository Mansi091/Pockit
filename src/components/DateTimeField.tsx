import { Alert, Pressable, StyleSheet, Text, TurboModuleRegistry, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing } from '@/constants/theme';
import { isExpoGo } from '@/lib/runtime';
import { dayKey, formatDay, formatTime, parseDayKey } from '@/utils/dates';

/**
 * Tappable field that opens Android's own date (and optionally time) dialog
 * via @react-native-community/datetimepicker's imperative API.
 * Guarded: the native picker is only in the Pockit build, not Expo Go.
 */
type PickerModule = typeof import('@react-native-community/datetimepicker');

function loadPicker(): PickerModule | null {
  if (isExpoGo || !TurboModuleRegistry.get('RNCDatePicker')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-community/datetimepicker') as PickerModule;
  } catch {
    return null;
  }
}

function openPicker(mode: 'date' | 'time', value: Date, onPicked: (d: Date) => void, minimumDate?: Date) {
  const mod = loadPicker();
  if (!mod) {
    Alert.alert('Not available here', 'The date picker needs the Pockit app build (not Expo Go). Use the quick choices instead.');
    return;
  }
  mod.DateTimePickerAndroid.open({
    value,
    mode,
    is24Hour: false,
    minimumDate,
    onChange: (event, date) => {
      if (event.type === 'set' && date) onPicked(date);
    },
  });
}

/** Date only, stored as YYYY-MM-DD. */
export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Pick a date',
  clearable,
}: {
  label: string;
  value: string | null;
  onChange: (day: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => openPicker('date', value ? parseDayKey(value) : new Date(), (d) => onChange(dayKey(d)))}
          style={styles.field}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value ? formatDay(value) : 'not set'}`}
        >
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={[styles.value, !value && styles.placeholder]}>{value ? formatDay(value) : placeholder}</Text>
        </Pressable>
        {clearable && value && (
          <Pressable onPress={() => onChange(null)} hitSlop={8} style={styles.clear} accessibilityLabel={`Clear ${label}`}>
            <Ionicons name="close-circle" size={20} color={colors.textSubtle} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Date + time (follow-ups). Picks the date first, then the time. */
export function DateTimeField({ label, value, onChange }: { label: string; value: Date | null; onChange: (d: Date) => void }) {
  const pickDate = () =>
    openPicker('date', value ?? new Date(), (d) => {
      const next = new Date(d);
      const base = value ?? new Date(new Date().setHours(10, 0, 0, 0));
      next.setHours(base.getHours(), base.getMinutes(), 0, 0);
      onChange(next);
      setTimeout(() => openPicker('time', next, (t) => {
        const withTime = new Date(next);
        withTime.setHours(t.getHours(), t.getMinutes(), 0, 0);
        onChange(withTime);
      }), 300);
    }, new Date(new Date().setHours(0, 0, 0, 0)));
  const pickTime = () =>
    value &&
    openPicker('time', value, (t) => {
      const withTime = new Date(value);
      withTime.setHours(t.getHours(), t.getMinutes(), 0, 0);
      onChange(withTime);
    });

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable onPress={pickDate} style={[styles.field, { flex: 3 }]} accessibilityRole="button" accessibilityLabel="Pick date">
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={[styles.value, !value && styles.placeholder]}>{value ? formatDay(dayKey(value)) : 'Pick a date'}</Text>
        </Pressable>
        <Pressable
          onPress={pickTime}
          disabled={!value}
          style={[styles.field, { flex: 2 }, !value && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel="Pick time"
        >
          <Ionicons name="time-outline" size={18} color={colors.primary} />
          <Text style={[styles.value, !value && styles.placeholder]}>{value ? formatTime(value) : 'Time'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
  },
  value: { fontSize: 15, color: colors.text, fontWeight: '500' },
  placeholder: { color: colors.textSubtle, fontWeight: '400' },
  clear: { padding: 4 },
});

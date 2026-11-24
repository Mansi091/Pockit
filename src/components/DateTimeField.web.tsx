import { createElement, type CSSProperties } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';
import { dayKey } from '@/utils/dates';

/**
 * Web version of DateTimeField.tsx (same exports and props).
 * Uses the browser's own date / time inputs instead of Android's dialogs.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const timeKey = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const inputStyle: CSSProperties = {
  flex: 1,
  minHeight: 46,
  boxSizing: 'border-box',
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  padding: '0 12px',
  fontSize: 15,
  fontFamily: 'inherit',
  background: colors.surfaceMuted,
  color: colors.text,
};

export function DateField({
  label,
  value,
  onChange,
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
        {createElement('input', {
          type: 'date',
          value: value ?? '',
          'aria-label': label,
          style: inputStyle,
          onChange: (e: { target: { value: string } }) => onChange(e.target.value || (clearable ? null : value)),
        })}
      </View>
    </View>
  );
}

export function DateTimeField({ label, value, onChange }: { label: string; value: Date | null; onChange: (d: Date) => void }) {
  const setDay = (day: string) => {
    if (!day) return;
    const [y, m, d] = day.split('-').map(Number);
    const next = new Date(value ?? new Date(new Date().setHours(10, 0, 0, 0)));
    next.setFullYear(y!, (m ?? 1) - 1, d ?? 1);
    onChange(next);
  };
  const setTime = (t: string) => {
    if (!t || !value) return;
    const [h, min] = t.split(':').map(Number);
    const next = new Date(value);
    next.setHours(h ?? 0, min ?? 0, 0, 0);
    onChange(next);
  };
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {createElement('input', {
          type: 'date',
          value: value ? dayKey(value) : '',
          min: dayKey(new Date()),
          'aria-label': 'Date',
          style: { ...inputStyle, flex: 3 },
          onChange: (e: { target: { value: string } }) => setDay(e.target.value),
        })}
        {createElement('input', {
          type: 'time',
          value: value ? timeKey(value) : '',
          disabled: !value,
          'aria-label': 'Time',
          style: { ...inputStyle, flex: 2, opacity: value ? 1 : 0.5 },
          onChange: (e: { target: { value: string } }) => setTime(e.target.value),
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});

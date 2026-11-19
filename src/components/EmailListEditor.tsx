import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import OptionSheet from '@/components/OptionSheet';
import { validateEmail } from '@/utils/validation';
import { EMAIL_LABELS, LABEL_TEXT, type EmailDraft, type EmailLabel } from '@/types/contact';

const MAX_EMAILS = 6;

/** Multiple labelled email addresses (Work / Personal / Other). */
export default function EmailListEditor({
  value,
  onChange,
  showErrors,
}: {
  value: EmailDraft[];
  onChange: (next: EmailDraft[]) => void;
  showErrors: boolean;
}) {
  const [labelFor, setLabelFor] = useState<number | null>(null);
  const update = (i: number, patch: Partial<EmailDraft>) => onChange(value.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, { label: value.length === 0 ? 'work' : 'personal', address: '' }]);

  return (
    <View>
      {value.map((e, i) => {
        const error = showErrors || e.address.includes('@') ? validateEmail(e.address) : null;
        return (
          <View key={e.id ?? `new-${i}`} style={styles.item}>
            <View style={[styles.row, !!error && styles.rowError]}>
              <TextInput
                value={e.address}
                onChangeText={(t) => update(i, { address: t })}
                placeholder="name@company.com"
                placeholderTextColor={colors.textSubtle}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                style={styles.input}
                accessibilityLabel={`Email ${i + 1}`}
              />
              <Pressable onPress={() => setLabelFor(i)} style={styles.label} accessibilityRole="button" accessibilityLabel={`Label ${LABEL_TEXT[e.label]}, change`}>
                <Text style={styles.labelText}>{LABEL_TEXT[e.label]}</Text>
                <Ionicons name="chevron-down" size={12} color={colors.primary} />
              </Pressable>
              <Pressable onPress={() => remove(i)} hitSlop={8} style={styles.removeBtn} accessibilityRole="button" accessibilityLabel={`Remove email ${i + 1}`}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        );
      })}

      {value.length < MAX_EMAILS && (
        <Pressable onPress={add} style={styles.add} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.addText}>{value.length ? 'Add another email' : 'Add email'}</Text>
        </Pressable>
      )}

      <OptionSheet<EmailLabel>
        visible={labelFor !== null}
        title="Label"
        options={EMAIL_LABELS}
        selected={labelFor !== null ? value[labelFor]?.label : undefined}
        labelOf={(l) => LABEL_TEXT[l]}
        onSelect={(l) => labelFor !== null && update(labelFor, { label: l })}
        onClose={() => setLabelFor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  item: { marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.surfaceMuted,
    paddingRight: spacing.xs,
  },
  rowError: { borderColor: colors.danger, backgroundColor: colors.surface },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 14, paddingHorizontal: spacing.md + 2 },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  labelText: { fontSize: 12, fontWeight: '600', color: colors.primaryDark },
  removeBtn: { padding: spacing.sm },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.xs, paddingHorizontal: spacing.xs },
  add: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  addText: { ...typography.body, color: colors.primary, fontWeight: '600' },
});

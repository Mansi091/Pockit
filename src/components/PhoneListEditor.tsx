import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { countryByIso, flagOf } from '@/data/countries';
import CountryPicker from '@/components/CountryPicker';
import OptionSheet from '@/components/OptionSheet';
import { checkPhoneDraft } from '@/utils/phone';
import { LABEL_TEXT, PHONE_LABELS, type PhoneDraft, type PhoneLabel } from '@/types/contact';

const MAX_NUMBERS = 8;

/**
 * Multiple labelled phone numbers, each with its own country code.
 * The first number is the main one (used by the Call button); the star moves a number to the top.
 * `showErrors` turns on hard errors (after the user tries to save).
 */
export default function PhoneListEditor({
  value,
  onChange,
  showErrors,
}: {
  value: PhoneDraft[];
  onChange: (next: PhoneDraft[]) => void;
  showErrors: boolean;
}) {
  const [countryFor, setCountryFor] = useState<number | null>(null);
  const [labelFor, setLabelFor] = useState<number | null>(null);

  // Editing the country or number counts as confirming it; changing the label doesn't.
  const update = (i: number, patch: Partial<PhoneDraft>) =>
    onChange(
      value.map((p, idx) =>
        idx === i ? { ...p, ...patch, needsReview: 'countryIso' in patch || 'number' in patch ? false : p.needsReview } : p,
      ),
    );
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const makeMain = (i: number) => onChange([value[i]!, ...value.filter((_, idx) => idx !== i)]);
  const add = () =>
    onChange([...value, { label: value.length === 0 ? 'mobile' : 'work', countryIso: null, number: '' }]);

  return (
    <View>
      {value.map((p, i) => {
        const country = countryByIso(p.countryIso);
        const issue = checkPhoneDraft(p, country?.name);
        const error = showErrors ? issue.error : null;
        return (
          <View key={p.id ?? `new-${i}`} style={styles.item}>
            <View style={[styles.row, !!error && styles.rowError, !error && !!issue.warning && styles.rowWarning]}>
              <Pressable
                onPress={() => setCountryFor(i)}
                style={styles.country}
                accessibilityRole="button"
                accessibilityLabel={`Country ${country?.name ?? 'not set'}, change`}
              >
                <Text style={styles.flag}>{flagOf(p.countryIso)}</Text>
                <Text style={styles.code}>{country ? `+${country.callingCode}` : '+?'}</Text>
                <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
              </Pressable>
              <TextInput
                value={p.number}
                onChangeText={(t) => update(i, { number: t })}
                placeholder="Phone number"
                placeholderTextColor={colors.textSubtle}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                style={styles.input}
                accessibilityLabel={`Phone number ${i + 1}`}
              />
              <Pressable onPress={() => setLabelFor(i)} style={styles.label} accessibilityRole="button" accessibilityLabel={`Label ${LABEL_TEXT[p.label]}, change`}>
                <Text style={styles.labelText}>{LABEL_TEXT[p.label]}</Text>
                <Ionicons name="chevron-down" size={12} color={colors.primary} />
              </Pressable>
            </View>

            <View style={styles.meta}>
              {i === 0 ? (
                <Text style={styles.main}>★ Main number</Text>
              ) : (
                <Pressable onPress={() => makeMain(i)} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.makeMain}>☆ Make main</Text>
                </Pressable>
              )}
              <Pressable onPress={() => remove(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove phone number ${i + 1}`}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
            {!error && !!issue.warning && <Text style={styles.warning}>{issue.warning}</Text>}
          </View>
        );
      })}

      {value.length < MAX_NUMBERS && (
        <Pressable onPress={add} style={styles.add} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.addText}>{value.length ? 'Add another number' : 'Add phone number'}</Text>
        </Pressable>
      )}

      <CountryPicker
        visible={countryFor !== null}
        selected={countryFor !== null ? value[countryFor]?.countryIso ?? null : null}
        onSelect={(iso) => countryFor !== null && update(countryFor, { countryIso: iso })}
        onClose={() => setCountryFor(null)}
      />
      <OptionSheet<PhoneLabel>
        visible={labelFor !== null}
        title="Label"
        options={PHONE_LABELS}
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
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
  },
  rowError: { borderColor: colors.danger, backgroundColor: colors.surface },
  rowWarning: { borderColor: '#FCD34D', backgroundColor: colors.warningSoft },
  country: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  flag: { fontSize: 20 },
  code: { fontSize: 15, color: colors.text, fontWeight: '500' },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 14, paddingHorizontal: spacing.md },
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
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: spacing.xs },
  main: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  makeMain: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  remove: { fontSize: 12, color: colors.danger, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.xs, paddingHorizontal: spacing.xs },
  warning: { color: colors.warning, fontSize: 12, marginTop: spacing.xs, paddingHorizontal: spacing.xs },
  add: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  addText: { ...typography.body, color: colors.primary, fontWeight: '600' },
});

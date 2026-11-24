import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import OptionSheet from '@/components/OptionSheet';
import { ADDRESS_LABELS, ADDRESS_LABEL_TEXT, type AddressDraft, type AddressLabel } from '@/types/contact';

const emptyAddress = (label: AddressLabel = 'other'): AddressDraft => ({
  label,
  fullAddress: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
});

/**
 * Any number of addresses, each with its own label (Registered office,
 * Factory, Branch …), the complete address, and City / State / PIN / Country.
 * Rows left empty are ignored on save.
 */
export default function AddressListEditor({
  value,
  onChange,
  warning,
}: {
  value: AddressDraft[];
  onChange: (next: AddressDraft[]) => void;
  /** Shown above the list, e.g. "Auto-detected — please check". */
  warning?: string | null;
}) {
  const [labelFor, setLabelFor] = useState<number | null>(null);

  const update = (i: number, patch: Partial<AddressDraft>) => onChange(value.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, emptyAddress(value.length === 0 ? 'office' : 'other')]);

  return (
    <View>
      {!!warning && value.length > 0 && <Text style={styles.warning}>{warning}</Text>}

      {value.map((a, i) => (
        <View key={a.id ?? `new-${i}`} style={styles.card}>
          <View style={styles.header}>
            <Pressable
              onPress={() => setLabelFor(i)}
              style={styles.label}
              accessibilityRole="button"
              accessibilityLabel={`Address type ${ADDRESS_LABEL_TEXT[a.label]}, change`}
            >
              <Ionicons name="location-outline" size={14} color={colors.primary} />
              <Text style={styles.labelText}>{ADDRESS_LABEL_TEXT[a.label]}</Text>
              <Ionicons name="chevron-down" size={12} color={colors.primary} />
            </Pressable>
            <Pressable onPress={() => remove(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove address ${i + 1}`}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>

          <TextInput
            value={a.fullAddress}
            onChangeText={(t) => update(i, { fullAddress: t })}
            placeholder="Complete address"
            placeholderTextColor={colors.textSubtle}
            multiline
            style={[styles.input, styles.full]}
            accessibilityLabel={`Address ${i + 1}, complete address`}
          />
          <View style={styles.grid}>
            <Field label="City" value={a.city} onChange={(t) => update(i, { city: t })} />
            <Field label="State" value={a.state} onChange={(t) => update(i, { state: t })} />
          </View>
          <View style={styles.grid}>
            <Field label="PIN / Postal code" value={a.postalCode} onChange={(t) => update(i, { postalCode: t })} />
            <Field label="Country" value={a.country} onChange={(t) => update(i, { country: t })} />
          </View>
        </View>
      ))}

      <Pressable onPress={add} style={styles.add} accessibilityRole="button">
        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        <Text style={styles.addText}>{value.length ? 'Add another address' : 'Add address'}</Text>
      </Pressable>

      <OptionSheet<AddressLabel>
        visible={labelFor !== null}
        title="Address type"
        options={ADDRESS_LABELS}
        selected={labelFor !== null ? value[labelFor]?.label : undefined}
        labelOf={(l) => ADDRESS_LABEL_TEXT[l]}
        onSelect={(l) => labelFor !== null && update(labelFor, { label: l })}
        onClose={() => setLabelFor(null)}
      />
    </View>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (t: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholderTextColor={colors.textSubtle}
        style={styles.input}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  warning: { fontSize: 12, color: colors.warning, marginBottom: spacing.sm },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  labelText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  remove: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  full: { minHeight: 64, textAlignVertical: 'top' },
  grid: { flexDirection: 'row', gap: spacing.sm },
  field: { flex: 1, gap: 4 },
  fieldLabel: { ...typography.caption, fontWeight: '600' },
  add: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  addText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
});

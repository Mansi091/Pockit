import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing } from '@/constants/theme';
import { useAuth } from '@/auth/AuthProvider';
import { fullNameOf, MAX_NAME_LENGTH, validateAccountName } from '@/auth/userName';

/** Settings → Account: the account holder's name, editable in place (same on phone and web). */
export default function AccountNameRow() {
  const { session, updateName } = useAuth();
  const current = fullNameOf(session);
  const [editing, setEditing] = useState(!current);
  const [value, setValue] = useState(current ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setValue(current ?? '');
  }, [current, editing]);

  const save = async () => {
    const problem = validateAccountName(value);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await updateName(value);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your name.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.row}>
      <Ionicons name="happy-outline" size={20} color={colors.accent} style={styles.icon} />
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>Your name</Text>
        {editing ? (
          <>
            <View style={styles.editRow}>
              <TextInput
                value={value}
                onChangeText={(t) => {
                  setValue(t);
                  setError(null);
                }}
                placeholder="Your full name"
                placeholderTextColor={colors.textSubtle}
                autoCapitalize="words"
                autoComplete="name"
                maxLength={MAX_NAME_LENGTH}
                onSubmitEditing={save}
                style={styles.input}
                accessibilityLabel="Your name"
              />
              <Pressable onPress={save} disabled={busy} style={styles.saveBtn} accessibilityRole="button">
                {busy ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={styles.saveText}>Save</Text>}
              </Pressable>
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
            {!current && !error && <Text style={styles.hint}>Used to greet you and shown to your company.</Text>}
          </>
        ) : (
          <View style={styles.viewRow}>
            <Text style={styles.value}>{current}</Text>
            <Pressable onPress={() => setEditing(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit your name">
              <Text style={styles.edit}>Edit</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  icon: { marginRight: spacing.md, marginTop: 2 },
  label: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  viewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  value: { fontSize: 15, color: colors.text, flex: 1 },
  edit: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  input: {
    flex: 1,
    minHeight: 44,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  saveBtn: { minHeight: 44, minWidth: 72, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 14 },
  error: { color: colors.danger, fontSize: 13, marginTop: 6 },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
});

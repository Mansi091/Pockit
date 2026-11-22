import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import Sheet, { sheetStyles } from '@/components/Sheet';
import Avatar from '@/components/Avatar';
import CustomButton from '@/components/CustomButton';
import { searchContacts } from '@/services/contactService';
import type { Contact } from '@/types/contact';

/**
 * Pick one contact (single) or several (multi). Used by "New follow-up" in the
 * Planner and "Add existing contacts" on an event.
 */
export default function ContactPickerSheet({
  visible,
  title,
  multi,
  exclude = [],
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  multi?: boolean;
  /** Contact ids already chosen elsewhere (e.g. already in the event). */
  exclude?: string[];
  onClose: () => void;
  onPick: (contacts: Contact[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Contact[] | null>(null);
  const [selected, setSelected] = useState<Map<string, Contact>>(new Map());

  useEffect(() => {
    if (!visible) return;
    setSelected(new Map());
    setQuery('');
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    const t = setTimeout(async () => {
      const found = await searchContacts(query).catch(() => []);
      if (live) setResults(found.filter((c) => !exclude.includes(c.id)));
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, query]);

  const toggle = (c: Contact) => {
    if (!multi) {
      onPick([c]);
      onClose();
      return;
    }
    setSelected((s) => {
      const next = new Map(s);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c);
      return next;
    });
  };

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      tall
      footer={
        multi ? (
          <CustomButton
            title={selected.size ? `Add ${selected.size} contact${selected.size > 1 ? 's' : ''}` : 'Select contacts'}
            icon="checkmark"
            disabled={!selected.size}
            onPress={() => {
              onPick([...selected.values()]);
              onClose();
            }}
            style={{ flex: 1 }}
          />
        ) : undefined
      }
    >
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search name, company, phone…"
        placeholderTextColor={colors.textSubtle}
        style={sheetStyles.input}
        autoCorrect={false}
        accessibilityLabel="Search contacts"
      />
      {results === null ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
      ) : results.length === 0 ? (
        <Text style={styles.empty}>{query ? 'No matching contacts.' : 'No contacts to add.'}</Text>
      ) : (
        results.map((c) => {
          const on = selected.has(c.id);
          return (
            <Pressable
              key={c.id}
              onPress={() => toggle(c)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}
              accessibilityRole={multi ? 'checkbox' : 'button'}
              accessibilityState={multi ? { checked: on } : undefined}
            >
              <Avatar name={c.personName} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{c.personName}</Text>
                {!!c.companyName && <Text style={styles.sub} numberOfLines={1}>{c.companyName}</Text>}
              </View>
              {multi ? (
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? colors.primary : colors.textSubtle} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
              )}
            </Pressable>
          );
        })
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: 4, borderRadius: radius.md },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  sub: { ...typography.caption, marginTop: 1 },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
});

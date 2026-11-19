import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing } from '@/constants/theme';
import { COUNTRIES, DEFAULT_COUNTRY, flagOf, type Country } from '@/data/countries';

/** Full-screen searchable country list (name, ISO code or calling code). India is pinned first. */
export default function CountryPicker({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: string | null;
  onSelect: (iso: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const data = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, '');
    const pinned = COUNTRIES.filter((c) => c.iso === DEFAULT_COUNTRY);
    const rest = COUNTRIES.filter((c) => c.iso !== DEFAULT_COUNTRY);
    const all = [...pinned, ...rest];
    if (!q) return all;
    return all.filter((c) => c.name.toLowerCase().includes(q) || c.iso.toLowerCase() === q || c.callingCode.startsWith(q));
  }, [query]);

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Country code</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.textSubtle} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search country or code"
            placeholderTextColor={colors.textSubtle}
            style={styles.searchInput}
            autoCorrect={false}
            autoFocus
          />
        </View>
        <FlatList
          data={data}
          keyExtractor={(c) => c.iso}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
          renderItem={({ item }: { item: Country }) => (
            <Pressable
              onPress={() => {
                onSelect(item.iso);
                close();
              }}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}
              accessibilityRole="button"
              accessibilityLabel={`${item.name} plus ${item.callingCode}`}
            >
              <Text style={styles.flag}>{flagOf(item.iso)}</Text>
              <Text style={[styles.name, item.iso === selected && styles.selected]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.code}>+{item.callingCode}</Text>
              {item.iso === selected && <Ionicons name="checkmark" size={18} color={colors.primary} />}
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No country matches “{query}”.</Text>}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    margin: spacing.lg,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  flag: { fontSize: 22 },
  name: { flex: 1, fontSize: 15, color: colors.text },
  selected: { fontWeight: '600', color: colors.primary },
  code: { fontSize: 15, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});

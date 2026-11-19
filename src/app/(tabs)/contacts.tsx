import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing } from '@/constants/theme';
import ContactCard from '@/components/ContactCard';
import CustomButton from '@/components/CustomButton';
import EmptyState from '@/components/EmptyState';
import { getCompanies, searchContacts } from '@/services/contactService';
import { useContactsVersion } from '@/services/dataEvents';
import type { Contact } from '@/types/contact';

/** Screen 6 – Contact list with search (name/company) and company filter. Newest first. */
export default function ContactsScreen() {
  const version = useContactsVersion(); // refresh after saves and background syncs
  const [query, setQuery] = useState('');
  const [company, setCompany] = useState<string | null>(null);
  const [companies, setCompanies] = useState<string[]>([]);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [list, comps] = await Promise.all([searchContacts(query, company), getCompanies()]);
      setContacts(list);
      setCompanies(comps);
      if (company && !comps.includes(company)) setCompany(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load contacts.');
    }
  }, [query, company]);

  // Runs when the tab gains focus and whenever search, filter or data changes.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, version]),
  );

  const hasFilters = !!query.trim() || !!company;
  const total = contacts?.length ?? 0;

  return (
    <View style={styles.screen}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textSubtle} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name or company"
          placeholderTextColor={colors.textSubtle}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
        />
        {!!query && (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.textSubtle} />
          </Pressable>
        )}
      </View>

      {companies.length > 0 && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="All" active={!company} onPress={() => setCompany(null)} />
            {companies.map((c) => (
              <Chip key={c} label={c} active={company === c} onPress={() => setCompany(company === c ? null : c)} />
            ))}
          </ScrollView>
        </View>
      )}

      {error ? (
        <EmptyState
          icon="warning-outline"
          title="Something went wrong"
          message={error}
          action={<CustomButton title="Try again" variant="outline" onPress={load} />}
        />
      ) : contacts === null ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => (
            // Rows are stitched into one rounded white group.
            <View
              style={[
                styles.groupRow,
                index === 0 && styles.groupTop,
                index === total - 1 && styles.groupBottom,
              ]}
            >
              <ContactCard
                contact={item}
                last={index === total - 1}
                onPress={() => router.push({ pathname: '/contact/[id]', params: { id: item.id } })}
              />
            </View>
          )}
          ListHeaderComponent={
            total > 0 ? (
              <Text style={styles.count}>
                {total} contact{total === 1 ? '' : 's'}
              </Text>
            ) : undefined
          }
          ListEmptyComponent={
            hasFilters ? (
              <EmptyState icon="search-outline" title="No matches" message="Try a different name or company." />
            ) : (
              <EmptyState
                icon="people-outline"
                title="No contacts yet"
                message="Cards you scan and save will appear here."
                action={<CustomButton title="Scan a card" icon="scan" onPress={() => router.push('/scan')} />}
              />
            )
          }
        />
      )}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 2,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    ...shadow,
  },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: colors.text },
  chips: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 200,
  },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { fontSize: 13, color: colors.text, fontWeight: '500' },
  chipTextActive: { color: colors.textOnPrimary, fontWeight: '600' },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  count: { ...{ fontSize: 12, fontWeight: '600' as const }, color: colors.textMuted, marginBottom: spacing.sm, marginLeft: spacing.xs },
  groupRow: { backgroundColor: colors.surface, overflow: 'hidden' },
  groupTop: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  groupBottom: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
});

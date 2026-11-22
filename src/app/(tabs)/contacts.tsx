import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing } from '@/constants/theme';
import ContactCard from '@/components/ContactCard';
import CustomButton from '@/components/CustomButton';
import EmptyState from '@/components/EmptyState';
import { getCompanies, searchContacts } from '@/services/contactService';
import { getCategories, type CategoryWithCount } from '@/services/categoryService';
import { useContactsVersion } from '@/services/dataEvents';
import type { Contact } from '@/types/contact';

/** Screen 6 – Contact list with search (name/company) and company filter. Newest first. */
export default function ContactsScreen() {
  const version = useContactsVersion(); // refresh after saves and background syncs
  const [query, setQuery] = useState('');
  const params = useLocalSearchParams<{ category?: string; favourites?: string }>();
  const [company, setCompany] = useState<string | null>(null);
  const [companies, setCompanies] = useState<string[]>([]);
  // Group filter: everyone, ⭐ favourites, or one category (can be preset by the Categories tab).
  const [group, setGroup] = useState<{ kind: 'all' } | { kind: 'fav' } | { kind: 'cat'; id: string }>({ kind: 'all' });
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.category) setGroup({ kind: 'cat', id: params.category });
    else if (params.favourites) setGroup({ kind: 'fav' });
  }, [params.category, params.favourites]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [list, comps, cats] = await Promise.all([
        searchContacts(query, {
          company,
          favouritesOnly: group.kind === 'fav',
          categoryId: group.kind === 'cat' ? group.id : null,
        }),
        getCompanies(),
        getCategories(),
      ]);
      setContacts(list);
      setCompanies(comps);
      setCategories(cats);
      if (company && !comps.includes(company)) setCompany(null);
      if (group.kind === 'cat' && !cats.some((c) => c.id === group.id)) setGroup({ kind: 'all' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load contacts.');
    }
  }, [query, company, group]);

  // Runs when the tab gains focus and whenever search, filter or data changes.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, version]),
  );

  const hasFilters = !!query.trim() || !!company || group.kind !== 'all';
  const total = contacts?.length ?? 0;

  return (
    <View style={styles.screen}>
      <View style={styles.appHeading}>
        <View>
          <Text style={styles.appTitle}>Contacts</Text>
          <Text style={styles.subtitle}>Good people, all in one place.</Text>
        </View>
        <Pressable
          onPress={() => router.push('/review-contact')}
          style={styles.addButton}
          accessibilityRole="button"
          accessibilityLabel="Add contact"
        >
          <Ionicons name="add" size={21} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textSubtle} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, company, phone, email, notes…"
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

      {/* Groups: everyone · favourites · categories */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All" active={group.kind === 'all'} onPress={() => setGroup({ kind: 'all' })} />
          <Chip label="★ Favourites" active={group.kind === 'fav'} onPress={() => setGroup(group.kind === 'fav' ? { kind: 'all' } : { kind: 'fav' })} />
          {categories.map((c) => {
            const on = group.kind === 'cat' && group.id === c.id;
            return (
              <Chip
                key={c.id}
                label={c.name}
                dot={c.color}
                active={on}
                activeColor={c.color}
                onPress={() => setGroup(on ? { kind: 'all' } : { kind: 'cat', id: c.id })}
              />
            );
          })}
        </ScrollView>
      </View>

      {companies.length > 1 && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { paddingTop: 0 }]}>
            {companies.map((c) => (
              <Chip key={c} label={c} small active={company === c} onPress={() => setCompany(company === c ? null : c)} />
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

function Chip({ label, active, onPress, dot, activeColor, small }: {
  label: string; active: boolean; onPress: () => void; dot?: string; activeColor?: string; small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        small && styles.chipSmall,
        active && styles.chipActive,
        active && activeColor ? { backgroundColor: activeColor, borderColor: activeColor } : null,
      ]}
    >
      {dot && <View style={[styles.dot, { backgroundColor: active ? '#fff' : dot }]} />}
      <Text style={[styles.chipText, small && { fontSize: 12 }, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  appHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  appTitle: { fontFamily: 'Manrope_700Bold', fontSize: 27, lineHeight: 34, letterSpacing: -1.2, color: colors.text },
  subtitle: { fontFamily: 'Manrope_400Regular', fontSize: 11, color: colors.textMuted, marginTop: 4 },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipSmall: { paddingVertical: 5, paddingHorizontal: 11 },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  chipText: { fontSize: 13, color: colors.text, fontWeight: '500' },
  chipTextActive: { color: colors.textOnPrimary, fontWeight: '600' },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  count: { ...{ fontSize: 12, fontWeight: '600' as const }, color: colors.textMuted, marginBottom: spacing.sm, marginLeft: spacing.xs },
  groupRow: { backgroundColor: colors.surface, overflow: 'hidden' },
  groupTop: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  groupBottom: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
});

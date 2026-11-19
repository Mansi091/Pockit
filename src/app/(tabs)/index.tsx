import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import DashboardCard from '@/components/DashboardCard';
import ContactCard from '@/components/ContactCard';
import CustomButton from '@/components/CustomButton';
import EmptyState from '@/components/EmptyState';
import { useAuth } from '@/auth/AuthProvider';
import { getDashboardStats, getFavourites, getRecentContacts } from '@/services/contactService';
import Avatar from '@/components/Avatar';
import { useContactsVersion } from '@/services/dataEvents';
import type { Contact, DashboardStats } from '@/types/contact';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Screen 1 – Home. Stats are recomputed from stored contacts whenever the tab gains focus or data changes. */
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const version = useContactsVersion();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<Contact[]>([]);
  const [favourites, setFavourites] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, r, f] = await Promise.all([getDashboardStats(), getRecentContacts(5), getFavourites(15)]);
      setFavourites(f);
      setStats(s);
      setRecent(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your contacts.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, version]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const emailName = session?.user.email?.split('@')[0] ?? '';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting()} 👋</Text>
          <Text style={styles.brand}>Pockit</Text>
        </View>
        <Pressable
          onPress={() => router.navigate('/settings')}
          accessibilityLabel={`Account ${emailName}`}
          style={styles.accountButton}
        >
          <Ionicons name="person" size={18} color={colors.primary} />
        </Pressable>
      </View>

      {error ? (
        <EmptyState
          icon="warning-outline"
          title="Something went wrong"
          message={error}
          action={<CustomButton title="Try again" variant="outline" onPress={load} />}
        />
      ) : !stats ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <>
          {/* Stats */}
          <View style={styles.statsRow}>
            <DashboardCard label="Contacts" value={stats.totalContacts} icon="people-outline" />
            <DashboardCard label="Scanned" value={stats.totalScannedCards} icon="scan-outline" />
            <DashboardCard label="Companies" value={stats.uniqueCompanies} icon="business-outline" />
          </View>

          {/* Primary action */}
          <Pressable
            onPress={() => router.push('/scan')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.scanCard, pressed && { transform: [{ scale: 0.99 }], opacity: 0.95 }]}
          >
            <View style={styles.scanIcon}>
              <Ionicons name="scan" size={26} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.scanTitle}>Scan a business card</Text>
              <Text style={styles.scanSub}>Camera or gallery · reads text on your phone</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={colors.textOnPrimary} />
          </Pressable>

          {/* Favourites strip */}
          {favourites.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>★ Favourites</Text>
                <Pressable onPress={() => router.navigate({ pathname: '/contacts', params: { favourites: '1' } })} hitSlop={8}>
                  <Text style={styles.seeAll}>See all</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.favRow}>
                {favourites.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => router.push({ pathname: '/contact/[id]', params: { id: c.id } })}
                    style={styles.favItem}
                    accessibilityRole="button"
                    accessibilityLabel={c.personName}
                  >
                    <Avatar name={c.personName} size={56} />
                    <Text style={styles.favName} numberOfLines={1}>{c.personName.split(' ')[0]}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          {/* Recent */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recently added</Text>
            {recent.length > 0 && (
              <Pressable onPress={() => router.navigate('/contacts')} hitSlop={8}>
                <Text style={styles.seeAll}>See all</Text>
              </Pressable>
            )}
          </View>

          {recent.length === 0 ? (
            <View style={styles.group}>
              <EmptyState icon="card-outline" title="No contacts yet" message="Scan your first business card to get started." />
            </View>
          ) : (
            <View style={styles.group}>
              {recent.map((c, i) => (
                <ContactCard
                  key={c.id}
                  contact={c}
                  last={i === recent.length - 1}
                  onPress={() => router.push({ pathname: '/contact/[id]', params: { id: c.id } })}
                />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  greeting: { fontSize: 14, color: colors.textMuted },
  brand: { ...typography.display, marginTop: 2 },
  accountButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  scanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  scanIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTitle: { color: colors.textOnPrimary, fontSize: 16, fontWeight: '700' },
  scanSub: { color: '#C7D2FE', fontSize: 13, marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: typography.heading,
  seeAll: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  favRow: { gap: spacing.lg, paddingVertical: spacing.xs, paddingRight: spacing.lg },
  favItem: { alignItems: 'center', width: 64 },
  favName: { fontSize: 12, color: colors.text, marginTop: 6, fontWeight: '500' },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow },
});

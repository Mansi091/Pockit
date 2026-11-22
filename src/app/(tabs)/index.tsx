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
import EventModeBanner from '@/components/EventModeBanner';
import { getAllFollowUps, setFollowUpDone, type ReminderWithContact } from '@/services/activityService';
import { bucketReminders, formatDue } from '@/utils/dates';

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
  const [due, setDue] = useState<{ list: ReminderWithContact[]; overdue: number; total: number }>({ list: [], overdue: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, r, f, reminders] = await Promise.all([getDashboardStats(), getRecentContacts(5), getFavourites(15), getAllFollowUps()]);
      const b = bucketReminders(reminders);
      const now = [...b.overdue, ...b.today];
      // Show what's due now; if nothing is, the next upcoming one.
      setDue({ list: (now.length ? now : b.upcoming).slice(0, 3), overdue: b.overdue.length, total: now.length });
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
          <Text style={styles.brand}>pockit.</Text>
        </View>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityLabel={`Settings and account ${emailName}`}
          style={styles.accountButton}
        >
          <Ionicons name="settings-outline" size={19} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.welcome}>
        <Text style={styles.eyebrow}>{greeting().toUpperCase()}</Text>
        <Text style={styles.welcomeTitle}>Your network, {emailName ? emailName : 'at a glance'}<Text style={styles.greetingDot}>.</Text></Text>
        <Text style={styles.welcomeSub}>Keep the people you meet close to you.</Text>
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
          <EventModeBanner />

          {/* Network summary */}
          <View style={styles.networkCard}>
            <View style={styles.networkTop}>
              <Text style={styles.networkLabel}>YOUR NETWORK</Text>
              <Ionicons name="people-outline" size={18} color={colors.textMuted} />
            </View>
            <View style={styles.networkStatRow}>
              <Text style={styles.networkStat}>{stats.totalContacts}</Text>
              <Text style={styles.networkStatLabel}>contacts</Text>
            </View>
            <View style={styles.networkBottom}>
              <Text style={styles.networkMeta}>{stats.uniqueCompanies} companies · {stats.totalScannedCards} cards scanned</Text>
              <View style={styles.miniAvatars}>
                {recent.slice(0, 3).map((c) => (
                  <Avatar key={c.id} name={c.personName} size={24} />
                ))}
                {recent.length === 0 && <View style={styles.miniAvatarEmpty} />}
              </View>
            </View>
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

          {/* Follow-ups */}
          {due.list.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, due.overdue > 0 && { color: colors.danger }]}>
                  {due.total > 0 ? `Follow-ups due · ${due.total}` : 'Next follow-up'}
                </Text>
                <Pressable onPress={() => router.navigate({ pathname: '/planner', params: { tab: 'followups' } })} hitSlop={8}>
                  <Text style={styles.seeAll}>Planner</Text>
                </Pressable>
              </View>
              <View style={styles.group}>
                {due.list.map((r, i) => {
                  const late = new Date(r.dueAt).getTime() < Date.now();
                  return (
                    <Pressable
                      key={r.id}
                      onPress={() => router.push({ pathname: '/contact/[id]', params: { id: r.contactId, tab: 'followups' } })}
                      style={({ pressed }) => [styles.dueRow, i < due.list.length - 1 && styles.dueDivider, pressed && { backgroundColor: colors.surfaceMuted }]}
                      accessibilityRole="button"
                    >
                      <Pressable onPress={() => setFollowUpDone(r, true)} hitSlop={10} accessibilityRole="checkbox" accessibilityLabel="Mark as done">
                        <Ionicons name="ellipse-outline" size={24} color={late ? colors.danger : colors.textSubtle} />
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dueTitle} numberOfLines={1}>{r.title}</Text>
                        <Text style={[styles.dueMeta, late && { color: colors.danger }]} numberOfLines={1}>
                          {r.personName} · {formatDue(r.dueAt)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

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
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  brand: { fontFamily: 'Manrope_800ExtraBold', fontSize: 25, color: colors.text, letterSpacing: -1.2 },
  accountButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcome: { marginBottom: spacing.lg },
  eyebrow: { fontFamily: 'Manrope_600SemiBold', fontSize: 9, letterSpacing: 1.6, color: colors.textMuted, marginBottom: 6 },
  welcomeTitle: { fontFamily: 'Manrope_600SemiBold', fontSize: 24, lineHeight: 34, color: colors.text, letterSpacing: -1.1 },
  greetingDot: { color: '#91A27E' },
  welcomeSub: { fontFamily: 'Manrope_400Regular', fontSize: 11, color: colors.textMuted, marginTop: 2 },
  networkCard: {
    backgroundColor: '#F1F2EC',
    borderWidth: 1,
    borderColor: '#E6E9DE',
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  networkTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  networkLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 9, letterSpacing: 1.2, color: colors.textMuted },
  networkStatRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  networkStat: { fontFamily: 'Manrope_500Medium', fontSize: 52, lineHeight: 62, letterSpacing: -3, color: colors.text },
  networkStatLabel: { fontFamily: 'Manrope_400Regular', fontSize: 10, color: colors.textMuted, marginLeft: 8 },
  networkBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  networkMeta: { fontFamily: 'Manrope_400Regular', fontSize: 9, color: colors.textMuted },
  miniAvatars: { flexDirection: 'row', alignItems: 'center' },
  miniAvatarEmpty: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
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
  scanSub: { fontFamily: 'Manrope_400Regular', color: '#AEB5A5', fontSize: 10, marginTop: 3 },
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
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.lg },
  dueDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dueTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  dueMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});

import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import ContactCard from '@/components/ContactCard';
import CustomButton from '@/components/CustomButton';
import EmptyState from '@/components/EmptyState';
import Avatar from '@/components/Avatar';
import EventModeBanner from '@/components/EventModeBanner';
import { useAuth } from '@/auth/AuthProvider';
import { firstNameOf } from '@/auth/userName';
import { useWebLayout } from '@/web/hooks/useWebLayout';
import { getDashboardStats, getFavourites, getRecentContacts } from '@/services/contactService';
import { useContactsVersion } from '@/services/dataEvents';
import { getCachedOrganization } from '@/services/orgService';
import { getAllFollowUps, setFollowUpDone, type ReminderWithContact } from '@/services/activityService';
import { bucketReminders, formatDue } from '@/utils/dates';
import type { Contact, DashboardStats } from '@/types/contact';

type IconName = keyof typeof Ionicons.glyphMap;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Screen 1 – Home.
 * Phone: one column (network card, scan, follow-ups, favourites, recent).
 * Desktop website: a dashboard — stat tiles across the top, recent contacts on
 * the left, follow-ups / favourites / scan on the right.
 */
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const version = useContactsVersion();
  const { isWide } = useWebLayout();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<Contact[]>([]);
  const [favourites, setFavourites] = useState<Contact[]>([]);
  const [due, setDue] = useState<{ list: ReminderWithContact[]; overdue: number; total: number }>({ list: [], overdue: 0, total: 0 });
  const [orgName, setOrgName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, r, f, reminders, org] = await Promise.all([
        getDashboardStats(),
        getRecentContacts(isWide ? 8 : 5),
        getFavourites(15),
        getAllFollowUps(),
        getCachedOrganization(),
      ]);
      const b = bucketReminders(reminders);
      const now = [...b.overdue, ...b.today];
      // Show what's due now; if nothing is, the next upcoming ones.
      setDue({ list: (now.length ? now : b.upcoming).slice(0, isWide ? 5 : 3), overdue: b.overdue.length, total: now.length });
      setFavourites(f);
      setStats(s);
      setRecent(r);
      setOrgName(org?.displayName ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your contacts.');
    }
  }, [isWide]);

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

  // Account name first; for older accounts fall back to the name used in their company.
  const firstName = firstNameOf(session) ?? orgName?.split(' ')[0] ?? null;
  const openContact = (id: string) => router.push({ pathname: '/contact/[id]', params: { id } });

  // ── Building blocks ────────────────────────────────────────────────
  const welcome = (
    <View style={[styles.welcome, isWide && styles.welcomeWide]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow}>{greeting().toUpperCase()}</Text>
        <Text style={[styles.welcomeTitle, isWide && { fontSize: 32, lineHeight: 40 }]}>
          {firstName ? `Your network, ${firstName}` : 'Your network'}
          <Text style={styles.greetingDot}>.</Text>
        </Text>
        <Text style={styles.welcomeSub}>Keep the people you meet close to you.</Text>
        {!firstName && (
          <Pressable onPress={() => router.push('/settings')} accessibilityRole="link" hitSlop={6}>
            <Text style={styles.addName}>Add your name in Settings →</Text>
          </Pressable>
        )}
      </View>
      {isWide && (
        <View style={styles.headerActions}>
          <CustomButton title="Add manually" icon="create-outline" variant="outline" onPress={() => router.push('/review-contact')} />
          <CustomButton title="Scan a card" icon="scan" onPress={() => router.push('/scan')} />
        </View>
      )}
    </View>
  );

  const scanCta = (
    <Pressable
      onPress={() => router.push('/scan')}
      accessibilityRole="button"
      style={({ pressed }) => [styles.scanCard, pressed && { transform: [{ scale: 0.99 }], opacity: 0.95 }]}
    >
      <View style={styles.scanIcon}>
        <Ionicons name="scan" size={24} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.scanTitle}>Scan a business card</Text>
        <Text style={styles.scanSub}>
          {Platform.OS === 'web' ? 'Webcam or photo upload · Pockit fills in the details' : 'Camera or gallery · reads text on your phone'}
        </Text>
      </View>
      <Ionicons name="arrow-forward" size={20} color={colors.textOnPrimary} />
    </Pressable>
  );

  const followUps = (
    <Section
      title={due.total > 0 ? `Follow-ups due · ${due.total}` : 'Next follow-ups'}
      titleColor={due.overdue > 0 ? colors.danger : undefined}
      action={{ label: 'Planner', onPress: () => router.navigate({ pathname: '/planner', params: { tab: 'followups' } }) }}
    >
      <View style={styles.group}>
        {due.list.length === 0 ? (
          <Text style={styles.emptyLine}>Nothing to follow up. Add reminders from a contact's page.</Text>
        ) : (
          due.list.map((r, i) => {
            const late = new Date(r.dueAt).getTime() < Date.now();
            return (
              <Pressable
                key={r.id}
                onPress={() => router.push({ pathname: '/contact/[id]', params: { id: r.contactId, tab: 'followups' } })}
                style={({ pressed, hovered }) => [
                  styles.dueRow,
                  i < due.list.length - 1 && styles.divider,
                  (pressed || hovered) && { backgroundColor: colors.surfaceMuted },
                ]}
                accessibilityRole="button"
              >
                <Pressable onPress={() => setFollowUpDone(r, true)} hitSlop={10} accessibilityRole="checkbox" accessibilityLabel="Mark as done">
                  <Ionicons name="ellipse-outline" size={22} color={late ? colors.danger : colors.textSubtle} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dueTitle} numberOfLines={1}>{r.title}</Text>
                  <Text style={[styles.dueMeta, late && { color: colors.danger }]} numberOfLines={1}>
                    {r.personName} · {formatDue(r.dueAt)}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </View>
    </Section>
  );

  const favouritesBlock = favourites.length > 0 && (
    <Section title="★ Favourites" action={{ label: 'See all', onPress: () => router.navigate({ pathname: '/contacts', params: { favourites: '1' } }) }}>
      <ScrollView horizontal={!isWide} showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.favRow, isWide && styles.favWrap]}>
        {favourites.map((c) => (
          <Pressable key={c.id} onPress={() => openContact(c.id)} style={styles.favItem} accessibilityRole="button" accessibilityLabel={c.personName}>
            <Avatar name={c.personName} size={isWide ? 48 : 56} />
            <Text style={styles.favName} numberOfLines={1}>{c.personName.split(' ')[0]}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Section>
  );

  const recentBlock = (
    <Section title="Recently added" action={recent.length ? { label: 'See all', onPress: () => router.navigate('/contacts') } : undefined}>
      <View style={styles.group}>
        {recent.length === 0 ? (
          <EmptyState
            icon="card-outline"
            title="No contacts yet"
            message="Scan your first business card to get started."
            action={isWide ? <CustomButton title="Scan a card" icon="scan" onPress={() => router.push('/scan')} /> : undefined}
          />
        ) : (
          recent.map((c, i) => <ContactCard key={c.id} contact={c} last={i === recent.length - 1} onPress={() => openContact(c.id)} />)
        )}
      </View>
    </Section>
  );

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (isWide ? spacing.xl : spacing.lg) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {!isWide && (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>pockit.</Text>
          </View>
          <Pressable onPress={() => router.push('/settings')} accessibilityLabel="Settings and account" style={styles.accountButton}>
            <Ionicons name="settings-outline" size={19} color={colors.text} />
          </Pressable>
        </View>
      )}

      {welcome}

      {error ? (
        <EmptyState icon="warning-outline" title="Something went wrong" message={error} action={<CustomButton title="Try again" variant="outline" onPress={load} />} />
      ) : !stats ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : isWide ? (
        <>
          <EventModeBanner />
          <View style={styles.tiles}>
            <StatTile icon="people-outline" label="Contacts" value={stats.totalContacts} onPress={() => router.navigate('/contacts')} />
            <StatTile icon="business-outline" label="Companies" value={stats.uniqueCompanies} />
            <StatTile icon="scan-outline" label="Cards scanned" value={stats.totalScannedCards} />
            <StatTile
              icon="alarm-outline"
              label="Follow-ups due"
              value={due.total}
              tone={due.overdue > 0 ? 'danger' : undefined}
              onPress={() => router.navigate({ pathname: '/planner', params: { tab: 'followups' } })}
            />
          </View>
          <View style={styles.columns}>
            <View style={styles.mainCol}>{recentBlock}</View>
            <View style={styles.sideCol}>
              {followUps}
              {favouritesBlock}
            </View>
          </View>
        </>
      ) : (
        <>
          <EventModeBanner />
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
              <Text style={styles.networkMeta}>
                {stats.uniqueCompanies} companies · {stats.totalScannedCards} cards scanned
              </Text>
              {recent.length > 0 && (
                <View style={styles.miniAvatars}>
                  {recent.slice(0, 3).map((c) => (
                    <Avatar key={c.id} name={c.personName} size={24} />
                  ))}
                </View>
              )}
            </View>
          </View>
          {scanCta}
          {due.list.length > 0 && followUps}
          {favouritesBlock}
          {recentBlock}
        </>
      )}
    </ScrollView>
  );
}

function Section({
  title,
  titleColor,
  action,
  children,
}: {
  title: string;
  titleColor?: string;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, titleColor ? { color: titleColor } : null]}>{title}</Text>
        {action && (
          <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="link">
            <Text style={styles.seeAll}>{action.label}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: number;
  tone?: 'danger';
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ hovered }) => [styles.tile, onPress && hovered && { borderColor: colors.textSubtle }]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={styles.tileTop}>
        <Text style={styles.tileLabel}>{label}</Text>
        <Ionicons name={icon} size={18} color={tone === 'danger' ? colors.danger : colors.textMuted} />
      </View>
      <Text style={[styles.tileValue, tone === 'danger' && { color: colors.danger }]}>{value}</Text>
    </Pressable>
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
  welcomeWide: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.lg, marginBottom: spacing.xl },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  eyebrow: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, letterSpacing: 1.6, color: colors.textMuted, marginBottom: 6 },
  welcomeTitle: { fontFamily: 'Manrope_700Bold', fontSize: 26, lineHeight: 34, color: colors.text, letterSpacing: -1 },
  greetingDot: { color: '#91A27E' },
  welcomeSub: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: colors.textMuted, marginTop: 4 },
  addName: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: colors.accent, marginTop: spacing.sm },

  // Phone network card
  networkCard: { backgroundColor: '#F1F2EC', borderWidth: 1, borderColor: '#E6E9DE', borderRadius: radius.lg, padding: spacing.lg },
  networkTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  networkLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, letterSpacing: 1.2, color: colors.textMuted },
  networkStatRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  networkStat: { fontFamily: 'Manrope_500Medium', fontSize: 52, lineHeight: 62, letterSpacing: -3, color: colors.text },
  networkStatLabel: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: colors.textMuted, marginLeft: 8 },
  networkBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  networkMeta: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: colors.textMuted },
  miniAvatars: { flexDirection: 'row', alignItems: 'center', gap: 2 },

  scanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  scanIcon: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  scanTitle: { fontFamily: 'Manrope_700Bold', color: colors.textOnPrimary, fontSize: 16 },
  scanSub: { fontFamily: 'Manrope_400Regular', color: '#C5CBBC', fontSize: 13, marginTop: 3 },

  // Desktop dashboard
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    flexGrow: 1,
    flexBasis: 180,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: colors.textMuted },
  tileValue: { fontFamily: 'Manrope_600SemiBold', fontSize: 36, lineHeight: 44, letterSpacing: -1.5, color: colors.text, marginTop: spacing.sm },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl, alignItems: 'flex-start' },
  mainCol: { flexGrow: 2, flexBasis: 420, minWidth: 0 },
  sideCol: { flexGrow: 1, flexBasis: 280, minWidth: 0 },

  // Shared
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: typography.heading,
  seeAll: { fontFamily: 'Manrope_600SemiBold', color: colors.accent, fontSize: 14 },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadow },
  emptyLine: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: colors.textMuted, padding: spacing.lg, lineHeight: 20 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.lg },
  dueTitle: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: colors.text },
  dueMeta: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: colors.textMuted, marginTop: 2 },
  favRow: { gap: spacing.lg, paddingVertical: spacing.xs, paddingRight: spacing.lg },
  favWrap: { flexWrap: 'wrap', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  favItem: { alignItems: 'center', width: 64 },
  favName: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: colors.text, marginTop: 6 },
});

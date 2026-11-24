import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import SegmentedTabs from '@/components/SegmentedTabs';
import EmptyState from '@/components/EmptyState';
import CustomButton from '@/components/CustomButton';
import Avatar from '@/components/Avatar';
import {
  getAdminCompanies,
  getAdminGrowth,
  getAdminOverview,
  getAdminUsers,
  isSuperAdmin,
  type AdminCompany,
  type AdminMonth,
  type AdminOverview,
  type AdminUser,
} from '@/services/superAdminService';

type Tab = 'overview' | 'companies' | 'people';
type IconName = keyof typeof Ionicons.glyphMap;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Super Admin dashboard (the Pockit owner). Platform-wide NUMBERS only:
 * users, companies, and how many contacts each person / company has.
 * Never shows anyone's actual contacts, notes or follow-ups.
 * Access is enforced in the database (0006); this screen just asks.
 */
export default function SuperAdminScreen() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [growth, setGrowth] = useState<AdminMonth[]>([]);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError(null);
    const ok = await isSuperAdmin();
    setAllowed(ok);
    if (!ok) return;
    try {
      const [o, g, c, u] = await Promise.all([getAdminOverview(), getAdminGrowth(6), getAdminCompanies(), getAdminUsers()]);
      setOverview(o);
      setGrowth(g);
      setCompanies(c);
      setUsers(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the dashboard.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => [u.fullName, u.email, u.company].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [users, query]);

  if (allowed === null) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />;
  if (!allowed) {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="Super Admin only"
        message="This dashboard is for the owner of Pockit. Your account doesn't have access."
        action={<CustomButton title="Go back" variant="outline" onPress={() => router.back()} />}
      />
    );
  }

  const maxGrowth = Math.max(1, ...growth.map((g) => Math.max(g.newUsers, g.newContacts)));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Super Admin' }} />

      <View style={styles.hero}>
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark" size={14} color={colors.textOnPrimary} />
          <Text style={styles.badgeText}>SUPER ADMIN</Text>
        </View>
        <Text style={styles.title}>Pockit at a glance</Text>
        <Text style={styles.subtitle}>
          Everyone using Pockit and how many people they have connected with. Numbers only — no one's contacts are shown here.
        </Text>
      </View>

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        style={{ marginBottom: spacing.lg }}
        tabs={[
          { key: 'overview', label: 'Overview', icon: 'speedometer-outline' },
          { key: 'companies', label: 'Companies', icon: 'business-outline', badge: companies.length },
          { key: 'people', label: 'People', icon: 'people-outline', badge: users.length },
        ]}
      />

      {error ? (
        <EmptyState icon="warning-outline" title="Could not load" message={error} action={<CustomButton title="Try again" variant="outline" onPress={load} />} />
      ) : !overview ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <>
          {tab === 'overview' && (
            <View style={{ gap: spacing.lg }}>
              <View style={styles.tiles}>
                <Tile icon="people-outline" label="People using Pockit" value={overview.users} sub={`${overview.newUsers30d} new in the last 30 days`} />
                <Tile icon="pulse-outline" label="Active this week" value={overview.active7d} sub={`${overview.active30d} active in 30 days`} />
                <Tile icon="business-outline" label="Companies" value={overview.companies} sub={`${overview.usersInCompanies} people in companies`} />
                <Tile icon="card-outline" label="Contacts connected" value={overview.contacts} sub={`${overview.contacts30d} added in 30 days`} />
                <Tile icon="scan-outline" label="Cards scanned" value={overview.cardsScanned} sub="contacts with a card photo" />
                <Tile icon="share-social-outline" label="Shared with companies" value={overview.sharedContacts} sub="contacts employees chose to share" />
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Growth · last 6 months</Text>
                <View style={styles.legend}>
                  <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                  <Text style={styles.legendText}>New people</Text>
                  <View style={[styles.dot, { backgroundColor: '#A7B79A', marginLeft: spacing.md }]} />
                  <Text style={styles.legendText}>New contacts</Text>
                </View>
                <View style={styles.chart} accessibilityLabel="Monthly growth chart">
                  {growth.map((g) => (
                    <View key={g.month} style={styles.chartCol}>
                      <View style={styles.bars}>
                        <View style={[styles.bar, { height: `${(g.newUsers / maxGrowth) * 100}%`, backgroundColor: colors.primary }]} />
                        <View style={[styles.bar, { height: `${(g.newContacts / maxGrowth) * 100}%`, backgroundColor: '#A7B79A' }]} />
                      </View>
                      <Text style={styles.chartLabel}>{MONTHS[Number(g.month.slice(5, 7)) - 1]}</Text>
                      <Text style={styles.chartValue}>
                        {g.newUsers} · {g.newContacts}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.note}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                <Text style={styles.noteText}>
                  Contact counts include only people with cloud backup on ({overview.usersWithBackup} of {overview.users}). Contacts kept only on a phone can't be counted.
                </Text>
              </View>
            </View>
          )}

          {tab === 'companies' && (
            <View style={styles.list}>
              {companies.length === 0 ? (
                <EmptyState icon="business-outline" title="No companies yet" message="Companies appear here when someone creates one in Settings → Company." />
              ) : (
                companies.map((c, i) => (
                  <View key={c.orgId} style={[styles.row, i < companies.length - 1 && styles.divider]}>
                    <View style={styles.companyIcon}>
                      <Ionicons name="business" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.rowMain}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{c.name}</Text>
                      <Text style={styles.rowSub}>
                        {c.members} {c.members === 1 ? 'person' : 'people'} · {c.admins} admin{c.admins === 1 ? '' : 's'} · created {ago(c.createdAt)}
                      </Text>
                    </View>
                    <Stat label="contacts" value={c.contacts} />
                    <Stat label="shared" value={c.shared} />
                    <Stat label="last added" text={ago(c.lastContactAt)} />
                  </View>
                ))
              )}
            </View>
          )}

          {tab === 'people' && (
            <View style={{ gap: spacing.md }}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search name, email or company…"
                placeholderTextColor={colors.textSubtle}
                style={styles.search}
                accessibilityLabel="Search people"
              />
              <View style={styles.list}>
                {filteredUsers.length === 0 ? (
                  <Text style={styles.empty}>No one matches “{query}”.</Text>
                ) : (
                  filteredUsers.map((u, i) => (
                    <View key={u.userId} style={[styles.row, i < filteredUsers.length - 1 && styles.divider]}>
                      <Avatar name={u.fullName ?? u.email} size={38} />
                      <View style={styles.rowMain}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {u.fullName ?? u.email.split('@')[0]}
                          {u.isSuperAdmin ? '  · Super Admin' : ''}
                        </Text>
                        <Text style={styles.rowSub} numberOfLines={1}>
                          {u.email}
                          {u.company ? ` · ${u.company}${u.role === 'admin' ? ' (admin)' : ''}` : ' · no company'}
                        </Text>
                      </View>
                      <Stat label="contacts" value={u.contacts} />
                      <Stat label="shared" value={u.shared} />
                      <Stat label="last active" text={ago(u.lastSignInAt)} />
                    </View>
                  ))
                )}
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Tile({ icon, label, value, sub }: { icon: IconName; label: string; value: number; sub: string }) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileTop}>
        <Text style={styles.tileLabel}>{label}</Text>
        <Ionicons name={icon} size={18} color={colors.textMuted} />
      </View>
      <Text style={styles.tileValue}>{value.toLocaleString()}</Text>
      <Text style={styles.tileSub}>{sub}</Text>
    </View>
  );
}

function Stat({ label, value, text }: { label: string; value?: number; text?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{text ?? (value ?? 0).toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  hero: { marginBottom: spacing.lg },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: spacing.sm,
  },
  badgeText: { color: colors.textOnPrimary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: typography.title,
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: 4, lineHeight: 21 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { flexGrow: 1, flexBasis: 200, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  tileLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted, flexShrink: 1 },
  tileValue: { fontSize: 34, fontWeight: '700', letterSpacing: -1.2, color: colors.text, marginTop: spacing.sm },
  tileSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  cardTitle: typography.heading,
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: colors.textMuted },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, height: 200, marginTop: spacing.lg },
  chartCol: { flex: 1, alignItems: 'center', height: '100%' },
  bars: { flex: 1, width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 4 },
  bar: { width: '34%', maxWidth: 22, minHeight: 2, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  chartLabel: { fontSize: 12, fontWeight: '600', color: colors.text, marginTop: 6 },
  chartValue: { fontSize: 11, color: colors.textMuted },
  note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  noteText: { ...typography.caption, flex: 1, lineHeight: 17 },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingHorizontal: spacing.lg },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  companyIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flexGrow: 1, flexBasis: 220, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  stat: { minWidth: 84, alignItems: 'flex-end' },
  statValue: { fontSize: 16, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted },
  search: {
    minHeight: 46,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  empty: { ...typography.body, color: colors.textMuted, padding: spacing.lg, textAlign: 'center' },
});

import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import EmptyState from '@/components/EmptyState';
import CustomButton from '@/components/CustomButton';
import Avatar from '@/components/Avatar';
import { getMemberStats, refreshMyOrganization, type MemberStats, type MyOrganization } from '@/services/orgService';
import { contactsToCsv, downloadCsv, exportFileName, getSharedContacts, type SharedContact } from '@/services/teamService';
import { ADDRESS_LABEL_TEXT, LABEL_TEXT } from '@/types/contact';
import { getCurrentUserId } from '@/database/db';

type IconName = keyof typeof Ionicons.glyphMap;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
const canDownload = Platform.OS === 'web';

/**
 * Company Admin (CEO) dashboard.
 *  • Team view: every employee, how many contacts each saved and how many they
 *    SHARED with the company, ranked by shared.
 *  • Click an employee → the contacts they shared (details, event, date).
 *  • Download (website): all shared contacts, or one person's, as a CSV that
 *    opens in Excel.
 * Only shared contacts are ever shown — the database enforces it (RLS).
 */
export default function TeamDashboardScreen() {
  const { member } = useLocalSearchParams<{ member?: string }>();
  const [org, setOrg] = useState<MyOrganization | null | undefined>(undefined);
  const [team, setTeam] = useState<MemberStats[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const o = await refreshMyOrganization();
      setOrg(o);
      if (o?.role === 'admin') setTeam(await getMemberStats());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your team.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const nameOf = useCallback((id: string) => team.find((m) => m.userId === id)?.displayName ?? 'Unknown', [team]);
  const ranked = useMemo(() => [...team].sort((a, b) => b.sharedContacts - a.sharedContacts || b.totalContacts - a.totalContacts), [team]);
  const totals = useMemo(
    () => ({
      shared: team.reduce((n, m) => n + m.sharedContacts, 0),
      saved: team.reduce((n, m) => n + m.totalContacts, 0),
      sharing: team.filter((m) => m.sharedContacts > 0).length,
    }),
    [team],
  );

  const exportAll = async () => {
    if (!org) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const list = await getSharedContacts(team.map((m) => m.userId));
      if (list.length === 0) setExportMsg('Nothing to download yet — no one has shared a contact.');
      else downloadCsv(exportFileName(org.name), contactsToCsv(list, nameOf));
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : 'Download failed.');
    } finally {
      setExporting(false);
    }
  };

  if (loading && org === undefined) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />;

  if (error && org === undefined) {
    return <EmptyState icon="cloud-offline-outline" title="Could not load your team" message={error} action={<CustomButton title="Try again" variant="outline" onPress={load} />} />;
  }

  if (!org || org.role !== 'admin') {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="For company admins"
        message="This dashboard is for the admin (CEO) of a company. Your company page shows what you share."
        action={<CustomButton title="Open Company" variant="outline" onPress={() => router.push('/company')} />}
      />
    );
  }

  const selected = member ? team.find((m) => m.userId === member) : undefined;
  if (member && selected) {
    return <MemberContacts org={org} person={selected} onBack={() => router.setParams({ member: undefined })} />;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.badge}>
          <Ionicons name="briefcase" size={13} color={colors.textOnPrimary} />
          <Text style={styles.badgeText}>COMPANY ADMIN</Text>
        </View>
        <Text style={styles.title}>{org.name} team</Text>
        <Text style={styles.subtitle}>Who is on Pockit and how many contacts each person brings to {org.name}. Click a person to see what they shared.</Text>
      </View>

      <View style={styles.tiles}>
        <Tile icon="people-outline" label="People in the team" value={team.length} sub={`${totals.sharing} sharing contacts`} />
        <Tile icon="share-social-outline" label="Contacts shared with you" value={totals.shared} sub="visible to company admins" />
        <Tile icon="card-outline" label="Contacts saved by the team" value={totals.saved} sub="private unless shared" />
      </View>

      <View style={styles.actions}>
        <CustomButton title="Invite people" variant="outline" icon="person-add-outline" onPress={() => router.push('/company')} />
        {canDownload && (
          <CustomButton
            title={exporting ? 'Preparing…' : 'Download all shared (Excel)'}
            icon="download-outline"
            onPress={exportAll}
            disabled={exporting || totals.shared === 0}
          />
        )}
      </View>
      {exportMsg && <Text style={styles.notice}>{exportMsg}</Text>}
      {error && <Text style={styles.notice}>{error}</Text>}

      <Text style={styles.section}>Employees · ranked by contacts shared</Text>
      <View style={styles.list}>
        {ranked.length <= 1 ? (
          <View style={styles.emptyTeam}>
            <Text style={styles.emptyTitle}>Only you so far</Text>
            <Text style={styles.emptyText}>Create an invite code on the Company page and send it to your employees. They join from Company → Join with a code.</Text>
          </View>
        ) : null}
        {ranked.map((m, i) => {
          const max = Math.max(1, ranked[0]!.sharedContacts);
          const me = m.userId === safeUserId();
          return (
            <Pressable
              key={m.userId}
              onPress={() => router.setParams({ member: m.userId })}
              style={({ hovered }) => [styles.row, i < ranked.length - 1 && styles.divider, hovered && { backgroundColor: colors.surfaceMuted }]}
              accessibilityRole="button"
              accessibilityLabel={`${m.displayName}, ${m.sharedContacts} shared, ${m.totalContacts} saved`}
            >
              <Avatar name={m.displayName} size={40} />
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {m.displayName}
                  {me ? ' (you)' : ''}
                  <Text style={styles.role}> · {m.role === 'admin' ? 'Admin' : 'Member'}</Text>
                </Text>
                <Text style={styles.rowSub}>Joined {day(m.joinedAt)}</Text>
                <View style={styles.meter}>
                  <View style={[styles.meterFill, { width: `${(m.sharedContacts / max) * 100}%` }]} />
                </View>
              </View>
              <Stat label="shared" value={m.sharedContacts} strong />
              <Stat label="saved" value={m.totalContacts} />
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.note}>
        <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
        <Text style={styles.noteText}>
          You see only contacts people chose to share. Private contacts, notes and follow-ups are never shown. "Saved" counts contacts backed up to the cloud.
        </Text>
      </View>
    </ScrollView>
  );
}

function safeUserId(): string | null {
  try {
    return getCurrentUserId();
  } catch {
    return null;
  }
}

/** One employee's shared contacts. */
function MemberContacts({ org, person, onBack }: { org: MyOrganization; person: MemberStats; onBack: () => void }) {
  const [list, setList] = useState<SharedContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError(null);
    setList(null);
    try {
      setList(await getSharedContacts([person.userId]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the contacts.');
    }
  }, [person.userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!list || !q) return list ?? [];
    return list.filter((c) =>
      [c.personName, c.companyName, c.designation, ...c.emails, ...c.phones.map((p) => p.number), ...c.events]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [list, query]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button">
        <Ionicons name="arrow-back" size={18} color={colors.text} />
        <Text style={styles.backText}>All employees</Text>
      </Pressable>

      <View style={styles.personHead}>
        <Avatar name={person.displayName} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{person.displayName}</Text>
          <Text style={styles.rowSub}>
            {person.role === 'admin' ? 'Admin' : 'Member'} of {org.name} · joined {day(person.joinedAt)}
          </Text>
        </View>
        {canDownload && list && list.length > 0 && (
          <CustomButton
            title="Download (Excel)"
            icon="download-outline"
            variant="outline"
            onPress={() => downloadCsv(exportFileName(org.name, person.displayName), contactsToCsv(list, () => person.displayName))}
          />
        )}
      </View>

      <View style={styles.tiles}>
        <Tile icon="share-social-outline" label="Shared with the company" value={person.sharedContacts} sub="you can see these" />
        <Tile icon="card-outline" label="Saved in total" value={person.totalContacts} sub={`${Math.max(0, person.totalContacts - person.sharedContacts)} kept private`} />
      </View>

      {error ? (
        <EmptyState icon="warning-outline" title="Could not load" message={error} action={<CustomButton title="Try again" variant="outline" onPress={load} />} />
      ) : !list ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="share-social-outline"
          title="Nothing shared yet"
          message={`${person.displayName} hasn't shared any contacts with ${org.name}. Their contacts stay private until they turn on "Share with ${org.name}".`}
        />
      ) : (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${list.length} shared contact${list.length === 1 ? '' : 's'}…`}
            placeholderTextColor={colors.textSubtle}
            style={styles.search}
          />
          {shown.length === 0 && <Text style={styles.notice}>No contact matches "{query}".</Text>}
          <View style={{ gap: spacing.md }}>
            {shown.map((c) => (
              <ContactCardView key={c.id} c={c} />
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function ContactCardView({ c }: { c: SharedContact }) {
  const role = [c.designation, c.companyName].filter(Boolean).join(' · ');
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Avatar name={c.personName} size={42} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>{c.personName}</Text>
          {!!role && <Text style={styles.rowSub} numberOfLines={2}>{role}</Text>}
        </View>
        <Text style={styles.saved}>Saved {day(c.savedAt)}</Text>
      </View>
      <View style={styles.fields}>
        {c.phones.map((p, i) => (
          <Field key={`p${i}`} icon="call-outline" label={LABEL_TEXT[p.label] ?? 'Phone'} value={p.number} />
        ))}
        {c.emails.map((e) => (
          <Field key={e} icon="mail-outline" label="Email" value={e} onPress={() => Linking.openURL(`mailto:${e}`)} />
        ))}
        {!!c.website && <Field icon="globe-outline" label="Website" value={c.website} />}
        {c.addresses.map((a, i) => (
          <Field key={`a${i}`} icon="location-outline" label={ADDRESS_LABEL_TEXT[a.label] ?? 'Address'} value={a.fullAddress} />
        ))}
        {c.events.length > 0 && <Field icon="calendar-outline" label="Met at" value={c.events.join(', ')} />}
      </View>
    </View>
  );
}

function Field({ icon, label, value, onPress }: { icon: IconName; label: string; value: string; onPress?: () => void }) {
  return (
    <View style={styles.field}>
      <Ionicons name={icon} size={15} color={colors.textMuted} style={{ marginTop: 2 }} />
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, onPress && { color: colors.accent }]} onPress={onPress} selectable>
        {value}
      </Text>
    </View>
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

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, strong && { color: colors.accent }]}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  hero: {},
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end' },
  notice: { ...typography.caption, color: colors.warning },
  section: { ...typography.label, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: -spacing.sm },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingHorizontal: spacing.lg },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  role: { fontWeight: '500', color: colors.textMuted },
  rowSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  meter: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, marginTop: 8, overflow: 'hidden', maxWidth: 360 },
  meterFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },
  stat: { minWidth: 64, alignItems: 'flex-end' },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted },
  emptyTeam: { padding: spacing.lg, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.warningSoft },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  noteText: { ...typography.caption, flex: 1, lineHeight: 17 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 },
  backText: { fontSize: 14, fontWeight: '600', color: colors.text },
  personHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
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
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  saved: { fontSize: 12, color: colors.textSubtle },
  fields: { gap: 6 },
  field: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  fieldLabel: { fontSize: 13, color: colors.textMuted, width: 110 },
  fieldValue: { fontSize: 14, color: colors.text, flex: 1 },
});

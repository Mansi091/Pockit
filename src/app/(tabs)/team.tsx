import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import EmptyState from '@/components/EmptyState';
import CustomButton from '@/components/CustomButton';
import Avatar from '@/components/Avatar';
import { getMemberStats, refreshMyOrganization, type MemberStats, type MyOrganization } from '@/services/orgService';
import { contactsToCsv, downloadCsv, exportFileName, getSharedContacts, groupByCategory, type SharedContact } from '@/services/teamService';
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
  const { member, category } = useLocalSearchParams<{ member?: string; category?: string }>();
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
  const ranked = useMemo(() => [...team].sort((a, b) => b.sharedContacts - a.sharedContacts || a.displayName.localeCompare(b.displayName)), [team]);
  const totals = useMemo(
    () => ({
      shared: team.reduce((n, m) => n + m.sharedContacts, 0),
      sharing: team.filter((m) => m.sharedContacts > 0).length,
    }),
    [team],
  );

  // Everyone's shared contacts, for the "By category" overview and the download.
  const [allShared, setAllShared] = useState<SharedContact[] | null>(null);
  const [allError, setAllError] = useState<string | null>(null);
  const teamKey = team.map((m) => `${m.userId}:${m.sharedContacts}`).join(',');
  useEffect(() => {
    if (!team.length) return;
    let live = true;
    setAllError(null);
    getSharedContacts(team.map((m) => m.userId))
      .then((l) => live && setAllShared(l))
      .catch((e) => live && setAllError(e instanceof Error ? e.message : 'Could not load the shared contacts.'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamKey]);
  const groups = useMemo(() => groupByCategory(allShared ?? []), [allShared]);

  const exportAll = async () => {
    if (!org) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const list = allShared ?? (await getSharedContacts(team.map((m) => m.userId)));
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

  // One category across the whole team.
  const group = category !== undefined && allShared ? groups.find((g) => g.key === category) : undefined;
  if (category !== undefined && allShared) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.setParams({ category: undefined })} style={styles.back} accessibilityRole="button">
          <Ionicons name="arrow-back" size={18} color={colors.text} />
          <Text style={styles.backText}>{org.name} team</Text>
        </Pressable>
        <View style={styles.personHead}>
          <View style={[styles.catIcon, { backgroundColor: group?.color ?? colors.surfaceMuted }]}>
            <Ionicons name="pricetag" size={22} color={group?.color ? '#FFFFFF' : colors.textMuted} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>{group?.name ?? 'Category'}</Text>
            <Text style={styles.rowSub}>
              {group?.contacts.length ?? 0} shared contact{group?.contacts.length === 1 ? '' : 's'} · from{' '}
              {new Set(group?.contacts.map((c) => c.ownerId)).size} people
            </Text>
          </View>
          {canDownload && !!group?.contacts.length && (
            <CustomButton
              title="Download (Excel)"
              icon="download-outline"
              variant="outline"
              onPress={() => downloadCsv(exportFileName(org.name, group.name), contactsToCsv(group.contacts, nameOf))}
            />
          )}
        </View>
        <ContactsBrowser list={group?.contacts ?? []} ownerName={nameOf} showCategories={false} />
      </ScrollView>
    );
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
        <Tile
          icon="pricetags-outline"
          label="Categories"
          value={groups.filter((g) => g.key !== '').length}
          sub="used on shared contacts"
        />
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
              accessibilityLabel={`${m.displayName}, ${m.sharedContacts} shared`}
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
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.section}>Shared contacts · by category</Text>
      <View style={styles.list}>
        {allError ? (
          <Text style={[styles.notice, { padding: spacing.lg }]}>{allError}</Text>
        ) : !allShared ? (
          <ActivityIndicator color={colors.primary} style={{ margin: spacing.lg }} />
        ) : groups.length === 0 ? (
          <Text style={[styles.emptyText, { padding: spacing.lg }]}>No shared contacts yet.</Text>
        ) : (
          groups.map((g, i) => {
            const people = new Set(g.contacts.map((c) => c.ownerId)).size;
            return (
              <Pressable
                key={g.key || 'none'}
                onPress={() => router.setParams({ category: g.key })}
                style={({ hovered }) => [styles.row, i < groups.length - 1 && styles.divider, hovered && { backgroundColor: colors.surfaceMuted }]}
                accessibilityRole="button"
                accessibilityLabel={`${g.name}, ${g.contacts.length} contacts`}
              >
                <View style={[styles.catDot, { backgroundColor: g.color ?? colors.border }]} />
                <View style={styles.rowMain}>
                  <Text style={[styles.rowTitle, !g.color && { color: colors.textMuted }]} numberOfLines={1}>{g.name}</Text>
                  <Text style={styles.rowSub}>from {people} {people === 1 ? 'person' : 'people'}</Text>
                </View>
                <Stat label="contacts" value={g.contacts.length} strong />
                <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
              </Pressable>
            );
          })
        )}
      </View>

      <View style={styles.note}>
        <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
        <Text style={styles.noteText}>
          You see only contacts people chose to share, with the categories they put them in. Private contacts — and how many there are — notes and follow-ups are never shown.
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
        <Tile icon="share-social-outline" label={`Shared with ${org.name}`} value={person.sharedContacts} sub="the contacts you can see" />
        <Tile
          icon="pricetags-outline"
          label="Categories"
          value={list ? groupByCategory(list).filter((g) => g.key !== '').length : 0}
          sub="on these contacts"
        />
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
        <ContactsBrowser list={list} />
      )}
    </ScrollView>
  );
}

/**
 * Shared contacts with category chips ("All · Clients 3 · Vendors 2 · No
 * category 1") and a search box. Used for one employee and for one category.
 */
function ContactsBrowser({
  list,
  ownerName,
  showCategories = true,
}: {
  list: SharedContact[];
  /** Set when contacts come from several people: each card says who shared it. */
  ownerName?: (id: string) => string;
  showCategories?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string | null>(null); // null = all
  const groups = useMemo(() => groupByCategory(list), [list]);
  const hasCategories = groups.some((g) => g.key !== '');

  const shown = useMemo(() => {
    const inCat = cat === null ? list : (groups.find((g) => g.key === cat)?.contacts ?? []);
    const q = query.trim().toLowerCase();
    if (!q) return inCat;
    return inCat.filter((c) =>
      [c.personName, c.companyName, c.designation, ...c.emails, ...c.phones.map((p) => p.number), ...c.events, ...c.categories.map((x) => x.name)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [list, groups, cat, query]);

  return (
    <>
      {showCategories && hasCategories && (
        <View style={styles.chips} accessibilityRole="tablist">
          <Chip label="All" count={list.length} on={cat === null} onPress={() => setCat(null)} />
          {groups.map((g) => (
            <Chip key={g.key || 'none'} label={g.name} count={g.contacts.length} color={g.color} on={cat === g.key} onPress={() => setCat(g.key)} />
          ))}
        </View>
      )}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={`Search ${list.length} shared contact${list.length === 1 ? '' : 's'}…`}
        placeholderTextColor={colors.textSubtle}
        style={styles.search}
      />
      {shown.length === 0 && <Text style={styles.notice}>{query ? `No contact matches "${query}".` : 'No contacts here.'}</Text>}
      <View style={{ gap: spacing.md }}>
        {shown.map((c) => (
          <ContactCardView key={c.id} c={c} sharedBy={ownerName?.(c.ownerId)} />
        ))}
      </View>
    </>
  );
}

function Chip({ label, count, color, on, onPress }: { label: string; count: number; color?: string | null; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }) => [styles.chip, on && styles.chipOn, !on && hovered && { backgroundColor: colors.surfaceMuted }]}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
    >
      {color ? <View style={[styles.chipDot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.chipText, on && { color: colors.textOnPrimary }]}>{label}</Text>
      <Text style={[styles.chipCount, on && { color: colors.textOnPrimary }]}>{count}</Text>
    </Pressable>
  );
}

/**
 * One shared contact, always in the same order:
 * Name (+ designation) → Company → Contact number → Email → Website → Address.
 * Every row is shown; "—" marks a detail the card didn't have.
 */
function ContactCardView({ c, sharedBy }: { c: SharedContact; sharedBy?: string }) {
  const url = (w: string) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Avatar name={c.personName} size={42} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowTitle} numberOfLines={1} selectable>{c.personName}</Text>
          {!!c.designation && <Text style={styles.rowSub} numberOfLines={2}>{c.designation}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={styles.saved}>Saved {day(c.savedAt)}</Text>
          {sharedBy ? <Text style={styles.saved}>by {sharedBy}</Text> : null}
        </View>
      </View>
      {c.categories.length > 0 && (
        <View style={styles.tagRow}>
          {c.categories.map((x) => (
            <View key={x.id} style={[styles.tag, { borderColor: x.color }]}>
              <View style={[styles.chipDot, { backgroundColor: x.color }]} />
              <Text style={styles.tagText}>{x.name}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.fields}>
        <Field icon="business-outline" label="Company" values={c.companyName ? [{ text: c.companyName }] : []} />
        <Field
          icon="call-outline"
          label="Contact number"
          values={c.phones.map((p) => ({ text: p.number, tag: LABEL_TEXT[p.label] }))}
        />
        <Field
          icon="mail-outline"
          label="Email"
          values={c.emails.map((e) => ({ text: e, onPress: () => Linking.openURL(`mailto:${e}`) }))}
        />
        <Field
          icon="globe-outline"
          label="Website"
          values={c.website ? [{ text: c.website, onPress: () => Linking.openURL(url(c.website!)) }] : []}
        />
        <Field
          icon="location-outline"
          label="Address"
          values={c.addresses.map((a) => ({ text: a.fullAddress, tag: a.label === 'other' ? undefined : ADDRESS_LABEL_TEXT[a.label] }))}
        />
        {c.events.length > 0 && <Field icon="calendar-outline" label="Met at" values={[{ text: c.events.join(', ') }]} />}
      </View>
    </View>
  );
}

type FieldValue = { text: string; tag?: string; onPress?: () => void };

function Field({ icon, label, values }: { icon: IconName; label: string; values: FieldValue[] }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Ionicons name={icon} size={15} color={colors.textMuted} />
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <View style={styles.fieldValues}>
        {values.length === 0 ? (
          <Text style={styles.fieldEmpty}>—</Text>
        ) : (
          values.map((v, i) => (
            <Text key={i} style={styles.fieldValue} selectable>
              <Text style={v.onPress && { color: colors.accent }} onPress={v.onPress}>
                {v.text}
              </Text>
              {v.tag ? <Text style={styles.fieldTag}>{`  ${v.tag}`}</Text> : null}
            </Text>
          ))
        )}
      </View>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDot: { width: 9, height: 9, borderRadius: 5 },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.text },
  chipCount: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -4 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 12, fontWeight: '600', color: colors.text },
  catDot: { width: 14, height: 14, borderRadius: 7, marginHorizontal: 13 },
  catIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  fields: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  field: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: spacing.md, rowGap: 2 },
  fieldHead: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 150, paddingTop: 1 },
  fieldLabel: { fontSize: 13, color: colors.textMuted },
  fieldValues: { flex: 1, minWidth: 200, gap: 2 },
  fieldValue: { fontSize: 14, color: colors.text, lineHeight: 20 },
  fieldTag: { fontSize: 12, color: colors.textSubtle },
  fieldEmpty: { fontSize: 14, color: colors.textSubtle },
});

import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import FormError from '@/components/FormError';
import SegmentedTabs from '@/components/SegmentedTabs';
import OptionSheet from '@/components/OptionSheet';
import Avatar from '@/components/Avatar';
import { sheetStyles } from '@/components/Sheet';
import { isBackupEnabled, setBackupEnabled } from '@/services/syncService';
import { useAuth } from '@/auth/AuthProvider';
import { fullNameOf } from '@/auth/userName';
import {
  countSharedContacts,
  createInvite,
  getActiveInvite,
  inviteMessage,
  createOrganization,
  getCachedOrganization,
  getMemberStats,
  getShareNewContacts,
  joinOrganization,
  leaveOrganization,
  refreshMyOrganization,
  removeMember,
  setMemberRole,
  setShareNewContacts,
  type MemberStats,
  type MyOrganization,
} from '@/services/orgService';

type Mode = 'join' | 'create';
type MemberAction = 'makeAdmin' | 'makeMember' | 'remove';

/**
 * Company page (Settings → Company).
 *  • Not in a company: join with an invite code, or create one (you become admin).
 *  • Member: opt-in sharing settings and how many contacts you've shared.
 *  • Admin: also invite people and see the team (counts only for unshared contacts).
 */
export default function CompanyScreen() {
  const [org, setOrg] = useState<MyOrganization | null | undefined>(undefined);
  const [offline, setOffline] = useState<string | null>(null);
  const [shareNew, setShareNew] = useState(false);
  const [sharedCount, setSharedCount] = useState(0);
  const [backupOn, setBackupOn] = useState(true);
  const [team, setTeam] = useState<MemberStats[] | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [inviteExpires, setInviteExpires] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [memberMenu, setMemberMenu] = useState<MemberStats | null>(null);

  // join / create form
  const [mode, setMode] = useState<Mode>('join');
  const [code, setCode] = useState('');
  const [orgName, setOrgName] = useState('');
  const { session } = useAuth();
  const [myName, setMyName] = useState(fullNameOf(session) ?? '');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setOffline(null);
    setShareNew(await getShareNewContacts());
    setSharedCount(await countSharedContacts());
    setBackupOn(await isBackupEnabled());
    let current: MyOrganization | null;
    try {
      current = await refreshMyOrganization();
    } catch (e) {
      current = await getCachedOrganization();
      setOffline(e instanceof Error ? e.message : 'Could not reach the cloud.');
    }
    setOrg(current);
    if (current?.role === 'admin') {
      // Show the company's current invite code again (any admin, any device).
      getActiveInvite(current.id)
        .then((i) => {
          setInvite(i?.code ?? null);
          setInviteExpires(i?.expiresAt ?? null);
        })
        .catch(() => {});
      setTeamError(null);
      getMemberStats()
        .then(setTeam)
        .catch((e) => {
          setTeam([]);
          setTeamError(e instanceof Error ? e.message : 'Could not load the team.');
        });
    } else {
      setTeam(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      if (key === 'join' || key === 'create') setError(msg);
      else Alert.alert('Could not do that', msg);
    } finally {
      setBusy(null);
    }
  };

  const onJoinOrCreate = () =>
    run(mode, async () => {
      const next = mode === 'join' ? await joinOrganization(code, myName) : await createOrganization(orgName, myName);
      setOrg(next);
      setCode('');
      setOrgName('');
      await load();
      const title = mode === 'join' ? `You joined ${next.name}` : `${next.name} is ready`;
      const body = 'Your contacts are still private. Share the ones you choose from each contact page, or turn on "Share new contacts" below.';
      if (await isBackupEnabled()) {
        Alert.alert(title, body);
      } else {
        // Phone app with backup off: shared contacts could never reach the company.
        Alert.alert(title, `${body}\n\nSharing works through Pockit's cloud, so cloud backup needs to be on. Contacts you don't share stay private — only you can see them.`, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Turn on backup', onPress: () => setBackupEnabled(true).catch(() => {}) },
        ]);
      }
    });

  const onInvite = () =>
    run('invite', async () => {
      const c = await createInvite('member');
      setInvite(c);
      setInviteExpires(new Date(Date.now() + 14 * 86_400_000).toISOString());
      setCopied(false);
    });

  const siteLink = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
  const message = (c: string) => inviteMessage(org?.name ?? 'our company', c, siteLink);

  // Website: copy straight to the clipboard. Phone: the share sheet (it has "Copy" too).
  const copyInvite = async (c: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(c);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        return;
      } catch {
        // clipboard blocked: fall through to sharing
      }
    }
    await shareInvite(c);
  };

  const shareInvite = async (c: string) => {
    if (Platform.OS === 'web') {
      const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }) : null;
      if (nav?.share) {
        await nav.share({ text: message(c) }).catch(() => {});
        return;
      }
      try {
        await navigator.clipboard.writeText(message(c));
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        Alert.alert('Invite code', message(c));
      }
      return;
    }
    await Share.share({ message: message(c) }).catch(() => {});
  };

  const validUntil = inviteExpires
    ? new Date(inviteExpires).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const onLeave = () =>
    Alert.alert(
      `Leave ${org?.name}?`,
      'All your contacts become private again. Your contacts stay on your phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => run('leave', async () => { await leaveOrganization(); await load(); }) },
      ],
    );

  const onToggleShareNew = async (on: boolean) => {
    setShareNew(on);
    await setShareNewContacts(on);
  };

  const onMemberAction = (a: MemberAction) => {
    const m = memberMenu;
    if (!m) return;
    if (a === 'remove') {
      Alert.alert(`Remove ${m.displayName}?`, 'Their contacts become private again and they leave the company.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => run('member', async () => { await removeMember(m.userId); await load(); }) },
      ]);
    } else {
      run('member', async () => {
        await setMemberRole(m.userId, a === 'makeAdmin' ? 'admin' : 'member');
        await load();
      });
    }
  };

  if (org === undefined) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />;

  // ── Not in a company ───────────────────────────────────────────────
  if (!org) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="business-outline" size={26} color={colors.primary} />
          </View>
          <Text style={styles.title}>Work with your team</Text>
          <Text style={styles.subtitle}>
            Join your company to share the contacts you choose. Everything stays private unless you share it.
          </Text>
        </View>

        {offline && <FormError tone="info" message={offline} />}

        <SegmentedTabs
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          style={{ marginBottom: spacing.lg }}
          tabs={[
            { key: 'join', label: 'Join with a code', icon: 'key-outline' },
            { key: 'create', label: 'Create a company', icon: 'add-circle-outline' },
          ]}
        />

        <View style={styles.card}>
          <FormError message={error} />
          {mode === 'join' ? (
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="Invite code, e.g. 7F3A9C21"
              placeholderTextColor={colors.textSubtle}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              style={[sheetStyles.input, styles.codeInput]}
              accessibilityLabel="Invite code"
            />
          ) : (
            <TextInput
              value={orgName}
              onChangeText={setOrgName}
              placeholder="Company name"
              placeholderTextColor={colors.textSubtle}
              maxLength={80}
              style={sheetStyles.input}
              accessibilityLabel="Company name"
            />
          )}
          <TextInput
            value={myName}
            onChangeText={setMyName}
            placeholder="Your name (as your team will see it)"
            placeholderTextColor={colors.textSubtle}
            maxLength={80}
            autoCapitalize="words"
            style={sheetStyles.input}
            accessibilityLabel="Your name"
          />
          <CustomButton
            title={mode === 'join' ? 'Join company' : 'Create company'}
            icon="arrow-forward"
            onPress={onJoinOrCreate}
            loading={busy === mode}
          />
          <Text style={styles.note}>
            {mode === 'join'
              ? 'Ask your company admin for an 8-character invite code.'
              : 'You will be the admin: you can invite people and see what they share.'}
          </Text>
        </View>
      </ScrollView>
    );
  }

  // ── In a company ───────────────────────────────────────────────────
  const isAdmin = org.role === 'admin';
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="business" size={26} color={colors.primary} />
        </View>
        <Text style={styles.title}>{org.name}</Text>
        <Text style={styles.subtitle}>
          You are {isAdmin ? 'an admin' : 'a member'} · {org.displayName}
        </Text>
      </View>

      {offline && <FormError tone="info" message={offline} />}

      {/* Sharing */}
      <Text style={styles.sectionTitle}>Your sharing</Text>
      <View style={styles.card}>
        <View style={styles.statRow}>
          <Text style={styles.bigNumber}>{sharedCount}</Text>
          <Text style={styles.statLabel}>contact{sharedCount === 1 ? '' : 's'} shared with {org.name}</Text>
        </View>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Share new contacts automatically</Text>
            <Text style={styles.rowSub}>Off by default. You can always share or unshare a single contact from its page.</Text>
          </View>
          <Switch value={shareNew} onValueChange={onToggleShareNew} trackColor={{ true: colors.accent, false: colors.border }} thumbColor={colors.surface} />
        </View>
        {!backupOn && (
          <View style={styles.warn}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
            <Text style={styles.warnText}>
              Sharing needs Cloud backup — shared contacts only reach your company once they are in the cloud.
            </Text>
            <CustomButton
              title="Turn on"
              variant="outline"
              onPress={() => run('backup', async () => { await setBackupEnabled(true); setBackupOn(true); })}
              loading={busy === 'backup'}
            />
          </View>
        )}
        <View style={styles.privacy}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
          <Text style={styles.privacyText}>
            Admins see shared contacts' details, the event and when you saved them. Your notes and follow-ups are never shared.
          </Text>
        </View>
      </View>

      {/* Admin */}
      {isAdmin && (
        <>
          <Text style={styles.sectionTitle}>Invite people</Text>
          <View style={styles.card}>
            {invite ? (
              <>
                <Text style={styles.inviteLabel}>{org?.name} invite code</Text>
                <Text style={styles.code} selectable>{invite}</Text>
                <Text style={styles.note}>
                  {validUntil ? `Works until ${validUntil}. ` : ''}Send it to anyone who should join {org?.name}: they open Company → Join with a code.
                </Text>
                <View style={sheetStyles.row}>
                  <CustomButton
                    title={copied ? 'Copied!' : Platform.OS === 'web' ? 'Copy code' : 'Copy / share'}
                    icon={copied ? 'checkmark' : 'copy-outline'}
                    onPress={() => copyInvite(invite)}
                    style={{ flex: 1 }}
                  />
                  <CustomButton title="Send invite" icon="share-social-outline" variant="outline" onPress={() => shareInvite(invite)} style={{ flex: 1 }} />
                </View>
                <Pressable onPress={onInvite} disabled={busy === 'invite'} style={styles.newCode} accessibilityRole="button">
                  <Text style={styles.newCodeText}>{busy === 'invite' ? 'Creating…' : 'Make a new code (the old one keeps working until it expires)'}</Text>
                </Pressable>
              </>
            ) : (
              <CustomButton title="Create an invite code" icon="person-add-outline" onPress={onInvite} loading={busy === 'invite'} />
            )}
          </View>

          <Text style={styles.sectionTitle}>Team</Text>
          <CustomButton
            title="Open team dashboard"
            icon="briefcase-outline"
            onPress={() => router.push('/team' as Href)}
            style={{ marginBottom: spacing.sm }}
          />
          <View style={[styles.card, { paddingVertical: 0 }]}>
            {teamError ? (
              <View style={{ paddingVertical: spacing.lg, gap: spacing.sm }}>
                <Text style={styles.rowSub}>{teamError}</Text>
                <CustomButton title="Try again" variant="outline" onPress={load} />
              </View>
            ) : team === null ? (
              <ActivityIndicator color={colors.primary} style={{ margin: spacing.lg }} />
            ) : (
              team.map((m, i) => (
                <Pressable
                  key={m.userId}
                  onPress={() => router.push({ pathname: '/team', params: { member: m.userId } } as unknown as Href)}
                  onLongPress={() => setMemberMenu(m)}
                  style={[styles.member, i < team.length - 1 && styles.divider]}
                  accessibilityHint="Tap to see their shared contacts. Long-press to change role or remove"
                >
                  <Avatar name={m.displayName} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {m.displayName}
                      {m.role === 'admin' ? '  · Admin' : ''}
                    </Text>
                    <Text style={styles.rowSub}>
                      {m.sharedContacts} shared · {m.totalContacts} saved
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </View>
          <Text style={styles.tip}>
            Tap someone to see the contacts they shared; long-press to change their role or remove them. "Saved" counts contacts backed up to the cloud.
          </Text>
        </>
      )}

      <View style={{ marginTop: spacing.xl }}>
        <CustomButton title="Leave company" icon="exit-outline" variant="danger" onPress={onLeave} loading={busy === 'leave'} />
      </View>

      <OptionSheet
        visible={!!memberMenu}
        title={memberMenu?.displayName ?? ''}
        options={(memberMenu?.role === 'admin' ? ['makeMember', 'remove'] : ['makeAdmin', 'remove']) as MemberAction[]}
        labelOf={(o) => (o === 'makeAdmin' ? 'Make admin' : o === 'makeMember' ? 'Make member' : 'Remove from company')}
        onSelect={onMemberAction}
        onClose={() => setMemberMenu(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  hero: { alignItems: 'center', marginBottom: spacing.lg },
  heroIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  title: { ...typography.title, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: 4, lineHeight: 21 },
  sectionTitle: { ...typography.label, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, ...shadow },
  codeInput: { letterSpacing: 2, fontSize: 18, fontWeight: '700' },
  note: { ...typography.caption, marginTop: spacing.sm, lineHeight: 17 },
  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginBottom: spacing.md },
  bigNumber: { ...typography.display },
  statLabel: { ...typography.body, color: colors.textMuted, flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowSub: { ...typography.caption, marginTop: 2, lineHeight: 17 },
  warn: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, marginTop: spacing.sm },
  warnText: { ...typography.caption, color: colors.warning, lineHeight: 17 },
  privacy: { flexDirection: 'row', gap: 6, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  privacyText: { ...typography.caption, flex: 1, lineHeight: 17 },
  inviteLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6 },
  newCode: { alignSelf: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
  newCodeText: { fontSize: 13, color: colors.textMuted, textDecorationLine: 'underline' },
  code: { fontSize: 30, fontWeight: '800', letterSpacing: 4, textAlign: 'center', color: colors.text, marginBottom: spacing.xs },
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tip: { ...typography.caption, marginTop: spacing.sm, lineHeight: 17 },
});

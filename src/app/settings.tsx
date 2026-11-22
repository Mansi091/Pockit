import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import { useAuth } from '@/auth/AuthProvider';
import { isOcrAvailable } from '@/services/ocrService';
import { isBackupEnabled, setBackupEnabled, syncNow, useSyncStatus } from '@/services/syncService';
import { storageUsage } from '@/services/imageService';
import { getDashboardStats } from '@/services/contactService';
import { useContactsVersion } from '@/services/dataEvents';
import { databaseFileName } from '@/database/db';
import { SCHEMA_VERSION } from '@/database/migrations';
import { isExpoGo } from '@/lib/runtime';

const formatBytes = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const formatTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'Never');

/** Screen 8 – Settings: account, cloud backup, app, permissions and storage information. */
export default function SettingsScreen() {
  const { session, signOut, deleteAccount } = useAuth();
  const sync = useSyncStatus();
  const version = useContactsVersion();
  const [backupOn, setBackupOn] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const [busy, setBusy] = useState<'signout' | 'delete' | null>(null);
  const [counts, setCounts] = useState<{ contacts: number; files: number; bytes: number } | null>(null);
  const userId = session?.user.id ?? '';

  useFocusEffect(
    useCallback(() => {
      isBackupEnabled().then(setBackupOn).catch(() => setBackupOn(false));
      getDashboardStats()
        .then((s) => setCounts({ contacts: s.totalContacts, ...storageUsage(userId) }))
        .catch(() => setCounts(null));
    }, [userId, version]),
  );

  const onToggleBackup = async (value: boolean) => {
    if (value) {
      const ok = await new Promise<boolean>((resolve) =>
        Alert.alert(
          'Turn on cloud backup?',
          'Your saved contacts and card images will be uploaded to your private Pockit cloud account so you can restore them on a new phone. Only you can access them.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Turn on', onPress: () => resolve(true) },
          ],
        ),
      );
      if (!ok) return;
    }
    setToggling(true);
    try {
      await setBackupEnabled(value);
      setBackupOn(value);
    } finally {
      setToggling(false);
    }
  };

  const onSignOut = () =>
    Alert.alert('Sign out?', 'Your contacts stay saved on this phone and will be here when you sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setBusy('signout');
          try {
            await signOut();
          } catch (e) {
            Alert.alert('Sign out failed', e instanceof Error ? e.message : 'Unknown error');
            setBusy(null);
          }
        },
      },
    ]);

  const onDeleteAccount = () =>
    Alert.alert(
      'Delete account permanently?',
      'This deletes your account, all contacts and card images on this phone and in the cloud. Contacts you saved to your phone\'s Contacts app are not affected. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setBusy('delete');
            try {
              await deleteAccount();
            } catch (e) {
              Alert.alert('Could not delete account', `${e instanceof Error ? e.message : 'Unknown error'}\n\nYou need an internet connection to delete your account.`);
              setBusy(null);
            }
          },
        },
      ],
    );

  const syncLabel: Record<typeof sync.state, string> = {
    disabled: 'Off',
    idle: `Up to date · last synced ${formatTime(sync.lastSyncedAt)}`,
    syncing: 'Syncing…',
    offline: `Offline · ${sync.pending} change(s) waiting`,
    error: `Error: ${sync.error ?? 'unknown'}`,
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.appHeading}>
        <Text style={styles.appTitle}>Settings</Text>
        <Text style={styles.subtitle}>A space that is yours.</Text>
      </View>
      <Section title="Account">
        <Row icon="person-circle-outline" label="Signed in as" value={session?.user.email ?? '—'} />
        <Row
          icon="key-outline"
          label="Sign-in method"
          value={session?.user.app_metadata?.provider === 'google' ? 'Google' : 'Email & password'}
          last
        />
      </Section>

      <Section title="Cloud backup">
        <View style={styles.row}>
          <Ionicons name="cloud-upload-outline" size={20} color={colors.accent} style={styles.rowIcon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Back up contacts & card images</Text>
            <Text style={styles.rowValue}>{backupOn === null ? '…' : syncLabel[sync.state]}</Text>
          </View>
          {toggling || sync.state === 'syncing' ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Switch
              value={!!backupOn}
              onValueChange={onToggleBackup}
              trackColor={{ true: colors.accent, false: colors.border }}
              thumbColor={colors.surface}
            />
          )}
        </View>
        {backupOn && (
          <View style={{ paddingVertical: spacing.md }}>
            <CustomButton title="Sync now" icon="sync-outline" variant="outline" onPress={() => syncNow()} disabled={sync.state === 'syncing'} />
          </View>
        )}
      </Section>

      <Section title="Data on this phone">
        <Row icon="people-outline" label="Contacts" value={counts ? String(counts.contacts) : '…'} />
        <Row icon="images-outline" label="Card images" value={counts ? `${counts.files} · ${formatBytes(counts.bytes)}` : '…'} />
        <Row icon="server-outline" label="Database" value={`SQLite · ${databaseFileName() ?? '—'} · schema v${SCHEMA_VERSION}`} last />
      </Section>

      <Section title="Application">
        <Row icon="pricetag-outline" label="Version" value={Constants.expoConfig?.version ?? '—'} />
        <Row
          icon="scan-outline"
          label="Text recognition"
          value={isOcrAvailable() ? 'Google ML Kit v2 · on-device' : isExpoGo ? 'Unavailable in Expo Go — use the development build' : 'Unavailable in this build'}
        />
        <Row icon="shield-checkmark-outline" label="Privacy" value="Card photos are read on your phone. Nothing is uploaded unless cloud backup is on." last />
      </Section>

      <Section title="Permissions">
        <Row icon="camera-outline" label="Camera" value="To photograph business cards" />
        <Row icon="images-outline" label="Photos" value="To import card images from your gallery" />
        <Row icon="person-add-outline" label="Contacts" value="To save a card to your phone's Contacts app" last />
      </Section>

      <View style={styles.dangerZone}>
        <CustomButton title="Sign Out" icon="log-out-outline" variant="outline" onPress={onSignOut} loading={busy === 'signout'} disabled={!!busy} />
        <CustomButton title="Delete Account" icon="trash-outline" variant="danger" onPress={onDeleteAccount} loading={busy === 'delete'} disabled={!!busy} />
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ icon, label, value, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Ionicons name={icon} size={20} color={colors.accent} style={styles.rowIcon} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  appHeading: { marginBottom: spacing.lg },
  appTitle: { fontFamily: 'Manrope_700Bold', fontSize: 27, lineHeight: 34, letterSpacing: -1.2, color: colors.text },
  subtitle: { fontFamily: 'Manrope_400Regular', fontSize: 11, color: colors.textMuted, marginTop: 4 },
  section: { marginBottom: spacing.xl },
  sectionTitle: { ...typography.label, textTransform: 'uppercase', marginBottom: spacing.sm, marginLeft: spacing.xs },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.md, ...shadow },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIcon: { marginRight: spacing.md },
  rowLabel: { fontSize: 15, color: colors.text, fontWeight: '500' },
  rowValue: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  dangerZone: { gap: spacing.sm },
});

import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { isSuperAdmin } from '@/services/superAdminService';
import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing } from '@/constants/theme';
import { SIDEBAR_WIDTH } from '@/hooks/useWebLayout';
import { useAuth } from '@/auth/AuthProvider';
import { useContactsVersion } from '@/services/dataEvents';
import { getCachedOrganization, type MyOrganization } from '@/services/orgService';
import { fullNameOf } from '@/auth/userName';

type IconName = keyof typeof Ionicons.glyphMap;

const ITEMS: Record<string, { label: string; icon: IconName; active: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', active: 'home' },
  contacts: { label: 'Contacts', icon: 'people-outline', active: 'people' },
  planner: { label: 'Planner', icon: 'calendar-outline', active: 'calendar' },
  categories: { label: 'Categories', icon: 'pricetags-outline', active: 'pricetags' },
};

/**
 * Desktop website navigation: a left sidebar replacing the phone's bottom tab
 * bar. Same destinations; "Scan a card" is a prominent button at the top
 * (it opens the scan flow, like the centre Scan button on the phone).
 */
export default function WebSidebar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const { session, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const go2 = (path: '/settings' | '/company') => {
    setMenuOpen(false);
    router.push(path);
  };

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'Your contacts stay saved in your account. Sign in again any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut(); // the route guard then shows the sign-in page
          } catch (e) {
            setSigningOut(false);
            Alert.alert('Sign out failed', e instanceof Error ? e.message : 'Please try again.');
          }
        },
      },
    ]);
  const version = useContactsVersion();
  const [org, setOrg] = useState<MyOrganization | null>(null);
  const [superAdmin, setSuperAdmin] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getCachedOrganization().then(setOrg).catch(() => setOrg(null));
      isSuperAdmin().then(setSuperAdmin);
    }, [version]),
  );

  const name = fullNameOf(session);
  const displayName = name ?? session?.user.email ?? '';
  const initial = (name ?? session?.user.email ?? '?').slice(0, 1).toUpperCase();
  const roleText = org ? (org.role === 'admin' ? 'Admin' : 'Member') : 'Personal account';
  const subline = name ? `${roleText} · ${session?.user.email ?? ''}` : roleText;

  // Same contract as the built-in tab bar: emit tabPress, then switch unless prevented.
  const go = (routeKey: string, focused: boolean) => {
    const event = emitter.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigateToTab(routeKey);
  };

  return (
    <View style={styles.bar} accessibilityRole="navigation">
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Ionicons name="wallet" size={18} color={colors.textOnPrimary} />
        </View>
        <Text style={styles.brandText}>
          pockit<Text style={{ color: colors.accent }}>.</Text>
        </Text>
      </View>

      <Pressable
        onPress={() => router.push('/scan')}
        style={({ pressed, hovered }) => [styles.scan, (pressed || hovered) && { opacity: 0.9 }]}
        accessibilityRole="button"
      >
        <Ionicons name="scan" size={18} color={colors.textOnPrimary} />
        <Text style={styles.scanText}>Scan a card</Text>
      </Pressable>

      <View style={styles.items}>
        {state.routes.map((route, index) => {
          const item = ITEMS[route.name];
          if (!item) return null; // the "new" (scan) placeholder tab
          const focused = state.index === index;
          return (
            <Pressable
              key={route.key}
              onPress={() => go(route.key, focused)}
              style={({ hovered }) => [styles.item, focused && styles.itemOn, !focused && hovered && styles.itemHover]}
              accessibilityRole="link"
              accessibilityState={{ selected: focused }}
            >
              <Ionicons name={focused ? item.active : item.icon} size={19} color={focused ? colors.textOnPrimary : colors.textMuted} />
              <Text style={[styles.itemText, focused && { color: colors.textOnPrimary }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.bottom}>
        {superAdmin && (
          <Pressable onPress={() => router.push('/admin' as Href)} style={({ hovered }) => [styles.item, hovered && styles.itemHover]} accessibilityRole="link">
            <Ionicons name="shield-checkmark-outline" size={19} color={colors.accent} />
            <Text style={[styles.itemText, { color: colors.accent }]}>Super Admin</Text>
          </Pressable>
        )}
        <Pressable onPress={() => router.push('/company')} style={({ hovered }) => [styles.item, hovered && styles.itemHover]} accessibilityRole="link">
          <Ionicons name="business-outline" size={19} color={colors.textMuted} />
          <Text style={styles.itemText} numberOfLines={1}>{org ? org.name : 'Company'}</Text>
        </Pressable>
        {/* Account: click to open the menu with Settings and Sign out */}
        <Pressable
          onPress={() => setMenuOpen((v) => !v)}
          style={({ hovered }) => [styles.user, (hovered || menuOpen) && styles.userHover]}
          accessibilityRole="button"
          accessibilityLabel="Account menu"
          accessibilityState={{ expanded: menuOpen }}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.userEmail} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.userRole} numberOfLines={1}>{subline}</Text>
          </View>
          <Ionicons name={menuOpen ? 'chevron-down' : 'chevron-up'} size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu" />
        <View style={styles.menu}>
          <View style={styles.menuHeader}>
            <Text style={styles.menuName} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.menuEmail} numberOfLines={1}>{session?.user.email ?? ''}</Text>
          </View>
          <MenuItem icon="settings-outline" label="Settings" onPress={() => go2('/settings')} />
          <MenuItem icon="business-outline" label={org ? org.name : 'Company'} onPress={() => go2('/company')} />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="log-out-outline"
            label={signingOut ? 'Signing out…' : 'Sign out'}
            danger
            onPress={() => {
              setMenuOpen(false);
              confirmSignOut();
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

function MenuItem({ icon, label, danger, onPress }: { icon: IconName; label: string; danger?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }) => [styles.menuItem, hovered && { backgroundColor: danger ? colors.dangerSoft : colors.surfaceMuted }]}
      accessibilityRole="menuitem"
    >
      <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.textMuted} />
      <Text style={[styles.menuText, danger && { color: colors.danger }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: SIDEBAR_WIDTH,
    height: '100%',
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xl,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.sm, marginBottom: spacing.xl },
  logo: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 22, letterSpacing: -1, color: colors.text },
  scan: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 46,
    marginBottom: spacing.lg,
  },
  scanText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: colors.textOnPrimary },
  items: { gap: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  itemOn: { backgroundColor: colors.primary },
  itemHover: { backgroundColor: colors.surfaceMuted },
  userHover: { backgroundColor: colors.surfaceMuted },
  menu: {
    position: 'absolute',
    left: spacing.md,
    bottom: 84,
    width: SIDEBAR_WIDTH - spacing.md * 2 + 24,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  menuHeader: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: 4 },
  menuName: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: colors.text },
  menuEmail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 42, paddingHorizontal: spacing.md, marginHorizontal: 6, borderRadius: radius.sm },
  menuText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: colors.text, flexShrink: 1 },
  menuDivider: { height: 1, backgroundColor: colors.border, marginVertical: 6, marginHorizontal: spacing.md },
  itemText: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: colors.text, flexShrink: 1 },
  bottom: { marginTop: 'auto', gap: 4 },
  user: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: colors.text },
  userEmail: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: colors.text },
  userRole: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
});

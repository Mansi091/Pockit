import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, Tabs, usePathname, type Href } from 'expo-router';
import { isSuperAdmin } from '@/services/superAdminService';
import { getCachedOrganization, refreshMyOrganization } from '@/services/orgService';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '@/constants/theme';
import { useContactsVersion } from '@/services/dataEvents';
import { refreshNotifications } from '@/services/activityService';
import { initNotifications, onNotificationTap } from '@/services/notificationService';
import WebSidebar from '@/web/components/WebSidebar';
import { CONTENT_MAX, SIDEBAR_WIDTH, useWebLayout } from '@/web/hooks/useWebLayout';

// Home stays the starting tab for everyone, even though "admin" is declared first
// (so it sits at the top of the Super Admin's sidebar).
export const unstable_settings = { initialRouteName: 'index' };

type IconName = keyof typeof Ionicons.glyphMap;
const icon =
  (active: IconName, inactive: IconName) =>
  ({ focused, size }: { focused: boolean; size: number }) => (
    <Ionicons name={focused ? active : inactive} size={size} color={focused ? colors.primary : colors.textSubtle} />
  );

/**
 * Bottom navigation: Home · Contacts · (Scan) · Planner · Categories.
 * Website: role dashboards sit first in the sidebar and open right after sign-in:
 *   Pockit owner → "Dashboard" (Super Admin), company admin / CEO → "Team".
 * Members and personal users never see them (phones reach them from Settings /
 * the Company page).
 * Settings opens from the gear on Home. Each area has its own screen —
 * Planner splits into Follow-ups / Calendar / Events tabs at the top.
 */
export default function TabLayout() {
  const version = useContactsVersion();
  // Desktop website: left sidebar + centred content; phones keep the bottom bar.
  const { isWide, width, gutter } = useWebLayout();
  const sidePad = gutter(width - SIDEBAR_WIDTH, CONTENT_MAX);
  const pathname = usePathname();
  const [roles, setRoles] = useState<{ superAdmin: boolean; companyAdmin: boolean } | null>(null);
  const superAdmin = !!roles?.superAdmin;
  const companyAdmin = !!roles?.companyAdmin;

  // Who is signed in: Pockit owner? company admin (CEO)? Asked from the cloud on
  // sign-in; the company role is re-read from the local cache when it changes
  // (creating / joining / leaving a company emits a data change).
  useEffect(() => {
    let live = true;
    Promise.all([
      isSuperAdmin(),
      refreshMyOrganization().catch(() => getCachedOrganization()),
    ]).then(([sa, org]) => live && setRoles({ superAdmin: sa, companyAdmin: org?.role === 'admin' }));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!roles) return;
    getCachedOrganization().then((org) => setRoles((r) => (r ? { ...r, companyAdmin: org?.role === 'admin' } : r)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // Website: open the person's dashboard once per sign-in (first landing on Home),
  // not every time Home is opened afterwards. Tabs remount on each sign-in.
  //   Pockit owner → Super Admin dashboard;  company admin (CEO) → Team dashboard.
  const openedDashboard = useRef(false);
  useEffect(() => {
    if (!roles || !isWide || openedDashboard.current) return;
    openedDashboard.current = true;
    if (pathname !== '/') return;
    if (roles.superAdmin) router.replace('/admin' as Href);
    else if (roles.companyAdmin) router.replace('/team' as Href);
  }, [roles, isWide, pathname]);

  // Follow-up notifications: set up once, open the contact when one is tapped…
  useEffect(() => {
    initNotifications().catch(() => {});
    return onNotificationTap((contactId) =>
      router.push({ pathname: '/contact/[id]', params: { id: contactId, tab: 'followups' } }),
    );
  }, []);

  // …and re-schedule whenever data changes (local edits or a cloud sync).
  useEffect(() => {
    const t = setTimeout(() => refreshNotifications(), 800);
    return () => clearTimeout(t);
  }, [version]);

  return (
    <Tabs
      tabBar={isWide ? (props) => <WebSidebar {...props} /> : undefined}
      screenOptions={{
        tabBarPosition: isWide ? 'left' : 'bottom',
            tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
            tabBarStyle: {
              backgroundColor: colors.surface,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              elevation: 0,
              shadowOpacity: 0,
              paddingTop: 6,
            },
            tabBarLabelStyle: { fontFamily: 'Manrope_600SemiBold', fontSize: 9, fontWeight: '600' },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 22 },
        headerTitleAlign: 'left',
        sceneStyle: { backgroundColor: colors.background, paddingHorizontal: sidePad },
        headerStyle: isWide
          ? { backgroundColor: colors.background, paddingHorizontal: sidePad }
          : { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="admin"
        options={{
          title: isWide ? 'Dashboard' : 'Super Admin',
          headerShown: !isWide, // phone: titled screen opened from Settings
          // Only the Pockit owner on the website gets the tab; the screen itself
          // still checks with the database before showing anything.
          href: superAdmin && isWide ? undefined : null,
          tabBarIcon: icon('shield-checkmark', 'shield-checkmark-outline'),
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: isWide ? 'Team' : 'Team dashboard',
          headerShown: !isWide, // phone: titled screen opened from the Company page
          // Company admins (CEO) on the website; the screen re-checks the role itself.
          href: companyAdmin && isWide ? undefined : null,
          tabBarIcon: icon('briefcase', 'briefcase-outline'),
        }}
      />
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false, tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="contacts" options={{ title: 'Contacts', tabBarIcon: icon('people', 'people-outline') }} />
      <Tabs.Screen
        name="new"
        options={{
          title: 'Scan',
          tabBarLabel: () => null,
          tabBarAccessibilityLabel: 'Scan a new card',
          tabBarIcon: () => (
            <View style={styles.scanButton}>
              <Ionicons name="scan" size={24} color={colors.textOnPrimary} />
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault(); // it's an action, not a tab
            router.push('/scan');
          },
        }}
      />
      <Tabs.Screen name="planner" options={{ title: 'Planner', tabBarIcon: icon('calendar', 'calendar-outline') }} />
      <Tabs.Screen name="categories" options={{ title: 'Categories', tabBarIcon: icon('pricetags', 'pricetags-outline') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scanButton: {
    width: 44,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -3,
    shadowColor: '#293120',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
});

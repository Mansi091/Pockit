import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '@/constants/theme';
import { useContactsVersion } from '@/services/dataEvents';
import { refreshNotifications } from '@/services/activityService';
import { initNotifications, onNotificationTap } from '@/services/notificationService';

type IconName = keyof typeof Ionicons.glyphMap;
const icon =
  (active: IconName, inactive: IconName) =>
  ({ focused, size }: { focused: boolean; size: number }) => (
    <Ionicons name={focused ? active : inactive} size={size} color={focused ? colors.primary : colors.textSubtle} />
  );

/**
 * Bottom navigation: Home · Contacts · (Scan) · Planner · Categories.
 * Settings opens from the gear on Home. Each area has its own screen —
 * Planner splits into Follow-ups / Calendar / Events tabs at the top.
 */
export default function TabLayout() {
  const version = useContactsVersion();

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
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        // No fixed height: React Navigation adds the bottom safe-area inset itself, so the bar
        // sits above Android's 3-button / gesture navigation instead of underneath it.
        tabBarStyle: { backgroundColor: colors.surface, borderTopWidth: 0, elevation: 12 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 22 },
        headerTitleAlign: 'left',
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
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
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});

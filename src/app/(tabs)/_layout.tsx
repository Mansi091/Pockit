import { StyleSheet, View } from 'react-native';
import { router, Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const icon =
  (active: IconName, inactive: IconName) =>
  ({ focused, size }: { focused: boolean; size: number }) => (
    <Ionicons name={focused ? active : inactive} size={size} color={focused ? colors.primary : colors.textSubtle} />
  );

/** Bottom navigation: Home · Contacts · (Scan) · Categories · Settings. */
export default function TabLayout() {
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
      <Tabs.Screen name="categories" options={{ title: 'Categories', tabBarIcon: icon('pricetags', 'pricetags-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings', 'settings-outline') }} />
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

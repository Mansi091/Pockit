import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { colors, spacing } from '@/constants/theme';
import { isSupabaseConfigured } from '@/config/env';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';

/**
 * Root navigator with route protection (Expo Router `Stack.Protected`):
 *  - signed out              → only the (auth) screens exist
 *  - signed in               → tabs + scan flow + contact screens
 *  - verifying a reset code  → only the "set new password" screen
 * Guards are UI-only; real data protection is Supabase Row Level Security.
 */
export default function RootLayout() {
  if (!isSupabaseConfigured) return <ConfigMissing />;
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, ready, mustSetPassword } = useAuth();
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  if (!ready || !fontsLoaded) {
    return (
      <View style={styles.center}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const signedIn = !!session;
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Protected guard={signedIn && !mustSetPassword}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="scan" options={{ title: 'Scan Business Card' }} />
          <Stack.Screen name="processing" options={{ title: 'Processing', headerBackVisible: false, gestureEnabled: false }} />
          <Stack.Screen name="review-contact" options={{ title: 'Review Contact' }} />
          <Stack.Screen name="contact/[id]" options={{ title: 'Contact Profile' }} />
          <Stack.Screen name="event/[id]" options={{ title: 'Event' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack.Protected>

        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && mustSetPassword}>
          <Stack.Screen name="new-password" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** Shown instead of crashing when .env hasn't been filled in yet. */
function ConfigMissing() {
  return (
    <View style={[styles.center, { padding: spacing.xl }]}>
      <StatusBar style="dark" />
      <Ionicons name="construct-outline" size={40} color={colors.primary} />
      <Text style={styles.title}>Setup needed</Text>
      <Text style={styles.body}>
        Add your Supabase Project URL and anon key to the .env file in the project folder, then restart with
        {'\n'}npx expo start --clear
      </Text>
      <Text style={styles.caption}>See docs/SETUP.md, step 1.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  body: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 22 },
  caption: { fontSize: 13, color: colors.textMuted, marginTop: spacing.lg },
});

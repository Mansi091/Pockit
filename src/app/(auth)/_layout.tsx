import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

/** Signed-out screens. `sign-in` is first, so it's where the guard lands users. */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="verify-email" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { useAuth } from '@/auth/AuthProvider';
import { GoogleSignInCancelled, isGoogleSignInAvailable } from '@/auth/googleAuth';
import AuthLayout from '@/components/AuthLayout';
import InputField from '@/components/InputField';
import CustomButton from '@/components/CustomButton';
import FormError from '@/components/FormError';
import TextLink from '@/components/TextLink';
import { validateAccountEmail } from '@/utils/validation';

export default function SignInScreen() {
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const emailError = submitted ? validateAccountEmail(email) : null;
  const passwordError = submitted && !password ? 'Password is required.' : null;

  const onSubmit = async () => {
    setSubmitted(true);
    setError(null);
    if (validateAccountEmail(email) || !password) return;
    setBusy('email');
    try {
      await signIn(email, password);
      // The route guard switches to the app automatically once the session exists.
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sign in failed.';
      if (/verify your email/i.test(msg)) {
        router.push({ pathname: '/verify-email', params: { email: email.trim(), resend: '1' } });
      } else {
        setError(msg);
      }
    } finally {
      setBusy(null);
    }
  };

  const onGoogle = async () => {
    setError(null);
    setBusy('google');
    try {
      await signInWithGoogle();
    } catch (e) {
      if (!(e instanceof GoogleSignInCancelled)) setError(e instanceof Error ? e.message : 'Google sign-in failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to access your business cards."
      footer={
        <View style={styles.row}>
          <Text style={styles.muted}>New here? </Text>
          <TextLink label="Create an account" onPress={() => router.push('/sign-up')} />
        </View>
      }
    >
      <FormError message={error} />
      <InputField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        autoCorrect={false}
      />
      <InputField
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={onSubmit}
        returnKeyType="go"
      />
      <View style={styles.linksRow}>
        <TextLink label={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((v) => !v)} />
        <TextLink
          label="Forgot password?"
          onPress={() => router.push({ pathname: '/forgot-password', params: { email: email.trim() } })}
        />
      </View>

      <CustomButton title="Sign In" onPress={onSubmit} loading={busy === 'email'} disabled={!!busy} />
      <View style={styles.codeLink}>
        <TextLink
          label="Sign in with an email code instead"
          onPress={() => router.push({ pathname: '/sign-in-code', params: { email: email.trim() } })}
        />
      </View>

      {isGoogleSignInAvailable() && (
        <>
          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.muted}>or</Text>
            <View style={styles.line} />
          </View>
          <CustomButton
            title="Continue with Google"
            icon="logo-google"
            variant="outline"
            onPress={onGoogle}
            loading={busy === 'google'}
            disabled={!!busy}
          />
        </>
      )}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  muted: { color: colors.textMuted, fontSize: 14 },
  codeLink: { alignItems: 'center', marginTop: spacing.md },
  linksRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -spacing.sm, marginBottom: spacing.lg },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.lg },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});

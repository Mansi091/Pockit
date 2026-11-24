import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/auth/AuthProvider';
import AuthLayout from '@/components/AuthLayout';
import InputField from '@/components/InputField';
import CustomButton from '@/components/CustomButton';
import FormError from '@/components/FormError';
import TextLink from '@/components/TextLink';
import { validateAccountEmail, validateNewPassword } from '@/utils/validation';
import { MAX_NAME_LENGTH, validateAccountName } from '@/auth/userName';

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = {
    name: validateAccountName(name),
    email: validateAccountEmail(email),
    password: validateNewPassword(password),
    confirm: confirm !== password ? 'Passwords do not match.' : null,
  };

  const onSubmit = async () => {
    setSubmitted(true);
    setError(null);
    if (errors.name || errors.email || errors.password || errors.confirm) return;
    setBusy(true);
    try {
      const { needsVerification } = await signUp(email, password, name);
      if (needsVerification) {
        router.replace({ pathname: '/verify-email', params: { email: email.trim() } });
      }
      // If email confirmation is disabled in Supabase, a session exists and the guard opens the app.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Your contacts stay on your phone. You can turn on cloud backup later in Settings."
      footer={
        <View style={styles.row}>
          <Text style={styles.muted}>Already have an account? </Text>
          <TextLink label="Sign in" onPress={() => router.back()} />
        </View>
      }
    >
      <FormError message={error} />
      <InputField
        label="Your name"
        value={name}
        onChangeText={setName}
        error={submitted ? errors.name : null}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        maxLength={MAX_NAME_LENGTH}
        placeholder="Your full name"
      />
      <InputField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={submitted ? errors.email : null}
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
        error={submitted ? errors.password : null}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <InputField
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        error={submitted ? errors.confirm : null}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={onSubmit}
      />
      <Text style={styles.hint}>At least 8 characters, with a letter and a number.</Text>
      <CustomButton title="Create Account" onPress={onSubmit} loading={busy} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  muted: { color: colors.textMuted, fontSize: 14 },
  hint: { ...typography.caption, marginTop: -spacing.sm, marginBottom: spacing.lg },
});

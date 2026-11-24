import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/auth/AuthProvider';
import AuthLayout from '@/components/AuthLayout';
import InputField from '@/components/InputField';
import CustomButton from '@/components/CustomButton';
import FormError from '@/components/FormError';
import TextLink from '@/components/TextLink';
import CodeInput, { isValidCode } from '@/components/CodeInput';
import { useCooldown } from '@/hooks/useCooldown';
import { validateAccountEmail } from '@/utils/validation';

/**
 * Passwordless sign-in: 1) enter your email → 2) type the 6-digit code we email you.
 * Only works for emails that already have a Pockit account. A correct code
 * creates a session and the route guard opens the app.
 */
export default function SignInWithCodeScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { sendLoginCode, verifyLoginCode } = useAuth();
  const [email, setEmail] = useState(params.email ?? '');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const cooldown = useCooldown(0);

  const send = async () => {
    setError(null);
    setInfo(null);
    const problem = validateAccountEmail(email);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await sendLoginCode(email);
      setSentTo(email.trim());
      setCode('');
      cooldown.start(60);
      setInfo(`We emailed a sign-in code to ${email.trim()}. It can take a minute — check spam too.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    if (!isValidCode(code)) return setError('Enter the code from the email.');
    setBusy(true);
    try {
      await verifyLoginCode(sentTo!, code);
      // Signed in — the root layout's guard switches to the app.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={sentTo ? 'Check your email' : 'Sign in with a code'}
      subtitle={
        sentTo
          ? `Enter the code we sent to ${sentTo}.`
          : 'No password needed — we email you a one-time code.'
      }
      footer={<TextLink label="Back to sign in with password" onPress={() => router.back()} />}
    >
      <FormError message={error} />
      <FormError tone="info" message={info} />

      {!sentTo ? (
        <>
          <InputField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            autoCorrect={false}
            onSubmitEditing={send}
          />
          <CustomButton title="Email me a code" icon="mail-outline" onPress={send} loading={busy} />
        </>
      ) : (
        <>
          <CodeInput value={code} onChange={setCode} onSubmit={verify} />
          <CustomButton title="Sign In" onPress={verify} loading={busy} />
          <View style={styles.row}>
            <TextLink
              label={cooldown.remaining > 0 ? `Resend code in ${cooldown.remaining}s` : 'Resend code'}
              onPress={() => cooldown.remaining <= 0 && send()}
            />
            <TextLink
              label="Use a different email"
              onPress={() => {
                setSentTo(null);
                setInfo(null);
                setError(null);
              }}
            />
          </View>
          <Text style={styles.hint}>Codes expire after a while. If yours stopped working, ask for a new one.</Text>
        </>
      )}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.md, textAlign: 'center' },
});

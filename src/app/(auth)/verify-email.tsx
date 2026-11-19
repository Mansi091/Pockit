import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { spacing, typography } from '@/constants/theme';
import { useAuth } from '@/auth/AuthProvider';
import AuthLayout from '@/components/AuthLayout';
import CustomButton from '@/components/CustomButton';
import FormError from '@/components/FormError';
import TextLink from '@/components/TextLink';
import CodeInput, { isValidCode } from '@/components/CodeInput';
import { useCooldown } from '@/hooks/useCooldown';

/** Step 2 of sign-up: enter the code emailed by Supabase. Success creates a session → app opens. */
export default function VerifyEmailScreen() {
  const { email = '', resend } = useLocalSearchParams<{ email?: string; resend?: string }>();
  const { verifySignUpCode, resendSignUpCode } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const cooldown = useCooldown(resend ? 0 : 60);

  const onResend = async () => {
    setError(null);
    try {
      await resendSignUpCode(email);
      setInfo(`A new code was sent to ${email}.`);
      cooldown.start(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resend the code.');
    }
  };

  // Arrived from sign-in with an unverified account → send a fresh code right away.
  useEffect(() => {
    if (resend && email) onResend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onVerify = async () => {
    setError(null);
    if (!isValidCode(code)) {
      setError('Enter the code from the email.');
      return;
    }
    setBusy(true);
    try {
      await verifySignUpCode(email, code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={`We sent a verification code to ${email || 'your email'}. It can take a minute to arrive — check spam too.`}
      footer={<TextLink label="Back to sign in" onPress={() => router.dismissTo('/sign-in')} />}
    >
      <FormError message={error} />
      <FormError message={info} tone="info" />
      <CodeInput value={code} onChange={setCode} onSubmit={onVerify} />
      <CustomButton title="Verify" onPress={onVerify} loading={busy} />
      <View style={styles.resend}>
        <TextLink
          label={cooldown.remaining > 0 ? `Resend code in ${cooldown.remaining}s` : 'Resend code'}
          onPress={onResend}
          disabled={cooldown.remaining > 0 || !email}
        />
      </View>

      {/* Fallback for projects still using Supabase's default (link-based) email template. */}
      <Text style={styles.linkHint}>
        Got a link instead of a code? Tap the link in the email to confirm your account, then come back here.
      </Text>
      <CustomButton title="I've confirmed — Sign in" variant="outline" onPress={() => router.dismissTo('/sign-in')} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  resend: { alignItems: 'center', marginTop: spacing.lg },
  linkHint: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl, marginBottom: spacing.sm, lineHeight: 18 },
});

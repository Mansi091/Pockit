import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { spacing } from '@/constants/theme';
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
 * Password reset in two steps:
 *  1. email → Supabase emails a recovery code
 *  2. code  → verified; user is temporarily signed in and the router forces
 *             the "set new password" screen (see app/_layout.tsx guards).
 */
export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { sendPasswordReset, verifyRecoveryCode } = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cooldown = useCooldown();

  const onSend = async () => {
    setError(null);
    const emailError = validateAccountEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setStep('code');
      cooldown.start(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the reset code.');
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    setError(null);
    if (!isValidCode(code)) {
      setError('Enter the code from the email.');
      return;
    }
    setBusy(true);
    try {
      await verifyRecoveryCode(email, code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed.');
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Reset password"
      subtitle={
        step === 'email'
          ? "Enter your account email and we'll send you a reset code."
          : `If an account exists for ${email}, a reset code is on its way.`
      }
      footer={<TextLink label="Back to sign in" onPress={() => router.back()} />}
    >
      <FormError message={error} />
      {step === 'email' ? (
        <>
          <InputField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            onSubmitEditing={onSend}
          />
          <CustomButton title="Send Reset Code" onPress={onSend} loading={busy} />
        </>
      ) : (
        <>
          <CodeInput value={code} onChange={setCode} onSubmit={onVerify} />
          <CustomButton title="Continue" onPress={onVerify} loading={busy} />
          <View style={styles.resend}>
            <TextLink
              label={cooldown.remaining > 0 ? `Resend code in ${cooldown.remaining}s` : 'Resend code'}
              onPress={onSend}
              disabled={cooldown.remaining > 0}
            />
            <TextLink label="Use a different email" onPress={() => setStep('email')} />
          </View>
        </>
      )}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  resend: { alignItems: 'center', marginTop: spacing.lg, gap: spacing.sm },
});

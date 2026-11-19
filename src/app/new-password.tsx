import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { spacing, typography } from '@/constants/theme';
import { useAuth } from '@/auth/AuthProvider';
import AuthLayout from '@/components/AuthLayout';
import InputField from '@/components/InputField';
import CustomButton from '@/components/CustomButton';
import FormError from '@/components/FormError';
import TextLink from '@/components/TextLink';
import { validateNewPassword } from '@/utils/validation';

/** Final step of password recovery. Only reachable while `mustSetPassword` is true. */
export default function NewPasswordScreen() {
  const { setNewPassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pwError = validateNewPassword(password);
  const confirmError = confirm !== password ? 'Passwords do not match.' : null;

  const onSave = async () => {
    setSubmitted(true);
    setError(null);
    if (pwError || confirmError) return;
    setBusy(true);
    try {
      await setNewPassword(password); // guard then opens the app
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update password.');
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Your code was verified. Set a new password to finish."
      footer={<TextLink label="Cancel and sign out" onPress={() => signOut().catch(() => undefined)} />}
    >
      <FormError message={error} />
      <InputField
        label="New password"
        value={password}
        onChangeText={setPassword}
        error={submitted ? pwError : null}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <InputField
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        error={submitted ? confirmError : null}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={onSave}
      />
      <Text style={styles.hint}>At least 8 characters, with a letter and a number.</Text>
      <CustomButton title="Save Password" onPress={onSave} loading={busy} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  hint: { ...typography.caption, marginTop: -spacing.sm, marginBottom: spacing.lg },
});

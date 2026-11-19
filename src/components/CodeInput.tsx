import InputField from '@/components/InputField';

/** One-time-code field (Supabase sends 6 digits by default; projects can configure up to 10). */
export default function CodeInput({
  value,
  onChange,
  error,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  onSubmit?: () => void;
}) {
  return (
    <InputField
      label="Verification code"
      value={value}
      onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 10))}
      error={error}
      keyboardType="number-pad"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      placeholder="123456"
      maxLength={10}
      onSubmitEditing={onSubmit}
      style={{ fontSize: 22, letterSpacing: 6, textAlign: 'center' }}
    />
  );
}

export const isValidCode = (c: string) => /^\d{6,10}$/.test(c);

import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';

interface Props extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string | null;
  /** Soft hint shown when there's no error, e.g. "Please check — auto-detected". */
  warning?: string | null;
  required?: boolean;
}

/** Filled input that highlights on focus. */
export default function InputField({
  label,
  value,
  onChangeText,
  error,
  warning,
  required,
  style,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textSubtle}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          rest.multiline && styles.multiline,
          !error && !!warning && styles.inputWarning,
          focused && styles.inputFocused,
          !!error && styles.inputError,
          style,
        ]}
        {...rest}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!error && !!warning && <Text style={styles.warning}>{warning}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { ...typography.label, marginBottom: 6 },
  required: { color: colors.danger },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
  },
  inputFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger, backgroundColor: colors.surface },
  inputWarning: { borderColor: '#FCD34D', backgroundColor: colors.warningSoft },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.xs },
  warning: { color: colors.warning, fontSize: 12, marginTop: spacing.xs },
});

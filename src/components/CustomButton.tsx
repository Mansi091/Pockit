import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.textOnPrimary, border: colors.primary },
  secondary: { bg: colors.primarySoft, fg: colors.primaryDark, border: colors.primarySoft },
  outline: { bg: colors.surface, fg: colors.text, border: colors.border },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
};

export default function CustomButton({ title, onPress, variant = 'primary', icon, loading, disabled, style }: Props) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: p.bg, borderColor: p.border, opacity: inactive ? 0.5 : 1 },
        pressed && !inactive && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon && <Ionicons name={icon} size={18} color={p.fg} style={styles.icon} />}
          <Text style={[styles.text, { color: p.fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: spacing.sm },
  text: { fontSize: 15, fontWeight: '600' },
});

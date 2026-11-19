import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '@/constants/theme';

export default function TextLink({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} accessibilityRole="link">
      {({ pressed }) => (
        <Text style={[styles.text, (pressed || disabled) && { opacity: 0.5 }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.accent, fontWeight: '600', fontSize: 14, paddingVertical: 4 },
});

import { StyleSheet, Text, View } from 'react-native';
import { avatarColors } from '@/constants/theme';

/** Initials in a soft, name-coloured circle. */
export default function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const { bg, fg } = avatarColors(name || '?');
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || '?';
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg, fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '700' },
});

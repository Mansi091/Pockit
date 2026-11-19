import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing } from '@/constants/theme';

interface Props {
  uri: string | null | undefined;
  height?: number;
  emptyText?: string;
}

/**
 * Shows a card image, or a placeholder when there is no image or the file
 * can no longer be loaded (e.g. deleted from storage).
 */
export default function ImagePreview({ uri, height = 200, emptyText = 'No card image' }: Props) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const broken = !!uri && failedUri === uri;

  if (!uri || broken) {
    return (
      <View style={[styles.box, styles.placeholder, { height }]}>
        <Ionicons name={broken ? 'alert-circle-outline' : 'image-outline'} size={32} color={colors.textMuted} />
        <Text style={styles.placeholderText}>{broken ? 'Card image is missing or unreadable' : emptyText}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.box, { height }]}
      resizeMode="contain"
      onError={() => setFailedUri(uri)}
      accessibilityLabel="Business card image"
    />
  );
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    borderRadius: radius.lg,
    backgroundColor: '#EEF2F6',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  placeholderText: { color: colors.textMuted, marginTop: spacing.sm, fontSize: 13 },
});

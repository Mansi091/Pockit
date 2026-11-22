import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing } from '@/constants/theme';
import Avatar from '@/components/Avatar';
import type { Contact } from '@/types/contact';
import { displayName } from '@/services/contactService';

interface Props {
  contact: Contact;
  onPress: () => void;
  onLongPress?: () => void;
  /** Hide the bottom divider (last row in a group). */
  last?: boolean;
}

/** A contact row: avatar, "Name – Company", designation. Meant to sit inside a white group card. */
export default function ContactCard({ contact, onPress, onLongPress, last }: Props) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={displayName(contact)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      <Avatar name={contact.personName} />
      <View style={[styles.body, !last && styles.divider]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {contact.personName}
            {!!contact.companyName && <Text style={styles.company}> · {contact.companyName}</Text>}
          </Text>
          {!!contact.designation && (
            <Text style={styles.sub} numberOfLines={1}>
              {contact.designation}
            </Text>
          )}
        </View>
        {!!contact.cardImagePath && <Ionicons name="card-outline" size={16} color={colors.textSubtle} />}
        <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.md,
    paddingVertical: 14,
    paddingRight: spacing.lg,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  company: { fontWeight: '400', color: colors.textMuted },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
});

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import EmptyState from '@/components/EmptyState';
import NoteEditorSheet from '@/components/NoteEditorSheet';
import { relativeDay } from '@/utils/dates';
import type { Interaction } from '@/types/contact';

/** Contact → Notes: where/when you met and what you discussed, newest first. */
export default function ContactNotesTab({ contactId, notes }: { contactId: string; notes: Interaction[] }) {
  const [editing, setEditing] = useState<Interaction | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <View style={styles.wrap}>
      <CustomButton title="Add a note" icon="add" variant="secondary" onPress={() => setAdding(true)} />

      {notes.length === 0 ? (
        <View style={{ marginTop: spacing.lg }}>
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="No notes yet"
            message="Write down where you met and what you talked about, so you remember next time."
          />
        </View>
      ) : (
        <View style={styles.timeline}>
          {notes.map((n, i) => (
            <View key={n.id} style={styles.item}>
              {/* timeline rail */}
              <View style={styles.rail}>
                <View style={styles.dot} />
                {i < notes.length - 1 && <View style={styles.line} />}
              </View>
              <Pressable
                onPress={() => setEditing(n)}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
                accessibilityRole="button"
                accessibilityHint="Edit this note"
              >
                <Text style={styles.when}>{n.occurredOn ? relativeDay(n.occurredOn) : 'No date'}</Text>
                {!!n.place && (
                  <View style={styles.placeRow}>
                    <Ionicons name="location-outline" size={14} color={colors.primary} />
                    <Text style={styles.place}>{n.place}</Text>
                  </View>
                )}
                {!!n.notes && <Text style={styles.text}>{n.notes}</Text>}
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <NoteEditorSheet
        visible={adding || !!editing}
        contactId={contactId}
        note={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg },
  timeline: { marginTop: spacing.lg },
  item: { flexDirection: 'row', gap: spacing.md },
  rail: { width: 14, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary, marginTop: 16, borderWidth: 2, borderColor: colors.primarySoft },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadow },
  when: { ...typography.label, color: colors.text },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  place: { fontSize: 14, color: colors.primaryDark, fontWeight: '600' },
  text: { ...typography.body, marginTop: 6, lineHeight: 21 },
});

import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing } from '@/constants/theme';
import Sheet, { sheetStyles } from '@/components/Sheet';
import CustomButton from '@/components/CustomButton';
import FormError from '@/components/FormError';
import Avatar from '@/components/Avatar';
import ContactPickerSheet from '@/components/ContactPickerSheet';
import { DateTimeField } from '@/components/DateTimeField';
import FollowUpPresets from '@/components/FollowUpPresets';
import { addFollowUp, deleteFollowUp, updateFollowUp, validateFollowUp, type ReminderWithContact } from '@/services/activityService';
import { showPermissionHint } from '@/components/followUpHints';

/**
 * Add or edit a follow-up reminder. With `contact` fixed (contact page) the
 * person is known; from the Planner the user picks one first.
 */
export default function FollowUpEditorSheet({
  visible,
  contact,
  reminder,
  onClose,
}: {
  visible: boolean;
  contact: { id: string; personName: string } | null;
  reminder: ReminderWithContact | null;
  onClose: () => void;
}) {
  const [who, setWho] = useState<{ id: string; personName: string } | null>(contact);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setWho(reminder ? { id: reminder.contactId, personName: reminder.personName } : contact);
    setTitle(reminder?.title ?? '');
    setDue(reminder ? new Date(reminder.dueAt) : null);
    setError(null);
  }, [visible, reminder, contact]);

  const save = async () => {
    if (!who) return setError('Choose who to follow up with.');
    const t = title.trim() || `Follow up with ${who.personName.split(' ')[0]}`;
    const problem = validateFollowUp(t, due);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      if (reminder) await updateFollowUp(reminder, t, due!);
      else showPermissionHint(await addFollowUp(who.id, t, due!));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the follow-up.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert('Delete this follow-up?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteFollowUp(reminder!.id);
          onClose();
        },
      },
    ]);

  return (
    <>
      <Sheet
        visible={visible && !picking}
        title={reminder ? 'Edit follow-up' : 'New follow-up'}
        onClose={onClose}
        footer={
          <>
            {reminder && <CustomButton title="Delete" icon="trash-outline" variant="danger" onPress={remove} style={{ flex: 1 }} />}
            <CustomButton title="Save" icon="checkmark" onPress={save} loading={busy} style={{ flex: 2 }} />
          </>
        }
      >
        <FormError message={error} />

        <Text style={sheetStyles.label}>With</Text>
        <Pressable
          onPress={() => !contact && !reminder && setPicking(true)}
          disabled={!!contact || !!reminder}
          style={styles.who}
          accessibilityRole="button"
          accessibilityLabel={who ? `With ${who.personName}` : 'Choose a contact'}
        >
          {who ? <Avatar name={who.personName} size={32} /> : <Ionicons name="person-add-outline" size={20} color={colors.primary} />}
          <Text style={[styles.whoText, !who && { color: colors.primary }]}>{who?.personName ?? 'Choose a contact'}</Text>
          {!contact && !reminder && <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />}
        </Pressable>

        <TextInput
          value={title}
          onChangeText={(t) => {
            setTitle(t);
            setError(null);
          }}
          placeholder={who ? `Follow up with ${who.personName.split(' ')[0]}` : 'What about? (e.g. send the quotation)'}
          placeholderTextColor={colors.textSubtle}
          maxLength={200}
          style={sheetStyles.input}
          accessibilityLabel="Follow-up title"
        />

        <Text style={sheetStyles.label}>When</Text>
        <FollowUpPresets value={due} onChange={(d) => { setDue(d); setError(null); }} />
        <View style={{ height: spacing.sm }} />
        <DateTimeField label="Or pick a date and time" value={due} onChange={(d) => { setDue(d); setError(null); }} />
      </Sheet>
      <ContactPickerSheet
        visible={visible && picking}
        title="Follow up with…"
        onClose={() => setPicking(false)}
        onPick={([c]) => c && setWho({ id: c.id, personName: c.personName })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    minHeight: 50,
  },
  whoText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
});

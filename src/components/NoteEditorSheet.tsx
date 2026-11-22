import { useEffect, useState } from 'react';
import { Alert, TextInput } from 'react-native';
import { colors } from '@/constants/theme';
import Sheet, { sheetStyles } from '@/components/Sheet';
import CustomButton from '@/components/CustomButton';
import FormError from '@/components/FormError';
import { DateField } from '@/components/DateTimeField';
import { addNote, deleteNote, updateNote, validateNote } from '@/services/activityService';
import { todayKey } from '@/utils/dates';
import type { Interaction } from '@/types/contact';

/** Add or edit a meeting note: when, where, what was discussed. */
export default function NoteEditorSheet({
  visible,
  contactId,
  note,
  onClose,
}: {
  visible: boolean;
  contactId: string;
  /** Editing when set, adding when null. */
  note: Interaction | null;
  onClose: () => void;
}) {
  const [day, setDay] = useState<string | null>(todayKey());
  const [place, setPlace] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDay(note ? note.occurredOn : todayKey());
    setPlace(note?.place ?? '');
    setText(note?.notes ?? '');
    setError(null);
  }, [visible, note]);

  const save = async () => {
    const input = { occurredOn: day, place, notes: text };
    const problem = validateNote(input);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      if (note) await updateNote(note, input);
      else await addNote(contactId, input);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the note.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert('Delete this note?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteNote(note!.id);
          onClose();
        },
      },
    ]);

  return (
    <Sheet
      visible={visible}
      title={note ? 'Edit note' : 'Add a note'}
      onClose={onClose}
      footer={
        <>
          {note && <CustomButton title="Delete" icon="trash-outline" variant="danger" onPress={remove} style={{ flex: 1 }} />}
          <CustomButton title="Save" icon="checkmark" onPress={save} loading={busy} style={{ flex: 2 }} />
        </>
      }
    >
      <FormError message={error} />
      <DateField label="When" value={day} onChange={setDay} clearable />
      <TextInput
        value={place}
        onChangeText={(t) => {
          setPlace(t);
          setError(null);
        }}
        placeholder="Where (e.g. TechSparks expo, Pune)"
        placeholderTextColor={colors.textSubtle}
        maxLength={120}
        style={sheetStyles.input}
        accessibilityLabel="Where you met"
      />
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          setError(null);
        }}
        placeholder="What did you talk about?"
        placeholderTextColor={colors.textSubtle}
        maxLength={5000}
        multiline
        style={[sheetStyles.input, sheetStyles.multiline]}
        accessibilityLabel="Note"
      />
    </Sheet>
  );
}

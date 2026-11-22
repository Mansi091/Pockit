import { useEffect, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { colors } from '@/constants/theme';
import Sheet, { sheetStyles } from '@/components/Sheet';
import CustomButton from '@/components/CustomButton';
import FormError from '@/components/FormError';
import { DateField } from '@/components/DateTimeField';
import { createEvent, deleteEvent, updateEvent, validateEvent } from '@/services/activityService';
import { todayKey } from '@/utils/dates';
import type { ContactEvent } from '@/types/contact';

/** Create or edit an event (expo, conference, meetup): name, place and dates. */
export default function EventEditorSheet({
  visible,
  event,
  onClose,
  onSaved,
  onDeleted,
}: {
  visible: boolean;
  event: ContactEvent | null;
  onClose: () => void;
  onSaved?: (e: ContactEvent) => void;
  onDeleted?: () => void;
}) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [startsOn, setStartsOn] = useState<string | null>(todayKey());
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(event?.name ?? '');
    setLocation(event?.location ?? '');
    setStartsOn(event ? event.startsOn : todayKey());
    setEndsOn(event?.endsOn ?? null);
    setError(null);
  }, [visible, event]);

  const save = async () => {
    const input = { name, location, startsOn, endsOn };
    setBusy(true);
    try {
      const problem = await validateEvent(input, event?.id);
      if (problem) return setError(problem);
      if (event) {
        await updateEvent(event, input);
        onSaved?.({ ...event, name: name.trim(), location: location.trim() || null, startsOn, endsOn });
      } else {
        onSaved?.(await createEvent(input));
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the event.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert(`Delete "${event?.name}"?`, 'The contacts stay in Pockit — they just won\'t be linked to this event any more.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteEvent(event!.id);
          onClose();
          onDeleted?.();
        },
      },
    ]);

  return (
    <Sheet
      visible={visible}
      title={event ? 'Edit event' : 'New event'}
      onClose={onClose}
      footer={
        <>
          {event && <CustomButton title="Delete" icon="trash-outline" variant="danger" onPress={remove} style={{ flex: 1 }} />}
          <CustomButton title={event ? 'Save' : 'Create event'} icon="checkmark" onPress={save} loading={busy} style={{ flex: 2 }} />
        </>
      }
    >
      <FormError message={error} />
      <TextInput
        value={name}
        onChangeText={(t) => {
          setName(t);
          setError(null);
        }}
        placeholder="Event name (e.g. TechSparks 2026)"
        placeholderTextColor={colors.textSubtle}
        maxLength={80}
        style={sheetStyles.input}
        autoFocus={!event}
        accessibilityLabel="Event name"
      />
      <TextInput
        value={location}
        onChangeText={setLocation}
        placeholder="Location (optional)"
        placeholderTextColor={colors.textSubtle}
        maxLength={120}
        style={sheetStyles.input}
        accessibilityLabel="Event location"
      />
      <View style={sheetStyles.row}>
        <View style={{ flex: 1 }}>
          <DateField label="Starts" value={startsOn} onChange={setStartsOn} clearable />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label="Ends (optional)" value={endsOn} onChange={setEndsOn} clearable placeholder="Same day" />
        </View>
      </View>
    </Sheet>
  );
}

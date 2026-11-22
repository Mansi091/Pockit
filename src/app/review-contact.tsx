import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import InputField from '@/components/InputField';
import ImagePreview from '@/components/ImagePreview';
import EmptyState from '@/components/EmptyState';
import FormError from '@/components/FormError';
import FormSection from '@/components/FormSection';
import PhoneListEditor from '@/components/PhoneListEditor';
import EmailListEditor from '@/components/EmailListEditor';
import CategoryPicker from '@/components/CategoryPicker';
import { countryByIso } from '@/data/countries';
import { createContact, displayName, findDuplicates, getContactDetails, updateContact } from '@/services/contactService';
import { scanSession } from '@/services/scanSession';
import { describeAdded, mergeBackSide } from '@/services/cardMerge';
import { checkPhoneDraft, phoneToDraft } from '@/utils/phone';
import { validateEmail, validatePersonName } from '@/utils/validation';
import { DateField, DateTimeField } from '@/components/DateTimeField';
import FollowUpPresets from '@/components/FollowUpPresets';
import { showPermissionHint } from '@/components/followUpHints';
import {
  getActiveEvent,
  recordFirstMeeting,
  validateFollowUp,
  validateNote,
  type EventWithCount,
} from '@/services/activityService';
import { todayKey } from '@/utils/dates';
import type { ContactField, ContactInput, EmailDraft, PhoneDraft } from '@/types/contact';

type TextKey = 'personName' | 'companyName' | 'designation' | 'website' | 'address';
type TextForm = Record<TextKey, string>;
const emptyText: TextForm = { personName: '', companyName: '', designation: '', website: '', address: '' };

const CHECK = 'Auto-detected — please check this.';
const snapshot = (t: TextForm, p: PhoneDraft[], e: EmailDraft[], cats: string[], fav: boolean) =>
  JSON.stringify([t, p, e, [...cats].sort(), fav]);

/**
 * Screen 5 – Review and Edit Contact.
 * New contact: pre-filled from the scan (image + extracted fields), or blank for manual entry.
 * Edit: `?id=<uuid>` loads an existing contact. Nothing is saved until the user taps Save.
 * Sections: Basic information · Contact details (P9/P10 add Meeting details, Categories, Follow-up).
 */
export default function ReviewContactScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; addBack?: string }>();
  const editId = params.id ?? null;
  const isEdit = !!editId;
  const addingBack = isEdit && params.addBack === '1';

  const [loading, setLoading] = useState(isEdit);
  const [notFound, setNotFound] = useState(false);
  const [text, setText] = useState<TextForm>(emptyText);
  const [phones, setPhones] = useState<PhoneDraft[]>([]);
  const [emails, setEmails] = useState<EmailDraft[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [favourite, setFavourite] = useState(false);
  const [initial, setInitial] = useState('');
  const [initialText, setInitialText] = useState<TextForm>(emptyText);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [backImagePath, setBackImagePath] = useState<string | null>(null);
  const [initialBack, setInitialBack] = useState<string | null>(null);
  const [backNotice, setBackNotice] = useState<string | null>(null);
  const [rawOcr, setRawOcr] = useState<string | null>(null);
  const [lowConfidence, setLowConfidence] = useState<ContactField[]>([]);
  const [fromScan, setFromScan] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  // P9/P12 — new contacts only: where you met, a follow-up, and Event mode.
  const [activeEvent, setActiveEvent] = useState<EventWithCount | null>(null);
  const [linkEvent, setLinkEvent] = useState(true);
  const [meetDay, setMeetDay] = useState<string | null>(todayKey());
  const [meetPlace, setMeetPlace] = useState('');
  const [meetNote, setMeetNote] = useState('');
  const [followUp, setFollowUp] = useState<Date | null>(null);
  const [followUpTitle, setFollowUpTitle] = useState('');
  const batchPos = isEdit ? null : scanSession.batchPosition();

  useEffect(() => {
    if (isEdit) return;
    getActiveEvent()
      .then((e) => {
        setActiveEvent(e);
        if (e) setMeetPlace((p) => p || e.location || e.name);
      })
      .catch(() => {});
  }, [isEdit]);

  useEffect(() => {
    (async () => {
      if (isEdit) {
        const details = await getContactDetails(editId!);
        if (!details) setNotFound(true);
        else {
          const { contact: c } = details;
          const t: TextForm = {
            personName: c.personName,
            companyName: c.companyName ?? '',
            designation: c.designation ?? '',
            website: c.website ?? '',
            address: c.address ?? '',
          };
          const p = details.phones.map(phoneToDraft);
          const e: EmailDraft[] = details.emails.map((m) => ({ id: m.id, label: m.label, address: m.address }));
          setText(t);
          setInitialText(t);
          setPhones(p);
          setEmails(e);
          setCategoryIds(details.categoryIds);
          setFavourite(c.isFavourite);
          setInitial(snapshot(t, p, e, details.categoryIds, c.isFavourite));
          setImagePath(c.cardImagePath);
          setRawOcr(c.rawOcrText);
          setBackImagePath(c.cardBackImagePath);
          setInitialBack(c.cardBackImagePath);

          // P11: "Add back side" on this contact → merge what the back adds (front data always wins).
          const s = scanSession.get();
          if (addingBack && s.draft && s.targetContactId === editId) {
            const current: ContactInput = { ...t, phones: p, emails: e, cardImagePath: c.cardImagePath, rawOcrText: c.rawOcrText };
            const { merged, added } = mergeBackSide(current, s.draft);
            const mt: TextForm = {
              personName: merged.personName,
              companyName: merged.companyName ?? '',
              designation: merged.designation ?? '',
              website: merged.website ?? '',
              address: merged.address ?? '',
            };
            setText(mt);
            setInitialText(mt); // so "please check" hints show on the newly filled fields
            setPhones(merged.phones);
            setEmails(merged.emails);
            setRawOcr(merged.rawOcrText);
            setBackImagePath(s.draft.cardBackImagePath ?? null);
            setLowConfidence(s.lowConfidence.filter((f) => added.includes(f)));
            setBackNotice(
              added.length
                ? `Added from the back: ${describeAdded(added)}. Check them, then save.`
                : 'Nothing new was found on the back. Save to keep its image with this contact.',
            );
          }
        }
        setLoading(false);
      } else {
        const s = scanSession.get();
        const d = s.draft;
        const t: TextForm = {
          personName: d?.personName ?? '',
          companyName: d?.companyName ?? '',
          designation: d?.designation ?? '',
          website: d?.website ?? '',
          address: d?.address ?? '',
        };
        const p = d?.phones.length ? d.phones : [{ label: 'mobile' as const, countryIso: 'IN', number: '' }];
        const e = d?.emails.length ? d.emails : [];
        setText(t);
        setInitialText(t);
        setPhones(p);
        setEmails(e);
        setInitial(snapshot(t, p, e, [], false));
        setImagePath(d?.cardImagePath ?? s.image?.uri ?? null);
        setBackImagePath(d?.cardBackImagePath ?? s.back?.uri ?? null);
        setRawOcr(d?.rawOcrText ?? s.ocr?.text ?? null);
        setLowConfidence(s.lowConfidence);
        setFromScan(!!s.ocr?.text);
      }
    })();
  }, [isEdit, editId, addingBack]);

  const nameError = validatePersonName(text.personName);
  const phoneErrors = useMemo(
    () => phones.map((p) => checkPhoneDraft(p, countryByIso(p.countryIso)?.name).error).filter(Boolean),
    [phones],
  );
  const emailErrors = useMemo(() => emails.map((e) => validateEmail(e.address)).filter(Boolean), [emails]);
  const hasErrors = !!nameError || phoneErrors.length > 0 || emailErrors.length > 0;
  const dirty = snapshot(text, phones, emails, categoryIds, favourite) !== initial || (isEdit && backImagePath !== initialBack);

  const set = (k: TextKey) => (v: string) => setText((f) => ({ ...f, [k]: v }));
  const warn = (k: ContactField & TextKey) =>
    lowConfidence.includes(k) && text[k] === initialText[k] && !!text[k] ? CHECK : null;

  const buildInput = (): ContactInput => ({
    ...text,
    phones,
    emails,
    cardImagePath: imagePath,
    cardBackImagePath: backImagePath,
    rawOcrText: rawOcr,
    categoryIds,
    isFavourite: favourite,
  });

  const persist = async () => {
    setSaving(true);
    try {
      if (isEdit) {
        await updateContact(editId!, buildInput());
        if (addingBack) scanSession.clear();
        router.back();
      } else {
        const created = await createContact(buildInput());
        const meeting = firstMeeting();
        let perm = null;
        try {
          perm = await recordFirstMeeting(created.id, meeting);
        } catch (e) {
          // The contact is saved; only the extras failed. Say so instead of losing the contact.
          Alert.alert('Contact saved', `But the meeting details could not be saved: ${e instanceof Error ? e.message : 'unknown error'}`);
        }
        if (perm) showPermissionHint(perm);
        afterCreate(created.id, created.personName);
      }
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  /** What the "Where you met" / "Follow-up" sections add to a new contact. */
  const firstMeeting = () => {
    const hasNote = !!meetPlace.trim() || !!meetNote.trim();
    const first = text.personName.trim().split(/\s+/)[0] || 'them';
    return {
      eventId: activeEvent && linkEvent ? activeEvent.id : null,
      note: hasNote ? { occurredOn: meetDay, place: meetPlace, notes: meetNote } : null,
      followUp: followUp ? { title: followUpTitle.trim() || `Follow up with ${first}`, due: followUp } : null,
    };
  };

  /** After saving a new contact: next card in a batch, quick "scan next" in Event mode, or open it. */
  const afterCreate = (id: string, name: string) => {
    if (scanSession.get().batch) {
      if (scanSession.nextInBatch(true)) {
        router.replace('/processing');
        return;
      }
      const saved = scanSession.get().batch?.saved ?? 0;
      scanSession.clear();
      router.dismissAll();
      Alert.alert('Batch finished', `${saved} card${saved === 1 ? '' : 's'} saved${activeEvent && linkEvent ? ` to ${activeEvent.name}` : ''}.`);
      return;
    }
    scanSession.clear();
    if (activeEvent) {
      router.dismissAll();
      Alert.alert('Saved', `${name} was added${linkEvent ? ` to ${activeEvent.name}` : ''}.`, [
        { text: 'View contact', onPress: () => router.push({ pathname: '/contact/[id]', params: { id } }) },
        { text: 'Scan next card', onPress: () => router.push('/scan') },
      ]);
      return;
    }
    router.dismissAll();
    router.push({ pathname: '/contact/[id]', params: { id } });
  };

  /** Batch: drop this card and move on. */
  const skipCard = () => {
    if (scanSession.nextInBatch(false)) {
      router.replace('/processing');
      return;
    }
    const saved = scanSession.get().batch?.saved ?? 0;
    scanSession.clear();
    router.dismissAll();
    Alert.alert('Batch finished', `${saved} card${saved === 1 ? '' : 's'} saved.`);
  };

  const onSave = async () => {
    setSubmitted(true);
    if (hasErrors) {
      Alert.alert('Check the form', 'Please fix the highlighted fields before saving.');
      return;
    }
    if (!isEdit) {
      const m = firstMeeting();
      const problem = (m.note && validateNote(m.note)) || (m.followUp && validateFollowUp(m.followUp.title, m.followUp.due));
      if (problem) {
        Alert.alert('Check the meeting details', problem);
        return;
      }
    }
    const dupes = await findDuplicates({ phones, emails }, editId ?? undefined);
    if (dupes.length) {
      const d = dupes[0]!;
      Alert.alert('Possible duplicate', `"${displayName(d.contact)}" already has the same ${d.matchedOn.join(' and ')}.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'View existing', onPress: () => router.push({ pathname: '/contact/[id]', params: { id: d.contact.id } }) },
        { text: 'Save anyway', onPress: persist },
      ]);
      return;
    }
    persist();
  };

  const leave = () => {
    if (scanSession.get().batch && !isEdit) {
      // Leaving a batch discards the cards that weren't reviewed yet.
      scanSession.clear();
      router.dismissAll();
      return;
    }
    if (addingBack) scanSession.clear();
    if (isEdit) router.back();
    else {
      scanSession.clear();
      router.dismissAll();
    }
  };

  const onCancel = () => {
    if (batchPos) {
      const left = batchPos.total - batchPos.index;
      Alert.alert('Stop batch scanning?', `This card${left ? ` and the ${left} after it` : ''} won't be saved. Cards you already saved stay.`, [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Stop', style: 'destructive', onPress: leave },
      ]);
      return;
    }
    if (!dirty && !(fromScan && !isEdit)) return leave();
    Alert.alert('Discard this contact?', 'Nothing has been saved yet.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: leave },
    ]);
  };

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />;
  if (notFound) {
    return (
      <EmptyState
        icon="person-outline"
        title="Contact not found"
        message="It may have been deleted."
        action={<CustomButton title="Go back" variant="outline" onPress={() => router.back()} />}
      />
    );
  }

  const nothingFound = fromScan && !Object.values(initialText).some(Boolean) && !phones.some((p) => p.number);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: batchPos ? `Card ${batchPos.index} of ${batchPos.total}` : addingBack ? 'Add Back Side' : isEdit ? 'Edit Contact' : 'Review Contact',
          headerRight: batchPos
            ? () => <CustomButton title="Stop" variant="ghost" onPress={onCancel} style={{ paddingHorizontal: 0 }} />
            : undefined,
        }}
      />
      {!isEdit && activeEvent && (
        <View style={styles.eventStrip}>
          <Text style={styles.eventStripText} numberOfLines={1}>
            {linkEvent ? `Will be added to ${activeEvent.name}` : `Not adding to ${activeEvent.name}`}
          </Text>
          <CustomButton title={linkEvent ? "Don't add" : 'Add'} variant="ghost" onPress={() => setLinkEvent((v) => !v)} style={{ paddingVertical: 4 }} />
        </View>
      )}
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ImagePreview uri={imagePath} height={170} emptyText="No card image (manual entry)" />
        {!!backImagePath && (
          <View style={{ marginTop: spacing.sm }}>
            <ImagePreview uri={backImagePath} height={130} />
            <View style={styles.sideBadge}>
              <Text style={styles.sideBadgeText}>Back</Text>
            </View>
            <CustomButton title="Remove back side" icon="trash-outline" variant="ghost" onPress={() => setBackImagePath(null)} />
          </View>
        )}
        {!!backNotice && (
          <View style={{ marginTop: spacing.sm }}>
            <FormError tone="info" message={backNotice} />
          </View>
        )}

        {!!rawOcr && (
          <View style={styles.rawWrap}>
            <CustomButton
              title={showRaw ? 'Hide raw OCR text' : 'Show raw OCR text'}
              variant="ghost"
              icon="document-text-outline"
              onPress={() => setShowRaw((v) => !v)}
            />
            {showRaw && (
              <Text style={styles.rawText} selectable>
                {rawOcr}
              </Text>
            )}
          </View>
        )}

        <View style={{ marginTop: spacing.lg }}>
          {nothingFound ? (
            <FormError tone="info" message="Text was read, but no fields could be identified with confidence. Use 'Show raw OCR text' and copy what you need." />
          ) : (
            <Text style={styles.hint}>
              {fromScan ? 'Fields were filled in automatically. Check each one — ' : ''}Leave anything you are unsure of blank.
            </Text>
          )}
        </View>

        <FormSection title="Basic information" icon="person-outline">
          <InputField label="Person name" required value={text.personName} onChangeText={set('personName')}
            error={submitted || text.personName !== initialText.personName ? nameError : null}
            warning={warn('personName')} autoCapitalize="words" placeholder="e.g. Priya Sharma" />
          <InputField label="Company" value={text.companyName} onChangeText={set('companyName')} warning={warn('companyName')} autoCapitalize="words" />
          <InputField label="Designation" value={text.designation} onChangeText={set('designation')} warning={warn('designation')} autoCapitalize="words" />
        </FormSection>

        <FormSection title="Categories & favourites" icon="pricetags-outline">
          <CategoryPicker selected={categoryIds} onChange={setCategoryIds} favourite={favourite} onFavouriteChange={setFavourite} />
        </FormSection>

        <FormSection title="Contact details" icon="call-outline">
          <Text style={styles.fieldLabel}>Phone numbers</Text>
          <PhoneListEditor value={phones} onChange={setPhones} showErrors={submitted} />
          <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Email addresses</Text>
          <EmailListEditor value={emails} onChange={setEmails} showErrors={submitted} />
          <View style={{ height: spacing.md }} />
          <InputField label="Website" value={text.website} onChangeText={set('website')} keyboardType="url" autoCapitalize="none" autoCorrect={false} />
          <InputField label="Address" value={text.address} onChangeText={set('address')} warning={warn('address')} multiline />
        </FormSection>

        {!isEdit && (
          <>
            <FormSection title="Where you met · optional" icon="location-outline">
              <DateField label="When" value={meetDay} onChange={setMeetDay} clearable />
              <InputField label="Place" value={meetPlace} onChangeText={setMeetPlace} placeholder="e.g. TechSparks expo, Pune" maxLength={120} />
              <InputField
                label="Note"
                value={meetNote}
                onChangeText={setMeetNote}
                placeholder="What did you talk about?"
                multiline
                maxLength={5000}
              />
            </FormSection>

            <FormSection title="Follow-up reminder · optional" icon="alarm-outline">
              <FollowUpPresets value={followUp} onChange={setFollowUp} allowNone />
              {followUp && (
                <View style={{ marginTop: spacing.md }}>
                  <DateTimeField label="Exact date and time" value={followUp} onChange={setFollowUp} />
                  <InputField
                    label="About"
                    value={followUpTitle}
                    onChangeText={setFollowUpTitle}
                    placeholder={`Follow up with ${text.personName.trim().split(/\s+/)[0] || 'them'}`}
                    maxLength={200}
                  />
                </View>
              )}
            </FormSection>
          </>
        )}
      </ScrollView>

      {/* Save bar pinned to the bottom */}
      <View style={[styles.saveBar, { paddingBottom: insets.bottom + spacing.md }]}>
        {batchPos ? (
          <>
            <CustomButton title="Skip card" variant="outline" onPress={skipCard} disabled={saving} style={styles.cancel} />
            <CustomButton
              title={batchPos.index < batchPos.total ? 'Save & next' : 'Save & finish'}
              icon={batchPos.index < batchPos.total ? 'arrow-forward' : 'checkmark'}
              onPress={onSave}
              loading={saving}
              style={styles.save}
            />
          </>
        ) : (
          <>
            <CustomButton title="Cancel" variant="outline" onPress={onCancel} disabled={saving} style={styles.cancel} />
            <CustomButton title={isEdit ? 'Save Changes' : 'Save Contact'} icon="checkmark" onPress={onSave} loading={saving} style={styles.save} />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  eventStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FDF2F8',
    paddingHorizontal: spacing.lg,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F9A8D4',
  },
  eventStripText: { flex: 1, color: '#9D174D', fontWeight: '600', fontSize: 13 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  rawWrap: { marginTop: spacing.sm },
  rawText: {
    fontFamily: 'monospace',
    fontSize: 13,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  hint: { ...typography.caption, marginBottom: spacing.lg },
  sideBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  sideBadgeText: { fontSize: 12, fontWeight: '600', color: colors.primaryDark },
  fieldLabel: { ...typography.label, marginBottom: spacing.sm },
  saveBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cancel: { flex: 1 },
  save: { flex: 2 },
});

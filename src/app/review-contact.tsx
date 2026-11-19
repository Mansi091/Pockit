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
        scanSession.clear();
        router.dismissAll();
        router.push({ pathname: '/contact/[id]', params: { id: created.id } });
      }
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const onSave = async () => {
    setSubmitted(true);
    if (hasErrors) {
      Alert.alert('Check the form', 'Please fix the highlighted fields before saving.');
      return;
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
    if (addingBack) scanSession.clear();
    if (isEdit) router.back();
    else {
      scanSession.clear();
      router.dismissAll();
    }
  };

  const onCancel = () => {
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
      <Stack.Screen options={{ title: addingBack ? 'Add Back Side' : isEdit ? 'Edit Contact' : 'Review Contact' }} />
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
      </ScrollView>

      {/* Save bar pinned to the bottom */}
      <View style={[styles.saveBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <CustomButton title="Cancel" variant="outline" onPress={onCancel} disabled={saving} style={styles.cancel} />
        <CustomButton title={isEdit ? 'Save Changes' : 'Save Contact'} icon="checkmark" onPress={onSave} loading={saving} style={styles.save} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
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

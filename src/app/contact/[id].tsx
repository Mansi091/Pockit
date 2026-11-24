import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View, Switch } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import ImagePreview from '@/components/ImagePreview';
import EmptyState from '@/components/EmptyState';
import Avatar from '@/components/Avatar';
import OptionSheet from '@/components/OptionSheet';
import SegmentedTabs from '@/components/SegmentedTabs';
import { getCachedOrganization, setContactShared, type MyOrganization } from '@/services/orgService';
import ContactNotesTab from '@/components/contact/ContactNotesTab';
import ContactFollowUpsTab from '@/components/contact/ContactFollowUpsTab';
import { getEventsForContact, getFollowUps, getNotes, type EventWithCount, type ReminderWithContact } from '@/services/activityService';
import CardPhotoComposer, { type CardPhotoComposerHandle } from '@/components/CardPhotoComposer';
import { deleteContact, getContactDetails, linkNativeContact, setFavourite } from '@/services/contactService';
import { getCategories, type CategoryWithCount } from '@/services/categoryService';
import { attachCardPhotoToPhoneContact, openPhoneContact, phoneContactExists, saveToPhoneContacts } from '@/services/nativeContactsService';
import { useContactsVersion } from '@/services/dataEvents';
import { CAPTURE_LABEL, captureCard, captureSources, type CaptureSource } from '@/services/cardCapture';
import { ScannerUnavailableError } from '@/services/documentScannerService';
import { scanSession } from '@/services/scanSession';
import { dialString, formatPhone } from '@/utils/phone';
import { flagOf } from '@/data/countries';
import { ADDRESS_LABEL_TEXT, LABEL_TEXT, type AddressDraft, type Contact, type ContactEmail, type ContactPhone, type Interaction } from '@/types/contact';

type ProfileTab = 'details' | 'notes' | 'followups';
const isProfileTab = (t: unknown): t is ProfileTab => t === 'details' || t === 'notes' || t === 'followups';

/** Screen 7 – Contact Profile: call / email / website / edit / delete / save to phone contacts. */
export default function ContactProfileScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const id = params.id;
  const [tab, setTab] = useState<ProfileTab>(isProfileTab(params.tab) ? params.tab : 'details');
  const [notes, setNotes] = useState<Interaction[]>([]);
  const [followUps, setFollowUps] = useState<ReminderWithContact[]>([]);
  const [events, setEvents] = useState<EventWithCount[]>([]);
  const [org, setOrg] = useState<MyOrganization | null>(null);
  const version = useContactsVersion();
  const [contact, setContact] = useState<Contact | null | undefined>(undefined); // undefined = loading
  const [phones, setPhones] = useState<ContactPhone[]>([]);
  const [emails, setEmails] = useState<ContactEmail[]>([]);
  const [addresses, setAddresses] = useState<AddressDraft[]>([]);
  const [contactCategories, setContactCategories] = useState<CategoryWithCount[]>([]);
  const [savingToPhone, setSavingToPhone] = useState(false);
  const [backSheet, setBackSheet] = useState(false);
  const [capturingBack, setCapturingBack] = useState(false);
  const composerRef = useRef<CardPhotoComposerHandle>(null);
  // Square "whole card on white" photo for the phone's Contacts app (null → plain photo).
  const compose = (uri: string) => composerRef.current?.compose(uri) ?? Promise.resolve(null);

  const load = useCallback(async () => {
    try {
      const details = await getContactDetails(id);
      setContact(details?.contact ?? null);
      setPhones(details?.phones ?? []);
      setEmails(details?.emails ?? []);
      setAddresses(details?.addresses ?? []);
      const all = details?.categoryIds.length ? await getCategories() : [];
      setContactCategories(all.filter((c) => details!.categoryIds.includes(c.id)));
      if (details) {
        const [n, f, e, o] = await Promise.all([getNotes(id), getFollowUps(id), getEventsForContact(id), getCachedOrganization()]);
        setOrg(o);
        setNotes(n);
        setFollowUps(f);
        setEvents(e);
      }
    } catch {
      setContact(null);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load, version]);

  useEffect(() => {
    if (isProfileTab(params.tab)) setTab(params.tab);
  }, [params.tab]);

  if (contact === undefined) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />;
  if (contact === null) {
    return (
      <EmptyState
        icon="person-outline"
        title="Contact not found"
        message="It may have been deleted."
        action={<CustomButton title="Go back" variant="outline" onPress={() => router.back()} />}
      />
    );
  }

  // The first number/email is the main one (P8 'Make main' moves it to the top).
  const phone = phones[0] ? dialString(phones[0]) : null;
  const email = emails[0]?.address ?? null;
  const whatsappUrl = (p: ContactPhone) => `https://wa.me/${(p.e164 ?? p.nationalNumber).replace(/\D/g, '')}`;

  // P11: capture the back → read it → review screen merges it into this contact.
  const addBackSide = async (from: CaptureSource) => {
    setCapturingBack(true);
    try {
      const img = await captureCard(from);
      if (!img) return;
      scanSession.startBackOnly(contact.id, img);
      router.push('/processing');
    } catch (e) {
      if (e instanceof ScannerUnavailableError) {
        Alert.alert('Automatic scan unavailable', `${e.message}

You can take a photo and crop it to the card instead.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Take photo', onPress: () => addBackSide('camera') },
        ]);
      } else {
        Alert.alert('Could not use this image', e instanceof Error ? e.message : 'Please try again.');
      }
    } finally {
      setCapturingBack(false);
    }
  };

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open', 'No app on this device can handle this action.');
    }
  };

  const openWebsite = () => {
    const w = contact.website!;
    open(/^https?:\/\//i.test(w) ? w : `https://${w}`);
  };

  const onSaveToPhone = async () => {
    setSavingToPhone(true);
    try {
      if (contact.nativeContactId) {
        const nativeId = contact.nativeContactId;
        if (await phoneContactExists(nativeId)) {
          if (!contact.cardImagePath) {
            await openPhoneContact(nativeId);
            return;
          }
          // Already in the phone: open it, or (for contacts saved earlier) attach the card photo.
          Alert.alert('Saved in your phone', 'What would you like to do?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Add card photo',
              onPress: async () => {
                const ok = await attachCardPhotoToPhoneContact(nativeId, contact, compose).catch(() => false);
                Alert.alert(ok ? 'Card photo added' : 'Could not add the photo', ok ? 'The phone contact now shows this card.' : 'Please try again.');
              },
            },
            { text: 'Open in Contacts', onPress: () => openPhoneContact(nativeId) },
          ]);
          return;
        }
        await linkNativeContact(contact.id, null); // was deleted from the phone; fall through to re-save
      }
      const result = await saveToPhoneContacts(contact, compose);
      if (result.status === 'saved') {
        const nativeId = result.nativeId;
        if (nativeId) await linkNativeContact(contact.id, nativeId);
        Alert.alert(
          'Saved to phone',
          `${contact.personName} is now in your phone's contacts${contact.cardImagePath ? ', with the card as their photo' : ''}.`,
          nativeId
            ? [
                { text: 'Done', style: 'cancel' },
                { text: 'Open in Contacts', onPress: () => openPhoneContact(nativeId) },
              ]
            : undefined,
        );
      }
    } catch (e) {
      Alert.alert('Could not save to contacts', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSavingToPhone(false);
    }
  };

  const onDelete = () =>
    Alert.alert(
      'Delete contact?',
      `${contact.personName} will be removed from Pockit${contact.nativeContactId ? '. The copy in your phone contacts is not affected' : ''}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteContact(contact.id);
              router.back();
            } catch (e) {
              Alert.alert('Could not delete', e instanceof Error ? e.message : 'Unknown error');
            }
          },
        },
      ],
    );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Avatar name={contact.personName} size={84} />
          <Pressable
            onPress={() => setFavourite(contact.id, !contact.isFavourite)}
            hitSlop={10}
            style={styles.star}
            accessibilityRole="switch"
            accessibilityState={{ checked: contact.isFavourite }}
            accessibilityLabel="Favourite"
          >
            <Ionicons name={contact.isFavourite ? 'star' : 'star-outline'} size={20} color={contact.isFavourite ? '#F59E0B' : colors.textMuted} />
          </Pressable>
        </View>
        <Text style={styles.name}>{contact.personName}</Text>
        {!!contact.designation && <Text style={styles.designation}>{contact.designation}</Text>}
        {!!contact.companyName && <Text style={styles.company}>{contact.companyName}</Text>}
        {(contactCategories.length > 0 || events.length > 0) && (
          <View style={styles.catRow}>
            {events.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
                style={[styles.catChip, styles.eventChip]}
                accessibilityRole="button"
                accessibilityLabel={`Event ${e.name}`}
              >
                <Ionicons name="calendar" size={12} color="#9D174D" />
                <Text style={[styles.catText, { color: '#9D174D' }]} numberOfLines={1}>{e.name}</Text>
              </Pressable>
            ))}
            {contactCategories.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => router.navigate({ pathname: '/contacts', params: { category: c.id } })}
                style={[styles.catChip, { backgroundColor: c.color }]}
                accessibilityRole="button"
                accessibilityLabel={`Category ${c.name}`}
              >
                <Text style={styles.catText} numberOfLines={1}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.quickActions}>
          <QuickAction icon="call-outline" label="Call" disabled={!phone} onPress={() => open(`tel:${phone}`)} />
          <QuickAction icon="mail-outline" label="Email" disabled={!email} onPress={() => open(`mailto:${email}`)} />
          <QuickAction icon="globe-outline" label="Website" disabled={!contact.website} onPress={openWebsite} />
        </View>
      </View>

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        style={{ marginHorizontal: spacing.lg, marginBottom: spacing.lg }}
        tabs={[
          { key: 'details', label: 'Details', icon: 'person-outline' },
          { key: 'notes', label: 'Notes', icon: 'chatbubble-ellipses-outline', badge: notes.length },
          {
            key: 'followups',
            label: 'Follow-ups',
            icon: 'alarm-outline',
            badge: followUps.filter((r) => !r.completedAt).length,
            urgent: followUps.some((r) => !r.completedAt && new Date(r.dueAt).getTime() < Date.now()),
          },
        ]}
      />

      {tab === 'notes' && <ContactNotesTab contactId={contact.id} notes={notes} />}
      {tab === 'followups' && <ContactFollowUpsTab contact={contact} reminders={followUps} />}

      {tab === 'details' && (
      <>
      <View style={styles.card}>
        {phones.length === 0 && <Detail icon="call-outline" label="Phone" value={null} />}
        {phones.map((p) => (
          <ListRow
            key={p.id}
            icon="call-outline"
            label={`${LABEL_TEXT[p.label]}${p.needsReview ? ' · check country' : ''}`}
            value={`${p.countryIso ? `${flagOf(p.countryIso)}  ` : ''}${formatPhone(p)}`}
            onPress={() => open(`tel:${dialString(p)}`)}
            action={p.label === 'whatsapp' || p.label === 'mobile' ? { icon: 'logo-whatsapp', label: 'WhatsApp', onPress: () => open(whatsappUrl(p)) } : undefined}
          />
        ))}
        {emails.length === 0 && <Detail icon="mail-outline" label="Email" value={null} />}
        {emails.map((e) => (
          <ListRow key={e.id} icon="mail-outline" label={LABEL_TEXT[e.label]} value={e.address} onPress={() => open(`mailto:${e.address}`)} />
        ))}
        <Detail icon="globe-outline" label="Website" value={contact.website} />
        {addresses.length === 0 && <Detail icon="location-outline" label="Address" value={null} />}
        {addresses.map((a, i) => (
          <ListRow
            key={a.id ?? 'addr-' + i}
            icon="location-outline"
            label={ADDRESS_LABEL_TEXT[a.label]}
            value={a.fullAddress}
            onPress={() => open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a.fullAddress))}
          />
        ))}
        <Detail icon="business-outline" label="Company" value={contact.companyName} />
        <Detail icon="briefcase-outline" label="Designation" value={contact.designation} last />
      </View>

      {org && (
        <View style={styles.shareCard}>
          <Ionicons
            name={contact.sharedWithOrg ? 'people' : 'lock-closed-outline'}
            size={20}
            color={contact.sharedWithOrg ? colors.accent : colors.textMuted}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.shareTitle}>Share with {org.name}</Text>
            <Text style={styles.shareSub}>
              {contact.sharedWithOrg
                ? 'Your company admins can see this contact. Notes and follow-ups stay private.'
                : 'Private — only you can see this contact.'}
            </Text>
          </View>
          <Switch
            value={contact.sharedWithOrg}
            onValueChange={(v) => setContactShared(contact.id, v)}
            trackColor={{ true: colors.accent, false: colors.border }}
            thumbColor={colors.surface}
            accessibilityLabel={`Share with ${org.name}`}
          />
        </View>
      )}

      <Text style={styles.sectionTitle}>Original card</Text>
      <View style={{ marginHorizontal: spacing.lg, gap: spacing.sm }}>
        <ImagePreview uri={contact.cardImagePath} height={200} emptyText="No card image saved" />
        {contact.cardBackImagePath ? (
          <View>
            <ImagePreview uri={contact.cardBackImagePath} height={170} />
            <View style={styles.sideBadge}>
              <Text style={styles.sideBadgeText}>Back</Text>
            </View>
          </View>
        ) : (
          <CustomButton title="Add back side" icon="add-circle-outline" variant="ghost" onPress={() => setBackSheet(true)} loading={capturingBack} />
        )}
      </View>
      <OptionSheet
        visible={backSheet}
        title="Add the back side"
        options={captureSources()}
        labelOf={(o) => CAPTURE_LABEL[o]}
        onSelect={(o) => setTimeout(() => addBackSide(o), 250) /* let the sheet close first */}
        onClose={() => setBackSheet(false)}
      />

      <Text style={styles.meta}>
        Added {new Date(contact.createdAt).toLocaleDateString()}
        {contact.updatedAt !== contact.createdAt && ` · Updated ${new Date(contact.updatedAt).toLocaleDateString()}`}
      </Text>

      <View style={styles.actions}>
        {Platform.OS !== 'web' && (
          <CustomButton
            title={contact.nativeContactId ? 'Saved to Phone · Open' : 'Save to Phone Contacts'}
            icon={contact.nativeContactId ? 'checkmark-circle-outline' : 'person-add-outline'}
            variant="secondary"
            onPress={onSaveToPhone}
            loading={savingToPhone}
          />
        )}
        <CustomButton
          title="Edit Contact"
          icon="create-outline"
          onPress={() => router.push({ pathname: '/review-contact', params: { id: contact.id } })}
        />
        <CustomButton title="Delete Contact" icon="trash-outline" variant="danger" onPress={onDelete} />
      </View>
      </>
      )}
      <CardPhotoComposer ref={composerRef} />
    </ScrollView>
  );
}

function QuickAction({ icon, label, onPress, disabled }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.qa, { opacity: disabled ? 0.35 : pressed ? 0.7 : 1 }]}
    >
      <View style={styles.qaIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </Pressable>
  );
}

/** A tappable phone/email row with an optional trailing action (e.g. WhatsApp). */
function ListRow({ icon, label, value, onPress, action }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string; onPress: () => void;
  action?: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void };
}) {
  return (
    <View style={[styles.detail, styles.detailBorder]}>
      <Ionicons name={icon} size={18} color={colors.textSubtle} style={{ marginRight: spacing.md, marginTop: 2 }} />
      <Pressable style={{ flex: 1 }} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label} ${value}`}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={[styles.detailValue, { color: colors.primary }]} selectable>{value}</Text>
      </Pressable>
      {action && (
        <Pressable onPress={action.onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={action.label} style={{ padding: 6 }}>
          <Ionicons name={action.icon} size={22} color="#16A34A" />
        </Pressable>
      )}
    </View>
  );
}

function Detail({ icon, label, value, last }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string | null; last?: boolean;
}) {
  return (
    <View style={[styles.detail, !last && styles.detailBorder]}>
      <Ionicons name={icon} size={18} color={colors.textSubtle} style={{ marginRight: spacing.md, marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={[styles.detailValue, !value && styles.detailEmpty]} selectable>
          {value || 'Not provided'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },
  header: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, marginBottom: 2 },
  star: {
    position: 'absolute',
    right: -6,
    bottom: -2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    elevation: 3,
  },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: spacing.md },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, maxWidth: 180 },
  shareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    ...shadow,
  },
  shareTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  shareSub: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  eventChip: { backgroundColor: '#FDF2F8', borderWidth: 1, borderColor: '#F9A8D4' },
  catText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  name: { ...typography.title, marginTop: spacing.md, textAlign: 'center' },
  designation: { color: colors.textMuted, fontSize: 15, marginTop: 4, textAlign: 'center' },
  company: { color: colors.text, fontSize: 15, marginTop: 2, fontWeight: '600', textAlign: 'center' },
  quickActions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, marginTop: spacing.xl },
  qa: { alignItems: 'center', minWidth: 64 },
  qaIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaLabel: { color: colors.text, fontSize: 12, fontWeight: '500', marginTop: 6 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.md, margin: spacing.lg, ...shadow },
  detail: { flexDirection: 'row', paddingVertical: spacing.md },
  detailBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  detailLabel: { ...typography.caption },
  detailValue: { ...typography.body, marginTop: 2 },
  detailEmpty: { color: colors.textMuted, fontStyle: 'italic' },
  sectionTitle: { ...typography.heading, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  meta: { ...typography.caption, marginHorizontal: spacing.lg, marginTop: spacing.sm },
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
  actions: { gap: spacing.sm, margin: spacing.lg },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import ImagePreview from '@/components/ImagePreview';
import EmptyState from '@/components/EmptyState';
import Avatar from '@/components/Avatar';
import CardPhotoComposer, { type CardPhotoComposerHandle } from '@/components/CardPhotoComposer';
import { deleteContact, getContactDetails, linkNativeContact } from '@/services/contactService';
import { attachCardPhotoToPhoneContact, openPhoneContact, phoneContactExists, saveToPhoneContacts } from '@/services/nativeContactsService';
import { useContactsVersion } from '@/services/dataEvents';
import { dialString, formatPhone } from '@/utils/phone';
import { flagOf } from '@/data/countries';
import { LABEL_TEXT, type Contact, type ContactEmail, type ContactPhone } from '@/types/contact';

/** Screen 7 – Contact Profile: call / email / website / edit / delete / save to phone contacts. */
export default function ContactProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const version = useContactsVersion();
  const [contact, setContact] = useState<Contact | null | undefined>(undefined); // undefined = loading
  const [phones, setPhones] = useState<ContactPhone[]>([]);
  const [emails, setEmails] = useState<ContactEmail[]>([]);
  const [savingToPhone, setSavingToPhone] = useState(false);
  const composerRef = useRef<CardPhotoComposerHandle>(null);
  // Square "whole card on white" photo for the phone's Contacts app (null → plain photo).
  const compose = (uri: string) => composerRef.current?.compose(uri) ?? Promise.resolve(null);

  const load = useCallback(async () => {
    try {
      const details = await getContactDetails(id);
      setContact(details?.contact ?? null);
      setPhones(details?.phones ?? []);
      setEmails(details?.emails ?? []);
    } catch {
      setContact(null);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load, version]);

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
        <Avatar name={contact.personName} size={84} />
        <Text style={styles.name}>{contact.personName}</Text>
        {!!contact.designation && <Text style={styles.designation}>{contact.designation}</Text>}
        {!!contact.companyName && <Text style={styles.company}>{contact.companyName}</Text>}

        <View style={styles.quickActions}>
          <QuickAction icon="call-outline" label="Call" disabled={!phone} onPress={() => open(`tel:${phone}`)} />
          <QuickAction icon="mail-outline" label="Email" disabled={!email} onPress={() => open(`mailto:${email}`)} />
          <QuickAction icon="globe-outline" label="Website" disabled={!contact.website} onPress={openWebsite} />
        </View>
      </View>

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
        <Detail icon="location-outline" label="Address" value={contact.address} />
        <Detail icon="business-outline" label="Company" value={contact.companyName} />
        <Detail icon="briefcase-outline" label="Designation" value={contact.designation} last />
      </View>

      <Text style={styles.sectionTitle}>Original card</Text>
      <View style={{ marginHorizontal: spacing.lg }}>
        <ImagePreview uri={contact.cardImagePath} height={200} emptyText="No card image saved" />
      </View>

      <Text style={styles.meta}>
        Added {new Date(contact.createdAt).toLocaleDateString()}
        {contact.updatedAt !== contact.createdAt && ` · Updated ${new Date(contact.updatedAt).toLocaleDateString()}`}
      </Text>

      <View style={styles.actions}>
        <CustomButton
          title={contact.nativeContactId ? 'Saved to Phone · Open' : 'Save to Phone Contacts'}
          icon={contact.nativeContactId ? 'checkmark-circle-outline' : 'person-add-outline'}
          variant="secondary"
          onPress={onSaveToPhone}
          loading={savingToPhone}
        />
        <CustomButton
          title="Edit Contact"
          icon="create-outline"
          onPress={() => router.push({ pathname: '/review-contact', params: { id: contact.id } })}
        />
        <CustomButton title="Delete Contact" icon="trash-outline" variant="danger" onPress={onDelete} />
      </View>
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
  header: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  name: { ...typography.title, marginTop: spacing.md, textAlign: 'center' },
  designation: { color: colors.textMuted, fontSize: 15, marginTop: 4, textAlign: 'center' },
  company: { color: colors.text, fontSize: 15, marginTop: 2, fontWeight: '600', textAlign: 'center' },
  quickActions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, marginTop: spacing.xl },
  qa: { alignItems: 'center', minWidth: 64 },
  qaIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
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
  actions: { gap: spacing.sm, margin: spacing.lg },
});

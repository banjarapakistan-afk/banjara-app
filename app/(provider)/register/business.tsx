import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';
import { TransportSignupSteps } from '@/components/provider/TransportSignupSteps';
import { PlaceAutocompleteSelect } from '@/components/ui/PlaceAutocompleteSelect';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { ImagePickerField } from '@/components/ui/ImagePickerField';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/colors';
import { Radius, Spacing } from '@/constants/spacing';
import { TRIP_CITY_OPTIONS } from '@/constants/tripPlaces';
import { Fonts, Typography } from '@/constants/typography';
import { getApiErrorMessage } from '@/services/apiError';
import * as uploadService from '@/services/uploadService';
import { useProviderStore } from '@/store/providerStore';
import { useAuthStore } from '@/store/authStore';

const validPhone = (value: string) => /^\+?\d{10,15}$/.test(value.replace(/[\s()-]/g, ''));

const schema = z
  .object({
    ownerName: z.string().trim().min(2, 'Enter your full name'),
    phone: z.string().refine(validPhone, 'Enter a valid phone number (10–15 digits)'),
    email: z.string().email('Enter a valid email'),
    description: z.string().trim().min(10, 'Write at least a short line about yourself'),
    city: z.string().min(2, 'Select a city'),
    address: z.string().trim().min(5, 'Enter your home address'),
    yearsExperience: z
      .string()
      .regex(/^\d+$/, 'Enter whole years, including 0')
      .refine((value) => Number(value) <= 80, 'Enter 0 to 80 years'),
    emergencyContact: z.string().refine(validPhone, 'Enter a valid phone number (10–15 digits)'),
  })
  .refine(
    (values) => values.emergencyContact.replace(/\D/g, '') !== values.phone.replace(/\D/g, ''),
    { path: ['emergencyContact'], message: 'Use someone else’s number, not your own' },
  );

type FormValues = z.infer<typeof schema>;

function matchCityOption(placeName: string | undefined): string | undefined {
  const raw = String(placeName ?? '').trim().toLowerCase();
  if (!raw) return undefined;
  const exact = TRIP_CITY_OPTIONS.find((city) => city.toLowerCase() === raw);
  if (exact) return exact;
  return TRIP_CITY_OPTIONS.find(
    (city) => raw.includes(city.toLowerCase()) || city.toLowerCase().includes(raw)
  );
}

/**
 * Step 1 of 4 for drivers: everything about the person, asked once.
 * Name, phone and email come from the account they just created and are shown as a summary
 * (tap Edit to change them). The vehicle and the CNIC have their own steps later.
 */
export default function ProviderBusinessScreen() {
  const insets = useSafeAreaInsets();
  const draft = useProviderStore((state) => state.draft);
  const provider = useProviderStore((state) => state.provider);
  const setBusiness = useProviderStore((state) => state.setBusiness);
  const setTransport = useProviderStore((state) => state.setTransport);
  const saveProgress = useProviderStore((state) => state.saveProgress);
  const saving = useProviderStore((state) => state.saving);
  const user = useAuthStore((state) => state.user);
  const cached = useMemo(() => useProviderStore.getState().formDrafts.business as Partial<FormValues> | undefined, []);
  const transport = draft.transport ?? provider?.transport;

  const { control, handleSubmit, formState, setValue, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      ownerName: draft.business.ownerName || draft.personal.name || user?.name || '',
      phone: draft.business.phone || draft.personal.phone || user?.phone || '',
      email: draft.business.email || draft.personal.email || user?.email || '',
      description: draft.business.description ?? '',
      city: draft.business.city ?? '',
      address: draft.business.address || transport?.driverPermanentAddress || '',
      yearsExperience: String(draft.business.yearsExperience ?? transport?.driverExperienceYears ?? ''),
      emergencyContact: transport?.driverEmergencyContact ?? '',
      ...cached,
    },
  });

  const [photo, setPhoto] = useState<string[]>(transport?.driverPhoto ? [transport.driverPhoto] : []);
  const [uploading, setUploading] = useState(false);
  const [removingImage, setRemovingImage] = useState(false);

  // The account step already asked for these. Only open them when they are missing or wrong.
  const accountErrors = Boolean(
    formState.errors.ownerName || formState.errors.phone || formState.errors.email,
  );
  const [editAccount, setEditAccount] = useState(false);
  const [ownerName, phone, email, watchedCity] = watch(['ownerName', 'phone', 'email', 'city']);

  const accountComplete = ownerName.trim().length >= 2 && validPhone(phone) && /\S+@\S+\.\S+/.test(email);
  const showAccountFields = editAccount || accountErrors || !accountComplete;

  useEffect(() => {
    const subscription = watch((values) => useProviderStore.getState().setFormDraft('business', values));
    return () => subscription.unsubscribe();
  }, [watch]);

  const pickPhoto = async () => {
    try {
      setUploading(true);
      const picked = await uploadService.pickImages(1);
      if (!picked.length) return;
      const uploaded = await uploadService.uploadImages(picked, 'vehicles');
      if (uploaded[0]?.url) setPhoto([uploaded[0].url]);
    } catch (error) {
      Alert.alert('Upload failed', getApiErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    if (uploading || removingImage) return;
    // Transport is offered by individual local drivers: the driver is the listing.
    const name = values.ownerName.trim();
    setBusiness({
      ownerName: name,
      businessName: name,
      phone: values.phone.trim(),
      email: values.email.trim(),
      description: values.description.trim(),
      city: values.city,
      address: values.address.trim(),
      yearsExperience: Number(values.yearsExperience) || 0,
    });
    // The same answers fill the driver record, so the vehicle step never asks for them again.
    setTransport({
      businessName: name,
      driverName: name,
      driverPhone: values.phone.trim(),
      driverEmail: values.email.trim() || undefined,
      driverPermanentAddress: values.address.trim(),
      driverExperienceYears: values.yearsExperience,
      driverEmergencyContact: values.emergencyContact.trim(),
      driverPhoto: photo[0] || '',
      // Routes and fares are not part of signup: drivers add trips from the dashboard once approved.
      operatingCities: transport?.operatingCities?.length ? transport.operatingCities : [values.city],
    });
    try {
      await saveProgress();
      useProviderStore.getState().clearFormDraft('business');
      router.push({ pathname: '/(provider)/location', params: { mode: 'onboarding' } } as never);
    } catch (error) {
      Alert.alert('Could not save', getApiErrorMessage(error));
    }
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="Your details"
        showBack
        fallbackHref="/(provider)/register/services"
      />
      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 40, gap: Spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <TransportSignupSteps current={1} hint="About 2 minutes" />
        <View style={{ gap: Spacing.xs }}>
          <Text style={styles.heading}>Tell us about yourself</Text>
          <Text style={styles.sub}>
            You drive your own vehicle on Banjara, so travellers book you. Your vehicle and CNIC come in the next steps.
          </Text>
        </View>

        {showAccountFields ? (
          <View style={styles.group}>
            <Controller
              control={control}
              name="ownerName"
              render={({ field: { onChange, value } }) => (
                <Input label="Full name (as on your CNIC)" value={value} onChangeText={onChange} error={formState.errors.ownerName?.message} />
              )}
            />
            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, value } }) => (
                <Input label="Phone" keyboardType="phone-pad" value={value} onChangeText={onChange} error={formState.errors.phone?.message} />
              )}
            />
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, value } }) => (
                <Input label="Email" autoCapitalize="none" keyboardType="email-address" value={value} onChangeText={onChange} error={formState.errors.email?.message} />
              )}
            />
          </View>
        ) : (
          <View style={styles.accountCard}>
            <View style={styles.accountIcon}>
              <Ionicons name="person-circle-outline" size={28} color={Colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.accountName}>{ownerName}</Text>
              <Text style={styles.accountMeta} numberOfLines={1}>{phone}</Text>
              <Text style={styles.accountMeta} numberOfLines={1}>{email}</Text>
            </View>
            <Pressable onPress={() => setEditAccount(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit name, phone and email">
              <Text style={styles.edit}>Edit</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.section}>Where you live</Text>
        <Controller
          control={control}
          name="city"
          render={({ field: { onChange, value } }) => (
            <View style={{ gap: 4 }}>
              <PlaceAutocompleteSelect
                label="Based in"
                placeholder="Search your city, town or village"
                value={value}
                suggestions={TRIP_CITY_OPTIONS}
                leftIcon="home-outline"
                hint="Any place in Pakistan, e.g. Karimabad, Hunza"
                onChange={(name, place) => onChange(place?.address.city || name)}
              />
              {formState.errors.city?.message ? (
                <Text style={styles.error}>{formState.errors.city.message}</Text>
              ) : null}
            </View>
          )}
        />
        <Controller
          control={control}
          name="address"
          render={({ field: { onChange, value } }) => (
            <View style={{ gap: 4 }}>
              <PlaceAutocompleteSelect
                label="Permanent address"
                placeholder="Search your village, area or street"
                value={value}
                leftIcon="location-outline"
                hint="As on your CNIC. Search, or tap the map to pin your home. Only the Banjara team sees it."
                onChange={(name, place) => {
                  // Keep the full address ("Karimabad, Hunza, Gilgit-Baltistan, Pakistan"), not just a name.
                  onChange(place?.address.formattedAddress?.trim() || name);
                  const matchedCity = matchCityOption(place?.address.city || name);
                  if (matchedCity && !watchedCity) {
                    setValue('city', matchedCity, { shouldDirty: true, shouldValidate: true });
                  }
                }}
              />
              {formState.errors.address?.message ? (
                <Text style={styles.error}>{formState.errors.address.message}</Text>
              ) : null}
            </View>
          )}
        />

        <Text style={styles.section}>Driving</Text>
        <Controller
          control={control}
          name="yearsExperience"
          render={({ field: { onChange, value } }) => (
            <Input label="Driving experience (years)" keyboardType="number-pad" value={value} onChangeText={onChange} error={formState.errors.yearsExperience?.message} />
          )}
        />
        <Controller
          control={control}
          name="emergencyContact"
          render={({ field: { onChange, value } }) => (
            <Input
              label="Emergency contact number"
              keyboardType="phone-pad"
              placeholder="A family member or friend"
              value={value}
              onChangeText={onChange}
              error={formState.errors.emergencyContact?.message}
            />
          )}
        />

        <Text style={styles.section}>Your profile</Text>
        <Controller
          control={control}
          name="description"
          render={({ field: { onChange, value } }) => (
            <Input label="About you" placeholder="Routes you know, languages you speak, what travellers can expect" value={value} onChangeText={onChange} multiline error={formState.errors.description?.message} />
          )}
        />
        <ImagePickerField
          label="Your photo (optional)"
          urls={photo}
          max={1}
          uploading={uploading}
          disabled={saving || uploading || removingImage}
          onRemovingChange={setRemovingImage}
          onAdd={() => void pickPhoto()}
          onRemove={() => setPhoto([])}
        />
        <Text style={styles.fine}>Travellers trust a clear, friendly face. You can add it later too.</Text>

        <Button title="Continue to location" loading={saving || uploading} disabled={removingImage} onPress={onSubmit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  heading: { ...Typography.h2, color: Colors.primary },
  sub: { ...Typography.body, color: Colors.muted },
  section: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: Colors.primary,
    marginTop: Spacing.xs,
    marginBottom: -Spacing.sm,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  group: { gap: Spacing.lg },
  row: { flexDirection: 'row', gap: Spacing.sm },
  rowItem: { flex: 1 },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  accountIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySoft,
  },
  accountName: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: Colors.dark },
  accountMeta: { fontFamily: Fonts.body, fontSize: 13, color: Colors.muted },
  edit: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.primary },
  fine: { ...Typography.caption, color: Colors.muted, marginTop: -Spacing.sm },
  error: { ...Typography.caption, color: Colors.danger },
});

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TransportSignupSteps } from '@/components/provider/TransportSignupSteps';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { ImagePickerField } from '@/components/ui/ImagePickerField';
import { Input } from '@/components/ui/Input';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { Colors } from '@/constants/colors';
import {
  INSURANCE_COMPANY_OPTIONS,
  VEHICLE_TYPE_OPTIONS,
} from '@/constants/providerOptions';
import { Radius, Spacing } from '@/constants/spacing';
import { Fonts, Typography } from '@/constants/typography';
import { useProviderFormDraft } from '@/hooks/useProviderFormDraft';
import { getApiErrorMessage } from '@/services/apiError';
import * as providerService from '@/services/providerService';
import * as uploadService from '@/services/uploadService';
import { useAuthStore } from '@/store/authStore';
import { useProviderStore } from '@/store/providerStore';
import type { ProviderTransportSetup } from '@/types/provider';
import {
  ONBOARDING_LOCATION,
  PROVIDER_SERVICE_TAB,
  leaveProviderEditor,
  paramId,
  useWizardBack,
  wizardBack,
} from '@/utils/navigation';
import { vehicleVerificationError } from '@/utils/transportValidation';

type VehicleClass = NonNullable<ProviderTransportSetup['vehicleClass']>;

const AMENITIES = [
  { key: 'Air Conditioning', icon: 'snow-outline' },
  { key: 'WiFi', icon: 'wifi-outline' },
  { key: 'Charging Ports', icon: 'battery-charging-outline' },
  { key: 'Luggage Space', icon: 'briefcase-outline' },
] as const;

/** A sensible starting seat count; the driver adjusts it with − / +. */
const DEFAULT_SEATS: Record<string, number> = {
  car: 4,
  jeep: 5,
  suv: 6,
  van: 12,
  mini_bus: 20,
  bus: 40,
};
const MAX_SEATS = 60;

const VEHICLE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  car: 'car-sport-outline',
  jeep: 'car-outline',
  suv: 'car-outline',
  van: 'bus-outline',
  mini_bus: 'bus-outline',
  bus: 'bus-outline',
};

const DRIVER_FIELDS: [keyof ProviderTransportSetup, string][] = [
  ['driverName', 'Your name'],
  ['driverPhone', 'Phone'],
  ['driverPermanentAddress', 'Home address'],
  ['driverEmergencyContact', 'Emergency contact'],
];

function nextAfterTransport(services: string[]) {
  if (services.some((s) => ['hotel', 'guestHouse'].includes(s)))
    return '/(provider)/register/hotel';
  if (services.some((s) => s === 'travelGuide')) return '/(provider)/register/guide';
  if (services.some((s) => s === 'tour')) return '/(provider)/register/tours';
  return '/(provider)/register/verification';
}

const sameReg = (a?: string, b?: string) =>
  (a ?? '').trim().toUpperCase() === (b ?? '').trim().toUpperCase();

/**
 * Step 3 of 4 for drivers: the vehicle, asked once.
 * Saves the vehicle record (seats, amenities, photos) and the verification details together,
 * so there is no separate "Add vehicle" screen during signup. Driver details come from step 1.
 */
export default function ProviderVehicleStepScreen() {
  const insets = useSafeAreaInsets();
  const draft = useProviderStore((s) => s.draft);
  const provider = useProviderStore((s) => s.provider);
  const vehicles = useProviderStore((s) => s.vehicles);
  const setTransport = useProviderStore((s) => s.setTransport);
  const saveProgress = useProviderStore((s) => s.saveProgress);
  const saving = useProviderStore((s) => s.saving);
  const user = useAuthStore((s) => s.user);
  const params = useLocalSearchParams<{ from?: string | string[] }>();
  const isEditing = paramId(params.from) === 'edit';
  const goPrevious = useWizardBack(() => {
    wizardBack(isEditing ? PROVIDER_SERVICE_TAB : (ONBOARDING_LOCATION as never));
  });
  const transport = draft.transport ?? provider?.transport;
  const driverName = (
    transport?.driverName ||
    draft.business.ownerName ||
    provider?.ownerName ||
    draft.personal.name ||
    ''
  ).trim();

  const existing = useMemo(
    () =>
      vehicles.find((item) => sameReg(item.registrationNumber, transport?.registrationNumber)) ??
      (vehicles.length === 1 ? vehicles[0] : undefined),
    [vehicles, transport?.registrationNumber],
  );

  // Load the saved vehicle (seats, amenities, extra photos) when resuming signup.
  useEffect(() => {
    if (isEditing || vehicles.length || !provider?.id) return;
    let alive = true;
    providerService
      .getProviderVehicles()
      .then((list) => {
        if (alive && list.length) useProviderStore.setState({ vehicles: list });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [isEditing, vehicles.length, provider?.id]);

  const initialClass = (transport?.vehicleClass ?? transport?.vehicleTypes?.[0] ?? 'van') as string;
  const [form, setForm] = useProviderFormDraft('vehicleStep.form', {
    vehicleClass: initialClass,
    vehicleModel: transport?.vehicleModel ?? '',
    vehicleMakeYear: transport?.vehicleMakeYear ?? '',
    registrationNumber: transport?.registrationNumber ?? '',
    engineNumber: transport?.engineNumber ?? '',
    ownedByMe: !transport?.ownerName || transport.ownerName.trim() === driverName,
    ownerName: transport?.ownerName ?? '',
    licenseNumber: transport?.driverLicenseNumber ?? '',
    insuranceCompany: transport?.insuranceCompany ?? '',
    insuranceNumber: transport?.insuranceNumber ?? '',
    insuranceYear: transport?.insuranceYear ?? '',
    seats: existing?.totalSeats ? String(existing.totalSeats) : '',
    amenities: existing?.amenities ?? ([] as string[]),
  });
  const [driver, setDriver] = useProviderFormDraft('vehicleStep.driver', {
    driverPhone: transport?.driverPhone ?? '',
    driverPermanentAddress: transport?.driverPermanentAddress ?? '',
    driverEmergencyContact: transport?.driverEmergencyContact ?? '',
    driverExperienceYears: transport?.driverExperienceYears ?? '',
  });
  const [photos, setPhotos] = useProviderFormDraft<string[]>('vehicleStep.photos', [
    transport?.vehicleImageFront || existing?.images[0] || '',
    transport?.vehicleImageBack || existing?.images[1] || '',
    ...(existing?.images.slice(2) ?? []),
  ]);

  // When the saved vehicle arrives after first render, fill seats/amenities/extra photos once.
  useEffect(() => {
    if (!existing) return;
    setForm((prev) => ({
      ...prev,
      seats: prev.seats || (existing.totalSeats ? String(existing.totalSeats) : ''),
      amenities: prev.amenities.length ? prev.amenities : existing.amenities ?? [],
    }));
    setPhotos((prev) =>
      prev.slice(2).some(Boolean) ? prev : [prev[0] || existing.images[0] || '', prev[1] || existing.images[1] || '', ...existing.images.slice(2)],
    );
    // Only when a different vehicle record is found.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  const [uploading, setUploading] = useState<number | null>(null);
  const [removingImage, setRemovingImage] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const busy = saving || advancing || uploading !== null;

  const patch = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const seatsNumber = Number(form.seats) || 0;
  const setSeats = (next: number) =>
    patch('seats', String(Math.max(1, Math.min(MAX_SEATS, next))));

  const chooseClass = (vehicleClass: string) => {
    setForm((prev) => ({
      ...prev,
      vehicleClass,
      // Suggest a seat count for the new type unless the driver already set one.
      seats: prev.seats ? prev.seats : String(DEFAULT_SEATS[vehicleClass] ?? 4),
    }));
  };

  const toggleAmenity = (key: string) =>
    patch(
      'amenities',
      form.amenities.includes(key)
        ? form.amenities.filter((item) => item !== key)
        : [...form.amenities, key],
    );

  const pickImage = async (slot: number) => {
    if (busy || removingImage) return;
    try {
      setUploading(slot);
      const picked = await uploadService.pickImages(1);
      if (!picked.length) return;
      const uploaded = await uploadService.uploadImages(picked, 'vehicles');
      const url = uploaded[0]?.url;
      if (!url) return;
      setPhotos((prev) => {
        const next = [...prev];
        while (next.length < 2) next.push('');
        if (slot >= 2) next.push(url);
        else next[slot] = url;
        return next;
      });
    } catch (error) {
      Alert.alert('Upload failed', getApiErrorMessage(error));
    } finally {
      setUploading(null);
    }
  };

  const extraPhotos = photos.slice(2).filter(Boolean);

  const onContinue = async () => {
    if (busy || removingImage) return;
    const model = form.vehicleModel.trim();
    const registrationNumber = form.registrationNumber.trim().toUpperCase();
    const ownerName = form.ownedByMe ? driverName : form.ownerName.trim();

    const missing = [
      [model, 'Vehicle model'],
      [form.vehicleMakeYear.trim(), 'Model year'],
      [registrationNumber, 'Registration number'],
      [form.engineNumber.trim(), 'Engine number'],
      [ownerName, 'Registered owner'],
      [form.licenseNumber.trim(), 'Driving licence number'],
      [form.insuranceCompany, 'Insurance company'],
      [form.insuranceNumber.trim(), 'Insurance policy number'],
      [form.insuranceYear.trim(), 'Insurance valid until'],
    ].filter(([value]) => !value);
    if (missing.length) {
      Alert.alert('A few details missing', missing.map(([, label]) => `• ${label}`).join('\n'));
      return;
    }
    if (!isEditing && seatsNumber < 1) {
      Alert.alert('Passenger seats', 'Set how many passengers your vehicle can carry.');
      return;
    }
    if (!photos[0] || !photos[1]) {
      Alert.alert('Vehicle photos', 'Add a front and a back photo of your vehicle. The number plate should be readable.');
      return;
    }

    const driverPatch = isEditing
      ? {
          driverPhone: driver.driverPhone.trim(),
          driverPermanentAddress: driver.driverPermanentAddress.trim(),
          driverEmergencyContact: driver.driverEmergencyContact.trim(),
          driverExperienceYears: driver.driverExperienceYears.trim(),
        }
      : {};
    const details: Partial<ProviderTransportSetup> = {
      ...transport,
      ...driverPatch,
      businessName: driverName || transport?.businessName,
      driverName: driverName || transport?.driverName,
      vehicleClass: form.vehicleClass as VehicleClass,
      vehicleTypes: [form.vehicleClass],
      vehicleCount: 1,
      ownershipType: 'owned',
      ownerName,
      vehicleModel: model,
      vehicleMakeYear: form.vehicleMakeYear.trim(),
      engineNumber: form.engineNumber.trim().toUpperCase(),
      registrationNumber,
      driverLicenseNumber: form.licenseNumber.trim().toUpperCase(),
      hasInsurance: 'yes',
      insuranceCompany: form.insuranceCompany,
      insuranceNumber: form.insuranceNumber.trim(),
      insuranceYear: form.insuranceYear.trim(),
      vehicleImageFront: photos[0],
      vehicleImageBack: photos[1],
      // Fares are set per trip; keep any saved pricing, otherwise start as negotiable.
      pricingMethod: transport?.pricingMethod ?? 'negotiable',
    };

    // Driver details belong to step 1. If any are missing (an older signup), send them back there.
    const missingDriver = DRIVER_FIELDS.filter(([key]) => !String(details[key] ?? '').trim());
    if (missingDriver.length && !isEditing) {
      Alert.alert(
        'Finish your details first',
        `Step 1 is missing: ${missingDriver.map(([, label]) => label).join(', ')}.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Go to step 1', onPress: () => router.push('/(provider)/register/business') },
        ],
      );
      return;
    }
    const verificationError = vehicleVerificationError(details);
    if (verificationError) {
      Alert.alert('Check your details', verificationError);
      return;
    }

    setTransport(details);
    try {
      setAdvancing(true);
      await saveProgress();
      if (isEditing) {
        clearDrafts();
        leaveProviderEditor(user);
        return;
      }
      const store = useProviderStore.getState();
      // 1) Confirms the vehicle + driver details and creates/updates the vehicle record.
      await store.checkpoint('transport');
      const list = await providerService.getProviderVehicles();
      const vehicle =
        list.find((item) => sameReg(item.registrationNumber, registrationNumber)) ?? list[0];
      if (!vehicle) throw new Error('Your vehicle could not be saved. Please try again.');
      // 2) Adds what only the vehicle record holds: seats, amenities and the full gallery.
      const saved = await providerService.updateVehicle(vehicle.id, {
        name: `${model} (${registrationNumber})`,
        type: form.vehicleClass as never,
        model,
        year: Number(form.vehicleMakeYear),
        registrationNumber,
        totalSeats: seatsNumber,
        amenities: form.amenities,
        images: photos.filter(Boolean),
        verificationDetails: details as ProviderTransportSetup,
      });
      useProviderStore.setState({
        vehicles: [...list.filter((item) => item.id !== saved.id), saved],
      });
      // 3) Marks the vehicle step done so signup resumes at the CNIC step.
      await store.checkpoint('vehicle', saved.id);
      clearDrafts();
      router.push(nextAfterTransport(draft.selectedServices) as never);
    } catch (error) {
      Alert.alert('Could not save', getApiErrorMessage(error));
    } finally {
      setAdvancing(false);
    }
  };

  function clearDrafts() {
    const store = useProviderStore.getState();
    for (const key of Object.keys(store.formDrafts)) {
      if (key.startsWith('vehicleStep.') || key.startsWith('transport.') || key.startsWith('vehicle.primary'))
        store.clearFormDraft(key);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title={isEditing ? 'Vehicle & driver details' : 'Your vehicle'}
        showBack
        fallbackHref={isEditing ? PROVIDER_SERVICE_TAB : (ONBOARDING_LOCATION as never)}
        onBack={goPrevious}
      />
      <ScrollView
        contentContainerStyle={{
          padding: Spacing.lg,
          paddingBottom: insets.bottom + 40,
          gap: Spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {!isEditing ? <TransportSignupSteps current={3} hint="Keep your registration book handy" /> : null}
        <View style={{ gap: Spacing.xs }}>
          <Text style={styles.heading}>The vehicle you drive</Text>
          <Text style={styles.sub}>
            Travellers see the type, seats, amenities and photos. Registration, engine and insurance numbers are only seen by the Banjara team.
          </Text>
        </View>

        {/* ---- Type ---- */}
        <Text style={styles.section}>Vehicle type</Text>
        <View style={styles.typeGrid}>
          {VEHICLE_TYPE_OPTIONS.map((option) => {
            const active = form.vehicleClass === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => chooseClass(option.value)}
                style={[styles.typeChip, active && styles.typeChipActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Ionicons
                  name={VEHICLE_ICONS[option.value] ?? 'car-outline'}
                  size={22}
                  color={active ? Colors.primary : Colors.muted}
                />
                <Text style={[styles.typeLabel, active && styles.typeLabelActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ---- Identity ---- */}
        <Text style={styles.section}>From your registration book</Text>
        <Input
          label="Make & model"
          placeholder="e.g. Toyota Hiace"
          value={form.vehicleModel}
          onChangeText={(v) => patch('vehicleModel', v)}
        />
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Input
              label="Model year"
              keyboardType="number-pad"
              placeholder="2019"
              maxLength={4}
              value={form.vehicleMakeYear}
              onChangeText={(v) => patch('vehicleMakeYear', v.replace(/\D/g, ''))}
            />
          </View>
          <View style={styles.rowItem}>
            <Input
              label="Registration no."
              placeholder="LEA-1234"
              autoCapitalize="characters"
              value={form.registrationNumber}
              onChangeText={(v) => patch('registrationNumber', v)}
            />
          </View>
        </View>
        <Input
          label="Engine number"
          autoCapitalize="characters"
          value={form.engineNumber}
          onChangeText={(v) => patch('engineNumber', v)}
        />
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Registered in my name</Text>
            <Text style={styles.switchHint}>
              {form.ownedByMe ? driverName || 'Your name from step 1' : 'Enter the owner’s name below'}
            </Text>
          </View>
          <Switch value={form.ownedByMe} onValueChange={(v) => patch('ownedByMe', v)} />
        </View>
        {!form.ownedByMe ? (
          <Input
            label="Registered owner’s name"
            value={form.ownerName}
            onChangeText={(v) => patch('ownerName', v)}
          />
        ) : null}
        <Input
          label="Your driving licence number"
          autoCapitalize="characters"
          placeholder="As on your licence card"
          value={form.licenseNumber}
          onChangeText={(v) => patch('licenseNumber', v)}
        />

        {/* ---- Seats & amenities (signup only; later edited from My vehicle) ---- */}
        {!isEditing ? (
          <>
            <Text style={styles.section}>Passengers & comfort</Text>
            <View style={styles.seatCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Passenger seats</Text>
                <Text style={styles.switchHint}>Not counting the driver</Text>
              </View>
              <Pressable
                onPress={() => setSeats(seatsNumber - 1)}
                style={[styles.stepBtn, seatsNumber <= 1 && { opacity: 0.4 }]}
                disabled={seatsNumber <= 1}
                accessibilityLabel="One seat less"
              >
                <Ionicons name="remove" size={20} color={Colors.primary} />
              </Pressable>
              <Text style={styles.seatValue}>{seatsNumber || '–'}</Text>
              <Pressable
                onPress={() => setSeats(seatsNumber ? seatsNumber + 1 : DEFAULT_SEATS[form.vehicleClass] ?? 4)}
                style={styles.stepBtn}
                accessibilityLabel="One seat more"
              >
                <Ionicons name="add" size={20} color={Colors.primary} />
              </Pressable>
            </View>
            <View style={styles.amenityWrap}>
              {AMENITIES.map((item) => {
                const active = form.amenities.includes(item.key);
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => toggleAmenity(item.key)}
                    style={[styles.amenity, active && styles.amenityActive]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                  >
                    <Ionicons name={item.icon} size={16} color={active ? Colors.primary : Colors.muted} />
                    <Text style={[styles.amenityLabel, active && { color: Colors.primary }]}>{item.key}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {/* ---- Insurance ---- */}
        <Text style={styles.section}>Insurance</Text>
        <View style={styles.notice}>
          <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
          <Text style={styles.noticeText}>Every vehicle on Banjara must be insured.</Text>
        </View>
        <SearchSelect
          label="Insurance company"
          placeholder="Select insurer"
          value={form.insuranceCompany}
          options={INSURANCE_COMPANY_OPTIONS}
          searchable
          leftIcon="business-outline"
          onChange={(v) => patch('insuranceCompany', v)}
        />
        <View style={styles.row}>
          <View style={[styles.rowItem, { flex: 1.4 }]}>
            <Input
              label="Policy number"
              value={form.insuranceNumber}
              onChangeText={(v) => patch('insuranceNumber', v)}
            />
          </View>
          <View style={styles.rowItem}>
            <Input
              label="Valid until (year)"
              keyboardType="number-pad"
              placeholder={String(new Date().getFullYear())}
              maxLength={4}
              value={form.insuranceYear}
              onChangeText={(v) => patch('insuranceYear', v.replace(/\D/g, ''))}
            />
          </View>
        </View>

        {/* ---- Photos ---- */}
        <Text style={styles.section}>Photos</Text>
        <View style={styles.row}>
          {[0, 1].map((slot) => (
            <View key={slot} style={styles.rowItem}>
              <ImagePickerField
                label={slot === 0 ? 'Front' : 'Back'}
                urls={photos[slot] ? [photos[slot]] : []}
                max={1}
                uploading={uploading === slot}
                disabled={busy || removingImage}
                onRemovingChange={setRemovingImage}
                onAdd={() => void pickImage(slot)}
                onRemove={() =>
                  setPhotos((prev) => {
                    const next = [...prev];
                    next[slot] = '';
                    return next;
                  })
                }
              />
            </View>
          ))}
        </View>
        <Text style={styles.fine}>Number plate clearly visible in both.</Text>
        {!isEditing ? (
          <ImagePickerField
            label="Inside & more (optional)"
            urls={extraPhotos}
            max={3}
            uploading={uploading !== null && uploading >= 2}
            disabled={busy || removingImage}
            onRemovingChange={setRemovingImage}
            onAdd={() => void pickImage(2)}
            onRemove={(index) =>
              setPhotos((prev) => [prev[0] ?? '', prev[1] ?? '', ...prev.slice(2).filter(Boolean).filter((_, i) => i !== index)])
            }
          />
        ) : null}

        {/* ---- Driver details: only when editing after signup (step 1 asks them during signup) ---- */}
        {isEditing ? (
          <>
            <Text style={styles.section}>Driver details</Text>
            <Input label="Phone" keyboardType="phone-pad" value={driver.driverPhone} onChangeText={(v) => setDriver((p) => ({ ...p, driverPhone: v }))} />
            <Input label="Home address" multiline value={driver.driverPermanentAddress} onChangeText={(v) => setDriver((p) => ({ ...p, driverPermanentAddress: v }))} />
            <Input label="Experience (years)" keyboardType="number-pad" value={driver.driverExperienceYears} onChangeText={(v) => setDriver((p) => ({ ...p, driverExperienceYears: v }))} />
            <Input label="Emergency contact" keyboardType="phone-pad" value={driver.driverEmergencyContact} onChangeText={(v) => setDriver((p) => ({ ...p, driverEmergencyContact: v }))} />
          </>
        ) : null}

        <Button
          title={isEditing ? 'Save changes' : 'Save vehicle & continue'}
          onPress={() => void onContinue()}
          disabled={removingImage}
          loading={busy}
        />
        {!isEditing ? (
          <Text style={[styles.fine, { textAlign: 'center' }]}>
            You set the fare for each trip after approval, when you create your first ride.
          </Text>
        ) : null}
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
  row: { flexDirection: 'row', gap: Spacing.sm },
  rowItem: { flex: 1 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeChip: {
    width: '31.5%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  typeChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  typeLabel: { fontFamily: Fonts.body, fontSize: 13, color: Colors.muted },
  typeLabelActive: { fontFamily: Fonts.bodySemiBold, color: Colors.primary },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  switchLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.dark },
  switchHint: { fontFamily: Fonts.body, fontSize: 12, color: Colors.muted, marginTop: 2 },
  seatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  seatValue: { fontFamily: Fonts.bodySemiBold, fontSize: 18, color: Colors.dark, minWidth: 28, textAlign: 'center' },
  amenityWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  amenity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  amenityActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  amenityLabel: { fontFamily: Fonts.body, fontSize: 13, color: Colors.dark },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySoft,
  },
  noticeText: { ...Typography.caption, color: Colors.dark, flex: 1 },
  fine: { ...Typography.caption, color: Colors.muted, marginTop: -Spacing.sm },
});

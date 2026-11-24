import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { DatePickerModal } from '@/components/ui/DatePickerModal';
import { Header } from '@/components/ui/Header';
import { ImagePickerField } from '@/components/ui/ImagePickerField';
import { Input } from '@/components/ui/Input';
import { PlaceAutocompleteSelect } from '@/components/ui/PlaceAutocompleteSelect';
import { Chips, Counted, Section, Tags } from '@/components/provider/SignupBits';
import { Colors } from '@/constants/colors';
import { GUIDE_TYPE_OPTIONS, WEEKDAY_LABELS } from '@/constants/guideOptions';
import { Radius, Spacing } from '@/constants/spacing';
import { TRIP_CITY_OPTIONS } from '@/constants/tripPlaces';
import { Fonts, Typography } from '@/constants/typography';
import { getApiErrorMessage } from '@/services/apiError';
import * as guideService from '@/services/guideService';
import * as uploadService from '@/services/uploadService';
import { useAuthStore } from '@/store/authStore';
import { useProviderStore } from '@/store/providerStore';
import type {
  GuideDetails,
  GuideDocument,
  GuideDocumentType,
  GuideLanguage,
  GuideOfferedService,
  GuidePricingType,
  GuideType,
  LanguageProficiency,
  Weekday,
} from '@/types/guide';
import { defaultGuideAvailability, emptyGuideDetails, newGuideId } from '@/utils/guideDraft';
import {
  ONBOARDING_LOCATION,
  PROVIDER_SERVICE_TAB,
  leaveProviderEditor,
  paramId,
  useWizardBack,
  wizardBack,
} from '@/utils/navigation';

/* ------------------------------------------------------------------ */
/* Steps: the same four tabs as the website (CNIC and Review follow).  */
/* ------------------------------------------------------------------ */

const STEPS = ['profile', 'services', 'schedule', 'photos'] as const;
type Step = (typeof STEPS)[number];
const STEP_LABELS: Record<Step, string> = {
  profile: 'Profile',
  services: 'Services',
  schedule: 'Availability',
  photos: 'Photos',
};
const TITLES: Record<Step, string> = {
  profile: 'Your guide profile',
  services: 'Services & prices',
  schedule: 'When you’re available',
  photos: 'Photos & documents',
};
const SUBTITLES: Record<Step, string> = {
  profile: 'This is what travellers read before they hire you. A clear photo and a friendly bio make the biggest difference.',
  services: 'Add what travellers can book — a city walk, a day trek, a photo tour. Or just set a daily rate.',
  schedule: 'Travellers can only book you on these days and hours. You can change them any time.',
  photos: 'Photos of your trips help travellers picture the day. Certificates are optional but earn trust.',
};
/** Old dashboard links used the 9-step numbers (6 = services, 7 = availability). */
const LEGACY_STEP: Record<string, Step> = { '1': 'profile', '3': 'profile', '4': 'profile', '5': 'photos', '6': 'services', '7': 'schedule', '8': 'photos' };

const AREAS = ['Hunza', 'Gilgit', 'Skardu', 'Nagar', 'Fairy Meadows', 'Naltar', 'Khunjerab', 'Ghizer', 'Astore', 'Chitral', 'Swat', 'Naran'];
const LANGUAGES = ['Urdu', 'English', 'Burushaski', 'Shina', 'Wakhi', 'Balti', 'Khowar', 'Pashto', 'Punjabi', 'Chinese'];
const LEVELS: { value: LanguageProficiency; label: string }[] = [
  { value: 'basic', label: 'Basic' },
  { value: 'conversational', label: 'Good' },
  { value: 'fluent', label: 'Fluent' },
  { value: 'native', label: 'Native' },
];
const PRICING: { value: GuidePricingType; label: string; sub: string }[] = [
  { value: 'per_person', label: 'Per person', sub: 'Each traveller pays' },
  { value: 'per_group', label: 'Per group', sub: 'One price for the group' },
  { value: 'per_day', label: 'Per day', sub: 'A fixed price each day' },
  { value: 'per_hour', label: 'Per hour', sub: 'Charged by the hour' },
];
const PRICING_SHORT: Record<string, string> = { per_person: 'per person', per_group: 'per group', per_day: 'per day', per_hour: 'per hour', custom: '' };
const DURATIONS = [
  { label: '2 hours', hours: 2 },
  { label: 'Half day', hours: 4 },
  { label: 'Full day', hours: 8 },
  { label: '2 days', hours: 16 },
  { label: '3+ days', hours: 24 },
];
const NOTICE = [
  { hours: 0, label: 'Same day' },
  { hours: 12, label: '12 hours' },
  { hours: 24, label: '1 day' },
  { hours: 48, label: '2 days' },
];
const DOCS: { type: GuideDocumentType; label: string; hint: string }[] = [
  { type: 'guide_license', label: 'Guide licence', hint: 'From the tourism department' },
  { type: 'tourism_cert', label: 'Tourism certificate', hint: 'Courses or training you’ve done' },
  { type: 'first_aid', label: 'First aid', hint: 'Any first-aid card or certificate' },
];
const WEEK: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TYPE_LABEL = Object.fromEntries(GUIDE_TYPE_OPTIONS.map((t) => [t.value, t.label])) as Record<string, string>;
const MAX_PHOTOS = 12;

const isTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const rupees = (value: number) => `Rs ${Math.round(value).toLocaleString('en-PK')}`;
const validPhone = (value?: string) => /^\+?\d{10,15}$/.test((value ?? '').replace(/[\s()-]/g, ''));

/* What each tab needs — the same rules as the website. */
function profileMissing(d: GuideDetails): string[] {
  const missing: string[] = [];
  if (!d.fullName?.trim()) missing.push('your name');
  if (!validPhone(d.phone)) missing.push('a valid phone number');
  if (!d.profilePhoto) missing.push('a profile photo');
  if (!d.guideTypes?.length) missing.push('the kind of guiding you do');
  if (!d.areasCovered?.length) missing.push('areas you cover');
  if (!d.languages?.some((l) => l.language.trim())) missing.push('languages you speak');
  if ((d.shortBio ?? '').trim().length < 30) missing.push('a short bio (30+ characters)');
  return missing;
}
function servicesMissing(d: GuideDetails): string[] {
  return (d.services ?? []).some((s) => s.active !== false) || (d.dailyHireRate ?? 0) > 0 ? [] : ['at least one service or a daily rate'];
}
function scheduleMissing(d: GuideDetails): string[] {
  const days = (d.availability?.weekly ?? []).filter((day) => day.enabled);
  if (!days.length) return ['at least one day you can guide'];
  const bad = days.find((day) => !isTime(day.startTime) || !isTime(day.endTime) || day.endTime <= day.startTime);
  return bad ? [`valid hours for ${WEEKDAY_LABELS[bad.day]} (e.g. 09:00 to 18:00)`] : [];
}
const MISSING: Record<Step, (d: GuideDetails) => string[]> = {
  profile: profileMissing,
  services: servicesMissing,
  schedule: scheduleMissing,
  photos: () => [],
};

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

type ServiceDraft = {
  id?: string;
  name: string;
  /** Kept from a saved service; new services use the type chosen on the profile step. */
  category?: GuideType;
  description: string;
  durationLabel: string;
  durationHours?: number;
  price: string;
  pricingType: GuidePricingType;
  maxGuests: string;
  included: string[];
};
const blankService = (): ServiceDraft => ({
  name: '',
  description: '',
  durationLabel: 'Full day',
  durationHours: 8,
  price: '',
  pricingType: 'per_person',
  maxGuests: '8',
  included: [],
});

/** Words for one-tap service names, from the guide's own types ("Hunza day tour", "Nagar trek"). */
const NAME_WORD: Record<GuideType, string> = {
  local: 'day tour',
  tour: 'guided tour',
  trekking: 'trek',
  hiking: 'hike',
  cultural: 'culture & history walk',
  adventure: 'adventure day',
  mountain: 'mountain expedition',
  photography: 'photo tour',
  other: 'tour',
};
const INCLUDED_IDEAS = ['Entry tickets', 'Tea & snacks', 'Lunch', 'Transport', 'Photos of your trip', 'Trekking poles'];

function nameIdeas(d: GuideDetails) {
  const taken = (d.services ?? []).map((s) => s.name.toLowerCase());
  const areas = (d.areasCovered ?? []).slice(0, 3);
  const types = (d.guideTypes?.length ? d.guideTypes : (['local'] as GuideType[])).slice(0, 2);
  return areas
    .flatMap((area) => types.map((t) => `${area} ${NAME_WORD[t]}`))
    .filter((idea) => !taken.includes(idea.toLowerCase()))
    .slice(0, 4);
}

export default function GuideOnboardingScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const params = useLocalSearchParams<{ from?: string | string[]; step?: string | string[] }>();
  const isEditing = paramId(params.from) === 'edit';
  const requested = paramId(params.step);
  const initialStep: Step = (STEPS as readonly string[]).includes(requested)
    ? (requested as Step)
    : LEGACY_STEP[requested] ?? 'profile';

  const draft = useProviderStore((s) => s.draft);
  const provider = useProviderStore((s) => s.provider);
  const setGuide = useProviderStore((s) => s.setGuide);
  const saveProgress = useProviderStore((s) => s.saveProgress);
  const setProvider = useProviderStore((s) => s.setProvider);

  const [step, setStep] = useState<Step>(initialStep);
  const [details, setDetails] = useState<GuideDetails>(() =>
    emptyGuideDetails({
      fullName: draft.business.ownerName || draft.personal.name || user?.name,
      phone: draft.business.phone || draft.personal.phone || user?.phone,
      email: draft.business.email || draft.personal.email || user?.email,
      city: draft.location?.address.city || draft.business.city,
      country: 'Pakistan',
    }),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [removingImage, setRemovingImage] = useState(false);
  const [editAccount, setEditAccount] = useState(false);
  const [otherLanguage, setOtherLanguage] = useState('');
  const [serviceForm, setServiceForm] = useState<ServiceDraft | null>(null);
  const [serviceError, setServiceError] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const patch = (next: Partial<GuideDetails>) => setDetails((d) => ({ ...d, ...next }));
  const busy = saving || Boolean(uploading) || removingImage;
  const index = STEPS.indexOf(step);

  const goPrevious = useWizardBack(() => {
    if (index > 0) {
      setStep(STEPS[index - 1]);
      return;
    }
    wizardBack(isEditing ? PROVIDER_SERVICE_TAB : (ONBOARDING_LOCATION as never));
  });

  useEffect(() => {
    let live = true;
    (async () => {
      // Guide profile APIs need an existing provider; during signup it is created on the location step.
      if (!isEditing && !(user?.providerId || provider?.id)) {
        router.replace(ONBOARDING_LOCATION as never);
        return;
      }
      const hydrate = (guide?: GuideDetails | null) => {
        if (!guide) return;
        setDetails((prev) => ({
          ...prev,
          ...guide,
          fullName: guide.fullName || prev.fullName,
          phone: guide.phone || prev.phone,
          email: guide.email || prev.email,
          city: guide.city || prev.city,
          availability: guide.availability?.weekly?.length ? guide.availability : prev.availability ?? defaultGuideAvailability(),
        }));
      };
      try {
        const mine = await guideService.getMyProfile();
        if (live) hydrate(mine.guideDetails ?? provider?.guideDetails ?? (draft.guide as GuideDetails));
      } catch {
        if (live) hydrate(provider?.guideDetails ?? (draft.guide as GuideDetails));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
    // Load once when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upload = async (slot: string, count = 1) => {
    setUploading(slot);
    try {
      const picked = await uploadService.pickImages(count);
      if (!picked.length) return [] as string[];
      const uploaded = await uploadService.uploadImages(picked, 'guides');
      return uploaded.map((item) => item.url);
    } catch (error) {
      Alert.alert('Upload failed', getApiErrorMessage(error));
      return [] as string[];
    } finally {
      setUploading(null);
    }
  };

  /** Saves the profile (submit = send for review), keeping the app's draft in step. */
  const persist = async (next: Partial<GuideDetails>, submit = false) => {
    const savedPatch = { ...next, documents: next.documents?.filter((d) => Boolean(d.fileUrl)) };
    setGuide(savedPatch);
    const res = await guideService.updateProfile(savedPatch, { submit });
    setDetails((prev) => ({ ...prev, ...res.guideDetails }));
    setGuide(res.guideDetails);
    await saveProgress();
    const refreshed = await guideService.refreshProviderAfterGuide();
    if (refreshed) setProvider(refreshed);
  };

  const onContinue = async () => {
    if (busy) return;
    if (step === 'services' && serviceForm?.name.trim()) {
      Alert.alert('Unsaved service', 'Add or cancel the service you are editing first.');
      return;
    }
    const missing = MISSING[step](details);
    if (missing.length) {
      Alert.alert('A few things missing', missing.map((m) => `• ${m}`).join('\n'));
      return;
    }
    const last = index === STEPS.length - 1;
    try {
      setSaving(true);
      await persist(details, last);
      if (!last) {
        setStep(STEPS[index + 1]);
        return;
      }
      if (isEditing) {
        leaveProviderEditor(user);
        return;
      }
      // Then the CNIC step (skippable for now) and the final Review & submit.
      router.push('/(provider)/register/verification');
    } catch (error) {
      Alert.alert('Could not save', getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  /* ---------- profile helpers ---------- */
  const toggle = <T,>(list: T[] = [], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  const hasLanguage = (name: string) => (details.languages ?? []).some((l) => l.language.toLowerCase() === name.toLowerCase());
  const addLanguage = (name: string) => {
    const clean = name.trim();
    if (!clean || hasLanguage(clean)) return;
    patch({ languages: [...(details.languages ?? []), { language: clean, proficiency: 'conversational' }] });
  };
  const setLanguage = (i: number, next: Partial<GuideLanguage>) =>
    patch({ languages: (details.languages ?? []).map((l, j) => (j === i ? { ...l, ...next } : l)) });
  const addArea = (name: string) => {
    const clean = name.trim();
    if (clean && !(details.areasCovered ?? []).some((a) => a.toLowerCase() === clean.toLowerCase()))
      patch({ areasCovered: [...(details.areasCovered ?? []), clean] });
  };

  /* ---------- services helpers ---------- */
  const commitService = () => {
    if (!serviceForm) return;
    const price = Number(serviceForm.price);
    const max = Number(serviceForm.maxGuests);
    if (serviceForm.name.trim().length < 3) return setServiceError('Give the service a name, e.g. “Hunza valley day tour”.');
    if (!Number.isFinite(price) || price <= 0) return setServiceError('Enter a price in rupees.');
    if (!Number.isInteger(max) || max < 1 || max > 50) return setServiceError('Group size must be between 1 and 50.');
    const service: GuideOfferedService = {
      id: serviceForm.id ?? newGuideId('svc'),
      name: serviceForm.name.trim(),
      // The type was chosen once, on the profile step.
      category: serviceForm.category ?? details.guideTypes?.[0] ?? 'local',
      description: serviceForm.description.trim(),
      durationLabel: serviceForm.durationLabel || 'Full day',
      durationHours: serviceForm.durationHours,
      price,
      pricingType: serviceForm.pricingType,
      currency: 'PKR',
      minGuests: 1,
      maxGuests: max,
      included: serviceForm.included,
      excluded: [],
      availableLocations: details.areasCovered ?? [],
      active: true,
    };
    const list = details.services ?? [];
    patch({ services: list.some((s) => s.id === service.id) ? list.map((s) => (s.id === service.id ? service : s)) : [...list, service] });
    setServiceForm(null);
    setServiceError('');
  };

  /* ---------- availability helpers ---------- */
  const weekly = details.availability?.weekly ?? defaultGuideAvailability().weekly;
  const availability = details.availability ?? defaultGuideAvailability();
  const setDay = (day: Weekday, next: Partial<{ enabled: boolean; startTime: string; endTime: string }>) =>
    patch({ availability: { ...availability, weekly: weekly.map((d) => (d.day === day ? { ...d, ...next } : d)) } });
  const preset = (days: Weekday[]) =>
    patch({ availability: { ...availability, weekly: weekly.map((d) => ({ ...d, enabled: days.includes(d.day) })) } });

  /* ---------- documents helpers ---------- */
  const docFor = (type: GuideDocumentType) => (details.documents ?? []).find((d) => d.type === type);
  const setDoc = (type: GuideDocumentType, next: Partial<GuideDocument>) => {
    const docs = details.documents ?? [];
    const existing = docs.find((d) => d.type === type);
    patch({
      documents: existing
        ? docs.map((d) => (d.type === type ? { ...d, ...next } : d))
        : [...docs, { id: newGuideId('doc'), type, fileUrl: '', status: 'pending', ...next }],
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 40, alignItems: 'center' }]}>
        <Text style={styles.sub}>Loading your guide profile…</Text>
      </View>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header
        title={isEditing ? 'Edit guide profile' : 'Travel guide setup'}
        showBack
        fallbackHref={isEditing ? PROVIDER_SERVICE_TAB : (ONBOARDING_LOCATION as never)}
        onBack={goPrevious}
      />
      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 40, gap: Spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress: tap a finished tab to go back to it */}
        <View style={{ gap: Spacing.sm }}>
          <Text style={styles.stepCount}>
            Step {index + 1} of {STEPS.length}
            {isEditing ? '' : ' · then CNIC and review'}
          </Text>
          <View style={styles.bar}>
            {STEPS.map((s, i) => {
              const done = i < index;
              const active = i === index;
              return (
                <Pressable
                  key={s}
                  style={styles.segment}
                  disabled={i >= index || busy}
                  onPress={() => setStep(s)}
                  accessibilityRole="button"
                  accessibilityLabel={`${STEP_LABELS[s]}${done ? ', done' : active ? ', current step' : ''}`}
                >
                  <View style={[styles.track, (done || active) && { backgroundColor: Colors.primary }]} />
                  <View style={styles.segLabelRow}>
                    {done ? <Ionicons name="checkmark-circle" size={13} color={Colors.success} /> : null}
                    <Text numberOfLines={1} style={[styles.segLabel, active && styles.segLabelActive, done && { color: Colors.dark }]}>
                      {STEP_LABELS[s]}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: Spacing.xs }}>
          <Text style={styles.heading}>{TITLES[step]}</Text>
          <Text style={styles.sub}>{SUBTITLES[step]}</Text>
        </View>

        {details.profileStatus === 'changes_requested' ? (
          <View style={[styles.notice, styles.noticeWarn]}>
            <Ionicons name="create-outline" size={18} color={Colors.warning} />
            <Text style={styles.noticeText}>{details.changesRequestedNote || 'BANJARA asked for a few changes. Update your profile and submit it again.'}</Text>
          </View>
        ) : null}

        {/* ============================ 1 · PROFILE ============================ */}
        {step === 'profile' ? (
          <>
            {editAccount || !details.fullName || !validPhone(details.phone) ? (
              <View style={{ gap: Spacing.md }}>
                <Input label="Full name (as on your CNIC)" value={details.fullName ?? ''} onChangeText={(v) => patch({ fullName: v })} />
                <Input label="Phone" keyboardType="phone-pad" value={details.phone ?? ''} onChangeText={(v) => patch({ phone: v })} />
                <Input label="Email" keyboardType="email-address" autoCapitalize="none" value={details.email ?? ''} onChangeText={(v) => patch({ email: v })} />
              </View>
            ) : (
              <View style={styles.accountCard}>
                <Ionicons name="person-circle-outline" size={30} color={Colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{details.fullName}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[details.phone, details.email].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Pressable onPress={() => setEditAccount(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit name, phone and email">
                  <Text style={styles.link}>Edit</Text>
                </Pressable>
              </View>
            )}

            <Section n={1} title="Your photo" sub="A clear, friendly photo of your face — no sunglasses" />
            <ImagePickerField
              label="Profile photo *"
              urls={details.profilePhoto ? [details.profilePhoto] : []}
              max={1}
              uploading={uploading === 'profile'}
              disabled={busy}
              onRemovingChange={setRemovingImage}
              onAdd={() => void upload('profile').then((urls) => urls[0] && patch({ profilePhoto: urls[0] }))}
              onRemove={() => patch({ profilePhoto: '' })}
            />

            <Section n={2} title="What kind of guide are you?" sub="Choose all that fit" />
            <Chips
              options={GUIDE_TYPE_OPTIONS}
              selected={details.guideTypes ?? []}
              onToggle={(v) => patch({ guideTypes: toggle(details.guideTypes, v as GuideType) })}
            />

            <Section n={3} title="Where do you guide?" sub="Tap the places you know well, or search for others" />
            <Chips
              icon="location-outline"
              options={[...AREAS, ...(details.areasCovered ?? []).filter((a) => !AREAS.includes(a))].map((a) => ({ value: a, label: a }))}
              selected={details.areasCovered ?? []}
              onToggle={(v) => patch({ areasCovered: toggle(details.areasCovered, v) })}
            />
            <PlaceAutocompleteSelect
              label="Add another place"
              placeholder="Search any valley, town or village"
              value=""
              suggestions={TRIP_CITY_OPTIONS}
              leftIcon="add-circle-outline"
              onChange={(name) => addArea(name)}
            />
            <PlaceAutocompleteSelect
              label="Based in"
              placeholder="Your town or city"
              value={details.city ?? ''}
              suggestions={TRIP_CITY_OPTIONS}
              leftIcon="home-outline"
              onChange={(name, place) => patch({ city: place?.address.city || name })}
            />

            <Section n={4} title="Languages you speak" sub="Travellers filter guides by language" />
            <Chips
              icon="add"
              options={LANGUAGES.filter((l) => !hasLanguage(l)).map((l) => ({ value: l, label: l }))}
              selected={[]}
              onToggle={addLanguage}
            />
            {(details.languages ?? []).map((row, i) => (
              <View key={`${row.language}-${i}`} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{row.language || 'Language'}</Text>
                  <Pressable
                    hitSlop={8}
                    accessibilityLabel={`Remove ${row.language}`}
                    onPress={() => patch({ languages: (details.languages ?? []).filter((_, j) => j !== i) })}
                  >
                    <Ionicons name="close-circle" size={22} color={Colors.mutedLight} />
                  </Pressable>
                </View>
                <View style={styles.segmented}>
                  {LEVELS.map((level) => {
                    const on = row.proficiency === level.value;
                    return (
                      <Pressable
                        key={level.value}
                        style={[styles.segBtn, on && styles.segBtnOn]}
                        onPress={() => setLanguage(i, { proficiency: level.value })}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                      >
                        <Text style={[styles.segBtnText, on && styles.segBtnTextOn]}>{level.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
            <View style={styles.addRow}>
              <View style={{ flex: 1 }}>
                <Input label="Other language" placeholder="e.g. French" value={otherLanguage} onChangeText={setOtherLanguage} />
              </View>
              <Button
                title="Add"
                variant="outline"
                compact
                disabled={!otherLanguage.trim()}
                onPress={() => {
                  addLanguage(otherLanguage);
                  setOtherLanguage('');
                }}
              />
            </View>

            <Section n={5} title="About you" sub="Write like you’d introduce yourself to a traveller" />
            <Input
              label="Guiding experience (years)"
              keyboardType="number-pad"
              value={details.yearsExperience != null ? String(details.yearsExperience) : ''}
              onChangeText={(v) => patch({ yearsExperience: v ? Number(v.replace(/\D/g, '')) : undefined })}
            />
            <Counted
              label="Short bio *"
              value={details.shortBio ?? ''}
              onChange={(v) => patch({ shortBio: v })}
              max={300}
              min={30}
              placeholder="Born and raised in Karimabad. I’ve guided treks to Rakaposhi base camp for 8 years…"
            />
            <Counted
              label="More about your tours (optional)"
              value={details.detailedDescription ?? ''}
              onChange={(v) => patch({ detailedDescription: v })}
              max={1500}
              placeholder="What a typical day with you looks like, safety, gear you provide…"
            />
            <Tags label="Special skills (optional)" values={details.specialSkills ?? []} onChange={(v) => patch({ specialSkills: v })} placeholder="e.g. Glacier walks" />
            <Tags label="Certifications & training (optional)" values={details.certifications ?? []} onChange={(v) => patch({ certifications: v })} placeholder="e.g. Wilderness first aid" />
          </>
        ) : null}

        {/* ============================ 2 · SERVICES ============================ */}
        {step === 'services' ? (
          <>
            <Section n={1} title="What travellers can book" sub="Each service shows on your profile with its price" />
            {(details.services ?? []).map((s) => (
              <View key={s.id} style={styles.serviceCard}>
                <View style={styles.serviceIcon}>
                  <Ionicons name="compass-outline" size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{s.name}</Text>
                  <Text style={styles.meta}>
                    {[s.durationLabel, `up to ${s.maxGuests} guests`].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={styles.price}>
                    {rupees(s.price)} <Text style={styles.meta}>{PRICING_SHORT[s.pricingType]}</Text>
                  </Text>
                </View>
                <Pressable
                  hitSlop={8}
                  accessibilityLabel={`Edit ${s.name}`}
                  onPress={() =>
                    setServiceForm({
                      id: s.id,
                      name: s.name,
                      category: s.category,
                      description: s.description ?? '',
                      durationLabel: s.durationLabel,
                      durationHours: s.durationHours,
                      price: String(s.price),
                      pricingType: s.pricingType,
                      maxGuests: String(s.maxGuests),
                      included: s.included ?? [],
                    })
                  }
                >
                  <Ionicons name="create-outline" size={20} color={Colors.primary} />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  accessibilityLabel={`Remove ${s.name}`}
                  onPress={() => patch({ services: (details.services ?? []).filter((x) => x.id !== s.id) })}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                </Pressable>
              </View>
            ))}

            {serviceForm ? (
              <View style={styles.editor}>
                <Text style={styles.cardTitle}>{serviceForm.id ? 'Edit service' : (details.services ?? []).length ? 'Add another service' : 'Your first service'}</Text>
                {serviceError ? <Text style={styles.error}>{serviceError}</Text> : null}
                <Input
                  label="Name *"
                  placeholder="e.g. Hunza day tour"
                  value={serviceForm.name}
                  onChangeText={(v) => {
                    setServiceError('');
                    setServiceForm({ ...serviceForm, name: v });
                  }}
                />
                {!serviceForm.name.trim() && nameIdeas(details).length ? (
                  <>
                    <Text style={styles.meta}>Ideas from your profile — tap one</Text>
                    <Chips
                      icon="add"
                      options={nameIdeas(details).map((idea) => ({ value: idea, label: idea }))}
                      selected={[]}
                      onToggle={(idea) => {
                        setServiceError('');
                        setServiceForm({ ...serviceForm, name: idea });
                      }}
                    />
                  </>
                ) : null}
                <Text style={styles.fieldLabel}>How long?</Text>
                <Chips
                  icon="time-outline"
                  options={DURATIONS.map((d) => ({ value: d.label, label: d.label }))}
                  selected={[serviceForm.durationLabel]}
                  onToggle={(v) => setServiceForm({ ...serviceForm, durationLabel: v, durationHours: DURATIONS.find((d) => d.label === v)?.hours })}
                />
                <Text style={styles.fieldLabel}>How do you charge?</Text>
                <View style={styles.optionGrid}>
                  {PRICING.map((p) => {
                    const on = serviceForm.pricingType === p.value;
                    return (
                      <Pressable
                        key={p.value}
                        style={[styles.option, on && styles.optionOn]}
                        onPress={() => setServiceForm({ ...serviceForm, pricingType: p.value })}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                      >
                        <Text style={[styles.optionTitle, on && { color: Colors.primary }]}>{p.label}</Text>
                        <Text style={styles.meta}>{p.sub}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.addRow}>
                  <View style={{ flex: 1 }}>
                    <Input
                      label={`Price (Rs) ${PRICING_SHORT[serviceForm.pricingType]} *`}
                      keyboardType="number-pad"
                      placeholder="e.g. 6000"
                      value={serviceForm.price}
                      onChangeText={(v) => setServiceForm({ ...serviceForm, price: v.replace(/\D/g, '') })}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Max group size *"
                      keyboardType="number-pad"
                      value={serviceForm.maxGuests}
                      onChangeText={(v) => setServiceForm({ ...serviceForm, maxGuests: v.replace(/\D/g, '') })}
                    />
                  </View>
                </View>
                <Counted
                  label="What will travellers do? (optional)"
                  value={serviceForm.description}
                  onChange={(v) => setServiceForm({ ...serviceForm, description: v })}
                  max={600}
                  placeholder="Walk through Altit village, visit Altit Fort, lunch with a local family…"
                />
                <Tags label="Included (optional)" values={serviceForm.included} onChange={(v) => setServiceForm({ ...serviceForm, included: v })} placeholder="Your own item" />
                <Chips
                  icon="add"
                  options={INCLUDED_IDEAS.filter((i) => !serviceForm.included.includes(i)).map((i) => ({ value: i, label: i }))}
                  selected={[]}
                  onToggle={(i) => setServiceForm({ ...serviceForm, included: [...serviceForm.included, i] })}
                />
                <View style={styles.saveNote}>
                  <Ionicons name="chatbubbles-outline" size={14} color={Colors.muted} />
                  <Text style={styles.meta}>The meeting place is agreed with each traveller in chat after they book.</Text>
                </View>
                <View style={styles.addRow}>
                  {(details.services ?? []).length || serviceForm.id ? (
                    <View style={{ flex: 1 }}>
                      <Button title="Cancel" variant="outline" onPress={() => { setServiceForm(null); setServiceError(''); }} />
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Button title={serviceForm.id ? 'Update service' : 'Add service'} onPress={commitService} />
                  </View>
                </View>
              </View>
            ) : (
              <Button title={(details.services ?? []).length ? 'Add another service' : 'Add a service'} variant="outline" onPress={() => setServiceForm(blankService())} />
            )}

            <View style={styles.or}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>OR</Text>
              <View style={styles.orLine} />
            </View>

            <Section n={2} title="Daily hire rate" sub="Optional: travellers hire you for a full day and plan it with you" />
            <Input
              label="Rate per day (Rs)"
              keyboardType="number-pad"
              placeholder="e.g. 8000"
              value={details.dailyHireRate ? String(details.dailyHireRate) : ''}
              onChangeText={(v) => patch({ dailyHireRate: Number(v.replace(/\D/g, '')) || undefined })}
            />
          </>
        ) : null}

        {/* ============================ 3 · AVAILABILITY ============================ */}
        {step === 'schedule' ? (
          <>
            <Section n={1} title="Your week" sub="Turn on the days you can guide and set your hours" />
            <View style={styles.chipGrid}>
              <SmallChip label="Every day" onPress={() => preset(WEEK)} />
              <SmallChip label="Weekdays" onPress={() => preset(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])} />
              <SmallChip label="Weekends" onPress={() => preset(['saturday', 'sunday'])} />
            </View>
            {weekly.map((d) => (
              <View key={d.day} style={[styles.dayRow, !d.enabled && styles.dayOff]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{WEEKDAY_LABELS[d.day]}</Text>
                  <Switch value={d.enabled} onValueChange={(enabled) => setDay(d.day, { enabled })} />
                </View>
                {d.enabled ? (
                  <View style={styles.addRow}>
                    <TimeBox label="From" value={d.startTime} onChange={(v) => setDay(d.day, { startTime: v })} />
                    <TimeBox label="To" value={d.endTime} onChange={(v) => setDay(d.day, { endTime: v })} />
                  </View>
                ) : (
                  <Text style={styles.meta}>Not available</Text>
                )}
              </View>
            ))}

            <Section n={2} title="Booking notice" sub="How far ahead must travellers book you?" />
            <Chips
              options={NOTICE.map((n) => ({ value: String(n.hours), label: n.label }))}
              selected={[String(availability.advanceBookingHours ?? 24)]}
              onToggle={(v) => patch({ availability: { ...availability, weekly, advanceBookingHours: Number(v) } })}
            />

            <Section n={3} title="Days off (optional)" sub="Dates you already know you can’t guide" />
            <Button title="Add a day off" variant="outline" compact onPress={() => setDatePickerOpen(true)} />
            <View style={styles.chipGrid}>
              {(availability.blockedDates ?? []).map((date) => (
                <Pressable
                  key={date}
                  style={styles.tag}
                  onPress={() => patch({ availability: { ...availability, weekly, blockedDates: availability.blockedDates.filter((x) => x !== date) } })}
                  accessibilityLabel={`Remove day off ${date}`}
                >
                  <Text style={styles.tagText}>
                    {new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                  <Ionicons name="close" size={14} color={Colors.primary} />
                </Pressable>
              ))}
            </View>
            <DatePickerModal
              visible={datePickerOpen}
              title="Day off"
              value={today}
              minimumDate={new Date()}
              onClose={() => setDatePickerOpen(false)}
              onChange={(iso) => {
                const date = iso.slice(0, 10);
                if (!availability.blockedDates.includes(date))
                  patch({ availability: { ...availability, weekly, blockedDates: [...availability.blockedDates, date].sort() } });
                setDatePickerOpen(false);
              }}
            />
          </>
        ) : null}

        {/* ============================ 4 · PHOTOS ============================ */}
        {step === 'photos' ? (
          <>
            <Section n={1} title="Trip photos (optional)" sub={`Up to ${MAX_PHOTOS}: views, groups you’ve guided, you on the trail`} />
            <ImagePickerField
              label="Gallery"
              urls={(details.photos ?? []).map((p) => p.url)}
              max={MAX_PHOTOS}
              uploading={uploading === 'gallery'}
              disabled={busy}
              onRemovingChange={setRemovingImage}
              onAdd={() =>
                void upload('gallery', 3).then((urls) => {
                  if (!urls.length) return;
                  patch({
                    photos: [...(details.photos ?? []), ...urls.map((url) => ({ id: newGuideId('photo'), url, category: 'destinations' as const }))].slice(0, MAX_PHOTOS),
                  });
                })
              }
              onRemove={(i) => patch({ photos: (details.photos ?? []).filter((_, j) => j !== i) })}
            />

            <Section n={2} title="Licences & certificates (optional)" sub="Only the BANJARA team sees these. Verified guides get a badge." />
            {DOCS.map((d) => {
              const doc = docFor(d.type);
              return (
                <View key={d.type} style={styles.card}>
                  <Text style={styles.cardTitle}>{d.label}</Text>
                  <Text style={styles.meta}>{d.hint}</Text>
                  <ImagePickerField
                    label="Photo of the document"
                    urls={doc?.fileUrl ? [doc.fileUrl] : []}
                    max={1}
                    uploading={uploading === d.type}
                    disabled={busy}
                    onRemovingChange={setRemovingImage}
                    onAdd={() => void upload(d.type).then((urls) => urls[0] && setDoc(d.type, { fileUrl: urls[0] }))}
                    onRemove={() => setDoc(d.type, { fileUrl: '' })}
                  />
                  <Input label="Number (optional)" value={doc?.number ?? ''} onChangeText={(v) => setDoc(d.type, { number: v })} />
                </View>
              );
            })}
          </>
        ) : null}

        <View style={styles.saveNote}>
          <Ionicons name="checkmark-circle-outline" size={14} color={Colors.muted} />
          <Text style={styles.meta}>Each step is saved when you continue. You can edit it any time.</Text>
        </View>
        <Button
          title={
            index < STEPS.length - 1
              ? 'Save & continue'
              : isEditing
                ? 'Save & submit for review'
                : 'Save & continue to CNIC'
          }
          disabled={removingImage}
          loading={saving || Boolean(uploading)}
          onPress={() => void onContinue()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function SmallChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.chip} accessibilityRole="button">
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

/** HH:MM with the colon added as you type ("930" → "09:30" on blur). */
function TimeBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const ok = isTime(value);
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={styles.meta}>{label}</Text>
      <TextInput
        style={[styles.timeInput, !ok && { borderColor: Colors.danger }]}
        value={value}
        keyboardType="number-pad"
        maxLength={5}
        placeholder="09:00"
        placeholderTextColor={Colors.mutedLight}
        accessibilityLabel={`${label} time`}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '').slice(0, 4);
          onChange(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
        }}
        onBlur={() => {
          const digits = value.replace(/\D/g, '');
          if (digits.length === 3) onChange(`0${digits[0]}:${digits.slice(1)}`);
          else if (digits.length <= 2 && digits) onChange(`${digits.padStart(2, '0')}:00`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  heading: { ...Typography.h2, color: Colors.primary },
  sub: { ...Typography.body, color: Colors.muted, lineHeight: 20 },
  meta: { fontFamily: Fonts.body, fontSize: 12, color: Colors.muted },
  link: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.primary },
  error: { ...Typography.caption, color: Colors.danger },
  fieldLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.dark },
  stepCount: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.primary, letterSpacing: 0.4, textTransform: 'uppercase' },
  bar: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, gap: 6 },
  track: { height: 4, borderRadius: Radius.full, backgroundColor: Colors.border },
  segLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  segLabel: { fontFamily: Fonts.body, fontSize: 11, color: Colors.muted, flexShrink: 1 },
  segLabelActive: { fontFamily: Fonts.bodySemiBold, color: Colors.primary },
  notice: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.primarySoft },
  noticeWarn: { backgroundColor: Colors.softAmber },
  noticeText: { ...Typography.caption, color: Colors.dark, flex: 1 },
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
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  sectionNumber: { width: 26, height: 26, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primarySoft },
  sectionNumberText: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.primary },
  sectionTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 16, color: Colors.dark },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  chipOn: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  chipText: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.dark },
  chipTextOn: { color: Colors.primary, fontFamily: Fonts.bodySemiBold },
  card: { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  cardTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: Colors.dark },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  segmented: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: Radius.full, backgroundColor: Colors.inputBg, borderWidth: 1, borderColor: Colors.border },
  segBtn: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.full },
  segBtnOn: { backgroundColor: Colors.primary },
  segBtnText: { fontFamily: Fonts.bodyMedium, fontSize: 12, color: Colors.muted },
  segBtnTextOn: { fontFamily: Fonts.bodySemiBold, color: Colors.white },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  counter: { alignSelf: 'flex-end', fontFamily: Fonts.body, fontSize: 11, color: Colors.muted },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: Spacing.md, paddingRight: Spacing.sm, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.primarySoft },
  tagText: { fontFamily: Fonts.bodySemiBold, fontSize: 12.5, color: Colors.primary },
  tagInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingLeft: Spacing.md, paddingRight: Spacing.sm, minHeight: 48, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.inputBg },
  tagInput: { flex: 1, fontFamily: Fonts.body, fontSize: 14, color: Colors.dark, paddingVertical: Spacing.sm },
  tagAdd: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  serviceCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  serviceIcon: { width: 38, height: 38, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primarySoft },
  price: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.primary, marginTop: 2 },
  editor: { gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.card },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  option: { width: '48%', flexGrow: 1, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.card, gap: 2 },
  optionOn: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  optionTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.dark },
  or: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  orText: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: Colors.mutedLight, letterSpacing: 0.6 },
  dayRow: { gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  dayOff: { backgroundColor: Colors.surfaceSecondary },
  timeInput: {
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBg,
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: Colors.dark,
    textAlign: 'center',
  },
  saveNote: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
});

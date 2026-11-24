import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chips, Counted, Section, Tags } from '@/components/provider/SignupBits';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { ImagePickerField } from '@/components/ui/ImagePickerField';
import { Input } from '@/components/ui/Input';
import { PlaceAutocompleteSelect } from '@/components/ui/PlaceAutocompleteSelect';
import { Colors } from '@/constants/colors';
import { isGuideService } from '@/constants/providerOptions';
import { Radius, Spacing } from '@/constants/spacing';
import { TRIP_CITY_OPTIONS } from '@/constants/tripPlaces';
import { Fonts, Typography } from '@/constants/typography';
import { getApiErrorMessage } from '@/services/apiError';
import * as providerService from '@/services/providerService';
import * as tourItineraryService from '@/services/tourItineraryService';
import * as uploadService from '@/services/uploadService';
import { useAuthStore } from '@/store/authStore';
import { useProviderStore } from '@/store/providerStore';
import type { TourDay, TourDifficulty, TourItinerary, TourType } from '@/types/tourItinerary';
import {
  ONBOARDING_LOCATION,
  PROVIDER_SERVICE_TAB,
  leaveProviderEditor,
  paramId,
  useWizardBack,
  wizardBack,
} from '@/utils/navigation';

/* ------------------------------------------------------------------ */
/* Same two tabs as the website: company profile, then a first tour.   */
/* CNIC (skippable for now) and the shared Review & submit follow.     */
/* ------------------------------------------------------------------ */

type Step = 'company' | 'tour';
const STEPS: Step[] = ['company', 'tour'];
const STEP_LABELS: Record<Step, string> = { company: 'Company', tour: 'First tour' };
const TITLES: Record<Step, string> = { company: 'Your tour company', tour: 'Your first tour' };
const SUBTITLES: Record<Step, string> = {
  company: 'Travellers compare operators before they book. Tell them who you are and where you take people.',
  tour: 'Add one tour now so travellers have something to book. You can add more from your dashboard once you’re approved.',
};

const REGIONS = ['Hunza', 'Skardu', 'Gilgit', 'Nagar', 'Fairy Meadows', 'Deosai', 'Chitral', 'Swat', 'Naran & Kaghan', 'Neelum Valley', 'K2 Base Camp', 'Khunjerab'];
const STYLES = ['Treks', 'Expeditions', 'Summit climbs', 'Jeep safaris', 'Culture & history', 'Family trips', 'Honeymoon', 'Photography', 'Group tours', 'Private tours'];
const LANGUAGES = ['Urdu', 'English', 'Burushaski', 'Shina', 'Wakhi', 'Balti', 'Chinese', 'French', 'German'];
const TYPES: { value: TourType; label: string; sub: string }[] = [
  { value: 'trek', label: 'Trek', sub: 'Walking routes, valleys, base camps' },
  { value: 'expedition', label: 'Expedition', sub: 'Long, remote multi-day journeys' },
  { value: 'summit', label: 'Summit', sub: 'Climbing a peak with a team' },
];
const DIFFICULTY: { value: TourDifficulty; label: string; sub: string }[] = [
  { value: 'easy', label: 'Easy', sub: 'Anyone in normal health' },
  { value: 'moderate', label: 'Moderate', sub: 'Some fitness needed' },
  { value: 'hard', label: 'Hard', sub: 'Fit and experienced' },
];
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const INCLUDED = ['Transport', 'Hotels', 'Camping gear', 'Meals', 'Guide', 'Porters', 'Permits', 'First aid kit'];
const EXCLUDED = ['Flights', 'Personal expenses', 'Travel insurance', 'Tips', 'Extra nights'];
const TYPE_WORD: Record<TourType, string> = { trek: 'Trek', expedition: 'Expedition', summit: 'Summit Climb' };
const LICENCE_PREFIX = 'Tourism licence: ';

type Company = {
  companyName: string;
  logo: string;
  description: string;
  yearsExperience?: number;
  operatingAreas: string[];
  specialties: string[];
  languages: string[];
  licence: string;
  images: string[];
};

type TourDraft = {
  id?: string;
  title: string;
  tourType: TourType;
  summary: string;
  description: string;
  destination: string;
  durationDays: number;
  difficulty: TourDifficulty;
  maxParticipants: string;
  pricePerPerson: string;
  departureLocation: string;
  seasons: string[];
  days: TourDay[];
  included: string[];
  excluded: string[];
  coverImage: string;
  images: string[];
  status?: TourItinerary['status'];
  rejectionReason?: string;
};

function resizeDays(days: TourDay[], count: number): TourDay[] {
  return Array.from({ length: count }, (_, i) => days[i] ?? { dayNumber: i + 1, title: '', description: '' }).map((d, i) => ({
    ...d,
    dayNumber: i + 1,
  }));
}

/* The same rules as the website. */
function companyMissing(c: Company): string[] {
  const missing: string[] = [];
  if (c.companyName.trim().length < 2) missing.push('your company name');
  if (c.description.trim().length < 30) missing.push('a short company description (30+ characters)');
  if (!c.operatingAreas.length) missing.push('regions you operate in');
  if (!c.specialties.length) missing.push('the kind of tours you run');
  return missing;
}
function tourMissing(t: TourDraft): string[] {
  const missing: string[] = [];
  if (t.title.trim().length < 3) missing.push('a tour name');
  if (!t.destination.trim()) missing.push('the destination');
  if (t.summary.trim().length < 10) missing.push('a one-line summary (10+ characters)');
  if (!(Number(t.pricePerPerson) > 0)) missing.push('the price per person');
  if (!(Number(t.maxParticipants) >= 1)) missing.push('the group size');
  if (!t.coverImage) missing.push('a cover photo');
  if (t.days.some((d) => !d.title.trim())) missing.push('a title for every day of the plan');
  return missing;
}
/** The API needs a 20+ character description; build one from the plan when it's left empty. */
function descriptionFor(t: TourDraft) {
  if (t.description.trim().length >= 20) return t.description.trim();
  const plan = t.days.map((d) => `Day ${d.dayNumber}: ${d.title}${d.description ? ` — ${d.description}` : ''}`).join('\n');
  return [t.summary.trim(), plan].filter(Boolean).join('\n\n').padEnd(20, '.');
}

export default function ProviderTourSetupScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const params = useLocalSearchParams<{ from?: string | string[]; step?: string | string[] }>();
  const isEditing = paramId(params.from) === 'edit';
  const draft = useProviderStore((s) => s.draft);
  const provider = useProviderStore((s) => s.provider);
  const setTour = useProviderStore((s) => s.setTour);
  const saveProgress = useProviderStore((s) => s.saveProgress);
  const isGuide = draft.selectedServices.some((s) => isGuideService(s)) || Boolean(provider?.services?.some((s) => isGuideService(s)));

  const [step, setStep] = useState<Step>(paramId(params.step) === 'tour' ? 'tour' : 'company');
  const index = STEPS.indexOf(step);
  const tourInfo = draft.tour ?? provider?.tour;
  const certs = tourInfo?.certifications ?? [];

  const [company, setCompany] = useState<Company>(() => ({
    companyName: tourInfo?.companyName || draft.business.businessName || provider?.businessName || '',
    logo: provider?.logo ?? '',
    description: tourInfo?.description || draft.business.description || '',
    yearsExperience: tourInfo?.yearsExperience ?? draft.business.yearsExperience,
    operatingAreas: tourInfo?.operatingAreas ?? [],
    specialties: tourInfo?.specialties ?? [],
    languages: [...new Set([...(tourInfo?.internationalLanguages ?? []), ...(tourInfo?.regionalLanguages ?? [])])],
    licence: (certs.find((c) => c.startsWith(LICENCE_PREFIX)) ?? '').slice(LICENCE_PREFIX.length),
    // Old signups saved a stock placeholder photo here; never show it as the operator's own.
    images: (tourInfo?.images ?? []).filter((u) => !/images\.unsplash\.com/.test(u)),
  }));
  const [tour, setTourDraft] = useState<TourDraft>(() => ({
    title: '',
    tourType: 'trek',
    summary: '',
    description: '',
    destination: tourInfo?.operatingAreas?.[0] ?? '',
    durationDays: 3,
    difficulty: 'moderate',
    maxParticipants: '12',
    pricePerPerson: '',
    departureLocation: 'Islamabad',
    seasons: ['Summer'],
    days: resizeDays([], 3),
    included: [],
    excluded: [],
    coverImage: '',
    images: [],
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [removingImage, setRemovingImage] = useState(false);
  const busy = saving || Boolean(uploading) || removingImage;

  const setC = (patch: Partial<Company>) => setCompany((c) => ({ ...c, ...patch }));
  const setT = (patch: Partial<TourDraft>) => setTourDraft((t) => ({ ...t, ...patch }));
  /** Updates one day from the latest state, so quick edits to several days never overwrite each other. */
  const setDay = (i: number, patch: Partial<TourDay>) =>
    setTourDraft((t) => ({ ...t, days: t.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const goPrevious = useWizardBack(() => {
    if (index > 0) {
      setStep(STEPS[index - 1]);
      return;
    }
    wizardBack(isEditing ? PROVIDER_SERVICE_TAB : (ONBOARDING_LOCATION as never));
  });

  // Continue the operator's newest tour (the one being built in signup), if any.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!(user?.providerId || provider?.id)) return;
        const mine = await tourItineraryService.listMine();
        const latest = mine[0];
        if (!live || !latest) return;
        setTourDraft({
          id: latest.id,
          title: latest.title,
          tourType: latest.tourType,
          summary: latest.summary,
          description: latest.description,
          destination: latest.destination,
          durationDays: latest.durationDays,
          difficulty: latest.difficulty ?? 'moderate',
          maxParticipants: String(latest.maxParticipants),
          pricePerPerson: latest.pricePerPerson ? String(latest.pricePerPerson) : '',
          departureLocation: latest.departureLocation ?? '',
          seasons: (latest.bestSeason ?? '').split(/,\s*/).filter(Boolean),
          days: resizeDays(latest.days, latest.durationDays),
          included: latest.included,
          excluded: latest.excluded,
          coverImage: latest.coverImage,
          images: latest.images.filter((u) => u !== latest.coverImage),
          status: latest.status,
          rejectionReason: latest.rejectionReason,
        });
      } catch {
        // No tours yet (or offline): start with a blank tour.
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
      const uploaded = await uploadService.uploadImages(picked, slot === 'logo' ? 'logos' : 'tours');
      return uploaded.map((item) => item.url);
    } catch (error) {
      Alert.alert('Upload failed', getApiErrorMessage(error));
      return [] as string[];
    } finally {
      setUploading(null);
    }
  };

  /** Company facts go into the profile's tour details (merged by the store), plus the logo. */
  const saveCompany = async (forTour?: TourDraft) => {
    const otherCerts = certs.filter((c) => !c.startsWith(LICENCE_PREFIX));
    setTour({
      companyName: company.companyName.trim(),
      description: company.description.trim(),
      yearsExperience: company.yearsExperience,
      operatingAreas: company.operatingAreas,
      specialties: company.specialties,
      internationalLanguages: company.languages,
      regionalLanguages: [],
      certifications: company.licence.trim() ? [...otherCerts, `${LICENCE_PREFIX}${company.licence.trim()}`] : otherCerts,
      images: company.images,
      // Older catalog cards read these from the profile; keep them in step with the first tour.
      ...(forTour
        ? {
            tourName: forTour.title.trim(),
            destination: forTour.destination,
            duration: `${forTour.durationDays} day${forTour.durationDays === 1 ? '' : 's'}`,
            departureLocation: forTour.departureLocation,
            price: Number(forTour.pricePerPerson) || 0,
            maxParticipants: Number(forTour.maxParticipants) || 1,
            included: forTour.included,
            excluded: forTour.excluded,
            pickupLocations: [],
          }
        : {}),
    });
    await saveProgress();
    if (company.logo !== (provider?.logo ?? '') && company.logo) await providerService.updateProviderLogo(company.logo);
  };

  const onContinue = async () => {
    if (busy) return;
    const missing = step === 'company' ? companyMissing(company) : tourMissing(tour);
    if (missing.length) {
      Alert.alert('A few things missing', missing.map((m) => `• ${m}`).join('\n'));
      return;
    }
    setSaving(true);
    try {
      if (step === 'company') {
        await saveCompany();
        // Start the tour where the company works, unless a destination is already set.
        setTourDraft((t) => (t.destination ? t : { ...t, destination: company.operatingAreas[0] ?? '' }));
        setStep('tour');
        return;
      }
      // The first tour is sent for review with the application (draft while editing later).
      const body = {
        title: tour.title.trim(),
        tourType: tour.tourType,
        summary: tour.summary.trim(),
        description: descriptionFor(tour),
        destination: tour.destination.trim(),
        durationDays: tour.durationDays,
        durationNights: Math.max(0, tour.durationDays - 1),
        difficulty: tour.difficulty,
        maxParticipants: Number(tour.maxParticipants),
        pricePerPerson: Number(tour.pricePerPerson),
        currency: 'PKR',
        included: tour.included,
        excluded: tour.excluded,
        days: tour.days.map((d) => ({ ...d, title: d.title.trim(), description: d.description.trim() })),
        coverImage: tour.coverImage,
        images: [tour.coverImage, ...tour.images.filter((u) => u !== tour.coverImage)],
        departureLocation: tour.departureLocation.trim() || undefined,
        bestSeason: tour.seasons.join(', ') || undefined,
        submitForReview: true,
      };
      const saved = tour.id
        ? await tourItineraryService.updateItinerary(tour.id, body)
        : await tourItineraryService.createItinerary(body);
      setT({ id: saved.id, status: saved.status });
      await saveCompany(tour);
      if (isEditing) {
        leaveProviderEditor(user);
        return;
      }
      router.push('/(provider)/register/verification');
    } catch (error) {
      Alert.alert('Could not save', getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (isGuide) return <Redirect href="/(provider)/register/guide" />;
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 40, alignItems: 'center' }]}>
        <Text style={styles.sub}>Loading your tour company…</Text>
      </View>
    );
  }

  const ideas = [...new Set([tour.destination, ...company.operatingAreas].filter(Boolean))]
    .slice(0, 3)
    .map((place) => `${place} ${TYPE_WORD[tour.tourType]} — ${tour.durationDays} Days`);
  const setDays = (n: number) => {
    const count = Math.max(1, Math.min(30, n));
    setT({ durationDays: count, days: resizeDays(tour.days, count) });
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header
        title={isEditing ? 'Edit tour company' : 'Tour operator setup'}
        showBack
        fallbackHref={isEditing ? PROVIDER_SERVICE_TAB : (ONBOARDING_LOCATION as never)}
        onBack={goPrevious}
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 40, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
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
                <Pressable key={s} style={styles.segment} disabled={i >= index || busy} onPress={() => setStep(s)} accessibilityRole="button" accessibilityLabel={`${STEP_LABELS[s]}${done ? ', done' : active ? ', current step' : ''}`}>
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

        {/* ============================ 1 · COMPANY ============================ */}
        {step === 'company' ? (
          <>
            <Section n={1} title="Who you are" sub="Your company name and logo appear on every tour" />
            <Input label="Company name *" value={company.companyName} onChangeText={(v) => setC({ companyName: v })} />
            <ImagePickerField
              label="Logo (optional)"
              urls={company.logo ? [company.logo] : []}
              max={1}
              uploading={uploading === 'logo'}
              disabled={busy}
              onRemovingChange={setRemovingImage}
              onAdd={() => void upload('logo').then((urls) => urls[0] && setC({ logo: urls[0] }))}
              onRemove={() => setC({ logo: '' })}
            />
            <Counted
              label="About your company *"
              value={company.description}
              onChange={(v) => setC({ description: v })}
              max={600}
              min={30}
              placeholder="Family-run operator from Skardu since 2012. Small-group treks to K2 Base Camp and Deosai…"
            />
            <Input
              label="Years in business"
              keyboardType="number-pad"
              value={company.yearsExperience != null ? String(company.yearsExperience) : ''}
              onChangeText={(v) => setC({ yearsExperience: v ? Number(v.replace(/\D/g, '')) : undefined })}
            />

            <Section n={2} title="Where do you run tours?" sub="Tap the regions, or search for others" />
            <Chips
              icon="location-outline"
              options={[...REGIONS, ...company.operatingAreas.filter((a) => !REGIONS.includes(a))].map((a) => ({ value: a, label: a }))}
              selected={company.operatingAreas}
              onToggle={(v) => setC({ operatingAreas: toggle(company.operatingAreas, v) })}
            />
            <PlaceAutocompleteSelect
              label="Add another region"
              placeholder="Search any valley or town"
              value=""
              suggestions={TRIP_CITY_OPTIONS}
              leftIcon="add-circle-outline"
              onChange={(name) => {
                const clean = name.trim();
                if (clean && !company.operatingAreas.includes(clean)) setC({ operatingAreas: [...company.operatingAreas, clean] });
              }}
            />

            <Section n={3} title="What kind of tours?" sub="Choose all that fit" />
            <Chips options={STYLES.map((s) => ({ value: s, label: s }))} selected={company.specialties} onToggle={(v) => setC({ specialties: toggle(company.specialties, v) })} />
            <Text style={styles.fieldLabel}>Languages your team speaks</Text>
            <Chips
              options={[...LANGUAGES, ...company.languages.filter((l) => !LANGUAGES.includes(l))].map((l) => ({ value: l, label: l }))}
              selected={company.languages}
              onToggle={(v) => setC({ languages: toggle(company.languages, v) })}
            />

            <Section n={4} title="Licence & photos (optional)" sub="Travellers trust licensed operators" />
            <Input label="Tourism / DTS licence number" placeholder="e.g. GB-DTS-1234" autoCapitalize="characters" value={company.licence} onChangeText={(v) => setC({ licence: v })} />
            <ImagePickerField
              label="Company photos"
              urls={company.images}
              max={8}
              uploading={uploading === 'company'}
              disabled={busy}
              onRemovingChange={setRemovingImage}
              onAdd={() => void upload('company', 3).then((urls) => urls.length && setC({ images: [...company.images, ...urls].slice(0, 8) }))}
              onRemove={(i) => setC({ images: company.images.filter((_, j) => j !== i) })}
            />
          </>
        ) : null}

        {/* ============================ 2 · FIRST TOUR ============================ */}
        {step === 'tour' ? (
          <>
            {tour.status === 'rejected' && tour.rejectionReason ? (
              <View style={[styles.notice, { backgroundColor: Colors.softAmber }]}>
                <Ionicons name="create-outline" size={18} color={Colors.warning} />
                <Text style={styles.noticeText}>BANJARA asked for changes: {tour.rejectionReason}</Text>
              </View>
            ) : null}

            <Section n={1} title="The basics" sub="What travellers see first" />
            <Text style={styles.fieldLabel}>Type of tour</Text>
            <View style={styles.optionGrid}>
              {TYPES.map((t) => {
                const on = tour.tourType === t.value;
                return (
                  <Pressable key={t.value} style={[styles.option, on && styles.optionOn]} onPress={() => setT({ tourType: t.value })} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                    <Text style={[styles.optionTitle, on && { color: Colors.primary }]}>{t.label}</Text>
                    <Text style={styles.meta}>{t.sub}</Text>
                  </Pressable>
                );
              })}
            </View>
            <PlaceAutocompleteSelect
              label="Destination *"
              placeholder="Where does the tour go?"
              value={tour.destination}
              suggestions={company.operatingAreas.length ? company.operatingAreas : TRIP_CITY_OPTIONS}
              leftIcon="flag-outline"
              onChange={(name) => setT({ destination: name })}
            />
            <Input label="Tour name *" placeholder="e.g. Deosai Plains Trek — 4 Days" value={tour.title} onChangeText={(v) => setT({ title: v })} />
            {!tour.title.trim() && ideas.length ? (
              <>
                <Text style={styles.meta}>Ideas — tap one</Text>
                <Chips icon="add" options={ideas.map((i) => ({ value: i, label: i }))} selected={[]} onToggle={(v) => setT({ title: v })} />
              </>
            ) : null}
            <Counted
              label="One-line summary *"
              value={tour.summary}
              onChange={(v) => setT({ summary: v })}
              max={300}
              min={10}
              placeholder="Walk across the second-highest plateau on earth and camp under the stars."
            />

            <Section n={2} title="Length, difficulty & price" sub="Travellers filter tours by these" />
            <View style={styles.daysRow}>
              <Text style={styles.fieldLabel}>How many days?</Text>
              <View style={styles.stepper}>
                <Pressable style={[styles.stepBtn, tour.durationDays <= 1 && { opacity: 0.4 }]} disabled={tour.durationDays <= 1} onPress={() => setDays(tour.durationDays - 1)} accessibilityLabel="One day less">
                  <Ionicons name="remove" size={20} color={Colors.primary} />
                </Pressable>
                <Text style={styles.stepValue}>{tour.durationDays}</Text>
                <Pressable style={[styles.stepBtn, tour.durationDays >= 30 && { opacity: 0.4 }]} disabled={tour.durationDays >= 30} onPress={() => setDays(tour.durationDays + 1)} accessibilityLabel="One day more">
                  <Ionicons name="add" size={20} color={Colors.primary} />
                </Pressable>
              </View>
            </View>
            <Text style={styles.meta}>
              {tour.durationDays} day{tour.durationDays === 1 ? '' : 's'} · {Math.max(0, tour.durationDays - 1)} night{tour.durationDays - 1 === 1 ? '' : 's'}
            </Text>
            <Text style={styles.fieldLabel}>Difficulty</Text>
            <View style={styles.optionGrid}>
              {DIFFICULTY.map((d) => {
                const on = tour.difficulty === d.value;
                return (
                  <Pressable key={d.value} style={[styles.option, on && styles.optionOn]} onPress={() => setT({ difficulty: d.value })} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                    <Text style={[styles.optionTitle, on && { color: Colors.primary }]}>{d.label}</Text>
                    <Text style={styles.meta}>{d.sub}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Input label="Price per person (Rs) *" keyboardType="number-pad" placeholder="e.g. 45000" value={tour.pricePerPerson} onChangeText={(v) => setT({ pricePerPerson: v.replace(/\D/g, '') })} />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="Max group size *" keyboardType="number-pad" value={tour.maxParticipants} onChangeText={(v) => setT({ maxParticipants: v.replace(/\D/g, '') })} />
              </View>
            </View>
            <PlaceAutocompleteSelect
              label="Starts from"
              placeholder="e.g. Islamabad, Gilgit"
              value={tour.departureLocation}
              suggestions={TRIP_CITY_OPTIONS}
              leftIcon="navigate-outline"
              onChange={(name) => setT({ departureLocation: name })}
            />
            <Text style={styles.fieldLabel}>Best season</Text>
            <Chips
              options={SEASONS.map((s) => ({ value: s, label: s }))}
              selected={tour.seasons}
              onToggle={(v) => setT({ seasons: toggle(tour.seasons, v).sort((a, b) => SEASONS.indexOf(a) - SEASONS.indexOf(b)) })}
            />

            <Section n={3} title="Day-by-day plan" sub="A title for each day; it grows with the number of days" />
            {tour.days.map((day, i) => (
              <View key={day.dayNumber} style={styles.card}>
                <Text style={styles.cardTitle}>Day {day.dayNumber}</Text>
                <Input
                  label="Title"
                  placeholder={i === 0 ? 'e.g. Drive Islamabad → Chilas' : i === tour.days.length - 1 ? 'e.g. Return to Skardu' : 'e.g. Trek to Bara Pani camp'}
                  value={day.title}
                  onChangeText={(v) => setDay(i, { title: v })}
                />
                <Input
                  label="What happens (optional)"
                  multiline
                  placeholder="Hours of walking, where you sleep, meals…"
                  value={day.description}
                  onChangeText={(v) => setDay(i, { description: v })}
                />
              </View>
            ))}

            <Section n={4} title="What’s included?" sub="Tap the common ones, or type your own" />
            <Tags label="Included" values={tour.included} onChange={(v) => setT({ included: v })} placeholder="Your own item" />
            <Chips icon="add" options={INCLUDED.filter((i) => !tour.included.includes(i)).map((i) => ({ value: i, label: i }))} selected={[]} onToggle={(i) => setT({ included: [...tour.included, i] })} />
            <Tags label="Not included" values={tour.excluded} onChange={(v) => setT({ excluded: v })} placeholder="Your own item" />
            <Chips icon="add" options={EXCLUDED.filter((i) => !tour.excluded.includes(i)).map((i) => ({ value: i, label: i }))} selected={[]} onToggle={(i) => setT({ excluded: [...tour.excluded, i] })} />

            <Section n={5} title="Photos" sub="A cover photo is required. Real photos from your trips work best." />
            <ImagePickerField
              label="Cover photo *"
              urls={tour.coverImage ? [tour.coverImage] : []}
              max={1}
              uploading={uploading === 'cover'}
              disabled={busy}
              onRemovingChange={setRemovingImage}
              onAdd={() => void upload('cover').then((urls) => urls[0] && setT({ coverImage: urls[0] }))}
              onRemove={() => setT({ coverImage: '' })}
            />
            <ImagePickerField
              label="More photos (optional)"
              urls={tour.images}
              max={8}
              uploading={uploading === 'gallery'}
              disabled={busy}
              onRemovingChange={setRemovingImage}
              onAdd={() => void upload('gallery', 3).then((urls) => urls.length && setT({ images: [...tour.images, ...urls].slice(0, 8) }))}
              onRemove={(i) => setT({ images: tour.images.filter((_, j) => j !== i) })}
            />
            <Counted
              label="Full description (optional)"
              value={tour.description}
              onChange={(v) => setT({ description: v })}
              max={4000}
              placeholder="Fitness, gear list, altitude, cancellation…"
            />
          </>
        ) : null}

        <View style={styles.saveNote}>
          <Ionicons name="checkmark-circle-outline" size={14} color={Colors.muted} />
          <Text style={styles.meta}>Each step is saved when you continue.</Text>
        </View>
        <Button
          title={step === 'company' ? 'Save & continue' : isEditing ? 'Save & submit tour' : 'Save & continue to CNIC'}
          disabled={removingImage}
          loading={saving || Boolean(uploading)}
          onPress={() => void onContinue()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  heading: { ...Typography.h2, color: Colors.primary },
  sub: { ...Typography.body, color: Colors.muted, lineHeight: 20 },
  meta: { fontFamily: Fonts.body, fontSize: 12, color: Colors.muted },
  fieldLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.dark },
  stepCount: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.primary, letterSpacing: 0.4, textTransform: 'uppercase' },
  bar: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, gap: 6 },
  track: { height: 4, borderRadius: Radius.full, backgroundColor: Colors.border },
  segLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  segLabel: { fontFamily: Fonts.body, fontSize: 11, color: Colors.muted, flexShrink: 1 },
  segLabelActive: { fontFamily: Fonts.bodySemiBold, color: Colors.primary },
  notice: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md },
  noticeText: { ...Typography.caption, color: Colors.dark, flex: 1 },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  option: { width: '31%', flexGrow: 1, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.card, gap: 2 },
  optionOn: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  optionTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.dark },
  row: { flexDirection: 'row', gap: Spacing.sm },
  daysRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stepBtn: { width: 40, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary },
  stepValue: { fontFamily: Fonts.bodySemiBold, fontSize: 20, color: Colors.dark, minWidth: 30, textAlign: 'center' },
  card: { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  cardTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: Colors.dark },
  saveNote: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
});

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chips, Counted, Section, Tags } from '@/components/provider/SignupBits';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { ImagePickerField } from '@/components/ui/ImagePickerField';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/colors';
import { Radius, Spacing } from '@/constants/spacing';
import { Fonts, Typography } from '@/constants/typography';
import { getApiErrorMessage } from '@/services/apiError';
import * as uploadService from '@/services/uploadService';
import { useAuthStore } from '@/store/authStore';
import { useProviderStore } from '@/store/providerStore';
import type { ProviderRestaurantOffer } from '@/types/provider';
import {
  ONBOARDING_LOCATION,
  PROVIDER_SERVICE_TAB,
  leaveProviderEditor,
  paramId,
  useWizardBack,
  wizardBack,
} from '@/utils/navigation';

/* ------------------------------------------------------------------ */
/* Same two tabs as the website: the restaurant, then menu & offers.  */
/* The map pin comes before (location step); CNIC and Review after.   */
/* ------------------------------------------------------------------ */

type Step = 'profile' | 'menu';
const STEPS: Step[] = ['profile', 'menu'];
const STEP_LABELS: Record<Step, string> = { profile: 'Restaurant', menu: 'Menu & offers' };
const TITLES: Record<Step, string> = { profile: 'Your restaurant', menu: 'Menu & offers' };
const SUBTITLES: Record<Step, string> = {
  profile: 'Travellers choose where to eat from photos and a few words. Show them your food and your place.',
  menu: 'List the dishes people come for, and any deals. You can change these any time from your dashboard.',
};

const CUISINES = ['Pakistani', 'Desi BBQ', 'Hunza local', 'Balti', 'Chinese', 'Continental', 'Fast food', 'Café & bakery', 'Tea & coffee', 'Vegetarian', 'Seafood', 'Italian'];
const DISHES: Record<string, string[]> = {
  Pakistani: ['Chicken karahi', 'Daal chawal', 'Biryani', 'Nihari', 'Haleem'],
  'Desi BBQ': ['Chicken tikka', 'Seekh kebab', 'Malai boti', 'Mutton chops'],
  'Hunza local': ['Chapshoro', 'Diram fitti', 'Hunza soup', 'Apricot cake', 'Walnut cake'],
  Balti: ['Balti chicken', 'Mamtu', 'Prapu', 'Butter tea'],
  Chinese: ['Chicken chow mein', 'Egg fried rice', 'Manchurian', 'Hot & sour soup'],
  Continental: ['Grilled chicken', 'Steak', 'Pasta', 'Club sandwich'],
  'Fast food': ['Burger', 'Zinger burger', 'Fries', 'Shawarma', 'Pizza'],
  'Café & bakery': ['Cakes', 'Pastries', 'Cookies', 'Sandwiches'],
  'Tea & coffee': ['Doodh patti chai', 'Green tea', 'Cappuccino', 'Hot chocolate'],
  Vegetarian: ['Mix vegetable', 'Palak paneer', 'Daal mash', 'Salad bar'],
  Seafood: ['Fried fish', 'Trout', 'Prawns'],
  Italian: ['Pizza', 'Pasta', 'Lasagna'],
};
const OFFER_TYPES: { value: ProviderRestaurantOffer['type']; label: string; sub: string }[] = [
  { value: 'discount', label: '% off', sub: 'e.g. 20% off lunch' },
  { value: 'offer', label: 'Deal', sub: 'e.g. Free tea with karahi' },
  { value: 'sale', label: 'Sale price', sub: 'e.g. Platter Rs 2,500' },
];
const OFFER_IDEAS = ['Family deal', 'Lunch special', 'Free tea with any meal', 'Student discount', 'Group discount'];
const HOUR_DAYS = ['Every day', 'Mon–Sat', 'Mon–Fri', 'Weekends'];
// The old form's made-up defaults; never treat them as the restaurant's own.
const OLD_DEFAULTS = new Set(['Pakistani, BBQ', 'Grill, Traditional, Family', '20% off lunch', 'Weekend family deal', 'Free dessert sale']);

type Hours = { days: string; open: string; close: string; allDay: boolean };
const isTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const formatHours = (h: Hours) => (h.allDay ? `${h.days} · Open 24 hours` : `${h.days} · ${h.open}–${h.close}`);
/** Reads "Every day · 08:00–23:00" back (the website writes the same format). */
function parseHours(value?: string): Hours {
  const match = (value ?? '').match(/^(.+?)\s*·\s*(?:(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})|(Open 24 hours))$/);
  if (!match) return { days: 'Every day', open: '09:00', close: '23:00', allDay: false };
  return { days: match[1], open: match[2] ?? '09:00', close: match[3] ?? '23:00', allDay: Boolean(match[4]) };
}
const newOfferId = () => `offer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export default function ProviderRestaurantSetupScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const params = useLocalSearchParams<{ from?: string | string[]; step?: string | string[] }>();
  const isEditing = paramId(params.from) === 'edit';
  const draft = useProviderStore((s) => s.draft);
  const provider = useProviderStore((s) => s.provider);
  const setRestaurant = useProviderStore((s) => s.setRestaurant);
  const saveProgress = useProviderStore((s) => s.saveProgress);

  const seed = draft.restaurant ?? provider?.restaurant;
  const [step, setStep] = useState<Step>(paramId(params.step) === 'menu' ? 'menu' : 'profile');
  const index = STEPS.indexOf(step);

  const [name, setName] = useState(seed?.restaurantName || draft.business.businessName || provider?.businessName || '');
  const [images, setImages] = useState<string[]>((seed?.images ?? []).filter((u) => !/images\.unsplash\.com/.test(u)));
  const [cuisines, setCuisines] = useState<string[]>((seed?.cuisineTypes ?? []).filter((c) => !OLD_DEFAULTS.has(c)));
  const [description, setDescription] = useState(seed?.description || draft.business.description || '');
  const [hours, setHours] = useState<Hours>(() => parseHours(seed?.hours));
  const [dishes, setDishes] = useState<string[]>(seed?.menuVariety ?? []);
  const [offers, setOffers] = useState<ProviderRestaurantOffer[]>((seed?.offers ?? []).filter((o) => !OLD_DEFAULTS.has(o.title)));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingImage, setRemovingImage] = useState(false);
  const busy = saving || uploading || removingImage;

  // Where the restaurant is and how to reach it come from the location step and the account.
  const pinnedAddress = draft.location?.address.formattedAddress || seed?.address || provider?.address || draft.business.address || '';
  const city = draft.location?.address.city || seed?.city || provider?.city || draft.business.city || '';
  const phone = seed?.phone || draft.business.phone || provider?.phone || draft.personal.phone || user?.phone || '';

  const goPrevious = useWizardBack(() => {
    if (index > 0) {
      setStep(STEPS[index - 1]);
      return;
    }
    wizardBack(isEditing ? PROVIDER_SERVICE_TAB : (ONBOARDING_LOCATION as never));
  });

  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  const setOffer = (id: string, patch: Partial<ProviderRestaurantOffer>) => setOffers((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const addOffer = (title = '') => setOffers((list) => [...list, { id: newOfferId(), title, type: 'offer', active: true }]);

  /* The same rules as the website. */
  const profileMissing = () => {
    const missing: string[] = [];
    if (name.trim().length < 2) missing.push('your restaurant name');
    if (!images.length) missing.push('at least one photo');
    if (!cuisines.length) missing.push('the food you serve');
    if (description.trim().length < 30) missing.push('a short description (30+ characters)');
    if (!hours.allDay && (!isTime(hours.open) || !isTime(hours.close))) missing.push('opening hours like 09:00 and 23:00');
    return missing;
  };
  const menuMissing = () => {
    const missing: string[] = [];
    if (!dishes.length) missing.push('at least one dish travellers can order');
    const bad = offers.find((o) => o.title.trim() && o.type === 'discount' && !(Number(o.discountPercent) > 0 && Number(o.discountPercent) <= 90));
    if (bad) missing.push(`a discount between 1 and 90% for “${bad.title}”`);
    return missing;
  };

  const onAddPhotos = async () => {
    try {
      setUploading(true);
      const picked = await uploadService.pickImages(Math.max(1, 8 - images.length));
      if (!picked.length) return;
      const uploaded = await uploadService.uploadImages(picked, 'restaurants');
      setImages((prev) => [...prev, ...uploaded.map((item) => item.url)].slice(0, 8));
    } catch (error) {
      Alert.alert('Upload failed', getApiErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const onContinue = async () => {
    if (busy) return;
    const missing = step === 'profile' ? profileMissing() : menuMissing();
    if (missing.length) {
      Alert.alert('A few things missing', missing.map((m) => `• ${m}`).join('\n'));
      return;
    }
    setRestaurant({
      restaurantName: name.trim(),
      cuisineTypes: cuisines,
      menuVariety: dishes,
      city,
      address: pinnedAddress || city,
      phone,
      description: description.trim(),
      hours: formatHours(hours),
      offers: offers
        .filter((o) => o.title.trim())
        .map((o) => ({ ...o, title: o.title.trim(), discountPercent: o.type === 'discount' ? o.discountPercent : undefined })),
      images,
      latitude: draft.location?.latitude ?? seed?.latitude,
      longitude: draft.location?.longitude ?? seed?.longitude,
    });
    try {
      setSaving(true);
      await saveProgress();
      if (step === 'profile') {
        setStep('menu');
        return;
      }
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

  const dishIdeas = [...new Set(cuisines.flatMap((c) => DISHES[c] ?? []))].filter((d) => !dishes.includes(d)).slice(0, 12);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header
        title={isEditing ? 'Edit restaurant' : 'Restaurant setup'}
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

        {/* ============================ 1 · RESTAURANT ============================ */}
        {step === 'profile' ? (
          <>
            <View style={styles.pinCard}>
              <Ionicons name="location" size={20} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.meta}>Pinned on the map</Text>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {pinnedAddress || city || 'Not pinned yet'}
                </Text>
              </View>
              <Pressable
                // Signup: step back to the location screen. Editing later: open the location settings.
                onPress={() => (isEditing ? router.push('/(provider)/location' as never) : goPrevious())}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Change the map pin"
              >
                <Text style={styles.link}>Change</Text>
              </Pressable>
            </View>

            <Section n={1} title="Photos" sub="Your best dish first, then the inside and outside. The first photo is your cover." />
            <ImagePickerField
              label="Restaurant photos *"
              urls={images}
              max={8}
              uploading={uploading}
              disabled={busy}
              onRemovingChange={setRemovingImage}
              onAdd={() => void onAddPhotos()}
              onRemove={(i) => setImages((prev) => prev.filter((_, j) => j !== i))}
            />

            <Section n={2} title="About your restaurant" sub="The name travellers search for, and what makes you worth the stop" />
            <Input label="Restaurant name *" value={name} onChangeText={setName} />
            <Text style={styles.fieldLabel}>What food do you serve? *</Text>
            <Chips
              options={[...CUISINES, ...cuisines.filter((c) => !CUISINES.includes(c))].map((c) => ({ value: c, label: c }))}
              selected={cuisines}
              onToggle={(v) => setCuisines((l) => toggle(l, v))}
            />
            <Counted
              label="Short description *"
              value={description}
              onChange={setDescription}
              max={500}
              min={30}
              placeholder="Family restaurant on the KKH with a terrace view of Rakaposhi. Famous for chicken karahi…"
            />

            <Section n={3} title="Opening hours" sub="Shown on your page so travellers know when to come" />
            <Chips options={HOUR_DAYS.map((d) => ({ value: d, label: d }))} selected={[hours.days]} onToggle={(d) => setHours((h) => ({ ...h, days: d }))} />
            <Chips icon="time-outline" options={[{ value: 'allDay', label: 'Open 24 hours' }]} selected={hours.allDay ? ['allDay'] : []} onToggle={() => setHours((h) => ({ ...h, allDay: !h.allDay }))} />
            {!hours.allDay ? (
              <View style={styles.row}>
                <TimeBox label="Opens" value={hours.open} onChange={(open) => setHours((h) => ({ ...h, open }))} />
                <TimeBox label="Closes" value={hours.close} onChange={(close) => setHours((h) => ({ ...h, close }))} />
              </View>
            ) : null}
            <Text style={styles.meta}>Shown as: {formatHours(hours)}</Text>
          </>
        ) : null}

        {/* ============================ 2 · MENU & OFFERS ============================ */}
        {step === 'menu' ? (
          <>
            <Section n={1} title="Popular dishes" sub="What people come for. Tap the ideas, or type your own." />
            <Tags label="Dishes *" values={dishes} onChange={setDishes} placeholder="e.g. Chicken karahi" />
            {dishIdeas.length ? (
              <Chips icon="add" options={dishIdeas.map((d) => ({ value: d, label: d }))} selected={[]} onToggle={(d) => setDishes((l) => [...l, d])} />
            ) : null}

            <Section n={2} title="Deals & offers (optional)" sub="Shown with a badge on your page. Pause them any time." />
            {offers.map((o) => (
              <View key={o.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{o.title.trim() || 'New offer'}</Text>
                  <View style={styles.row}>
                    <Pressable style={[styles.pill, o.active && styles.pillOn]} onPress={() => setOffer(o.id, { active: !o.active })} accessibilityRole="switch" accessibilityState={{ checked: o.active }}>
                      <Text style={[styles.pillText, o.active && styles.pillTextOn]}>{o.active ? 'Live' : 'Paused'}</Text>
                    </Pressable>
                    <Pressable hitSlop={8} onPress={() => setOffers((l) => l.filter((x) => x.id !== o.id))} accessibilityLabel={`Remove ${o.title || 'offer'}`}>
                      <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                    </Pressable>
                  </View>
                </View>
                <View style={styles.optionGrid}>
                  {OFFER_TYPES.map((t) => {
                    const on = o.type === t.value;
                    return (
                      <Pressable key={t.value} style={[styles.option, on && styles.optionOn]} onPress={() => setOffer(o.id, { type: t.value })} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                        <Text style={[styles.optionTitle, on && { color: Colors.primary }]}>{t.label}</Text>
                        <Text style={styles.meta}>{t.sub}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Input label="Offer title" placeholder="e.g. Lunch special" value={o.title} onChangeText={(v) => setOffer(o.id, { title: v })} />
                {o.type === 'discount' ? (
                  <Input
                    label="Discount %"
                    keyboardType="number-pad"
                    placeholder="20"
                    value={o.discountPercent != null ? String(o.discountPercent) : ''}
                    onChangeText={(v) => setOffer(o.id, { discountPercent: v ? Math.min(90, Number(v.replace(/\D/g, ''))) : undefined })}
                  />
                ) : null}
                <Input label="Details (optional)" placeholder="e.g. Mon–Fri, 12–3 pm, dine-in only" value={o.description ?? ''} onChangeText={(v) => setOffer(o.id, { description: v })} />
              </View>
            ))}
            <Button title={offers.length ? 'Add another offer' : 'Add an offer'} variant="outline" onPress={() => addOffer()} />
            {offers.length ? null : (
              <Chips icon="add" options={OFFER_IDEAS.map((i) => ({ value: i, label: i }))} selected={[]} onToggle={(i) => addOffer(i)} />
            )}
          </>
        ) : null}

        <View style={styles.saveNote}>
          <Ionicons name="checkmark-circle-outline" size={14} color={Colors.muted} />
          <Text style={styles.meta}>Each step is saved when you continue.</Text>
        </View>
        <Button
          title={step === 'profile' ? 'Save & continue' : isEditing ? 'Save changes' : 'Save & continue to CNIC'}
          disabled={removingImage}
          loading={saving || uploading}
          onPress={() => void onContinue()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** HH:MM with the colon added as you type ("930" → "09:30" when you leave the box). */
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
        accessibilityLabel={`${label} at`}
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
  fieldLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.dark },
  stepCount: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.primary, letterSpacing: 0.4, textTransform: 'uppercase' },
  bar: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, gap: 6 },
  track: { height: 4, borderRadius: Radius.full, backgroundColor: Colors.border },
  segLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  segLabel: { fontFamily: Fonts.body, fontSize: 11, color: Colors.muted, flexShrink: 1 },
  segLabelActive: { fontFamily: Fonts.bodySemiBold, color: Colors.primary },
  pinCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  card: { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  cardTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: Colors.dark },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  pillOn: { borderColor: Colors.success, backgroundColor: Colors.softGreen },
  pillText: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.muted },
  pillTextOn: { color: Colors.success },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  option: { width: '31%', flexGrow: 1, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.card, gap: 2 },
  optionOn: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  optionTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.dark },
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

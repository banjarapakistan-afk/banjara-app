import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { ExploreServiceTab } from '@/constants/exploreCatalog';
import { useExploreDesign } from '@/constants/exploreDesign';
import { Fonts } from '@/constants/typography';
import {
  NEAR_DEFAULT_KM,
  askToTurnOnLocation,
  fetchNearbyRides,
  locateVisitor,
  type LocateFailure,
  type LocateStage,
} from '@/utils/nearMe';
import { getIntercityConfigCached } from '@/services/intercity.service';
import { pushPath } from '@/utils/navigation';
import { Tappable } from '@/components/ui/Tappable';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
const OTHERS: { id: Exclude<ExploreServiceTab, 'transport'>; label: string; hint: string; icon: IconName }[] = [
  { id: 'hotels', label: 'Stay', hint: 'Hotels & guest houses', icon: 'office-building-outline' },
  { id: 'tours', label: 'Tours', hint: 'Treks & expeditions', icon: 'image-filter-hdr' },
  { id: 'guides', label: 'Guides', hint: 'Local experts', icon: 'sign-direction' },
  { id: 'restaurants', label: 'Restaurants', hint: 'Food & offers', icon: 'silverware-fork-knife' },
];

type Step = 'choose' | 'locating' | 'destination' | LocateFailure;

/** Where rides picking up near the visitor are going, busiest first. */
type Destination = { name: string; rides: number; from: number | null };

/** Minimum time on "Pinpointing your position" before showing "Found you". */
const MIN_LOCATING_MS = 2600;
/** How long "Found you!" stays before asking where to go. */
const FOUND_HOLD_MS = 900;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SETTINGS_STEPS =
  Platform.OS === 'ios'
    ? ['Tap Open settings below.', 'Tap Location and choose While Using the App.', 'Come back to BANJARA and tap Try again.']
    : ['Tap Open settings below.', 'Tap Permissions › Location and choose Allow only while using the app.', 'Come back to BANJARA and tap Try again.'];
const DEVICE_STEPS =
  Platform.OS === 'ios'
    ? ['Open Settings › Privacy & Security › Location Services.', 'Switch Location Services on.', 'Come back and tap Try again.']
    : ['Swipe down from the top of your screen.', 'Tap the Location tile to turn it on.', 'Come back and tap Try again.'];

/** What to tell the visitor for each way locating can fail, and the main fix to offer. */
const FAILURE: Record<
  LocateFailure,
  { title: string; body: string; steps?: string[]; action: 'retry' | 'settings' | 'turn-on' }
> = {
  denied: {
    title: 'Enable your location',
    body: 'BANJARA needs your location to find rides with pickups near you. Tap Allow when your phone asks.',
    action: 'retry',
  },
  blocked: {
    title: 'Enable your location',
    body: 'Location is turned off for BANJARA, so we can’t find rides near you. Turn it on in three quick steps:',
    steps: SETTINGS_STEPS,
    action: 'settings',
  },
  'services-off': {
    title: 'Turn on your location',
    body: 'Your phone’s location (GPS) is switched off. Turn it on to see rides near you:',
    steps: DEVICE_STEPS,
    action: Platform.OS === 'android' ? 'turn-on' : 'settings',
  },
  noanswer: {
    title: 'We didn’t get your location',
    body: 'The location request wasn’t answered. Tap Ask again and choose Allow to find rides near you.',
    action: 'retry',
  },
  timeout: {
    title: 'Finding your location took too long',
    body: 'Your phone didn’t return a position in time. Move somewhere with better signal or open sky, then try again.',
    steps: DEVICE_STEPS,
    action: 'retry',
  },
  unavailable: {
    title: 'We couldn’t find your location',
    body: 'Check that location is on, then try again, or browse every ride.',
    steps: DEVICE_STEPS,
    action: 'retry',
  },
};

/**
 * "What are you looking for?" — shown when the visitor opens Explore. Ride asks for location
 * and opens the nearby-rides map; the other services open their tab.
 */
export function ServicePickerSheet({
  visible,
  startWith = 'choose',
  onPick,
  onClose,
}: {
  visible: boolean;
  /** 'locating' skips the question (the "Rides near me" button). */
  startWith?: 'choose' | 'locating';
  onPick: (service: ExploreServiceTab) => void;
  onClose: () => void;
}) {
  const theme = useExploreDesign();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(startWith);
  const alive = useRef(true);
  // City to City shows only while BANJARA has it switched on.
  const [cityToCity, setCityToCity] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    getIntercityConfigCached()
      .then((config) => live && setCityToCity(config.enabled))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [visible]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Progress while locating: waiting for permission → getting a fix → found, opening the map.
  const [stage, setStage] = useState<LocateStage | 'found'>('asking');
  const [nudge, setNudge] = useState(false);
  useEffect(() => {
    if (step !== 'locating' || stage !== 'asking') return;
    const id = setTimeout(() => setNudge(true), 8000);
    return () => clearTimeout(id);
  }, [step, stage]);

  // After locating: the visitor's position and where nearby rides are heading.
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [destinations, setDestinations] = useState<Destination[] | null>(null);
  const [destinationsFailed, setDestinationsFailed] = useState(false);
  const [typed, setTyped] = useState('');

  const loadDestinations = (latitude: number, longitude: number) => {
    setDestinations(null);
    setDestinationsFailed(false);
    fetchNearbyRides(latitude, longitude, NEAR_DEFAULT_KM).then(
      (rides) => {
        if (!alive.current) return;
        const byName = new Map<string, Destination>();
        for (const ride of rides) {
          const name = (ride.city || '').trim();
          if (!name) continue;
          const key = name.toLowerCase();
          const current = byName.get(key) ?? { name, rides: 0, from: null };
          current.rides += 1;
          if (ride.price && ride.price > 0 && (current.from === null || ride.price < current.from)) {
            current.from = ride.price;
          }
          byName.set(key, current);
        }
        setDestinations(
          [...byName.values()].sort((a, b) => b.rides - a.rides || a.name.localeCompare(b.name)),
        );
      },
      () => {
        if (alive.current) setDestinationsFailed(true);
      },
    );
  };

  /** Open the nearby-rides map, only rides going to `to` when given. */
  const openRides = (to?: string) => {
    if (!position) return;
    const query = `lat=${position.latitude.toFixed(5)}&lng=${position.longitude.toFixed(5)}`;
    onClose();
    pushPath(`/(customer)/explore/nearby?${query}${to ? `&to=${encodeURIComponent(to)}` : ''}`);
  };

  // One lookup at a time (Try again, returning from Settings and the Android dialog can overlap).
  const running = useRef(false);
  const findRides = async () => {
    if (running.current) return;
    running.current = true;
    setStep('locating');
    setStage('asking');
    setNudge(false);
    const startedAt = Date.now();
    const result = await locateVisitor((next) => {
      if (alive.current) setStage(next);
    }).finally(() => {
      running.current = false;
    });
    if (!alive.current) return;
    if (!result.ok) {
      setStep(result.reason);
      return;
    }
    setPosition({ latitude: result.latitude, longitude: result.longitude });
    // Look up nearby destinations while the progress steps play out.
    loadDestinations(result.latitude, result.longitude);
    // Pace the steps so the whole flow takes ~3.5s even when the fix is instant.
    await wait(Math.max(0, MIN_LOCATING_MS - (Date.now() - startedAt)));
    if (!alive.current) return;
    setStage('found');
    await wait(FOUND_HOLD_MS);
    if (!alive.current) return;
    setTyped('');
    setStep('destination');
  };

  const turnOnLocation = async () => {
    if (await askToTurnOnLocation()) void findRides();
  };

  // Reset to the requested first step each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setStep(startWith);
    if (startWith === 'locating') void findRides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, startWith]);

  // Coming back from Settings: if location is now allowed, carry on automatically.
  useEffect(() => {
    if (step !== 'blocked' && step !== 'services-off') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void findRides();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const failure =
    step !== 'choose' && step !== 'locating' && step !== 'destination' ? FAILURE[step] : null;
  const query = typed.trim().toLowerCase();
  const shownDestinations = (destinations ?? []).filter(
    (place) => !query || place.name.toLowerCase().includes(query),
  );
  const submitTyped = () => {
    const exact = shownDestinations.find((place) => place.name.toLowerCase() === query);
    if (exact) openRides(exact.name);
    else if (shownDestinations.length === 1) openRides(shownDestinations[0].name);
    else if (typed.trim()) openRides(typed.trim());
  };
  const progress: { label: string; state: 'done' | 'active' | 'waiting' }[] = [
    {
      label: stage === 'asking' ? 'Waiting for location permission' : 'Location permission allowed',
      state: stage === 'asking' ? 'active' : 'done',
    },
    {
      label: stage === 'found' ? 'Found your position' : 'Pinpointing your position',
      state: stage === 'locating' ? 'active' : stage === 'found' ? 'done' : 'waiting',
    },
    {
      label: `Finding rides within ${NEAR_DEFAULT_KM} km`,
      state: stage === 'found' ? 'active' : 'waiting',
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[
            s.sheet,
            { backgroundColor: theme.surface, paddingBottom: insets.bottom + 16 },
          ]}
          accessibilityViewIsModal
        >
          <View style={[s.handle, { backgroundColor: theme.border }]} />
          <Pressable
            onPress={onClose}
            style={[s.close, { backgroundColor: theme.field }]}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color={theme.muted} />
          </Pressable>

          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          {step === 'choose' ? (
            <>
              <Text style={[s.eyebrow, { color: theme.primary }]}>WELCOME TO EXPLORE</Text>
              <Text style={[s.title, { color: theme.text }]} accessibilityRole="header">
                What are you looking for?
              </Text>
              <Text style={[s.lead, { color: theme.muted }]}>
                Pick a service and we’ll take you straight there.
              </Text>

              <Tappable
                onPress={() => void findRides()}
                accessibilityRole="button"
                accessibilityLabel={`Ride. Find rides with pickups within ${NEAR_DEFAULT_KM} kilometres of you. Uses your location.`}
                style={({ pressed }) => [
                  s.ride,
                  { borderColor: theme.primary, backgroundColor: theme.soft, opacity: pressed ? 0.9 : 1 },
                ]}
              >
                <LinearGradient
                  colors={['#1FC77A', '#0F9B98']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.rideIcon}
                >
                  <MaterialCommunityIcons name="car" size={28} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rideTitle, { color: theme.text }]}>Ride</Text>
                  <Text style={[s.rideHint, { color: theme.muted }]}>Find rides with pickups near you</Text>
                  <View style={s.rideTag}>
                    <Ionicons name="locate" size={13} color={theme.primary} />
                    <Text style={[s.rideTagText, { color: theme.primary }]}>
                      Uses your location · within {NEAR_DEFAULT_KM} km
                    </Text>
                  </View>
                </View>
                <Ionicons name="arrow-forward" size={20} color={theme.primary} />
              </Tappable>

              {cityToCity ? (
                <Pressable
                  onPress={() => {
                    onClose();
                    pushPath('/(customer)/intercity');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="City to City. A door-to-door ride to another city. Name your price."
                  style={[s.intercity, { borderColor: theme.border, backgroundColor: theme.surface }]}
                >
                  <View style={[s.optionIcon, s.intercityIcon, { backgroundColor: theme.field }]}>
                    <MaterialCommunityIcons name="map-marker-path" size={22} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.optionTitle, { color: theme.text }]}>City to City</Text>
                    <Text style={[s.optionHint, { color: theme.muted }]}>Door-to-door to another city · name your price</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.muted} />
                </Pressable>
              ) : null}

              <View style={s.grid}>
                {OTHERS.map((option) => (
                  <Tappable
                    key={option.id}
                    onPress={() => onPick(option.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${option.label}. ${option.hint}`}
                    style={({ pressed }) => [
                      s.option,
                      { borderColor: theme.border, backgroundColor: theme.surface, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <View style={[s.optionIcon, { backgroundColor: theme.field }]}>
                      <MaterialCommunityIcons name={option.icon} size={22} color={theme.primary} />
                    </View>
                    <Text style={[s.optionTitle, { color: theme.text }]}>{option.label}</Text>
                    <Text style={[s.optionHint, { color: theme.muted }]} numberOfLines={1}>
                      {option.hint}
                    </Text>
                  </Tappable>
                ))}
              </View>

              <Pressable onPress={onClose} style={s.skip} accessibilityRole="button">
                <Text style={[s.skipText, { color: theme.primary }]}>Just browse everything</Text>
              </Pressable>
            </>
          ) : step === 'locating' ? (
            <View style={s.state}>
              <LocatingRadar found={stage === 'found'} calm={stage === 'asking'} />
              <Text
                style={[s.title, s.center, { color: theme.text }]}
                accessibilityRole="header"
                accessibilityLiveRegion="polite"
              >
                {stage === 'asking'
                  ? 'Allow location access'
                  : stage === 'locating'
                    ? 'Finding your location…'
                    : 'Found you!'}
              </Text>
              <Text style={[s.lead, s.center, { color: theme.muted }]}>
                {stage === 'asking'
                  ? 'Your phone will ask to share your location. Tap Allow so we can show rides you can reach.'
                  : stage === 'locating'
                    ? 'Getting your position. This usually takes a few seconds.'
                    : `Looking for rides with pickups within ${NEAR_DEFAULT_KM} km of you.`}
              </Text>

              <View style={[s.progress, { borderColor: theme.border, backgroundColor: theme.field }]}>
                {progress.map((item) => (
                  <View key={item.label} style={s.progressRow}>
                    <View
                      style={[
                        s.progressDot,
                        item.state === 'done'
                          ? { backgroundColor: theme.action, borderColor: theme.action }
                          : item.state === 'active'
                            ? { borderColor: theme.action, backgroundColor: theme.surface }
                            : { borderColor: theme.border, backgroundColor: theme.surface },
                      ]}
                    >
                      {item.state === 'done' ? (
                        <Ionicons name="checkmark" size={13} color="#fff" />
                      ) : item.state === 'active' ? (
                        <ActivityIndicator size="small" color={theme.action} style={s.progressSpinner} />
                      ) : null}
                    </View>
                    <Text
                      style={[
                        s.progressText,
                        item.state === 'active'
                          ? { color: theme.text, fontFamily: Fonts.bodySemiBold }
                          : item.state === 'done'
                            ? { color: theme.primary }
                            : { color: theme.muted },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </View>
                ))}
              </View>

              {nudge && stage === 'asking' ? (
                <View style={s.nudge} accessibilityLiveRegion="polite">
                  <Ionicons name="information-circle" size={18} color="#7A4A00" />
                  <Text style={s.nudgeText}>
                    Don’t see a prompt? Location may be turned off for BANJARA.{' '}
                    <Text style={s.nudgeLink} onPress={() => void Linking.openSettings()}>
                      Open settings
                    </Text>
                  </Text>
                </View>
              ) : null}
              <View style={s.privacy}>
                <Ionicons name="shield-checkmark" size={14} color={theme.action} />
                <Text style={[s.privacyText, { color: theme.muted }]}>
                  Used only for this search. We don’t store your location.
                </Text>
              </View>
              <Pressable onPress={() => onPick('transport')} style={s.skip} accessibilityRole="button">
                <Text style={[s.skipText, { color: theme.primary }]}>Skip and browse all rides</Text>
              </Pressable>
            </View>
          ) : step === 'destination' ? (
            <>
              <View style={s.rideTag}>
                <Ionicons name="locate" size={13} color={theme.primary} />
                <Text style={[s.eyebrow, { color: theme.primary }]}>
                  PICKUPS WITHIN {NEAR_DEFAULT_KM} KM OF YOU
                </Text>
              </View>
              <Text style={[s.title, { color: theme.text }]} accessibilityRole="header">
                Where do you want to go?
              </Text>
              <Text style={[s.lead, { color: theme.muted }]}>
                Pick a destination and we’ll show rides heading there.
              </Text>

              <View style={[s.whereSearch, { borderColor: theme.border, backgroundColor: theme.field }]}>
                <Ionicons name="search" size={18} color={theme.muted} />
                <TextInput
                  value={typed}
                  onChangeText={setTyped}
                  onSubmitEditing={submitTyped}
                  placeholder="Search a city, e.g. Skardu"
                  placeholderTextColor={theme.muted}
                  returnKeyType="search"
                  autoCorrect={false}
                  maxLength={100}
                  accessibilityLabel="Destination"
                  style={[s.whereInput, { color: theme.text }]}
                />
                {typed ? (
                  <Pressable onPress={() => setTyped('')} hitSlop={8} accessibilityLabel="Clear">
                    <Ionicons name="close-circle" size={18} color={theme.muted} />
                  </Pressable>
                ) : null}
              </View>

              {destinations === null && !destinationsFailed ? (
                <View style={[s.whereNote, { backgroundColor: theme.field }]} accessibilityLiveRegion="polite">
                  <ActivityIndicator size="small" color={theme.action} />
                  <Text style={[s.whereNoteText, { color: theme.muted }]}>Finding where nearby rides go…</Text>
                </View>
              ) : destinationsFailed ? (
                <View style={[s.whereNote, { backgroundColor: theme.field }]}>
                  <Text style={[s.whereNoteText, { color: theme.muted }]}>
                    We couldn’t load destinations. Type one above, or see every ride near you.
                  </Text>
                </View>
              ) : destinations && destinations.length === 0 ? (
                <View style={[s.whereNote, { backgroundColor: theme.field }]}>
                  <Text style={[s.whereNoteText, { color: theme.muted }]}>
                    No rides pick up within {NEAR_DEFAULT_KM} km of you right now. You can browse every ride instead.
                  </Text>
                </View>
              ) : shownDestinations.length === 0 ? (
                <View style={[s.whereNote, { backgroundColor: theme.field }]}>
                  <Text style={[s.whereNoteText, { color: theme.muted }]}>
                    No nearby rides go to “{typed.trim()}”. Tap search on your keyboard to look anyway.
                  </Text>
                </View>
              ) : (
                <View style={s.places}>
                  {shownDestinations.map((place) => (
                    <Tappable
                      key={place.name}
                      onPress={() => openRides(place.name)}
                      accessibilityRole="button"
                      accessibilityLabel={`${place.name}. ${place.rides} ${place.rides === 1 ? 'ride' : 'rides'}`}
                      style={({ pressed }) => [
                        s.place,
                        { borderColor: theme.border, backgroundColor: theme.surface, opacity: pressed ? 0.85 : 1 },
                      ]}
                    >
                      <View style={[s.placeIcon, { backgroundColor: theme.soft }]}>
                        <Ionicons name="navigate" size={16} color={theme.primary} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.optionTitle, { color: theme.text }]} numberOfLines={1}>
                          {place.name}
                        </Text>
                        <Text style={[s.optionHint, { color: theme.muted }]}>
                          {place.rides} {place.rides === 1 ? 'ride' : 'rides'}
                          {place.from !== null ? ` · from Rs ${place.from.toLocaleString('en-PK')}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="arrow-forward" size={18} color={theme.primary} />
                    </Tappable>
                  ))}
                </View>
              )}

              {destinations && destinations.length === 0 ? (
                <Pressable
                  onPress={() => onPick('transport')}
                  style={[s.primary, { backgroundColor: theme.action }]}
                  accessibilityRole="button"
                >
                  <Text style={s.primaryText}>Browse all rides</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => openRides()}
                  style={[s.secondary, s.secondaryRow, { borderColor: theme.border }]}
                  accessibilityRole="button"
                >
                  <Ionicons name="location-outline" size={17} color={theme.text} />
                  <Text style={[s.secondaryText, { color: theme.text }]}>Show all rides near me</Text>
                </Pressable>
              )}
            </>
          ) : failure ? (
            <View style={s.state} accessibilityLiveRegion="assertive">
              <View style={[s.stateIcon, { backgroundColor: '#FFF1D6' }]}>
                <MaterialCommunityIcons name="map-marker-off-outline" size={30} color="#9A5B00" />
              </View>
              <Text style={[s.title, s.center, { color: theme.text }]} accessibilityRole="header">
                {failure.title}
              </Text>
              <Text style={[s.lead, s.center, { color: theme.muted }]}>{failure.body}</Text>
              {failure.steps ? (
                <View style={s.howTo}>
                  {failure.steps.map((text, i) => (
                    <View
                      key={text}
                      style={[s.howToRow, { borderColor: theme.border, backgroundColor: theme.field }]}
                    >
                      <LinearGradient colors={['#1FC77A', '#0F9B98']} style={s.howToNum}>
                        <Text style={s.howToNumText}>{i + 1}</Text>
                      </LinearGradient>
                      <Text style={[s.howToText, { color: theme.text }]}>{text}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {failure.action === 'settings' || failure.action === 'turn-on' ? (
                <Pressable
                  onPress={() =>
                    failure.action === 'turn-on' ? void turnOnLocation() : void Linking.openSettings()
                  }
                  style={[s.primary, { backgroundColor: theme.action }]}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={failure.action === 'turn-on' ? 'location' : 'settings-outline'}
                    size={18}
                    color="#fff"
                  />
                  <Text style={s.primaryText}>
                    {failure.action === 'turn-on' ? 'Turn on location' : 'Open settings'}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => void findRides()}
                style={[
                  s.primary,
                  failure.action === 'retry'
                    ? { backgroundColor: theme.action }
                    : { backgroundColor: theme.field },
                ]}
                accessibilityRole="button"
              >
                <Ionicons name="locate" size={18} color={failure.action === 'retry' ? '#fff' : theme.text} />
                <Text style={[s.primaryText, failure.action === 'retry' ? null : { color: theme.text }]}>
                  {step === 'noanswer' || step === 'denied' ? 'Ask again' : 'Try again'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onPick('transport')}
                style={[s.secondary, { borderColor: theme.border }]}
                accessibilityRole="button"
              >
                <Text style={[s.secondaryText, { color: theme.text }]}>Browse all rides instead</Text>
              </Pressable>
            </View>
          ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Three ripples, a sweeping beam and a bobbing map pin: "we're searching where you are". */
function LocatingRadar({ found, calm }: { found: boolean; calm: boolean }) {
  const ripple = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (found || reduceMotion) return;
    const loops = [
      Animated.loop(
        Animated.timing(ripple, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ),
      Animated.loop(
        Animated.timing(sweep, { toValue: 1, duration: calm ? 3600 : 2200, easing: Easing.linear, useNativeDriver: true }),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(bob, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    ];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [found, calm, reduceMotion, ripple, sweep, bob]);

  const rings = [0, 1 / 3, 2 / 3].map((offset) => {
    // Each ring runs the same 0→1 cycle, a third of a cycle apart.
    const phase = Animated.modulo(Animated.add(ripple, offset), 1);
    return {
      key: offset,
      style: {
        opacity: phase.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
        transform: [{ scale: phase.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }],
      },
    };
  });

  return (
    <View style={s.radar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {!found && !reduceMotion
        ? rings.map((ring) => <Animated.View key={ring.key} style={[s.ring, ring.style]} />)
        : null}
      {!found && !reduceMotion ? (
        <Animated.View
          style={[
            s.sweep,
            { transform: [{ rotate: sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
          ]}
        >
          <LinearGradient
            colors={['rgba(22,179,100,0)', 'rgba(22,179,100,0.28)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={s.sweepBeam}
          />
        </Animated.View>
      ) : null}
      <Animated.View
        style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }}
      >
        <LinearGradient colors={['#1FC77A', '#0F9B98']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.radarPin}>
          {found ? (
            <Ionicons name="checkmark" size={30} color="#fff" />
          ) : (
            <MaterialCommunityIcons name="map-marker-outline" size={30} color="#fff" />
          )}
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  radar: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: '#EEF9F4',
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    borderColor: '#16B364',
  },
  sweep: { position: 'absolute', width: 116, height: 116 },
  sweepBeam: { position: 'absolute', left: 58, top: 0, width: 58, height: 58, borderTopRightRadius: 58 },
  radarPin: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F9B98',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  progress: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 18,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressSpinner: { transform: [{ scale: 0.7 }] },
  progressText: { flex: 1, fontFamily: Fonts.body, fontSize: 14 },
  nudge: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FFF7E6',
  },
  nudgeText: { flex: 1, fontFamily: Fonts.body, fontSize: 13, lineHeight: 18, color: '#7A4A00' },
  nudgeLink: { fontFamily: Fonts.bodySemiBold, textDecorationLine: 'underline' },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  privacyText: { fontFamily: Fonts.body, fontSize: 12 },
  howTo: { alignSelf: 'stretch', gap: 8, marginTop: 14 },
  howToRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 14,
  },
  howToNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  howToNumText: { fontFamily: Fonts.bodyBold, fontSize: 12, color: '#fff' },
  howToText: { flex: 1, fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,30,28,0.55)' },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 14 },
  close: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  eyebrow: { fontFamily: Fonts.bodyBold, fontSize: 12, letterSpacing: 0.8 },
  title: { fontFamily: Fonts.displayBold, fontSize: 23, marginTop: 4, paddingRight: 44 },
  lead: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20, marginTop: 6 },
  center: { textAlign: 'center', paddingRight: 0 },
  ride: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 18,
    padding: 14,
    borderWidth: 1.5,
    borderRadius: 20,
  },
  rideIcon: { width: 56, height: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rideTitle: { fontFamily: Fonts.displayBold, fontSize: 18 },
  rideHint: { fontFamily: Fonts.body, fontSize: 13, marginTop: 1 },
  rideTag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  rideTagText: { fontFamily: Fonts.bodySemiBold, fontSize: 12 },
  intercity: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, padding: 12, borderWidth: 1, borderRadius: 18 },
  intercityIcon: { marginBottom: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  option: { width: '48%', flexGrow: 1, padding: 12, borderWidth: 1, borderRadius: 18 },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  optionTitle: { fontFamily: Fonts.display, fontSize: 16 },
  optionHint: { fontFamily: Fonts.body, fontSize: 12, marginTop: 1 },
  skip: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, marginTop: 8 },
  skipText: { fontFamily: Fonts.bodySemiBold, fontSize: 14, textDecorationLine: 'underline' },
  state: { alignItems: 'center', paddingTop: 12 },
  stateIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  primary: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    borderRadius: 999,
    marginTop: 12,
  },
  primaryText: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: '#fff' },
  secondary: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 8,
  },
  secondaryText: { fontFamily: Fonts.bodySemiBold, fontSize: 15 },
  secondaryRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  whereSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    marginTop: 16,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderRadius: 16,
  },
  whereInput: { flex: 1, fontFamily: Fonts.body, fontSize: 15, paddingVertical: 10 },
  whereNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
  },
  whereNoteText: { flex: 1, fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  places: { gap: 8, marginTop: 14 },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  placeIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});

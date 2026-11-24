import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { openExternalMaps } from '@/components/map/mapHelpers';
import { Button } from '@/components/ui/Button';
import { useExploreDesign } from '@/constants/exploreDesign';
import { Fonts } from '@/constants/typography';
import * as tripService from '@/services/tripService';
import type { TripWithDetails } from '@/types/trip';
import { tripAvailability } from '@/utils/tripDetails';
import type { NearbyRide } from '@/utils/nearMe';

export type RideSheetDistance = {
  atPickup: boolean;
  loading: boolean;
  headline: string;
  detail: string;
};

/** Drag thresholds (px): a short pull collapses, a long one (or a flick) closes. */
const COLLAPSE_DRAG = 70;
const CLOSE_DRAG = 170;
const FLICK_SPEED = 1.3;
/** Horizontal swipe distance (px) to move to the next / previous ride. */
const SWIPE_RIDE = 70;

/** Shown once per app session so the gestures are discoverable without nagging. */
let gestureHintShown = false;

/**
 * Bottom sheet for the ride the customer tapped on the map.
 *
 * Gestures (whole card): drag down to collapse, drag further or flick to close, drag up to expand,
 * swipe sideways for the next / previous ride. The handle toggles collapsed/expanded on tap.
 * Buttons stay tappable because the card only claims clear vertical or horizontal drags.
 */
export function RideSheet({
  ride,
  distance,
  departure,
  bottomInset,
  position,
  onPrev,
  onNext,
  onClose,
  onViewDetails,
  onBook,
  onHeight,
}: {
  /** Reports the sheet's height so the map can keep the route clear of it. */
  onHeight?: (height: number) => void;
  ride: NearbyRide;
  distance: RideSheetDistance | null;
  /** "Sat 14 Nov · 7:00 AM" */
  departure: string | null;
  bottomInset: number;
  /** Where this ride sits in the list, for "2 of 11". */
  position: { index: number; total: number } | null;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  onViewDetails: () => void;
  /** Called with the full trip, ready for the booking flow. */
  onBook: (trip: TripWithDetails) => void;
}) {
  const theme = useExploreDesign();
  const [collapsed, setCollapsed] = useState(false);
  const [hint] = useState(() => {
    const first = !gestureHintShown;
    gestureHintShown = true;
    return first;
  });

  // Full trip (live seats, rating, verification). The sheet is usable before it arrives.
  const [trip, setTrip] = useState<TripWithDetails | null>(null);
  const [tripState, setTripState] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    let live = true;
    setTrip(null);
    setTripState('loading');
    tripService
      .getTripById(ride.target.id)
      .then((full) => {
        if (!live) return;
        setTrip(full);
        setTripState(full ? 'ready' : 'failed');
      })
      .catch(() => live && setTripState('failed'));
    return () => {
      live = false;
    };
  }, [ride.target.id]);

  // Motion: vertical offset for drag/slide-in, horizontal for the ride swipe.
  const offsetY = useRef(new Animated.Value(420)).current;
  const offsetX = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      reduceMotion.current = reduce;
      if (cancelled) return;
      if (reduce) offsetY.setValue(0);
      else Animated.spring(offsetY, { toValue: 0, useNativeDriver: true, bounciness: 3, speed: 14 }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [offsetY]);
  // Another ride picked: slide its content in from the side it came from.
  const lastIndex = useRef(position?.index ?? 0);
  useEffect(() => {
    const index = position?.index ?? 0;
    const from = index > lastIndex.current ? 60 : index < lastIndex.current ? -60 : 0;
    lastIndex.current = index;
    if (!from || reduceMotion.current) return;
    offsetX.setValue(from);
    Animated.spring(offsetX, { toValue: 0, useNativeDriver: true, bounciness: 2, speed: 18 }).start();
  }, [ride.id, position?.index, offsetX]);

  const animateLayout = () =>
    LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
  const settle = () =>
    Animated.spring(offsetY, { toValue: 0, useNativeDriver: true, bounciness: 3 }).start();

  // Latest values for the gesture handler (created once).
  const latest = useRef({ collapsed, onClose, onPrev, onNext });
  useEffect(() => {
    latest.current = { collapsed, onClose, onPrev, onNext };
  });

  const pan = useRef(
    PanResponder.create({
      // Claim only clear drags, so taps on buttons inside still work.
      onMoveShouldSetPanResponderCapture: (_, g) =>
        (Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2) ||
        (Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5),
      onPanResponderMove: (_, g) => {
        if (Math.abs(g.dx) > Math.abs(g.dy)) {
          offsetX.setValue(g.dx * 0.6);
        } else {
          // Follow the finger down; resist a little when pulled up.
          offsetY.setValue(g.dy > 0 ? g.dy : g.dy * 0.2);
        }
      },
      onPanResponderRelease: (_, g) => {
        const { collapsed: isCollapsed, onClose: close, onPrev: prev, onNext: next } = latest.current;
        // Sideways: next / previous ride.
        if (Math.abs(g.dx) > Math.abs(g.dy)) {
          Animated.spring(offsetX, { toValue: 0, useNativeDriver: true, bounciness: 2 }).start();
          if (g.dx < -SWIPE_RIDE && next) next();
          else if (g.dx > SWIPE_RIDE && prev) prev();
          return;
        }
        // Down: collapse first, then close (a flick or a long pull closes straight away).
        const flick = g.vy > FLICK_SPEED;
        if (g.dy > CLOSE_DRAG || (flick && isCollapsed) || (isCollapsed && g.dy > COLLAPSE_DRAG)) {
          Animated.timing(offsetY, { toValue: 500, duration: 170, useNativeDriver: true }).start(() => close());
          return;
        }
        if (g.dy > COLLAPSE_DRAG || flick) {
          animateLayout();
          setCollapsed(true);
          offsetY.setValue(0);
          return;
        }
        // Up: expand.
        if (g.dy < -40 && isCollapsed) {
          animateLayout();
          setCollapsed(false);
        }
        settle();
      },
      onPanResponderTerminate: () => {
        settle();
        Animated.spring(offsetX, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const availability = trip ? tripAvailability(trip) : null;
  const canBook = !!trip && !!availability?.canBook;
  const wholeVehicle = ride.priceUnit?.includes('vehicle') ?? false;
  const operator = ride.subtitle || trip?.agency.name || 'Transport provider';
  const verified = ride.verified || !!trip?.agency.verified;
  const rating = trip ? trip.agency.rating || trip.rating : ride.rating;
  const reviews = trip?.agency.reviewCount ?? 0;
  const route = ride.tags[0];
  const features = ride.tags.slice(1, 3);
  const amount = ride.price && ride.price > 0 ? `PKR ${ride.price.toLocaleString('en-PK')}` : null;

  const seats =
    tripState === 'loading'
      ? { icon: 'people-outline' as const, text: 'Checking…', tone: theme.muted }
      : !trip
        ? { icon: 'people-outline' as const, text: 'On request', tone: theme.muted }
        : availability?.soldOut
          ? { icon: 'close-circle' as const, text: 'Sold out', tone: theme.coral }
          : wholeVehicle
            ? { icon: 'people' as const, text: `Seats up to ${trip.totalSeats || trip.availableSeats}`, tone: theme.positive }
            : {
                icon: 'people' as const,
                text: `${trip.availableSeats} ${trip.availableSeats === 1 ? 'seat' : 'seats'} left`,
                tone: trip.availableSeats <= 3 ? theme.coral : theme.positive,
              };

  const bookTitle =
    tripState === 'failed'
      ? 'View & book'
      : availability?.soldOut
        ? 'Sold out'
        : availability?.unavailable
          ? 'Not available'
          : wholeVehicle
            ? 'Book vehicle'
            : 'Book a seat';

  const toggle = () => {
    animateLayout();
    setCollapsed((value) => !value);
  };

  const book = (
    <Button
      title={bookTitle}
      onPress={() => (canBook && trip ? onBook(trip) : tripState === 'failed' ? onViewDetails() : undefined)}
      loading={tripState === 'loading'}
      disabled={!canBook && tripState !== 'failed'}
      fullWidth={false}
      style={collapsed ? s.bookCompact : s.main}
      compact={collapsed}
      icon={canBook ? <Ionicons name="arrow-forward" size={16} color="#fff" /> : undefined}
      iconPosition="right"
    />
  );

  return (
    <Animated.View
      {...pan.panHandlers}
      onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)}
      style={[
        s.sheet,
        {
          paddingBottom: bottomInset + (collapsed ? 10 : 14),
          backgroundColor: theme.surface,
          borderColor: theme.border,
          transform: [{ translateY: offsetY }],
        },
      ]}
      accessibilityLabel={`${ride.title}, ${operator}`}
    >
      {/* Handle: tap to collapse / expand. */}
      <Pressable
        onPress={toggle}
        style={s.handleHit}
        accessibilityRole="button"
        accessibilityLabel={collapsed ? 'Show ride details' : 'Minimise ride details'}
        hitSlop={8}
      >
        <View style={[s.handle, { backgroundColor: theme.border }]} />
      </Pressable>

      {/* Ride pager: slim dots + arrows, to compare nearby rides without closing. */}
      {position && position.total > 1 && !collapsed ? (
        <View style={s.pager} accessibilityRole="adjustable" accessibilityLabel={`Ride ${position.index + 1} of ${position.total}`}>
          <Pressable
            onPress={onPrev}
            disabled={!onPrev}
            style={({ pressed }) => [s.pageBtn, { backgroundColor: theme.field, opacity: !onPrev ? 0.35 : pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Previous ride"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={15} color={theme.text} />
          </Pressable>
          {position.total <= 7 ? (
            <View style={s.dots}>
              {Array.from({ length: position.total }, (_, i) => (
                <View
                  key={i}
                  style={[
                    s.dot,
                    i === position.index
                      ? [s.dotActive, { backgroundColor: theme.primary }]
                      : { backgroundColor: theme.border },
                  ]}
                />
              ))}
            </View>
          ) : (
            <Text style={[s.pageText, { color: theme.muted }]}>
              {position.index + 1} / {position.total}
            </Text>
          )}
          <Pressable
            onPress={onNext}
            disabled={!onNext}
            style={({ pressed }) => [s.pageBtn, { backgroundColor: theme.field, opacity: !onNext ? 0.35 : pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Next ride"
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={15} color={theme.text} />
          </Pressable>
        </View>
      ) : null}

      <Animated.View style={{ transform: [{ translateX: offsetX }] }}>
        {/* Header: photo, vehicle, operator, close. */}
        <View style={s.header}>
          <Pressable onPress={onViewDetails} accessibilityRole="imagebutton" accessibilityLabel="Open trip details">
            {ride.image ? (
              <Image
                source={{ uri: ride.image }}
                style={[s.thumb, collapsed && s.thumbSmall]}
                contentFit="cover"
                transition={150}
              />
            ) : (
              <View style={[s.thumb, collapsed && s.thumbSmall, s.center, { backgroundColor: theme.field }]}>
                <MaterialCommunityIcons name="car" size={26} color={theme.muted} />
              </View>
            )}
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>
              {ride.title}
            </Text>
            <View style={s.row}>
              <Text style={[s.sub, { color: theme.muted }]} numberOfLines={1}>
                {operator}
              </Text>
              {verified ? <Ionicons name="checkmark-circle" size={14} color={theme.primary} /> : null}
            </View>
            {collapsed ? (
              <Text style={[s.price, s.priceCompact, { color: theme.text }]} numberOfLines={1}>
                {amount ?? 'Ask for price'}
                {amount ? <Text style={[s.unit, { color: theme.muted }]}>{wholeVehicle ? ' / vehicle' : ' / seat'}</Text> : null}
              </Text>
            ) : (
              <View style={s.row}>
                {rating ? (
                  <>
                    <Ionicons name="star" size={12} color="#F59E0B" />
                    <Text style={[s.ratingText, { color: theme.text }]}>{rating.toFixed(1)}</Text>
                    {reviews ? <Text style={[s.sub, { color: theme.muted }]}>({reviews})</Text> : null}
                  </>
                ) : (
                  <View style={s.newTag}>
                    <Text style={s.newTagText}>New</Text>
                  </View>
                )}
              </View>
            )}
            {!collapsed && features.length > 0 ? (
              <View style={s.features} accessibilityLabel={`Features: ${features.join(', ')}`}>
                {features.map((feature) => (
                  <View key={feature} style={[s.feature, { borderColor: theme.border }]}>
                    <Text style={[s.featureText, { color: theme.muted }]} numberOfLines={1}>
                      {feature}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          {collapsed ? (
            book
          ) : (
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [s.round, { backgroundColor: theme.field, opacity: pressed ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Close ride details"
              hitSlop={8}
            >
              <Ionicons name="close" size={18} color={theme.text} />
            </Pressable>
          )}
        </View>

        {collapsed ? null : (
          <>
            {/* Facts, styled like the list card rows. */}
            <View style={s.facts}>
              {route ? <Fact icon="swap-horizontal" text={route} color={theme.primary} textColor={theme.text} /> : null}
              {departure ? (
                <Fact icon="calendar-outline" text={departure} color={theme.primary} textColor={theme.text} />
              ) : null}
              {ride.location?.address ? (
                <Fact icon="location" text={ride.location.address} color={theme.primary} textColor={theme.text} />
              ) : null}
            </View>

            {/* Distance + seats as chips. */}
            <View style={s.chips}>
              {distance ? (
                <View style={[s.chip, { backgroundColor: theme.soft }]} accessibilityLiveRegion="polite">
                  {distance.loading ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <Ionicons name={distance.atPickup ? 'checkmark-circle' : 'car'} size={15} color={theme.primary} />
                  )}
                  <Text style={[s.chipText, { color: theme.primary }]} numberOfLines={1}>
                    {distance.headline}
                  </Text>
                </View>
              ) : null}
              <View style={[s.chip, { backgroundColor: theme.field }]}>
                <Ionicons name={seats.icon} size={15} color={seats.tone} />
                <Text style={[s.chipText, { color: seats.tone }]} numberOfLines={1}>
                  {seats.text}
                </Text>
              </View>
            </View>
            {distance?.detail && !distance.atPickup ? (
              <Text style={[s.chipNote, { color: theme.muted }]}>{distance.detail}</Text>
            ) : null}

            {/* Price, then actions on their own row so nothing can push Book off screen. */}
            <View style={[s.priceRow, { borderTopColor: theme.border }]}>
              <Text style={[s.price, { color: theme.text }]} numberOfLines={1}>
                {amount ?? 'Ask for price'}
                {amount ? (
                  <Text style={[s.unit, { color: theme.muted }]}>{wholeVehicle ? ' / whole vehicle' : ' / seat'}</Text>
                ) : null}
              </Text>
            </View>
            <View style={s.actions}>
              {ride.location ? (
                <Pressable
                  onPress={() =>
                    openExternalMaps(
                      { latitude: ride.location!.lat, longitude: ride.location!.lng },
                      ride.location!.address || operator,
                      'directions',
                    )
                  }
                  style={({ pressed }) => [
                    s.round,
                    s.roundLarge,
                    { backgroundColor: theme.soft, transform: [{ scale: pressed ? 0.94 : 1 }] },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Directions to the pickup"
                >
                  <Ionicons name="navigate" size={20} color={theme.primary} />
                </Pressable>
              ) : null}
              <Button title="Details" variant="outline" onPress={onViewDetails} fullWidth={false} style={s.half} />
              {book}
            </View>

            {hint ? (
              <Text style={[s.hint, { color: theme.muted }]}>
                Swipe down to close{position && position.total > 1 ? ' · sideways for more rides' : ''}
              </Text>
            ) : null}
          </>
        )}
      </Animated.View>
    </Animated.View>
  );
}

function Fact({
  icon,
  text,
  color,
  textColor,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
  color: string;
  textColor: string;
}) {
  return (
    <View style={s.fact}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[s.factText, { color: textColor }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    shadowColor: '#0F1E1C',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
    zIndex: 20,
  },
  handleHit: { alignSelf: 'stretch', alignItems: 'center', paddingTop: 8, paddingBottom: 10 },
  handle: { width: 44, height: 5, borderRadius: 3 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 72, height: 72, borderRadius: 14 },
  thumbSmall: { width: 52, height: 52, borderRadius: 12 },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.display, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  sub: { flexShrink: 1, fontFamily: Fonts.body, fontSize: 13 },
  ratingText: { fontFamily: Fonts.bodySemiBold, fontSize: 13 },
  newTag: { paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, backgroundColor: '#F59E0B26' },
  newTagText: { fontFamily: Fonts.bodyBold, fontSize: 11.5, color: '#B45309' },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  feature: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, borderWidth: 1, maxWidth: '100%' },
  featureText: { fontFamily: Fonts.body, fontSize: 12 },
  round: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  roundLarge: { width: 48, height: 48, borderRadius: 24 },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: -4,
    marginBottom: 10,
  },
  pageBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotActive: { width: 20 },
  pageText: { fontFamily: Fonts.bodySemiBold, fontSize: 12.5, minWidth: 44, textAlign: 'center' },
  facts: { gap: 6, marginTop: 12 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  factText: { flex: 1, fontFamily: Fonts.body, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  chipText: { flexShrink: 1, fontFamily: Fonts.bodySemiBold, fontSize: 13 },
  chipNote: { fontFamily: Fonts.body, fontSize: 12, marginTop: 4, marginLeft: 4 },
  priceRow: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  price: { flexShrink: 1, fontFamily: Fonts.bodyBold, fontSize: 18 },
  priceCompact: { fontSize: 15, marginTop: 2 },
  unit: { fontFamily: Fonts.body, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  half: { flex: 1, paddingHorizontal: 12 },
  main: { flex: 1.4, paddingHorizontal: 12 },
  bookCompact: { paddingHorizontal: 14 },
  hint: { textAlign: 'center', fontFamily: Fonts.body, fontSize: 11.5, marginTop: 10 },
});

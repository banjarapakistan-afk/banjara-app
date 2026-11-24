import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { DistanceSlider } from '@/components/explore/DistanceSlider';
import { RideSheet } from '@/components/explore/RideSheet';
import { CityToCityEntry } from '@/components/intercity/CityToCityEntry';
import { InAppWebMap } from '@/components/map/InAppWebMap';
import { fetchDrivingRoute } from '@/components/map/fetchDrivingRoute';
import type { MapPerson, MapVehicleInfo } from '@/components/map/mapHelpers';
import { mapTravelerFromUser } from '@/components/map/mapParties';
import { useNativeMaps } from '@/components/map/nativeMaps';
import { useAuthStore } from '@/store/authStore';
import { useBookingStore } from '@/store/bookingStore';
import type { Coordinates } from '@/types/route';
import { Header } from '@/components/ui/Header';
import { useExploreDesign } from '@/constants/exploreDesign';
import { Fonts } from '@/constants/typography';
import {
  NEAR_DEFAULT_KM,
  NEAR_MAX_KM,
  distanceLabel,
  fetchAllRides,
  fetchNearbyRides,
  type NearbyRide,
} from '@/utils/nearMe';
import { pushPath, replacePath } from '@/utils/navigation';
import { Tappable } from '@/components/ui/Tappable';

const MAP_HEIGHT = 300;

/** Rides whose pickup is within 10 km of the visitor; widen to 20 km when nothing is close. */
export default function NearbyRidesScreen() {
  const theme = useExploreDesign();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; radius?: string; to?: string }>();
  const latitude = Number(params.lat);
  const longitude = Number(params.lng);
  const hasPosition = Number.isFinite(latitude) && Number.isFinite(longitude);
  // Chosen in the "Where do you want to go?" step after locating.
  const goingTo = hasPosition ? (params.to ?? '').trim().slice(0, 100) : '';

  const [radiusKm, setRadiusKm] = useState(() => {
    const r = Number(params.radius);
    return Number.isFinite(r) && r > 0 ? Math.min(NEAR_MAX_KM, Math.max(1, Math.round(r))) : NEAR_DEFAULT_KM;
  });
  const [rides, setRides] = useState<NearbyRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [draftKm, setDraftKm] = useState(radiusKm);

  // Without a position (location skipped or blocked) this shows every ride on the map.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRides(
        hasPosition
          ? await fetchNearbyRides(latitude, longitude, radiusKm, goingTo || undefined)
          : await fetchAllRides(),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rides could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [hasPosition, latitude, longitude, radiusKm, goingTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const empty = !loading && !error && rides.length === 0;
  const atMax = radiusKm >= NEAR_MAX_KM;

  // When nothing is close, suggest a wider circle straight away.
  useEffect(() => {
    if (empty) setDraftKm((km) => (km <= radiusKm && radiusKm < NEAR_MAX_KM ? Math.min(NEAR_MAX_KM, radiusKm + 5) : km));
  }, [empty, radiusKm]);

  const applyRadius = (km: number) => {
    setRangeOpen(false);
    setSelectedId(null);
    setRadiusKm(km);
    setDraftKm(km);
  };
  // Same screen, no distance limit (never the Explore list: rides aren't listed there).
  const browseAll = () => replacePath('/(customer)/explore/nearby');
  // Each card is one departure, so it opens that trip (date, seats, booking).
  const openRide = (ride: NearbyRide) => pushPath(`/(customer)/trip/${ride.target.id}`);

  const markers = useMemo(
    () =>
      rides
        .filter((ride) => ride.location)
        .map((ride) => ({
          id: ride.id,
          title: ride.title,
          subtitle: [distanceLabel(ride.distanceKm) && `${distanceLabel(ride.distanceKm)} away`, priceText(ride)]
            .filter(Boolean)
            .join(' · '),
          coordinate: { latitude: ride.location!.lat, longitude: ride.location!.lng },
          selected: ride.id === selectedId,
        })),
    [rides, selectedId],
  );

  // On the map: the customer as their photo + name, and once a ride is tapped, the operator's
  // logo + name at its pickup with the road route from the customer to it.
  const user = useAuthStore((state) => state.user);
  const position = useMemo(
    () => (hasPosition ? { latitude, longitude } : null),
    [hasPosition, latitude, longitude],
  );
  const traveler = useMemo<MapPerson | null>(
    () => (position ? (mapTravelerFromUser(user) ?? { name: 'You', label: 'You' }) : null),
    [position, user],
  );
  const selectedRide = rides.find((ride) => ride.id === selectedId && ride.location) ?? null;
  const provider = useMemo<MapVehicleInfo | null>(
    () =>
      selectedRide
        ? {
            name: selectedRide.title,
            agencyName: selectedRide.subtitle || selectedRide.title,
            agencyLogo: selectedRide.providerLogo || undefined,
            imageUrl: selectedRide.image || undefined,
          }
        : null,
    [selectedRide],
  );
  const [road, setRoad] = useState<{
    id: string;
    path: Coordinates[];
    distanceKm: number | null;
    durationMin: number | null;
  } | null>(null);
  const pickupLat = selectedRide?.location?.lat;
  const pickupLng = selectedRide?.location?.lng;
  useEffect(() => {
    if (!position || !selectedId || pickupLat === undefined || pickupLng === undefined) return;
    let live = true;
    void fetchDrivingRoute(position, { latitude: pickupLat, longitude: pickupLng }).then((route) => {
      if (!live) return;
      setRoad({
        id: selectedId,
        path: route?.coordinates ?? [],
        distanceKm: route ? route.distanceKm : null,
        durationMin: route ? route.durationMin : null,
      });
    });
    return () => {
      live = false;
    };
  }, [position, selectedId, pickupLat, pickupLng]);
  const roadForSelected = road && road.id === selectedId ? road : null;
  // Road path when it's in; a straight line meanwhile (or if routing is unavailable).
  const roadRoute = roadForSelected && roadForSelected.path.length > 1 ? roadForSelected.path : null;
  // Customer → selected provider's pickup: road distance and drive time, else straight line.
  const trip = selectedRide && position ? pickupDistance(selectedRide, position, roadForSelected) : null;

  const rangeCard = !hasPosition ? (
    <View style={[s.rangeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <LinearGradient colors={['#1FC77A', '#0F9B98']} style={s.rangeIcon}>
        <MaterialCommunityIcons name="car-off" size={24} color="#fff" />
      </LinearGradient>
      <Text style={[s.cardTitle, { color: theme.text }]} accessibilityRole="header">
        No rides on the map yet
      </Text>
      <Text style={[s.cardText, { color: theme.muted }]}>
        Drivers’ rides appear here as soon as they publish a pickup point. Please check back soon.
      </Text>
    </View>
  ) : (
    <View style={[s.rangeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <LinearGradient colors={['#1FC77A', '#0F9B98']} style={s.rangeIcon}>
        <MaterialCommunityIcons name={empty ? 'radar' : 'map-marker-outline'} size={24} color="#fff" />
      </LinearGradient>
      <Text style={[s.cardTitle, { color: theme.text }]} accessibilityRole="header">
        {empty
          ? goingTo
            ? `No rides to ${goingTo} within ${radiusKm} km of you`
            : `No rides within ${radiusKm} km of you`
          : 'How far will you go to a pickup?'}
      </Text>
      <Text style={[s.cardText, { color: theme.muted }]}>
        {empty
          ? goingTo
            ? atMax
              ? `No pickups for ${goingTo} within 20 km right now. Try another destination or browse every ride.`
              : 'Widen your search to find pickups a little further away, or try another destination.'
            : atMax
            ? 'There are no pickups within 20 km right now. You can still browse every ride across the north.'
            : 'Widen your search to find pickups a little further away.'
          : 'We show rides whose pickup point is within this distance of you.'}
      </Text>
      {!(empty && atMax) ? (
        <>
          <View style={{ alignSelf: 'stretch', marginTop: 14 }}>
            <DistanceSlider
              value={draftKm}
              min={NEAR_DEFAULT_KM}
              max={NEAR_MAX_KM}
              onChange={setDraftKm}
              color={theme.action}
              track={theme.field}
              mutedColor={theme.muted}
            />
          </View>
          <Pressable
            onPress={() => applyRadius(draftKm)}
            disabled={draftKm === radiusKm}
            style={[s.primary, { backgroundColor: theme.action, opacity: draftKm === radiusKm ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityState={{ disabled: draftKm === radiusKm }}
          >
            <Text style={s.primaryText}>Show rides within {draftKm} km</Text>
          </Pressable>
        </>
      ) : null}
      <Pressable
        onPress={browseAll}
        style={empty && atMax ? [s.primary, { backgroundColor: theme.action }] : s.linkButton}
        accessibilityRole="button"
      >
        <Text style={empty && atMax ? s.primaryText : [s.linkText, { color: theme.primary }]}>
          {empty && atMax ? 'Browse all rides' : 'Browse all rides instead'}
        </Text>
      </Pressable>
      {rangeOpen && !empty ? (
        <Pressable onPress={() => setRangeOpen(false)} style={s.linkButton} accessibilityRole="button">
          <Text style={[s.linkText, { color: theme.muted }]}>Close</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const [fullMap, setFullMap] = useState(false);

  // How much of each map the ride sheet covers, so the map frames the route above it.
  const { height: windowHeight } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState(0);
  const smallMapRef = useRef<ComponentRef<typeof View>>(null);
  const [smallMapCovered, setSmallMapCovered] = useState(0);
  const selectedKey = selectedRide?.id ?? null;
  useEffect(() => {
    if (!selectedKey || !sheetHeight || fullMap) return;
    smallMapRef.current?.measureInWindow((_x, y, _w, h) => {
      const sheetTop = windowHeight - sheetHeight;
      setSmallMapCovered(Math.max(0, Math.min(h - 60, y + h - sheetTop)));
    });
  }, [selectedKey, sheetHeight, windowHeight, fullMap]);
  const covered = (full: boolean) =>
    !selectedRide ? (full ? 64 : 0) : full ? sheetHeight : smallMapCovered;

  const mapView = (full: boolean) => (
    <NearbyMap
      position={position}
      radiusKm={radiusKm}
      rides={rides}
      markers={markers}
      onSelect={(id) => setSelectedId(id)}
      selectedId={selectedRide ? selectedId : null}
      traveler={traveler}
      provider={provider}
      roadRoute={roadRoute}
      full={full}
      obscuredBottom={covered(full)}
    />
  );

  // Nothing picked yet: a hint on the map. Once a ride is picked, the sheet shows its distance.
  const distanceCard = (full: boolean) => {
    if (!position || loading || error || empty || selectedRide) return null;
    return (
      <View
        style={[
          s.distanceCard,
          s.distanceHint,
          full ? { left: 16, right: 16, bottom: insets.bottom + 28 } : null,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
        pointerEvents="none"
      >
        <Ionicons name="hand-left-outline" size={15} color={theme.primary} />
        <Text style={[s.distanceDetail, { color: theme.text }]} numberOfLines={1}>
          Tap a ride pin to see details and book
        </Text>
      </View>
    );
  };

  // Book from the sheet: hand the full trip to the booking flow (pickup → seats → review).
  const setBookingTrip = useBookingStore((state) => state.setTrip);
  // Rides on the map in list order (nearest first), so the sheet can step through them.
  const mapRides = rides.filter((ride) => ride.location);
  const selectedIndex = selectedRide ? mapRides.findIndex((ride) => ride.id === selectedRide.id) : -1;
  const sheet = selectedRide ? (
    <RideSheet
      ride={selectedRide}
      distance={trip}
      departure={departureText(selectedRide.departsAt)}
      bottomInset={insets.bottom}
      position={selectedIndex >= 0 ? { index: selectedIndex, total: mapRides.length } : null}
      onPrev={selectedIndex > 0 ? () => setSelectedId(mapRides[selectedIndex - 1].id) : undefined}
      onNext={
        selectedIndex >= 0 && selectedIndex < mapRides.length - 1
          ? () => setSelectedId(mapRides[selectedIndex + 1].id)
          : undefined
      }
      onHeight={setSheetHeight}
      onClose={() => {
        setSelectedId(null);
        setSheetHeight(0);
        setSmallMapCovered(0);
      }}
      onViewDetails={() => {
        setFullMap(false);
        openRide(selectedRide);
      }}
      onBook={(fullTrip) => {
        setFullMap(false);
        setBookingTrip(fullTrip);
        pushPath(`/(customer)/pickup/${fullTrip.id}`);
      }}
    />
  ) : null;

  return (
    <View style={[s.root, { backgroundColor: theme.background }]}>
      <Modal
        visible={fullMap}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setFullMap(false)}
      >
        <View style={[s.fullRoot, { backgroundColor: theme.background }]}>
          {/* Same header as the screen behind it; back closes the full-screen map. */}
          <Header
            title={hasPosition ? (goingTo ? `Rides to ${goingTo}` : 'Rides near you') : 'All rides'}
            subtitle={`${rides.length} ${rides.length === 1 ? 'ride' : 'rides'}${hasPosition ? ` within ${radiusKm} km` : ''}`}
            showBack
            onBack={() => setFullMap(false)}
          />
          <View style={s.fullMap}>
            {mapView(true)}
            {distanceCard(true)}
            {fullMap ? sheet : null}
          </View>
        </View>
      </Modal>
      <Header
        title={hasPosition ? (goingTo ? `Rides to ${goingTo}` : 'Rides near you') : 'All rides'}
        subtitle={
          hasPosition ? `Pickup within ${radiusKm} km · nearest first` : 'Every ride with a pickup on the map'
        }
        showBack
      />
      <FlatList
        data={empty || loading || error || rangeOpen ? [] : rides}
        keyExtractor={(ride) => ride.id}
        // Leave room so the last cards can scroll clear of the ride sheet.
        contentContainerStyle={{ paddingBottom: insets.bottom + (selectedRide ? 340 : 24) }}
        // Going further than a local pickup? Door-to-door rides between cities.
        ListFooterComponent={
          <View style={s.cityToCity}>
            <CityToCityEntry />
          </View>
        }
        ListHeaderComponent={
          <>
            <View ref={smallMapRef} collapsable={false} style={[s.mapWrap, { borderColor: theme.border }]}>
              {mapView(false)}
              <Pressable
                onPress={() => setFullMap(true)}
                style={[s.mapButton, s.expandButton, { backgroundColor: theme.surface }]}
                accessibilityRole="button"
                accessibilityLabel="Show the map full screen"
                hitSlop={6}
              >
                <Ionicons name="expand-outline" size={20} color={theme.text} />
              </Pressable>
              {distanceCard(false)}
            </View>

            {!loading && !error && !empty ? (
              <View style={s.summaryRow}>
                <Text style={[s.summary, { color: theme.text }]}>
                  {rides.length} {rides.length === 1 ? 'ride' : 'rides'}
                  {goingTo ? ` to ${goingTo}` : ''}
                  {hasPosition ? ` within ${radiusKm} km` : ''}
                </Text>
                {hasPosition ? (
                  <Pressable
                    onPress={() => setRangeOpen((open) => !open)}
                    style={[s.changeChip, { backgroundColor: theme.soft }]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: rangeOpen }}
                    accessibilityLabel={`Search distance ${radiusKm} kilometres. Change`}
                  >
                    <Ionicons name="locate" size={14} color={theme.primary} />
                    <Text style={[s.changeText, { color: theme.primary }]}>{radiusKm} km · Change</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {loading ? (
              <View style={s.centerBox} accessibilityLiveRegion="polite">
                <ActivityIndicator color={theme.primary} />
                <Text style={[s.cardText, { color: theme.muted }]}>
                  {hasPosition ? 'Finding rides near you…' : 'Loading rides…'}
                </Text>
              </View>
            ) : error ? (
              <View style={s.centerBox}>
                <Text style={[s.cardTitle, { color: theme.text }]}>Rides couldn’t load</Text>
                <Text style={[s.cardText, { color: theme.muted }]}>{error}</Text>
                <Pressable onPress={() => void load()} style={[s.primary, { backgroundColor: theme.action }]}>
                  <Text style={s.primaryText}>Try again</Text>
                </Pressable>
              </View>
            ) : empty || rangeOpen ? (
              rangeCard
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <Tappable
            onPress={() => openRide(item)}
            style={({ pressed }) => [
              s.ride,
              {
                backgroundColor: theme.surface,
                borderColor: item.id === selectedId ? theme.primary : theme.border,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.subtitle}, ${distanceLabel(item.distanceKm) ?? ''} away, ${departureText(item.departsAt) ?? ''}, ${priceText(item) ?? ''}`}
          >
            {item.image ? (
              <Image source={{ uri: item.image }} style={s.thumb} contentFit="cover" />
            ) : (
              <View style={[s.thumb, s.thumbEmpty, { backgroundColor: theme.field }]}>
                <MaterialCommunityIcons name="car" size={28} color={theme.muted} />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.rideTitle, { color: theme.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[s.rideSub, { color: theme.muted }]} numberOfLines={1}>
                {item.subtitle}
                {item.verified ? ' · Verified' : ''}
              </Text>
              <View style={s.distanceRow}>
                <Ionicons name="location" size={13} color={theme.primary} />
                <Text style={[s.distance, { color: theme.primary }]} numberOfLines={1}>
                  {distanceLabel(item.distanceKm) ? `${distanceLabel(item.distanceKm)} away` : 'Pickup'}
                  <Text style={{ color: theme.muted, fontFamily: Fonts.body }}>
                    {item.location?.address ? ` · ${item.location.address}` : ''}
                  </Text>
                </Text>
              </View>
              {departureText(item.departsAt) ? (
                <View style={s.distanceRow}>
                  <Ionicons name="calendar-outline" size={13} color={theme.muted} />
                  <Text style={[s.distance, { color: theme.text, fontFamily: Fonts.body }]} numberOfLines={1}>
                    {departureText(item.departsAt)}
                  </Text>
                </View>
              ) : null}
              <View style={s.rideFoot}>
                <Text style={[s.price, { color: theme.text }]}>{priceText(item) ?? 'Ask for price'}</Text>
                <View style={[s.view, { backgroundColor: theme.action }]}>
                  <Text style={s.viewText}>View</Text>
                  <Ionicons name="arrow-forward" size={14} color="#fff" />
                </View>
              </View>
            </View>
          </Tappable>
        )}
      />
      {fullMap ? null : sheet}
    </View>
  );
}

/** Straight-line km between two points (haversine). */
function straightKm(a: Coordinates, b: Coordinates) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function kmText(km: number) {
  return km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${km.toFixed(1).replace(/\.0$/, '')} km`;
}

function minutesText(min: number) {
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Distance from the customer to a ride's pickup: by road (with drive time) once the route is in,
 * the straight line until then or if routing is unavailable.
 */
function pickupDistance(
  ride: NearbyRide,
  from: Coordinates,
  road: { distanceKm: number | null; durationMin: number | null } | null,
) {
  // Short on purpose: the sheet already names the operator and the pickup address.
  const pickup = { latitude: ride.location!.lat, longitude: ride.location!.lng };
  const straight = straightKm(from, pickup);
  if (straight < 0.1 || (road?.distanceKm != null && road.distanceKm < 0.1)) {
    return { atPickup: true, loading: false, headline: 'You’re at the pickup point', detail: '' };
  }
  if (road?.distanceKm != null) {
    return {
      atPickup: false,
      loading: false,
      headline: `${kmText(road.distanceKm)} · ${minutesText(road.durationMin ?? 0)} drive`,
      detail: `${kmText(straight)} straight`,
    };
  }
  return {
    atPickup: false,
    loading: road === null,
    headline: `${kmText(straight)} away`,
    detail: road === null ? 'finding road route…' : 'straight line',
  };
}

/** "2026-11-16T23:50" -> "Mon 16 Nov · 11:50 PM" (Pakistan time, as published). */
function departureText(iso?: string) {
  if (!iso) return null;
  const [date, time = ''] = iso.split('T');
  const day = new Date(`${date}T12:00:00+05:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Karachi',
  });
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h)) return day;
  return `${day} · ${h % 12 || 12}:${String(m ?? 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function priceText(ride: NearbyRide) {
  if (!ride.price || ride.price <= 0) return null;
  const unit = (ride.priceUnit ?? '').replace(/^per\s+/i, '');
  return `PKR ${ride.price.toLocaleString('en-PK')}${unit ? ` / ${unit === 'vehicle' ? 'whole vehicle' : unit}` : ''}`;
}

/** Native map when the build has it; otherwise the in-app web map (Expo Go, web). */
/** Gilgit-Baltistan, for "All rides" before any pins load. */
const NORTH_REGION = { latitude: 35.6, longitude: 74.6, latitudeDelta: 4.5, longitudeDelta: 5 };

/** A region that fits every pin (with margin), or the north when there are none. */
function regionForRides(rides: NearbyRide[]) {
  const points = rides.flatMap((ride) => (ride.location ? [ride.location] : []));
  if (!points.length) return NORTH_REGION;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.2, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.2, (maxLng - minLng) * 1.4),
  };
}

function NearbyMap({
  position,
  radiusKm,
  rides,
  markers,
  onSelect,
  selectedId,
  traveler,
  provider,
  roadRoute,
  full = false,
  obscuredBottom = 0,
}: {
  /** Px at the bottom hidden by the ride sheet; the map frames the route above it. */
  obscuredBottom?: number;
  /** Fill the screen (full-screen view) instead of the fixed-height map. */
  full?: boolean;
  /** The visitor's position for "near me"; null shows every ride. */
  position: { latitude: number; longitude: number } | null;
  radiusKm: number;
  rides: NearbyRide[];
  markers: Parameters<typeof InAppWebMap>[0]['markers'];
  onSelect: (id: string) => void;
  /** The tapped ride: its operator is shown at the pickup with the route to it. */
  selectedId: string | null;
  /** The customer, drawn at their position as photo + name. */
  traveler: MapPerson | null;
  provider: MapVehicleInfo | null;
  roadRoute: Coordinates[] | null;
}) {
  const { maps, ready } = useNativeMaps();
  const size = full ? { flex: 1 } : { height: MAP_HEIGHT };
  if (!ready) return <View style={size} />;
  if (!maps || Platform.OS === 'web') {
    return (
      <InAppWebMap
        fill={full}
        markers={markers}
        userLocation={position ?? undefined}
        traveler={traveler}
        vehicle={selectedId ? provider : null}
        showRoute={!!position && !!selectedId}
        roadRoute={roadRoute}
        searchRadiusKm={position ? radiusKm : undefined}
        height={MAP_HEIGHT}
        onSelectMarker={onSelect}
        obscuredBottom={obscuredBottom}
      />
    );
  }
  const MapView = maps.default;
  const Marker = maps.Marker;
  const Circle = maps.Circle;
  const Polyline = maps.Polyline;
  const selected = rides.find((ride) => ride.id === selectedId && ride.location) ?? null;
  const routePath =
    position && selected
      ? roadRoute ?? [position, { latitude: selected.location!.lat, longitude: selected.location!.lng }]
      : null;
  // Near me: frame the whole search circle with a little margin. All rides: fit every pin.
  const region = position
    ? (() => {
        const latitudeDelta = (radiusKm / 111.32) * 2.4;
        return {
          ...position,
          latitudeDelta,
          longitudeDelta: latitudeDelta / Math.max(0.2, Math.cos((position.latitude * Math.PI) / 180)),
        };
      })()
    : regionForRides(rides);
  return (
    <MapView
      key={position ? radiusKm : `all-${rides.length}`}
      style={size}
      provider={Platform.OS === 'android' ? maps.PROVIDER_GOOGLE : undefined}
      initialRegion={region}
      // Keep the visible centre (and controls) above the ride sheet.
      mapPadding={{ top: 0, right: 0, left: 0, bottom: obscuredBottom }}
      showsUserLocation={!!position && !traveler}
      showsMyLocationButton={false}
      toolbarEnabled={false}
    >
      {Polyline && routePath ? (
        <Polyline coordinates={routePath} strokeColor="#0F9B98" strokeWidth={5} lineCap="round" lineJoin="round" />
      ) : null}
      {position && traveler ? (
        <Marker coordinate={position} anchor={{ x: 0.5, y: 0.5 }} zIndex={20} title={traveler.name}>
          <AvatarMarker name={traveler.name} imageUrl={traveler.avatarUrl} tone="customer" />
        </Marker>
      ) : null}
      {selected && provider ? (
        <Marker
          coordinate={{ latitude: selected.location!.lat, longitude: selected.location!.lng }}
          anchor={{ x: 0.5, y: 0 }}
          zIndex={15}
          onPress={() => onSelect(selected.id)}
        >
          <AvatarMarker
            name={provider.agencyName || provider.name}
            imageUrl={provider.agencyLogo || provider.imageUrl}
            tone="provider"
          />
        </Marker>
      ) : null}
      {Circle && position ? (
        <Circle
          center={position}
          radius={radiusKm * 1000}
          strokeColor="#0F9B98"
          strokeWidth={2}
          fillColor="rgba(22,179,100,0.08)"
          lineDashPattern={[6, 8]}
        />
      ) : null}
      {rides
        .filter((ride) => ride.location)
        .map((ride) => (
          <Marker
            key={ride.id}
            coordinate={{ latitude: ride.location!.lat, longitude: ride.location!.lng }}
            title={ride.title}
            description={[distanceLabel(ride.distanceKm) && `${distanceLabel(ride.distanceKm)} away`, priceText(ride)]
              .filter(Boolean)
              .join(' · ')}
            pinColor="#16B364"
            onPress={() => onSelect(ride.id)}
          />
        ))}
    </MapView>
  );
}

/** A round photo (or initials) with a name tag under it, for map markers. */
function AvatarMarker({
  name,
  imageUrl,
  tone,
}: {
  name: string;
  imageUrl?: string;
  tone: 'customer' | 'provider';
}) {
  const color = tone === 'customer' ? '#DC2626' : '#0F9B98';
  const letters = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={s.avatarMark} collapsable={false}>
      <View style={[s.avatarRing, { backgroundColor: color }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={s.avatarImg} contentFit="cover" />
        ) : (
          <Text style={s.avatarInitials}>{letters || '•'}</Text>
        )}
      </View>
      <View style={[s.avatarTag, { backgroundColor: color }]}>
        <Text style={s.avatarName} numberOfLines={1}>
          {name}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // Floats over the bottom of the map; kept above the map's attribution line.
  distanceCard: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 16,
    shadowColor: '#0F1E1C',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  distanceHint: { justifyContent: 'center', paddingVertical: 7, gap: 6 },
  mapButton: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F1E1C',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
    zIndex: 5,
  },
  expandButton: { top: 10, right: 10 },
  fullRoot: { flex: 1 },
  fullMap: { flex: 1 },
  distanceHeadline: { fontFamily: Fonts.bodySemiBold, fontSize: 15 },
  distanceDetail: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 17, marginTop: 1 },
  avatarMark: { alignItems: 'center', gap: 2 },
  avatarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitials: { fontFamily: Fonts.bodyBold, fontSize: 13, color: '#fff' },
  avatarTag: { maxWidth: 130, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  avatarName: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: '#fff' },
  root: { flex: 1 },
  mapWrap: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cityToCity: { paddingHorizontal: 16, marginTop: 16 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  summary: { fontFamily: Fonts.display, fontSize: 17 },
  changeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  changeText: { fontFamily: Fonts.bodySemiBold, fontSize: 13 },
  centerBox: { alignItems: 'center', gap: 10, padding: 32 },
  rangeCard: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
  },
  rangeIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: { fontFamily: Fonts.displayBold, fontSize: 18, textAlign: 'center' },
  cardText: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 },
  primary: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    borderRadius: 999,
    marginTop: 14,
    paddingHorizontal: 20,
  },
  primaryText: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: '#fff' },
  linkButton: { minHeight: 44, justifyContent: 'center', marginTop: 4, paddingHorizontal: 12 },
  linkText: { fontFamily: Fonts.bodySemiBold, fontSize: 14, textDecorationLine: 'underline' },
  ride: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: 18,
    borderWidth: 1,
  },
  thumb: { width: 92, height: 92, borderRadius: 14 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  rideTitle: { fontFamily: Fonts.display, fontSize: 16 },
  rideSub: { fontFamily: Fonts.body, fontSize: 13, marginTop: 1 },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  distance: { flex: 1, fontFamily: Fonts.bodySemiBold, fontSize: 12 },
  rideFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  price: { fontFamily: Fonts.bodyBold, fontSize: 14, flexShrink: 1 },
  view: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  viewText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: '#fff' },
});

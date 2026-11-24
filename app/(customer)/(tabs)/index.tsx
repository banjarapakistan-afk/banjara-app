import type { ScrollViewInstance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { HotelCard } from '@/components/hotels/HotelCard';
import { HotelSearchCard } from '@/components/hotels/HotelSearchCard';
import { LocationPinSheet, formatPickedCity } from '@/components/location/LocationPinSheet';
import {
  HomeTopBar,
  HomeHighlights,
  HomeServices,
  HomeScenicHero,
  HomeRouteSearch,
  HomeRideCard,
  HomeDestinationCards,
  HomeHelp,
} from '@/components/home/HomeDiscovery';
import { useHomeDesign } from '@/constants/homeDesign';
import {
  TravelSection as HomeSection,
} from '@/components/ui/TravelPrimitives';

import type { HomeSearchKind } from '@/components/travel/NameSearchCard';
import { DatePickerModal } from '@/components/ui/DatePickerModal';
import { PassengerPicker } from '@/components/ui/PassengerPicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { HotelCardSkeleton, TripCardSkeleton } from '@/components/ui/Skeleton';
import { Colors } from '@/constants/colors';
import {
  TravelDesignProvider,
  usePresentationColors as useThemeColors,
} from '@/components/ui/TravelDesignProvider';
import { TravelOptionRow } from '@/components/ui/TravelForm';
import { HomeNameSearch } from '@/components/home/HomeSearchControls';
import { CityToCityEntry } from '@/components/intercity/CityToCityEntry';
import { HomeProviderInvite } from '@/components/home/HomeProviderInvite';
import { HomeReviews } from '@/components/home/HomeReviews';
import {
  POPULAR_DESTINATIONS,
  POPULAR_ROUTE_SUGGESTIONS,
  destinationMetaFor,
} from '@/constants/destinations';
import {
  type HomeServiceCategory,
  type TransportBookingKind,
  type TransportPanel,
  todayIsoDate,
} from '@/constants/productModes';
import { Radius, Shadows, Spacing } from '@/constants/spacing';
import { Fonts } from '@/constants/typography';
import { usePopularHotels } from '@/hooks/useHotels';
import { useRecommendedTrips } from '@/hooks/useTrips';
import { invalidatePopularHotelsCache } from '@/services/hotelService';
import { invalidateRecommendedTripsCache } from '@/services/tripService';
import { useAuthStore } from '@/store/authStore';
import { useHotelStore } from '@/store/hotelStore';
import { useSearchStore } from '@/store/searchStore';
import { useBookingStore } from '@/store/bookingStore';
import { useUserStore } from '@/store/userStore';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { formatDuration } from '@/utils/formatTime';
import { pushPath } from '@/utils/navigation';
import type { LocationPickerValue } from '@/types/location';
import { Tappable } from '@/components/ui/Tappable';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type HomeMode = HomeServiceCategory;

function shortDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return formatDate(iso, false);
  }
}

function RecentHotelRow({
  item,
  meta,
  nights,
  onPress,
}: {
  item: any;
  meta: any;
  nights: number;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.985, { damping: 16, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 16, stiffness: 300 });
      }}
      style={[
        styles.recentRowCard,
        { backgroundColor: colors.card, borderColor: colors.border },
        animStyle,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Continue hotel search in ${item.destination}`}
    >
      <Image
        source={{ uri: meta.image }}
        style={styles.recentThumb}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.recentBody}>
        <View style={styles.recentTitleRow}>
          <Text style={[styles.recentPlace, { color: colors.dark }]} numberOfLines={1}>
            {item.destination}
          </Text>
          <View style={[styles.recentTypeChip, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.recentTypeText, { color: colors.primary }]}>STAY</Text>
          </View>
        </View>
        <Text style={[styles.recentDetails, { color: colors.muted }]} numberOfLines={1}>
          {shortDate(item.checkIn)} → {shortDate(item.checkOut)} · {nights} night
          {nights === 1 ? '' : 's'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.mutedLight} />
    </AnimatedPressable>
  );
}

function PopularRouteCard({
  route,
  onPress,
}: {
  route: Omit<(typeof POPULAR_ROUTE_SUGGESTIONS)[number], 'fromPrice'> & {
    tripCount: number;
    fromPrice: number | null;
    currency: string;
  };
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const dest = POPULAR_DESTINATIONS.find((d) => d.name === route.to);

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.985, { damping: 16, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 16, stiffness: 300 });
      }}
      style={[
        styles.routeCard,
        { backgroundColor: colors.card, borderColor: colors.border },
        animStyle,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Search ${route.from} to ${route.to}`}
    >
      <Image
        source={{ uri: dest?.image ?? POPULAR_DESTINATIONS[0].image }}
        style={styles.routeThumb}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.routeCopy}>
        <View style={styles.routeHeaderRow}>
          <Text style={[styles.routeTitle, { color: colors.dark }]} numberOfLines={1}>
            {route.from} → {route.to}
          </Text>
          <View style={[styles.routeDurationBadge, { backgroundColor: colors.inputBg }]}>
            <Text style={[styles.routeDurationText, { color: colors.muted }]}>
              {route.duration}
            </Text>
          </View>
        </View>

        {route.tripCount > 0 ? (
          <View style={styles.routeLiveRow}>
            <View style={styles.routeLiveDot} />
            <Text style={[styles.routeLive, { color: colors.action }]}>
              {route.tripCount} live trip{route.tripCount === 1 ? '' : 's'}
              {route.fromPrice != null
                ? ` · from ${formatCurrency(route.fromPrice, route.currency)}`
                : ''}
            </Text>
          </View>
        ) : (
          <Text style={[styles.routeMeta, { color: colors.mutedLight }]}>Explore corridor</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.mutedLight} />
    </AnimatedPressable>
  );
}

const HOME_FOCUS_STALE_MS = 45_000;
let lastHomeFocusRefreshAt = 0;

export default function HomeScreen() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // Guests browse with a placeholder user (id "guest"); they are not signed in.
  const signedIn = isAuthenticated && !!user && user.id !== 'guest';
  const homeTheme = useHomeDesign();
  const profile = useUserStore((state) => state.profile);
  const toggleSavedTrip = useUserStore((state) => state.toggleSavedTrip);
  const savedIds = (profile?.id === user?.id ? profile?.savedTripIds : user?.savedTripIds) ?? [];
  const onSaveTrip = (id: string) => {
    if (!user) {
      pushPath('/(customer)/(tabs)/profile');
      return;
    }
    if (useUserStore.getState().profile?.id !== user.id) useUserStore.setState({ profile: user });
    toggleSavedTrip(id);
  };
  const from = useSearchStore((s) => s.from);
  const to = useSearchStore((s) => s.to);
  const date = useSearchStore((s) => s.date);
  const returnDate = useSearchStore((s) => s.returnDate);
  const passengers = useSearchStore((s) => s.passengers);
  const productMode = useSearchStore((s) => s.productMode);
  const query = useSearchStore((s) => s.query);
  const setFrom = useSearchStore((s) => s.setFrom);
  const setTo = useSearchStore((s) => s.setTo);
  const setDate = useSearchStore((s) => s.setDate);
  const setReturnDate = useSearchStore((s) => s.setReturnDate);
  const setPassengers = useSearchStore((s) => s.setPassengers);
  const setProductMode = useSearchStore((s) => s.setProductMode);
  const swapLocations = useSearchStore((s) => s.swapLocations);
  const saveRecentSearch = useSearchStore((s) => s.saveRecentSearch);
  const setQuery = useSearchStore((s) => s.setQuery);
  const [mode, setMode] = useState<HomeMode>('transport');
  const [transportPanel, setTransportPanel] = useState<TransportPanel>('available');
  const [bookingKind, setBookingKind] = useState<TransportBookingKind>('seat');
  const [journeyKind, setJourneyKind] = useState<'one_way' | 'round_trip'>(
    productMode === 'trips' ? 'round_trip' : 'one_way',
  );
  const [searchKind, setSearchKind] = useState<HomeSearchKind>('route');
  const [showDate, setShowDate] = useState(false);
  const [showReturnDate, setShowReturnDate] = useState(false);
  const [showPassengers, setShowPassengers] = useState(false);
  const [locationField, setLocationField] = useState<'from' | 'to' | null>(null);
  const [routePins, setRoutePins] = useState<
    Partial<Record<'from' | 'to', { name: string; value: LocationPickerValue }>>
  >({});
  const checkIn = useHotelStore((s) => s.checkIn);
  const checkOut = useHotelStore((s) => s.checkOut);
  const hotelDestination = useHotelStore((s) => s.destination);
  const setDestination = useHotelStore((s) => s.setDestination);
  const saveHotelSearch = useHotelStore((s) => s.saveRecentSearch);
  const hotelRecent = useHotelStore((s) => s.recentSearches);
  const { trips, loading, error, refresh: refreshTrips } = useRecommendedTrips();
  const { hotels, loading: hotelsLoading, refresh: refreshHotels } = usePopularHotels();
  const setTrip = useBookingStore((state) => state.setTrip);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const colors = useThemeColors();
  const notifications = useUserStore((state) => state.notifications);
  const loadNotifications = useUserStore((state) => state.loadNotifications);
  const hasUnread = notifications.some((item) => !item.read);

  useEffect(() => {
    if (!from) setFrom('Islamabad');
    if (!to) setTo('Hunza');
  }, [from, to, setFrom, setTo]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const stale = now - lastHomeFocusRefreshAt >= HOME_FOCUS_STALE_MS;
      if (!stale) return;
      lastHomeFocusRefreshAt = now;
      void refreshTrips({ silent: true });
      void refreshHotels({ silent: true });
    }, [refreshTrips, refreshHotels]),
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [mode]);

  const oneWayTrips = useMemo(
    () => trips.filter((trip) => trip.journeyType !== 'round_trip'),
    [trips],
  );
  const roundTrips = useMemo(
    () => trips.filter((trip) => trip.journeyType === 'round_trip'),
    [trips],
  );
  const journeyTrips = journeyKind === 'round_trip' ? roundTrips : oneWayTrips;

  /** Seat booking = shared vans/buses; vehicle = car/private/taxi style inventory. */
  const modeTrips = useMemo(() => {
    if (bookingKind === 'vehicle') {
      return journeyTrips.filter((trip) => {
        if (trip.bookingMode === 'vehicle') return true;
        if (trip.bookingMode === 'seat') return false;
        const type = String(trip.vehicleType || '').toLowerCase();
        return type.includes('car') || type.includes('private') || type.includes('taxi');
      });
    }
    return journeyTrips.filter((trip) => trip.bookingMode !== 'vehicle');
  }, [bookingKind, journeyTrips]);

  const today = todayIsoDate();

  /** Continue searching — all trips transporters currently offer. */
  const allTransporterTrips = useMemo(
    () =>
      [...modeTrips]
        .sort((a, b) => `${a.date}${a.departureTime}`.localeCompare(`${b.date}${b.departureTime}`))
        .slice(0, 3),
    [modeTrips],
  );

  const stayHotels = useMemo(() => {
    const dest = (hotelDestination || to || '').trim().toLowerCase();
    if (!dest) return hotels.slice(0, 8);
    const matched = hotels.filter((hotel) => {
      const city = hotel.location.city.toLowerCase();
      const area = hotel.location.area.toLowerCase();
      return city.includes(dest) || area.includes(dest) || dest.includes(city);
    });
    return (matched.length ? matched : hotels).slice(0, 8);
  }, [hotelDestination, hotels, to]);

  const durationLabel = useMemo(() => {
    if (mode !== 'transport') return undefined;
    const matching = trips.filter(
      (trip) =>
        trip.from.toLowerCase().includes((from || '').toLowerCase()) &&
        trip.to.toLowerCase().includes((to || '').toLowerCase()),
    );
    if (matching.length) {
      const minutes = matching.map((trip) => trip.durationMinutes).filter((value) => value > 0);
      if (minutes.length) {
        const min = Math.min(...minutes);
        const max = Math.max(...minutes);
        return min === max
          ? formatDuration(min)
          : `${formatDuration(min)} – ${formatDuration(max)}`;
      }
    }
    const corridor = POPULAR_ROUTE_SUGGESTIONS.find(
      (route) =>
        route.from.toLowerCase() === (from || '').toLowerCase() &&
        route.to.toLowerCase() === (to || '').toLowerCase(),
    );
    return corridor?.duration;
  }, [from, mode, to, trips]);

  const liveCount = useMemo(() => {
    if (mode === 'hotels') return stayHotels.length;
    if (mode !== 'transport') return 0;
    return modeTrips.filter((trip) => trip.date === today).length;
  }, [modeTrips, today, mode, stayHotels.length]);

  const liveRoutes = useMemo(
    () =>
      POPULAR_ROUTE_SUGGESTIONS.map((route) => {
        const matches = trips.filter(
          (trip) =>
            trip.from.toLowerCase().includes(route.from.toLowerCase()) &&
            trip.to.toLowerCase().includes(route.to.toLowerCase()),
        );
        const fromPrice = matches.length ? Math.min(...matches.map((trip) => trip.price)) : null;
        return {
          ...route,
          tripCount: matches.length,
          fromPrice,
          currency: matches[0]?.currency ?? 'PKR',
        };
      }).sort((a, b) => b.tripCount - a.tripCount),
    [trips],
  );

  const onSearchTransport = () => {
    setQuery('');
    saveRecentSearch();
    router.push('/(customer)/results');
  };

  const onSearchHotels = () => {
    setQuery('');
    saveHotelSearch();
    router.push('/(customer)/hotels/results');
  };

  const onSearchByName = () => {
    const text = query.trim();
    if (!text) return;
    if (mode === 'hotels') {
      setDestination(text);
      saveHotelSearch();
      router.push('/(customer)/hotels/results');
      return;
    }
    router.push('/(customer)/results');
  };

  const onChangeMode = (next: HomeMode) => {
    setMode(next);
    if (next === 'transport') {
      setProductMode(journeyKind === 'round_trip' ? 'trips' : 'transport');
    } else if (next === 'hotels') {
      // hotels search uses hotel store
    }
  };

  const onChangeJourney = (next: 'one_way' | 'round_trip') => {
    setJourneyKind(next);
    setProductMode(next === 'round_trip' ? 'trips' : 'transport');
  };

  const openDestination = (name: string) => {
    if (mode === 'hotels') {
      setDestination(name);
      saveHotelSearch();
      router.push('/(customer)/hotels/results');
      return;
    }
    setTo(name);
    setProductMode(journeyKind === 'round_trip' ? 'trips' : 'transport');
    saveRecentSearch();
    router.push('/(customer)/results');
  };

  const openTrip = (tripId: string) => {
    const trip = trips.find((item) => item.id === tripId);
    if (trip) setTrip(trip);
    pushPath(`/(customer)/trip/${tripId}`);
  };

  const stayTitle = 'Looking for a place to stay';
  const staySubtitle =
    'Choose among the best hotels, lodges and guest houses available at your destination.';
  const searchCta =
    mode === 'hotels'
      ? 'Search stays'
      : journeyKind === 'round_trip'
        ? 'Search trips'
        : bookingKind === 'vehicle'
          ? 'Search vehicles'
          : 'Search rides';

  /** Home only starts the journey; full catalogs live in Explore. */
  // Rides live on the map (all rides); the other services open their Explore tab.
  const openExplore = (service: HomeMode) =>
    service === 'transport'
      ? router.push('/(customer)/explore/nearby')
      : router.push({ pathname: '/(customer)/(tabs)/search', params: { service } });

  // A clear invitation (not an "empty" box) for services that are browsed in Explore.
  const SERVICE_INVITE: Partial<
    Record<HomeMode, { noun: string; icon: keyof typeof Ionicons.glyphMap; body: string }>
  > = {
    tours: {
      noun: 'tours',
      icon: 'trail-sign-outline',
      body: 'Treks, expeditions and summit trips run by local operators, with prices and dates up front.',
    },
    guides: {
      noun: 'guides',
      icon: 'compass-outline',
      body: 'Verified local guides who know every trail, viewpoint and tea stop in the valley.',
    },
    restaurants: {
      noun: 'restaurants',
      icon: 'restaurant-outline',
      body: 'Local restaurants with menus, offers and ratings from travellers.',
    },
  };
  const invite = SERVICE_INVITE[mode];
  const serviceExploreBlock = invite ? (
    <HomeSection title={`Find ${invite.noun}`}>
      <Tappable
        onPress={() => openExplore(mode)}
        accessibilityRole="button"
        accessibilityLabel={`Browse ${invite.noun} in Explore`}
        style={({ pressed }) => [
          styles.invite,
          {
            backgroundColor: homeTheme.surface,
            borderColor: homeTheme.border,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <View style={[styles.inviteIcon, { backgroundColor: homeTheme.soft }]}>
          <Ionicons name={invite.icon} size={24} color={homeTheme.primary} />
        </View>
        <Text style={[styles.inviteTitle, { color: homeTheme.text }]}>
          Browse all {invite.noun}
        </Text>
        <Text style={[styles.inviteBody, { color: homeTheme.muted }]}>{invite.body}</Text>
        <View style={[styles.inviteCta, { backgroundColor: homeTheme.action }]}>
          <Text style={styles.inviteCtaText}>Explore {invite.noun}</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </View>
      </Tappable>
    </HomeSection>
  ) : null;

  const searchMethod = (
    <TravelOptionRow
      label="Search by"
      value={searchKind}
      onChange={setSearchKind}
      options={[
        {
          id: 'route' as const,
          label: mode === 'hotels' ? 'Destination' : 'Route',
          accessibilityLabel: 'Search by route',
        },
        { id: 'name' as const, label: 'Name', accessibilityLabel: 'Search by name' },
      ]}
    />
  );
  // Extra search options open inside the search card itself (not a separate switch
  // under it), and never change which rides are listed below.
  const moreOptions = transportPanel === 'customise';
  const transportPreferences = (
    <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: homeTheme.border, paddingTop: 10 }}>
      <Pressable
        onPress={() => setTransportPanel(moreOptions ? 'available' : 'customise')}
        accessibilityRole="button"
        accessibilityState={{ expanded: moreOptions }}
        accessibilityLabel={moreOptions ? 'Hide search options' : 'More search options'}
        hitSlop={8}
        style={styles.moreOptions}
      >
        <Ionicons name="options-outline" size={16} color={homeTheme.primary} />
        <Text style={[styles.moreOptionsText, { color: homeTheme.primary }]}>
          {moreOptions ? 'Fewer options' : 'Return trip, whole vehicle or search by name'}
        </Text>
        <Ionicons
          name={moreOptions ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={homeTheme.primary}
        />
      </Pressable>
      {moreOptions ? (
      <>
        <TravelOptionRow
          label="Journey"
          value={journeyKind}
          onChange={onChangeJourney}
          options={[
            { id: 'one_way' as const, label: 'One way' },
            { id: 'round_trip' as const, label: 'Return', accessibilityLabel: 'Two way' },
          ]}
        />
        <TravelOptionRow
          label="Booking"
          value={bookingKind}
          onChange={setBookingKind}
          options={[
            { id: 'seat' as const, label: 'Seat', accessibilityLabel: 'Seat booking' },
            { id: 'vehicle' as const, label: 'Vehicle', accessibilityLabel: 'Vehicle booking' },
          ]}
        />
        {searchMethod}
      </>
      ) : null}
    </View>
  );

  const searchBlock =
    mode === 'tours' || mode === 'guides' || mode === 'restaurants' ? null : (
      <View style={[styles.searchFloat, { marginTop: -30, gap: 20 }]}>
        {mode === 'hotels' ? (
          searchKind === 'name' ? (
            <HomeNameSearch
              value={query}
              onChangeText={setQuery}
              onSearch={onSearchByName}
              cta={searchCta}
              preferences={searchMethod}
              hotel
            />
          ) : (
            <HotelSearchCard onSearch={onSearchHotels} showCta footer={searchMethod} />
          )
        ) : (
          <>
            {searchKind === 'name' && transportPanel === 'customise' ? (
              <HomeNameSearch
                value={query}
                onChangeText={setQuery}
                onSearch={onSearchByName}
                cta={searchCta}
                preferences={transportPreferences}
              />
            ) : (
              <HomeRouteSearch
                from={from}
                to={to}
                date={date ? shortDate(date) : 'Pick date'}
                passengers={
                  bookingKind === 'vehicle'
                    ? passengers + ' travelers'
                    : passengers + (passengers === 1 ? ' Seat' : ' Seats')
                }
                returnDate={
                  journeyKind === 'round_trip'
                    ? returnDate
                      ? shortDate(returnDate)
                      : 'Pick return date'
                    : undefined
                }
                onFrom={() => setLocationField('from')}
                onTo={() => setLocationField('to')}
                onDate={() => setShowDate(true)}
                onReturnDate={() => setShowReturnDate(true)}
                onPassengers={() => setShowPassengers(true)}
                onSwap={swapLocations}
                onSearch={onSearchTransport}
                cta={searchCta}
                preferences={transportPreferences}
              />
            )}
            <CityToCityEntry />
            <LocationPinSheet
              visible={locationField !== null}
              title={locationField === 'from' ? 'Departure location' : 'Destination'}
              confirmLabel={locationField === 'from' ? 'Use departure location' : 'Use destination'}
              initial={
                locationField &&
                routePins[locationField]?.name === (locationField === 'from' ? from : to)
                  ? routePins[locationField]?.value
                  : undefined
              }
              onClose={() => setLocationField(null)}
              onConfirm={(picked) => {
                const name = formatPickedCity(picked);
                if (locationField)
                  setRoutePins((pins) => ({ ...pins, [locationField]: { name, value: picked } }));
                if (locationField === 'from') setFrom(name);
                else if (locationField === 'to') setTo(name);
                setLocationField(null);
              }}
            />
            <PassengerPicker
              visible={showPassengers}
              value={passengers}
              onChange={setPassengers}
              onClose={() => setShowPassengers(false)}
            />
            <DatePickerModal
              visible={showDate}
              title="Travel date"
              value={date}
              minimumDate={new Date()}
              onChange={setDate}
              onClose={() => setShowDate(false)}
            />
            <DatePickerModal
              visible={showReturnDate}
              title="Return home"
              value={returnDate}
              minimumDate={date ? new Date(date) : new Date()}
              onChange={setReturnDate}
              onClose={() => setShowReturnDate(false)}
            />
          </>
        )}
      </View>
    );

  const recentSection =
    mode === 'transport' ? (
      <HomeSection
        title="Continue searching"
        subtitle="All trips currently offered by local drivers"
        actionLabel="View all"
        onAction={() => router.push('/(customer)/results')}
      >
        {loading && allTransporterTrips.length === 0 ? (
          <View style={styles.stack}>
            <TripCardSkeleton />
            <TripCardSkeleton />
          </View>
        ) : allTransporterTrips.length === 0 ? (
          <EmptyState
            title="No trips listed yet"
            message="When local drivers publish rides, they will appear here."
            actionLabel={searchCta}
            onAction={onSearchTransport}
          />
        ) : (
          <View style={styles.stack}>
            {allTransporterTrips.map((trip) => (
              <HomeRideCard
                key={trip.id}
                trip={trip}
                saved={savedIds.includes(trip.id)}
                onSave={() => onSaveTrip(trip.id)}
                onPress={() => openTrip(trip.id)}
              />
            ))}
          </View>
        )}
      </HomeSection>
    ) : mode === 'hotels' && hotelRecent.length > 0 ? (
      <HomeSection title="Continue searching">
        <View style={styles.recentStack}>
          {hotelRecent.slice(0, 3).map((item) => {
            const meta = destinationMetaFor(item.destination);
            const nights = Math.max(
              1,
              Math.round(
                (new Date(item.checkOut).getTime() - new Date(item.checkIn).getTime()) /
                  (1000 * 60 * 60 * 24),
              ),
            );
            return (
              <RecentHotelRow
                key={item.id}
                item={item}
                meta={meta}
                nights={nights}
                onPress={() => {
                  useHotelStore.getState().applyRecentSearch(item);
                  setMode('hotels');
                  router.push('/(customer)/hotels/results');
                }}
              />
            );
          })}
        </View>
      </HomeSection>
    ) : null;

  const destinationsSection = (
    <HomeDestinationCards
      trips={trips}
      onOpen={openDestination}
      onExplore={() => openExplore(mode)}
    />
  );

  const renderStays = (layout: 'detail' | 'rail') => (
    <HomeSection
      title={stayTitle}
      subtitle={staySubtitle}
      actionLabel="Browse all"
      onAction={() => router.push('/(customer)/(tabs)/hotels')}
    >
      {hotelsLoading && hotels.length === 0 ? (
        layout === 'detail' ? (
          <View style={styles.stack}>
            <HotelCardSkeleton />
            <HotelCardSkeleton />
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hRow}
          >
            <HotelCardSkeleton />
          </ScrollView>
        )
      ) : stayHotels.length === 0 ? (
        <EmptyState
          title="No hotels listed yet"
          message="Stays will appear here when providers add hotels."
          actionLabel="Search stays"
          onAction={onSearchHotels}
        />
      ) : layout === 'detail' ? (
        <View style={styles.stack}>
          {stayHotels.slice(0, 4).map((hotel) => (
            <HotelCard
              key={hotel.id}
              hotel={hotel}
              checkIn={checkIn}
              checkOut={checkOut}
              onPress={() => pushPath(`/(customer)/hotels/${hotel.id}`)}
            />
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hRow}
        >
          {stayHotels.map((hotel) => (
            <View key={hotel.id} style={styles.hotelSlide}>
              <HotelCard
                hotel={hotel}
                checkIn={checkIn}
                checkOut={checkOut}
                compact
                onPress={() => pushPath(`/(customer)/hotels/${hotel.id}`)}
              />
            </View>
          ))}
        </ScrollView>
      )}
    </HomeSection>
  );

  const routesSection = (
    <HomeSection
      title="Popular routes"
      subtitle="Most travelled corridors on BANJARA"
      actionLabel="See all"
      onAction={() => openExplore('transport')}
    >
      <View style={styles.stack}>
        {liveRoutes.slice(0, 3).map((route) => (
          <PopularRouteCard
            key={route.id}
            route={route}
            onPress={() => {
              setFrom(route.from);
              setTo(route.to);
              saveRecentSearch();
              router.push('/(customer)/results');
            }}
          />
        ))}
      </View>
    </HomeSection>
  );

  return (
    <TravelDesignProvider>
      <View style={[styles.root, { backgroundColor: homeTheme.background }]}>
        <HomeTopBar
          name={user?.name}
          avatar={user?.avatar}
          unread={hasUnread}
          onSearch={() => router.push('/(customer)/(tabs)/search')}
          onNotifications={() => pushPath('/(customer)/(tabs)/notifications')}
          onProfile={() => pushPath('/(customer)/(tabs)/profile')}
          signedIn={signedIn}
          onLogin={() => router.push('/(auth)/login')}
        />
        <ScrollView
          ref={scrollRef}
          style={styles.container}
          contentContainerStyle={styles.feed}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                lastHomeFocusRefreshAt = Date.now();
                invalidateRecommendedTripsCache();
                invalidatePopularHotelsCache();
                await Promise.all([
                  refreshTrips(),
                  refreshHotels(),
                ]);
                setRefreshing(false);
              }}
              tintColor={colors.primary}
            />
          }
        >
          <HomeHighlights
            onExplore={() => router.push('/(customer)/(tabs)/search')}
            onGuides={() => onChangeMode('guides')}
            onNotifications={() => pushPath('/(customer)/(tabs)/notifications')}
          />
          <HomeServices mode={mode} onChange={onChangeMode} />
          <HomeScenicHero
            mode={mode}
            from={from}
            to={mode === 'hotels' ? hotelDestination : to}
            name={user?.name}
            duration={durationLabel}
            liveCount={liveCount}
            onPress={() => router.push('/(customer)/(tabs)/search')}
          />

          {searchBlock}

          {mode === 'tours' || mode === 'guides' || mode === 'restaurants' ? (
            serviceExploreBlock
          ) : mode === 'hotels' ? (
            <>
              {recentSection}
              {renderStays('rail')}
              {destinationsSection}
            </>
          ) : (
            <>
              <HomeSection
                  title="Available rides"
                  subtitle="Upcoming rides from verified local drivers"
                  actionLabel="View all"
                  onAction={() => router.push('/(customer)/results')}
                >
                  {loading && modeTrips.length === 0 ? (
                    <View style={styles.stack}>
                      <TripCardSkeleton />
                      <TripCardSkeleton />
                    </View>
                  ) : error && modeTrips.length === 0 ? (
                    <EmptyState
                      title="Could not load rides"
                      message="Check your connection and try again."
                      actionLabel="Try again"
                      onAction={() => void refreshTrips()}
                    />
                  ) : modeTrips.length === 0 ? (
                    <EmptyState
                      title="No rides available"
                      message="Try another route or date in the search above."
                      actionLabel="See rides on the map"
                      onAction={() => openExplore('transport')}
                    />
                  ) : (
                    <View style={styles.stack}>
                      {modeTrips.slice(0, 2).map((trip) => (
                        <HomeRideCard
                          key={trip.id}
                          trip={trip}
                          saved={savedIds.includes(trip.id)}
                          onSave={() => onSaveTrip(trip.id)}
                          onPress={() => openTrip(trip.id)}
                        />
                      ))}
                    </View>
                  )}
                </HomeSection>
              {liveRoutes.length > 0 ? routesSection : null}
              {destinationsSection}
            </>
          )}

          {/* Real reviews from completed bookings; hidden until customers leave some. */}
          <HomeReviews />

          <HomeProviderInvite signedIn={signedIn} />

          <HomeHelp onPress={() => router.push('/(customer)/(tabs)/inbox')} />
        </ScrollView>
      </View>
    </TravelDesignProvider>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1 },
  feed: {
    paddingBottom: 24,
  },
  searchFloat: {
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.screen,
    gap: Spacing.md,
  },
  moreOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  moreOptionsText: { flex: 1, fontFamily: Fonts.bodyMedium, fontSize: 13 },
  invite: {
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: 8,
    ...Shadows.soft,
  },
  inviteIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  inviteTitle: { fontFamily: Fonts.display, fontSize: 18 },
  inviteBody: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  inviteCta: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  inviteCtaText: { color: '#fff', fontFamily: Fonts.bodySemiBold, fontSize: 15 },
  hRow: {
    paddingHorizontal: Spacing.screen,
  },
  stack: {
    paddingHorizontal: Spacing.screen,
    gap: Spacing.sm,
  },
  hotelSlide: {
    marginRight: Spacing.sm,
  },
  recentStack: {
    marginHorizontal: Spacing.screen,
    gap: Spacing.sm,
  },
  recentRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    gap: Spacing.md,
    ...Shadows.card,
  },
  recentThumb: {
    width: 68,
    height: 68,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySoft,
  },
  recentBody: { flex: 1, minWidth: 0 },
  recentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  recentPlace: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
  },
  recentTypeChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  recentTypeText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.3,
  },
  recentDetails: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 4,
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    gap: Spacing.md,
    ...Shadows.card,
  },
  routeThumb: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    backgroundColor: Colors.border,
  },
  routeCopy: { flex: 1, minWidth: 0 },
  routeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  routeTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    flex: 1,
  },
  routeDurationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  routeDurationText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 11,
  },
  routeMeta: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 3,
  },
  routeLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  routeLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#20C978',
  },
  routeLive: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
  },
});

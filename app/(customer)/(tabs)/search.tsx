import type { ScrollViewInstance, TextInputInstance } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ServicePickerSheet } from '@/components/explore/ServicePickerSheet';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { ExplorePanels, FloatingCrossSell } from '@/components/explore/ExplorePanels';
import { ExploreHelp, ExploreServiceSelector } from '@/components/explore/ExploreDiscovery';
import { ExploreRefineBar } from '@/components/explore/ExploreRefineBar';
import { ExploreIntro, ExplorePromo, ExploreRoads, useRoadAdvisory } from '@/components/explore/ExploreSections';
import { CityToCityEntry } from '@/components/intercity/CityToCityEntry';
import { HomeTopBar } from '@/components/home/HomeDiscovery';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { TravelDesignProvider } from '@/components/ui/TravelDesignProvider';
import { TravelTextField } from '@/components/ui/TravelForm';
import { useExploreDesign } from '@/constants/exploreDesign';
import type { ExploreServiceTab } from '@/constants/exploreCatalog';
import { usePopularHotels } from '@/hooks/useHotels';
import { useGuides, useRestaurants, useTourOperators } from '@/hooks/useRestaurants';
import { useRecommendedTrips } from '@/hooks/useTrips';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';
import {
  DEFAULT_REFINE,
  refineHotels,
  refineRated,
  refineTrips,
  sanitizeRefine,
  type ExploreRefine,
} from '@/utils/exploreRefine';
import { pushPath } from '@/utils/navigation';

const EXPLORE_SERVICES: readonly string[] = ['transport', 'hotels', 'tours', 'guides', 'restaurants'];
/** Every ride on the map (the visitor skipped or blocked location). */
const ALL_RIDES_MAP = '/(customer)/explore/nearby';
function isExploreService(value: string | undefined): value is ExploreServiceTab {
  return !!value && EXPLORE_SERVICES.includes(value);
}

const SEARCH_PLACEHOLDER: Record<ExploreServiceTab, string> = {
  transport: 'Vehicle, driver or destination',
  hotels: 'Hotel, guest house or city',
  tours: 'Tour, operator or destination',
  guides: 'Guide name or city',
  restaurants: 'Restaurant, cuisine or city',
};

/** Card-shaped placeholders while listings load, instead of a spinner over empty space. */
function ListingSkeletons() {
  return (
    <View style={s.skeletonGrid} accessibilityLabel="Loading listings" accessibilityRole="progressbar">
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={s.skeletonCard}>
          <Skeleton height={120} radius={16} />
          <Skeleton width="80%" height={14} style={{ marginTop: 10 }} />
          <Skeleton width="50%" height={12} style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}

export default function ExploreScreen() {
  const theme = useExploreDesign();
  const user = useAuthStore((state) => state.user);
  const notifications = useUserStore((state) => state.notifications);
  const { service } = useLocalSearchParams<{ service?: string }>();
  // Stay is the default tab. Rides are never listed here: Ride opens the map instead.
  const [tab, setTab] = useState<ExploreServiceTab>(() =>
    isExploreService(service) && service !== 'transport' ? service : 'hotels',
  );
  // Home deep-links here with ?service=…; keep the tab in sync when it changes.
  // A ride link (e.g. Home's "Browse transport") opens every ride on the map.
  useEffect(() => {
    if (service === 'transport') {
      // Drop the param so the same link works again later (and Back doesn't bounce to the map).
      router.setParams({ service: undefined });
      pushPath(ALL_RIDES_MAP);
    } else if (isExploreService(service)) setTab(service);
  }, [service]);
  const [refineState, setRefine] = useState<ExploreRefine>(DEFAULT_REFINE);
  // Settings only apply to services that offer them (e.g. 'Free cancellation' is hotels-only).
  const refine = useMemo(() => sanitizeRefine(tab, refineState), [tab, refineState]);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const searchInput = useRef<TextInputInstance>(null);
  const roads = useRoadAdvisory();
  // Trips only feed the "Need a ride there?" suggestion; rides themselves live on the map.
  const { trips, refresh: refreshTrips } = useRecommendedTrips();
  const {
    hotels,
    loading: hotelsLoading,
    error: hotelsError,
    refresh: refreshHotels,
  } = usePopularHotels();
  const {
    restaurants,
    loading: restosLoading,
    error: restosError,
    refresh: refreshRestos,
    searchByDestination,
  } = useRestaurants();
  const {
    guides,
    loading: guidesLoading,
    error: guidesError,
    refresh: refreshGuides,
  } = useGuides();
  const { tours: tourProviders, refresh: refreshTours } = useTourOperators();

  const refreshAll = useCallback(
    async (silent: boolean) => {
      const opts = { silent };
      await Promise.all([
        refreshTrips(opts),
        refreshHotels(opts),
        refreshRestos(opts),
        refreshGuides(opts),
        refreshTours(opts),
      ]);
    },
    [refreshTrips, refreshHotels, refreshRestos, refreshGuides, refreshTours],
  );

  // Coming back to Explore updates listings quietly in the background: what is already
  // on screen stays put instead of being replaced by a loading state.
  useFocusEffect(
    useCallback(() => {
      void refreshAll(true);
    }, [refreshAll]),
  );

  // Ask what the visitor wants every time they open Explore: on first open (unless Home
  // deep-linked a service) and on every tap of the Explore tab. Coming back from a listing
  // (the Back button) is not "opening", so it doesn't ask again.
  const [picker, setPicker] = useState<null | 'choose' | 'locating'>(() =>
    isExploreService(service) ? null : 'choose',
  );
  const navigation = useNavigation();
  useEffect(
    () =>
      (navigation as unknown as {
        addListener: (event: 'tabPress', listener: () => void) => () => void;
      }).addListener('tabPress', () => setPicker('choose')),
    [navigation],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAll(true);
    } finally {
      setRefreshing(false);
    }
  };

  const changeService = (next: ExploreServiceTab) => {
    // Ride: find the visitor's location and open the nearby-rides map (or all rides if skipped).
    if (next === 'transport') {
      setPicker('locating');
      return;
    }
    setTab(next);
    setQuery('');
    setRefine(DEFAULT_REFINE);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  const catalog = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = (...parts: Array<string | undefined>) =>
      !term || parts.join(' ').toLowerCase().includes(term);
    return {
      trips: refineTrips(trips, DEFAULT_REFINE),
      hotels: refineHotels(
        hotels.filter((hotel) => matches(hotel.name, hotel.location.city, hotel.location.area)),
        refine,
      ),
      restaurants: refineRated(
        restaurants.filter((restaurant) =>
          matches(restaurant.name, restaurant.city, ...restaurant.cuisine),
        ),
        refine,
      ),
      guides: refineRated(
        guides.filter((guide) =>
          matches(guide.businessName, guide.ownerName, guide.city, guide.description),
        ),
        refine,
      ),
      tourProviders: tourProviders.filter((provider) =>
        matches(provider.businessName, provider.city, provider.tour?.destination),
      ),
    };
  }, [query, refine, trips, hotels, restaurants, guides, tourProviders]);

  // Per-tab status. Tours load inside their own panel.
  const status =
    tab === 'hotels'
      ? { loading: hotelsLoading, error: hotelsError, empty: hotels.length === 0, retry: refreshHotels }
      : tab === 'guides'
        ? { loading: guidesLoading, error: guidesError, empty: guides.length === 0, retry: refreshGuides }
        : tab === 'restaurants'
          ? { loading: restosLoading, error: restosError, empty: restaurants.length === 0, retry: refreshRestos }
          : null;

  return (
    <TravelDesignProvider>
      <View style={[s.root, { backgroundColor: theme.background }]}>
        <HomeTopBar
          name={user?.name}
          avatar={user?.avatar}
          unread={notifications.some((item) => !item.read)}
          onSearch={() => searchInput.current?.focus()}
          onNotifications={() => pushPath('/(customer)/(tabs)/notifications')}
          onProfile={() => pushPath('/(customer)/(tabs)/profile')}
        />
        <ScrollView
          ref={scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.feed}
          keyboardDismissMode="on-drag"
          // Like the website: search and filters stay at the top while the listings scroll.
          // Children 0-2 are always rendered, so index 2 is always the filter bar.
          stickyHeaderIndices={[2]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={theme.primary}
              colors={[theme.primary]}
              onRefresh={() => void onRefresh()}
            />
          }
        >
          <ExploreIntro />
          <ExploreServiceSelector value={tab} onChange={changeService} />
          <View style={[s.filterBar, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
            <View style={s.search}>
              <TravelTextField
                label="Search Explore"
                value={query}
                onChangeText={setQuery}
                placeholder={SEARCH_PLACEHOLDER[tab]}
                icon="search-outline"
                onSubmit={() => Keyboard.dismiss()}
                inputRef={searchInput}
                compact
              />
            </View>
            <ExploreRefineBar
              service={tab}
              value={refine}
              onChange={setRefine}
              resultCount={
                tab === 'hotels'
                  ? catalog.hotels.length
                  : tab === 'guides'
                    ? catalog.guides.length
                    : tab === 'restaurants'
                      ? catalog.restaurants.length
                      : undefined
              }
            />
          </View>
          {status?.loading && status.empty ? (
            <ListingSkeletons />
          ) : status?.error && status.empty ? (
            <View style={s.state}>
              <EmptyState
                title="Couldn't load listings"
                message="Check your connection and try again."
                actionLabel="Try again"
                onAction={() => void status.retry()}
              />
            </View>
          ) : (
            <>
              <ExplorePanels
                tab={tab}
                {...catalog}
                query={query}
                sort={refine.sort}
                onSearchRestaurants={(city) => void searchByDestination(city)}
              />
              <FloatingCrossSell tab={tab} {...catalog} onSwitchTab={changeService} />
            </>
          )}
          <View style={s.cityToCity}>
            <CityToCityEntry />
          </View>
          <ExplorePromo
            onOpenRoads={roads.open}
            onViewHunza={() => {
              changeService('hotels');
              setQuery('Hunza');
            }}
          />
          <ExploreRoads onOpenRoads={roads.open} />
        </ScrollView>
        {roads.sheet}
        <ExploreHelp />
        <ServicePickerSheet
          visible={picker !== null}
          startWith={picker ?? 'choose'}
          onClose={() => setPicker(null)}
          onPick={(next) => {
            setPicker(null);
            if (next === 'transport') pushPath(ALL_RIDES_MAP);
            else changeService(next);
          }}
        />
      </View>
    </TravelDesignProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  feed: { paddingBottom: 96 },
  filterBar: { paddingTop: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  search: { paddingHorizontal: 16 },
  cityToCity: { paddingHorizontal: 16, marginTop: 32 },
  state: { paddingHorizontal: 16, paddingTop: 8 },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  skeletonCard: { width: '47%' },
});

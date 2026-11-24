import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ExploreFilterChips, ThumbnailGrid } from '@/components/explore/ThumbnailGrid';
import { HomeSection } from '@/components/travel/HomeSection';
import { DestinationCard } from '@/components/travel/DestinationCard';
import { LocationPinSheet, formatPickedCity } from '@/components/location/LocationPinSheet';
import {
  usePresentationColors as useThemeColors,
  useTravelPresentation,
} from '@/components/ui/TravelDesignProvider';
import { TravelFormCard, TravelTextField, TravelSearchButton } from '@/components/ui/TravelForm';
import {
  GUIDE_GENDERS,
  RESIDENCE_CLASSES,
  TOUR_TYPES,
  mapHotelResidenceClass,
  mapTripVehicleClass,
  type ExploreServiceTab,
  type ExploreThumb,
  type GuideGender,
  type ResidenceClass,
  type TourType,
  type VehicleClass,
} from '@/constants/exploreCatalog';
import { POPULAR_DESTINATIONS, FEATURED_STORIES } from '@/constants/destinations';
import { Radius, Spacing } from '@/constants/spacing';
import { Fonts } from '@/constants/typography';
import { useBestTourOperators, useTourCatalog } from '@/hooks/useTourItineraries';
import { useLocation } from '@/hooks/useLocation';
import type { Hotel } from '@/types/hotel';
import type { Provider } from '@/types/provider';
import type { Restaurant } from '@/types/restaurant';
import type { TourItinerary } from '@/types/tourItinerary';
import type { TripWithDetails } from '@/types/trip';
import { formatCurrency } from '@/utils/formatCurrency';
import { pushPath } from '@/utils/navigation';
import type { ExploreSort } from '@/utils/exploreRefine';
import {
  rankMostVisited,
  rankRestaurantsByOffers,
  rankRestaurantsNearOffers,
} from '@/services/restaurantService';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=600&q=80&auto=format&fit=crop';
const RESTO_FALLBACK =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=80&auto=format&fit=crop';

type ExplorePanelsProps = {
  tab: ExploreServiceTab;
  trips?: TripWithDetails[];
  hotels?: Hotel[];
  restaurants?: Restaurant[];
  guides?: Provider[];
  tourProviders?: Provider[];
  compact?: boolean;
  query?: string;
  onOpenDestination?: (name: string) => void;
  onSearchRestaurants?: (city: string) => void;
  /** The visitor's chosen sort; anything but "recommended" keeps the list's order. */
  sort?: ExploreSort;
};

function EmptyCatalog({ title, message }: { title: string; message: string }) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        styles.emptyBox,
        { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.emptyTitle, { color: colors.dark }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.muted }]}>{message}</Text>
    </View>
  );
}

/** Highest rated first — only for the default "Recommended" order; a sort the visitor picked wins. */
function byRating<T extends { rating?: number; reviewCount?: number }>(list: T[], keepOrder: boolean) {
  if (keepOrder) return list;
  return [...list].sort(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0),
  );
}

const RESIDENCE_BADGE: Record<ResidenceClass, string> = {
  hotel: 'Hotel',
  guest_house: 'Guest house',
  lodge: 'Lodge',
};

/** Every stay in one list; perks (free cancellation, breakfast) ride along as the badge. */
function hotelThumbs(
  hotels: Hotel[],
  residence: ResidenceClass | 'all',
  keepOrder: boolean,
): ExploreThumb[] {
  return byRating(
    hotels.filter(
      (h) => residence === 'all' || mapHotelResidenceClass(h.hotelType) === residence,
    ),
    keepOrder,
  ).map((h) => ({
    id: h.id,
    title: h.name,
    subtitle: h.location.city,
    image: h.images[0] || FALLBACK_IMAGE,
    rating: h.rating,
    href: `/(customer)/hotels/${h.id}`,
    badge: h.freeCancellation
      ? 'Free cancellation'
      : h.breakfastIncluded || h.amenities?.includes('Breakfast')
        ? 'Breakfast included'
        : RESIDENCE_BADGE[mapHotelResidenceClass(h.hotelType)],
    meta: h.priceFrom > 0 ? `From ${formatCurrency(h.priceFrom)} / night` : undefined,
  }));
}

/** Vehicles of the local drivers offering live trips (used by the "Need a ride there?" cross-sell). */
function tripVehicleThumbs(
  trips: TripWithDetails[],
): Array<ExploreThumb & { vehicleClass: VehicleClass }> {
  const byVehicle = new Map<string, ExploreThumb & { vehicleClass: VehicleClass }>();
  for (const trip of trips) {
    const vehicleClass = mapTripVehicleClass(trip.vehicleType);
    const key = `${trip.agencyId}-${trip.vehicleType}-${trip.vehicleName || trip.vehicleId || trip.id}`;
    if (byVehicle.has(key)) continue;
    byVehicle.set(key, {
      id: key,
      title: trip.vehicleName || trip.vehicleType || 'Vehicle',
      subtitle: trip.agency?.name || 'Local driver',
      image: trip.image || trip.vehicleImages?.[0] || FALLBACK_IMAGE,
      rating: trip.agency?.rating || trip.rating,
      badge: vehicleClass.replace('_', ' '),
      href: `/(customer)/agency/${trip.agencyId}`,
      meta: `${trip.from} → ${trip.to}`,
      vehicleClass,
    });
  }
  return Array.from(byVehicle.values());
}


function restaurantThumbs(list: Restaurant[], badge?: string): ExploreThumb[] {
  return list.map((r) => {
    const topOffer = r.offers.find((o) => o.active);
    const offerBadge =
      badge ||
      (topOffer?.type === 'sale'
        ? 'Sale'
        : topOffer?.type === 'discount'
          ? topOffer.discountPercent
            ? `${topOffer.discountPercent}% off`
            : 'Deal'
          : topOffer
            ? 'Offer'
            : undefined);
    return {
      id: r.id,
      title: r.name,
      subtitle: r.cuisine.slice(0, 2).join(' · ') || r.city,
      image: r.images[0] || RESTO_FALLBACK,
      rating: r.rating || undefined,
      badge: offerBadge,
      href: `/(customer)/restaurants/${r.id}`,
      meta: topOffer?.title || r.city,
    };
  });
}

function providerThumbs(list: Provider[], hrefPrefix: string): ExploreThumb[] {
  return list.map((p) => ({
    id: p.id,
    title: p.businessName,
    subtitle: p.city,
    image: p.logo || p.tour?.images?.[0] || FALLBACK_IMAGE,
    rating: p.rating || undefined,
    href: `${hrefPrefix}${p.id}`,
    meta: p.tour?.destination || p.description?.slice(0, 40),
  }));
}

function guideDisplayName(p: Provider) {
  const owner = String(p.ownerName ?? '').trim();
  if (owner) return owner.split(/\s+/)[0] || owner;
  return p.businessName || 'Guide';
}

function guideThumbs(
  list: Provider[],
  gender: GuideGender | 'all',
  keepOrder: boolean,
): ExploreThumb[] {
  return byRating(
    list.filter((p) => {
      const g = String(p.tour?.gender ?? '').toLowerCase();
      return gender === 'all' || !g || g === gender;
    }),
    keepOrder,
  ).map((p) => {
    // "Speaks Urdu, English" — never "Languages 0 reg. 0 intl."
    const languages = [
      ...(p.tour?.regionalLanguages ?? []),
      ...(p.tour?.internationalLanguages ?? []),
    ]
      .map((l) => String(l).trim())
      .filter(Boolean);
    const langLine = languages.length
      ? `Speaks ${languages.slice(0, 3).join(', ')}${languages.length > 3 ? ` +${languages.length - 3}` : ''}`
      : undefined;
    const years = p.tour?.yearsExperience ?? p.yearsExperience;
    return {
      id: p.id,
      title: guideDisplayName(p),
      subtitle: [years ? `${years} yrs experience` : null, p.city].filter(Boolean).join(' · '),
      image: p.logo || p.tour?.images?.[0] || FALLBACK_IMAGE,
      rating: p.rating || undefined,
      href: `/(customer)/guides/${p.id}`,
      meta: langLine,
    };
  });
}

function itineraryThumbs(list: TourItinerary[], badge?: string): ExploreThumb[] {
  return list.map((item) => ({
    id: item.id,
    title: item.title,
    subtitle: item.destination,
    image: item.coverImage || item.images[0] || FALLBACK_IMAGE,
    rating: item.provider?.rating || undefined,
    badge: badge || item.tourType,
    href: `/(customer)/tours/${item.id}`,
    meta:
      item.pricePerPerson > 0
        ? `${item.durationDays}d · ${formatCurrency(item.pricePerPerson)}`
        : `${item.durationDays} days`,
  }));
}

function ToursPanel({ compact, query = '' }: { compact?: boolean; query?: string }) {
  const [tourType, setTourType] = useState<TourType>('trek');
  const { catalog } = useTourCatalog(tourType);
  const { operators } = useBestTourOperators(12);

  const matches = (item: ExploreThumb) =>
    [item.title, item.subtitle, item.meta]
      .join(' ')
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  const featured = itineraryThumbs(catalog?.featured ?? [], 'Featured').filter(matches);
  const popular = itineraryThumbs(catalog?.popular ?? [], 'Popular').filter(matches);
  const newest = itineraryThumbs(catalog?.newest ?? [], 'New').filter(matches);
  const bestOps: ExploreThumb[] = operators.map((op) => ({
    id: op.id,
    title: op.businessName,
    subtitle: op.city || undefined,
    image: op.logo || FALLBACK_IMAGE,
    rating: op.rating || undefined,
    badge: op.verified ? 'Verified' : undefined,
    href: `/(customer)/agency/${op.id}`,
    meta: op.itineraryCount
      ? `${op.itineraryCount} package${op.itineraryCount === 1 ? '' : 's'}`
      : op.yearsExperience
        ? `${op.yearsExperience} yrs`
        : undefined,
  }));

  return (
    <>
      <HomeSection title="Tour type" subtitle="Treks, expeditions & summits from operators">
        <ExploreFilterChips options={TOUR_TYPES} value={tourType} onChange={setTourType} />
      </HomeSection>

      <HomeSection
        title="Featured itineraries"
        subtitle={`${TOUR_TYPES.find((t) => t.id === tourType)?.label ?? 'Tour'} packages highlighted by BANJARA`}
      >
        {featured.length ? (
          <ThumbnailGrid
            items={featured}
            columns={4}
            rows={compact ? 2 : 3}
            showMoreLabel="Show more"
          />
        ) : (
          <EmptyCatalog
            title="No featured packages yet"
            message="Featured itineraries appear after operators publish and admin features them."
          />
        )}
      </HomeSection>

      <HomeSection title="Popular" subtitle="Great value packages travelers can open">
        {popular.length ? (
          <ThumbnailGrid
            items={popular}
            columns={4}
            rows={compact ? 2 : 3}
            showMoreLabel="Show more"
          />
        ) : (
          <EmptyCatalog
            title="No popular packages yet"
            message="Published itineraries for this tour type will show here."
          />
        )}
      </HomeSection>

      <HomeSection title="Newest" subtitle="Recently published by tour operators">
        {newest.length ? (
          <ThumbnailGrid
            items={newest}
            columns={4}
            rows={compact ? 2 : 3}
            showMoreLabel="Show more"
          />
        ) : (
          <EmptyCatalog
            title="Nothing new yet"
            message="When operators add packages and admin approves them, they land here."
          />
        )}
      </HomeSection>

      <HomeSection
        title="Best tour operators"
        subtitle="Ranked by experience, ratings and live packages"
      >
        {bestOps.filter(matches).length ? (
          <ThumbnailGrid
            items={bestOps.filter(matches)}
            columns={4}
            rows={compact ? 2 : 3}
            showMoreLabel="Show more"
          />
        ) : (
          <EmptyCatalog
            title="No operators ranked yet"
            message="Operators with published itineraries appear in this row."
          />
        )}
      </HomeSection>
    </>
  );
}

export function ExplorePanels({
  tab,
  trips = [],
  hotels = [],
  restaurants = [],
  guides = [],
  tourProviders = [],
  compact,
  onOpenDestination,
  onSearchRestaurants,
  query,
  sort = 'recommended',
}: ExplorePanelsProps) {
  const colors = useThemeColors();
  const travel = useTravelPresentation();
  // A sort the visitor picked (price, rating…) must survive; only "Recommended" re-ranks.
  const keepOrder = sort !== 'recommended';
  // Start with everything: all stay types, every guide.
  const [residence, setResidence] = useState<ResidenceClass | 'all'>('all');
  const [guideGender, setGuideGender] = useState<GuideGender | 'all'>('all');
  const [restoCity, setRestoCity] = useState('');
  const [searchedCity, setSearchedCity] = useState('');
  const { location: userLocation, request: requestLocation } = useLocation();
  const [destinationMapOpen, setDestinationMapOpen] = useState(false);

  useEffect(() => {
    if (tab === 'restaurants') void requestLocation();
  }, [tab, requestLocation]);

  const residenceClassesWithData = useMemo(() => {
    const present = new Set(hotels.map((h) => mapHotelResidenceClass(h.hotelType)));
    return RESIDENCE_CLASSES.filter((r) => present.has(r.id));
  }, [hotels]);

  const activeResidence = residenceClassesWithData.some((r) => r.id === residence)
    ? residence
    : 'all';

  const residenceItems = useMemo(
    () => hotelThumbs(hotels, activeResidence, keepOrder),
    [hotels, activeResidence, keepOrder],
  );

  const offerRestaurants = useMemo(
    () =>
      rankRestaurantsNearOffers(
        restaurants.filter((r) => r.offers.some((o) => o.active)),
        userLocation,
      ),
    [restaurants, userLocation],
  );

  const mostVisitedRestaurants = useMemo(
    () => (keepOrder ? restaurants : rankMostVisited(restaurants, userLocation)).slice(0, 12),
    [restaurants, userLocation, keepOrder],
  );

  const topRestaurantProviders = useMemo(
    () =>
      [...restaurants]
        .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
        .slice(0, 8)
        .map((r) => ({
          id: `top-${r.id}`,
          title: r.name,
          subtitle: r.city,
          image: r.images[0] || RESTO_FALLBACK,
          rating: r.rating || undefined,
          href: `/(customer)/restaurants/${r.id}`,
          meta: r.cuisine.slice(0, 2).join(' · ') || undefined,
          badge: r.rating >= 4.5 ? 'Top' : undefined,
        })),
    [restaurants],
  );

  const liveDestinations = useMemo(() => {
    const names = new Set<string>();
    for (const trip of trips) {
      if (trip.from) names.add(trip.from.trim());
      if (trip.to) names.add(trip.to.trim());
    }
    for (const hotel of hotels) {
      if (hotel.location?.city) names.add(hotel.location.city.trim());
    }
    for (const r of restaurants) {
      if (r.city) names.add(r.city.trim());
    }
    for (const g of guides) {
      if (g.city) names.add(g.city.trim());
    }
    for (const t of tourProviders) {
      if (t.city) names.add(t.city.trim());
      if (t.tour?.destination) names.add(t.tour.destination.trim());
    }
    return POPULAR_DESTINATIONS.filter((d) =>
      [...names].some(
        (n) =>
          n.toLowerCase().includes(d.name.toLowerCase()) ||
          d.name.toLowerCase().includes(n.toLowerCase()),
      ),
    );
  }, [trips, hotels, restaurants, guides, tourProviders]);

  const guideItems = useMemo(
    () => guideThumbs(guides, guideGender, keepOrder),
    [guides, guideGender, keepOrder],
  );

  const openDest = (name: string) => {
    if (onOpenDestination) onOpenDestination(name);
    else router.push('/(customer)/(tabs)/search');
  };

  const runRestaurantSearch = () => {
    const q = restoCity.trim();
    setSearchedCity(q);
    onSearchRestaurants?.(q);
  };

  return (
    <View style={styles.root}>
      <LocationPinSheet
        visible={destinationMapOpen}
        title="Restaurant destination"
        confirmLabel="Use destination"
        onClose={() => setDestinationMapOpen(false)}
        onConfirm={(picked) => {
          const city = formatPickedCity(picked);
          setRestoCity(city);
          setSearchedCity(city);
          onSearchRestaurants?.(city);
          setDestinationMapOpen(false);
        }}
      />
      {tab === 'hotels' ? (
        <>
          {residenceClassesWithData.length > 1 ? (
            <HomeSection title="Stay type" subtitle="Hotels, guest houses and lodges">
              <ExploreFilterChips
                options={[{ id: 'all' as const, label: 'All stays' }, ...residenceClassesWithData]}
                value={activeResidence}
                onChange={setResidence}
              />
            </HomeSection>
          ) : null}
          {/* One list: perks like free cancellation show as a badge on each card, so a
              separate "deals" list repeating the same stays isn't needed. */}
          <HomeSection
            title={
              activeResidence === 'all'
                ? 'Places to stay'
                : `Best ${RESIDENCE_CLASSES.find((r) => r.id === activeResidence)?.label ?? 'stays'}`
            }
            subtitle="Prices per night, from verified lodging providers"
          >
            {residenceItems.length ? (
              <ThumbnailGrid
                items={residenceItems}
                columns={4}
                rows={3}
                showMoreLabel="Show more"
                onShowMore={() => router.push('/(customer)/(tabs)/hotels')}
              />
            ) : (
              <EmptyCatalog
                title={hotels.length ? 'No stays match these filters' : 'No stays listed yet'}
                message={
                  hotels.length
                    ? 'Try another stay type or clear the filters above.'
                    : 'Hotels, guest houses and lodges appear here as soon as providers list them.'
                }
              />
            )}
          </HomeSection>
        </>
      ) : null}

      {tab === 'guides' ? (
        <>
          <HomeSection title="Guides" subtitle="Local experts for treks, jeep safaris and village walks">
            <ExploreFilterChips
              options={[{ id: 'all' as const, label: 'All guides' }, ...GUIDE_GENDERS]}
              value={guideGender}
              onChange={setGuideGender}
            />
          </HomeSection>
          {guideItems.length ? (
            <HomeSection
              title={
                guideGender === 'all' ? 'Top local guides' : `Top ${guideGender} guides`
              }
              subtitle="Experience and the languages they speak"
            >
              <ThumbnailGrid
                items={guideItems}
                columns={4}
                rows={compact ? 3 : 4}
                showMoreLabel="Show more"
                onShowMore={() => pushPath('/(customer)/guides/index')}
              />
            </HomeSection>
          ) : (
            <EmptyCatalog
              title={guideGender === 'all' ? 'No guides listed yet' : `No ${guideGender} guides listed yet`}
              message={
                guideGender === 'all'
                  ? 'Guide profiles appear here as soon as local guides register.'
                  : 'Try "All guides" to see every local guide.'
              }
            />
          )}
        </>
      ) : null}

      {tab === 'tours' ? <ToursPanel compact={compact} query={query} /> : null}

      {tab === 'restaurants' ? (
        <>
          <HomeSection
            title={travel ? 'Find a restaurant' : 'Search restaurants by destination'}
            subtitle="Enter a city — deals nearest to you show first"
          >
            {travel ? (
              <View style={{ marginHorizontal: 16 }}>
                <TravelFormCard>
                  <TravelTextField
                    label="Destination"
                    value={restoCity}
                    onChangeText={(city) => {
                      setRestoCity(city);
                      if (!city) {
                        setSearchedCity('');
                        onSearchRestaurants?.('');
                      }
                    }}
                    placeholder="Hunza, Skardu, Gilgit…"
                    icon="location-outline"
                    onSubmit={runRestaurantSearch}
                    trailing={
                      <Pressable
                        onPress={() => setDestinationMapOpen(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Pin restaurant destination on map"
                        style={{
                          minWidth: 36,
                          minHeight: 44,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="map-outline" size={20} color={colors.primary} />
                      </Pressable>
                    }
                  />
                  <TravelSearchButton title="Search restaurants" onPress={runRestaurantSearch} />
                  {userLocation ? (
                    <Text style={[styles.nearHint, { color: colors.muted }]}>
                      Offers nearest to you appear first
                    </Text>
                  ) : null}
                </TravelFormCard>
              </View>
            ) : (
              <View style={styles.restoSearchCol}>
                <View
                  style={[
                    styles.searchField,
                    styles.restoSearchFieldFull,
                    { borderColor: colors.border, backgroundColor: colors.inputBg },
                  ]}
                >
                  <Ionicons name="location-outline" size={18} color={colors.muted} />
                  <TextInput
                    value={restoCity}
                    onChangeText={setRestoCity}
                    placeholder="e.g. Hunza, Skardu, Gilgit"
                    placeholderTextColor={colors.muted}
                    style={[styles.searchInput, { color: colors.dark }]}
                    onSubmitEditing={runRestaurantSearch}
                    returnKeyType="search"
                  />
                  <Pressable
                    onPress={() => setDestinationMapOpen(true)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Pin restaurant destination on map"
                  >
                    <Ionicons name="map-outline" size={20} color={colors.primary} />
                  </Pressable>
                  {restoCity.length > 0 ? (
                    <Pressable
                      onPress={() => {
                        setRestoCity('');
                        setSearchedCity('');
                        onSearchRestaurants?.('');
                      }}
                      hitSlop={8}
                      accessibilityLabel="Clear destination"
                    >
                      <Ionicons name="close-circle" size={18} color={colors.muted} />
                    </Pressable>
                  ) : null}
                </View>
                <Pressable
                  onPress={runRestaurantSearch}
                  style={[styles.searchBtnWide, { backgroundColor: colors.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel="Search restaurants by destination"
                >
                  <Ionicons name="search" size={18} color="#fff" />
                  <Text style={styles.searchBtnText}>Search restaurants by destination</Text>
                </Pressable>
                {userLocation ? (
                  <Text style={[styles.nearHint, { color: colors.muted }]}>
                    Ranking deals nearest to your current location
                  </Text>
                ) : null}
              </View>
            )}
          </HomeSection>

          <HomeSection
            title={searchedCity ? `Offers near ${searchedCity}` : 'Sales, offers & discounts'}
            subtitle="Updated by restaurant owners on their profiles · deals first"
          >
            {offerRestaurants.length ? (
              <ThumbnailGrid
                items={restaurantThumbs(offerRestaurants)}
                columns={4}
                rows={compact ? 2 : 3}
                showMoreLabel="Show more"
              />
            ) : (
              <EmptyCatalog
                title="No offers yet"
                message={
                  searchedCity
                    ? `No sales or discounts listed near ${searchedCity} yet.`
                    : 'When restaurants add sales and discounts, they appear here first.'
                }
              />
            )}
          </HomeSection>

          <HomeSection
            title="Most visited restaurants"
            subtitle={
              travel
                ? 'Local flavors and traveler favorites'
                : 'Menu variety, ratings & nearest to you — 4 per row'
            }
          >
            {mostVisitedRestaurants.length ? (
              <ThumbnailGrid
                items={restaurantThumbs(mostVisitedRestaurants)}
                columns={4}
                rows={compact ? 2 : 3}
                showMoreLabel="Show more"
              />
            ) : (
              <EmptyCatalog
                title="No restaurants yet"
                message="Restaurants will list here after food partners join and add their venues."
              />
            )}
          </HomeSection>

          {topRestaurantProviders.length ? (
            <HomeSection title="Top providers" subtitle="Highest-rated dining partners on BANJARA">
              <ThumbnailGrid
                items={topRestaurantProviders}
                columns={4}
                rows={2}
                showMoreLabel="Show more"
              />
            </HomeSection>
          ) : null}

          <HomeSection title="Travel inspirations" subtitle="Food stops on iconic northern routes">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hRow}
            >
              {FEATURED_STORIES.map((story, index) => (
                <DestinationCard
                  key={story.id}
                  name={story.title}
                  subtitle={story.subtitle}
                  image={story.image}
                  tag="Dine"
                  featured={index === 0}
                  onPress={() => {
                    setRestoCity(story.to);
                    setSearchedCity(story.to);
                    onSearchRestaurants?.(story.to);
                  }}
                />
              ))}
            </ScrollView>
          </HomeSection>
        </>
      ) : null}

      {liveDestinations.length > 0 && tab !== 'transport' ? (
        <HomeSection title="Popular destinations" subtitle="From live trips, stays and dining">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hRow}
          >
            {liveDestinations.map((item, index) => (
              <DestinationCard
                key={item.id}
                name={item.name}
                subtitle={item.subtitle}
                image={item.image}
                tag={item.tag}
                featured={index === 0}
                onPress={() => openDest(item.name)}
              />
            ))}
          </ScrollView>
        </HomeSection>
      ) : null}
    </View>
  );
}

/** One "what next" suggestion per tab: stay → ride, tours → guides, guides → food, food → guides. */
export function FloatingCrossSell({
  tab,
  trips = [],
  restaurants = [],
  guides = [],
  onSwitchTab,
}: {
  tab: ExploreServiceTab;
  trips?: TripWithDetails[];
  hotels?: Hotel[];
  restaurants?: Restaurant[];
  guides?: Provider[];
  /** Switch Explore to another service tab (instead of a dead link). */
  onSwitchTab?: (tab: ExploreServiceTab) => void;
}) {
  const rideItems = useMemo(() => tripVehicleThumbs(trips).slice(0, 8), [trips]);
  // Every guide, not just one gender.
  const guideItems = useMemo(() => guideThumbs(guides, 'all', false).slice(0, 8), [guides]);
  const restoItems = useMemo(
    () => restaurantThumbs(rankRestaurantsByOffers(restaurants).slice(0, 8), 'Eat'),
    [restaurants],
  );
  // Rides live on the map now, not in a list.
  const openRidesMap = () => pushPath('/(customer)/explore/nearby');
  const openGuides = () =>
    onSwitchTab ? onSwitchTab('guides') : pushPath('/(customer)/guides/index');

  if (tab === 'hotels') {
    if (!rideItems.length) return null;
    return (
      <HomeSection
        title="Need a ride there?"
        subtitle="Cars, jeeps and vans from local drivers"
        actionLabel="See rides on the map"
        onAction={openRidesMap}
      >
        <ThumbnailGrid
          items={rideItems}
          columns={4}
          rows={2}
          showMoreLabel="See rides on the map"
          onShowMore={openRidesMap}
        />
      </HomeSection>
    );
  }

  if (tab === 'tours' || tab === 'restaurants') {
    if (!guideItems.length) return null;
    return (
      <HomeSection
        title={tab === 'tours' ? 'Need a guide?' : 'Explore with a guide'}
        subtitle="Verified local guides for the rest of your trip"
        actionLabel="Browse guides"
        onAction={openGuides}
      >
        <ThumbnailGrid
          items={guideItems}
          columns={4}
          rows={2}
          showMoreLabel="Browse guides"
          onShowMore={openGuides}
        />
      </HomeSection>
    );
  }

  if (tab === 'guides') {
    if (!restoItems.length) return null;
    const openFood = () => onSwitchTab?.('restaurants');
    return (
      <HomeSection
        title="Where to eat?"
        subtitle="Local restaurants with offers"
        actionLabel={onSwitchTab ? 'Browse restaurants' : undefined}
        onAction={onSwitchTab ? openFood : undefined}
      >
        <ThumbnailGrid items={restoItems} columns={4} rows={2} showMoreLabel="Show more" />
      </HomeSection>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  root: { gap: 0 },
  hRow: { paddingHorizontal: Spacing.screen },
  searchField: {
    marginHorizontal: Spacing.screen,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    minHeight: 46,
  },
  restoSearchCol: {
    paddingHorizontal: Spacing.screen,
    gap: 10,
    marginBottom: Spacing.sm,
  },
  restoSearchFieldFull: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  searchBtnWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
  },
  nearHint: {
    fontFamily: Fonts.body,
    fontSize: 12,
    paddingHorizontal: 4,
  },
  searchBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: '#fff',
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 14,
    paddingVertical: 8,
  },
  emptyBox: {
    marginHorizontal: Spacing.screen,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    borderWidth: 1,
    gap: 6,
  },
  emptyTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 15 },
  emptyBody: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },
});

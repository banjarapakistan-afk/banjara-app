import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { IntercityTracking } from '@/components/intercity/IntercityTracking';
import {
  Divider,
  ErrorText,
  Fact,
  FactGrid,
  Loading,
  Notice,
  Panel,
  Pill,
  ScreenTop,
  Section,
  StateCard,
  intercityStyles as t,
  requestTone,
  useTones,
} from '@/components/intercity/IntercityUI';
import { Button } from '@/components/ui/Button';
import { TravelDesignProvider } from '@/components/ui/TravelDesignProvider';
import { useHomeDesign } from '@/constants/homeDesign';
import {
  cancelRideRequest,
  chooseOffer,
  getRideRequest,
  joinSharedTrip,
  listSharedTrips,
  widenRideRequest,
  type RideOffer,
  type RideRequest,
  type SharedTrip,
} from '@/services/intercity.service';
import { classLabel, formatPakistanTime, formatRupees, requestStatusLabel, shouldSuggestWiden } from '@/utils/intercity';
import { paramId, pushPath, replacePath, safeBack } from '@/utils/navigation';

/** One City to City request: offers come in, the rider chooses one, then follows the driver. */
export default function IntercityRequestStatusScreen() {
  return (
    <TravelDesignProvider>
      <StatusScreen />
    </TravelDesignProvider>
  );
}

function StatusScreen() {
  const theme = useTones();
  const id = paramId(useLocalSearchParams<{ id: string }>().id);
  const [request, setRequest] = useState<RideRequest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [widenedAt, setWidenedAt] = useState<string | null>(null);
  const [focused, setFocused] = useState(true);

  const load = useCallback(async () => {
    try {
      setRequest(await getRideRequest(id));
      setLoadError(null);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : 'It may have been removed.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void load();
      return () => setFocused(false);
    }, [load]),
  );

  // While drivers can still answer, check for new offers every 5 seconds (only on screen).
  const open = request?.status === 'open';
  useEffect(() => {
    if (!open || !focused) return;
    const timer = setInterval(() => void load(), 5_000);
    return () => clearInterval(timer);
  }, [open, focused, load]);

  const run = async (key: string, task: () => Promise<RideRequest>) => {
    setError('');
    setBusy(key);
    try {
      setRequest(await task());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const confirmCancel = (r: RideRequest) =>
    Alert.alert('Cancel this request?', 'Drivers will stop seeing it.', [
      { text: 'Keep my request', style: 'cancel' },
      { text: 'Yes, cancel', style: 'destructive', onPress: () => void run('cancel', () => cancelRideRequest(r.id)) },
    ]);

  const r = request;
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScreenTop title="Your ride request" onBack={() => safeBack('/(customer)/intercity/mine' as never)} />
      {!r ? (
        <View style={t.screen}>
          {loadError ? (
            <StateCard icon="alert-circle-outline" title="We couldn’t find this request" body={loadError}>
              <Button title="Try again" onPress={() => void load()} />
            </StateCard>
          ) : (
            <Loading text="Loading your request…" />
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={t.screen}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
        >
          <View style={{ gap: 8 }}>
            <Pill text={requestStatusLabel(r.status)} tone={requestTone(r.status)} />
            <Text style={[t.heroTitle, { color: theme.text }]}>
              {r.pickup.city || 'Pickup'} → {r.dropoff.city || 'Drop-off'}
            </Text>
            <Text style={[t.body, { color: theme.muted }]}>
              {r.rideType === 'shared_seat' ? 'Shared seat' : 'Full car'} · {r.bookNow ? 'Leave now' : formatPakistanTime(r.departAt)}
              {r.journeyType === 'round_trip' && r.returnTrip ? ` · back ${formatPakistanTime(r.returnTrip.departAt)}` : ''}
            </Text>
          </View>

          {error ? (
            <View style={{ marginTop: 16 }}>
              <Notice tone="danger" text={error} />
            </View>
          ) : null}

          {r.status === 'matched' ? (
            <Section title="Booked">
              <Notice tone="ok" text="Your driver is confirmed. Pay them in cash for the ride." />
              {r.bookingId ? (
                <Button title="View my booking" onPress={() => pushPath(`/(customer)/booking-details/${encodeURIComponent(r.bookingId!)}`)} />
              ) : null}
              {r.returnBookingId ? (
                <Button title="Return booking" variant="outline" onPress={() => pushPath(`/(customer)/booking-details/${encodeURIComponent(r.returnBookingId!)}`)} />
              ) : null}
            </Section>
          ) : open ? (
            <>
              <Section title="Driver offers" subtitle={`Closes at ${formatPakistanTime(r.expiresAt)} if no driver is chosen.`} bare>
                <SearchRadius
                  request={r}
                  busy={busy === 'widen'}
                  widenedAt={widenedAt}
                  onWiden={() =>
                    void run('widen', async () => {
                      const next = await widenRideRequest(r.id);
                      setWidenedAt(new Date().toISOString());
                      return next;
                    })
                  }
                />
                {r.offers.length ? (
                  r.offers.map((offer) => (
                    <OfferCard key={offer.id} offer={offer} busy={busy} onChoose={() => void run(offer.id, () => chooseOffer(r.id, offer.id))} />
                  ))
                ) : (
                  <Panel>
                    <Loading text="Waiting for drivers to respond. This screen updates on its own." />
                  </Panel>
                )}
              </Section>
              {r.rideType === 'shared_seat' ? (
                <SharedTrips request={r} busy={busy} focused={focused} onJoin={(tripId) => void run(tripId, () => joinSharedTrip(r.id, tripId))} />
              ) : null}
            </>
          ) : (
            <View style={{ marginTop: 16 }}>
              <StateCard
                icon={r.status === 'expired' ? 'hourglass-outline' : 'close-circle-outline'}
                title={r.status === 'expired' ? 'No driver was chosen in time' : 'You cancelled this request'}
                body="You can send a new request whenever you’re ready."
              >
                <Button title="New request" onPress={() => replacePath('/(customer)/intercity')} />
              </StateCard>
            </View>
          )}

          {r.status === 'matched' && r.tripId ? (
            <Section title="Driver location">
              <IntercityTracking tripId={r.tripId} />
            </Section>
          ) : null}
          {r.status === 'matched' && r.returnTripId ? (
            <Section title="Return trip">
              <IntercityTracking tripId={r.returnTripId} />
            </Section>
          ) : null}

          <Section title="Your ride">
            <Fact icon="radio-button-on" label="Pickup" value={r.pickup.address} />
            <Divider />
            <Fact icon="location-outline" label="Drop-off" value={r.dropoff.address} />
          </Section>
          <View style={{ marginTop: 12 }}>
            <FactGrid
              items={[
                { icon: 'car-outline', label: 'Vehicle', value: classLabel(r.vehicleClass) },
                { icon: 'people-outline', label: 'Passengers', value: String(r.passengers) },
                {
                  icon: 'bag-handle-outline',
                  label: 'Luggage',
                  value: `${r.luggage.bags} ${r.luggage.bags === 1 ? 'bag' : 'bags'}${r.luggage.large ? `, ${r.luggage.large} large` : ''}`,
                },
                { icon: 'git-branch-outline', label: 'Distance', value: `about ${Math.round(r.quote.distanceKm)} km` },
                ...(r.riderOffer ? [{ icon: 'cash-outline' as const, label: 'Your offer', value: formatRupees(r.riderOffer) }] : []),
                { icon: 'wallet-outline', label: r.status === 'matched' ? 'Total' : 'Estimated total', value: formatRupees(r.estimate.total), accent: true },
              ]}
            />
          </View>
          <Text style={[t.small, { color: theme.muted, marginTop: 10 }]}>Pay cash to the driver.</Text>
          {open ? (
            <View style={{ marginTop: 20 }}>
              <Button title="Cancel request" variant="outline" loading={busy === 'cancel'} disabled={Boolean(busy)} onPress={() => confirmCancel(r)} />
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function OfferCard({ offer, busy, onChoose }: { offer: RideOffer; busy: string | null; onChoose: () => void }) {
  const theme = useHomeDesign();
  return (
    <Panel>
      <View style={styles.offerTop}>
        <View style={[styles.avatar, { backgroundColor: theme.soft }]}>
          <Ionicons name="person-outline" size={18} color={theme.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[t.strong, { color: theme.text }]} numberOfLines={1}>
            {offer.driver?.name ?? 'Driver'}
          </Text>
          <Text style={[t.small, { color: theme.muted }]} numberOfLines={2}>
            {offer.driver && offer.driver.totalReviews > 0 ? `★ ${offer.driver.rating.toFixed(1)} (${offer.driver.totalReviews})` : 'New driver'}
            {offer.vehicle ? ` · ${offer.vehicle.name} · ${offer.vehicle.seats} seats` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={[t.price, { color: theme.text }]}>{formatRupees(offer.amount)}</Text>
          {offer.kind === 'counter' ? <Pill text="Counter-offer" tone="warn" /> : null}
        </View>
      </View>
      <Button title="Choose this driver" loading={busy === offer.id} disabled={Boolean(busy)} onPress={onChoose} />
    </Panel>
  );
}

/** "Searching drivers within N km", with a button to step the radius out. */
function SearchRadius({ request, busy, widenedAt, onWiden }: { request: RideRequest; busy: boolean; widenedAt: string | null; onWiden: () => void }) {
  const theme = useHomeDesign();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const suggest = shouldSuggestWiden({ ...request, lastWidenedAt: widenedAt }, now);
  return (
    <Panel>
      <View style={styles.offerTop}>
        <View style={[styles.avatar, { backgroundColor: theme.soft }]}>
          <Ionicons name="radio-outline" size={18} color={theme.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[t.strong, { color: theme.text }]}>Searching within {request.searchRadiusKm} km</Text>
          <Text style={[t.small, { color: theme.muted }]}>
            {suggest ? 'No offers yet. A wider search lets more drivers see your request.' : 'Drivers near your pickup can see your request.'}
          </Text>
        </View>
      </View>
      {request.nextRadiusKm != null ? (
        <Button title={`Search wider (${request.nextRadiusKm} km)`} variant={suggest ? 'primary' : 'outline'} loading={busy} disabled={busy} onPress={onWiden} />
      ) : null}
    </Panel>
  );
}

function SharedTrips({ request, busy, focused, onJoin }: { request: RideRequest; busy: string | null; focused: boolean; onJoin: (tripId: string) => void }) {
  const theme = useHomeDesign();
  const [trips, setTrips] = useState<SharedTrip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) return;
    let live = true;
    const load = () =>
      listSharedTrips(request.id)
        .then((list) => {
          if (!live) return;
          setTrips(list);
          setError(null);
        })
        .catch((reason) => live && setError(reason instanceof Error ? reason.message : 'Shared rides could not be loaded.'));
    void load();
    const timer = setInterval(load, 10_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [request.id, focused]);

  return (
    <Section title="Shared rides already going" bare>
      {!trips ? (
        <Panel>{error ? <ErrorText text={error} /> : <Loading text="Looking for shared rides…" />}</Panel>
      ) : trips.length ? (
        trips.map((trip) => (
          <Panel key={trip.tripId}>
            <View style={styles.offerTop}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[t.strong, { color: theme.text }]}>{trip.route}</Text>
                <Text style={[t.small, { color: theme.muted }]}>
                  {formatPakistanTime(trip.departAt)} · {trip.seatsLeft} {trip.seatsLeft === 1 ? 'seat' : 'seats'} left
                  {trip.driver ? ` · ${trip.driver.name}` : ''}
                  {trip.vehicle ? ` · ${trip.vehicle.name}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[t.price, { color: theme.text }]}>{formatRupees(trip.pricePerSeat)}</Text>
                <Text style={[t.small, { color: theme.muted }]}>per seat</Text>
              </View>
            </View>
            <Button
              title="Join this ride"
              loading={busy === trip.tripId}
              disabled={Boolean(busy) || trip.seatsLeft < request.passengers}
              onPress={() => onJoin(trip.tripId)}
            />
          </Panel>
        ))
      ) : (
        <Panel>
          <Text style={[t.body, { color: theme.muted }]}>No shared rides on this route right now. Drivers can still offer you a seat.</Text>
        </Panel>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  offerTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});

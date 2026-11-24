import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BottomBar,
  Chips,
  Divider,
  ErrorText,
  Field,
  Loading,
  Notice,
  PickField,
  PriceLine,
  ScreenTop,
  Section,
  Segmented,
  StateCard,
  Stepper,
  TimePickerModal,
  displayTime,
  intercityStyles as t,
  useTones,
} from '@/components/intercity/IntercityUI';
import { LocationPinSheet, formatPickedAddress } from '@/components/location/LocationPinSheet';
import { InAppWebMap } from '@/components/map/InAppWebMap';
import { Button } from '@/components/ui/Button';
import { DatePickerModal } from '@/components/ui/DatePickerModal';
import { TravelDesignProvider } from '@/components/ui/TravelDesignProvider';
import { useHomeDesign } from '@/constants/homeDesign';
import { Fonts } from '@/constants/typography';
import {
  createRideRequest,
  getIntercityConfigCached,
  getIntercityQuote,
  getNearby,
  type EnabledIntercityConfig,
  type IntercityConfig,
  type IntercityQuote,
  type NearbyResult,
} from '@/services/intercity.service';
import { useAuthStore } from '@/store/authStore';
import { formatDate } from '@/utils/formatDate';
import { formatDuration } from '@/utils/formatTime';
import {
  buildQuoteBody,
  classLabel,
  distanceLabel,
  formatRupees,
  fromPakistanInputs,
  minDepartAt,
  nearbyMessage,
  normalizePhone,
  offerFloor,
  toPakistanInputs,
  validateRideForm,
  type FareMode,
  type PlacePoint,
  type RideFormErrors,
  type RideFormValues,
  type RideType,
  type VehicleClassKey,
  type WaitMode,
} from '@/utils/intercity';
import { pushPath, safeBack } from '@/utils/navigation';

/** City to City: a door-to-door ride between two cities, priced before it goes to drivers. */
export default function IntercityRequestScreen() {
  return (
    <TravelDesignProvider>
      <RequestScreen />
    </TravelDesignProvider>
  );
}

function RequestScreen() {
  const theme = useHomeDesign();
  const [config, setConfig] = useState<IntercityConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    getIntercityConfigCached()
      .then((value) => live && setConfig(value))
      .catch((reason) => live && setError(reason instanceof Error ? reason.message : 'Please try again.'));
    return () => {
      live = false;
    };
  }, [attempt]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScreenTop
        title="City to City"
        onBack={() => safeBack('/(customer)/(tabs)')}
        action={{ icon: 'time-outline', label: 'My City to City rides', onPress: () => pushPath('/(customer)/intercity/mine') }}
      />
      {error ? (
        <View style={t.screen}>
          <StateCard icon="cloud-offline-outline" title="We couldn’t load City to City rides" body={error}>
            <Button title="Try again" onPress={() => setAttempt((n) => n + 1)} />
          </StateCard>
        </View>
      ) : !config ? (
        <View style={t.screen}>
          <Loading />
        </View>
      ) : !config.enabled ? (
        <View style={t.screen}>
          <StateCard
            title="City to City rides aren’t available yet"
            body="We’re getting door-to-door rides between cities ready. Until then, you can book seats on published rides."
          >
            <Button title="Browse rides" variant="outline" onPress={() => pushPath('/(customer)/explore/nearby')} />
          </StateCard>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <RideForm config={config} />
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

type Errors = RideFormErrors & { form?: string };
type Picker = 'pickup' | 'dropoff' | 'departDate' | 'departTime' | 'returnDate' | 'returnTime' | null;

function RideForm({ config }: { config: EnabledIntercityConfig }) {
  const theme = useTones();
  const user = useAuthStore((state) => state.user);
  const signedIn = useAuthStore((state) => state.isAuthenticated) && Boolean(user);
  const isProvider = Boolean(user && user.role !== 'customer');
  const [initial] = useState(() => toPakistanInputs(minDepartAt(new Date(), config.minLeadMinutes)));

  const [pickup, setPickup] = useState<PlacePoint | null>(null);
  const [dropoff, setDropoff] = useState<PlacePoint | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [bookNow, setBookNow] = useState(false);
  const [departDate, setDepartDate] = useState(initial.date);
  const [departTime, setDepartTime] = useState(initial.time);
  const [vehicleClass, setVehicleClass] = useState<VehicleClassKey>(config.classes[0]?.key ?? 'car');
  const [classChosen, setClassChosen] = useState(false);
  const [passengers, setPassengers] = useState(1);
  const [bags, setBags] = useState(1);
  const [large, setLarge] = useState(0);
  const [rideType, setRideType] = useState<RideType>('full_car');
  const [roundTripChosen, setRoundTripChosen] = useState(false);
  const [returnDate, setReturnDate] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [waitMode, setWaitMode] = useState<WaitMode>('hourly');
  const [waitHours, setWaitHours] = useState(4);
  const [nights, setNights] = useState(1);
  const [fareChoice, setFareChoice] = useState<FareMode>('fixed');
  const [offer, setOffer] = useState('');
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const seats = config.classes.find((item) => item.key === vehicleClass)?.seats ?? 4;
  const shared = rideType === 'shared_seat';
  const roundTrip = !shared && roundTripChosen;

  const values: RideFormValues = {
    pickup,
    dropoff,
    bookNow,
    departAt: fromPakistanInputs(departDate, departTime),
    vehicleClass,
    rideType,
    passengers,
    journeyType: roundTrip ? 'round_trip' : 'one_way',
    returnAt: fromPakistanInputs(returnDate, returnTime),
    waitMode,
    waitHours,
    nights,
    fareMode: 'fixed',
    offerAmount: offer.trim() ? Number(offer) : null,
    subtotal: null,
    passengerName: name,
    passengerPhone: phone,
  };

  // Price the ride once the route is complete, half a second after the last change.
  const body = buildQuoteBody(values);
  const bodyKey = body ? JSON.stringify(body) : '';
  const [quote, setQuote] = useState<{ key: string; data?: IntercityQuote; error?: string } | null>(null);
  useEffect(() => {
    if (!bodyKey) return;
    let live = true;
    const timer = setTimeout(() => {
      getIntercityQuote(JSON.parse(bodyKey))
        .then((data) => live && setQuote({ key: bodyKey, data }))
        .catch((reason) => live && setQuote({ key: bodyKey, error: reason instanceof Error ? reason.message : 'We couldn’t price this ride.' }));
    }, 500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [bodyKey]);
  const settled = Boolean(bodyKey) && quote?.key === bodyKey;
  const fare = settled ? quote?.data : undefined;
  const fareMode: FareMode = fare?.bidAllowed ? fareChoice : 'fixed';
  const floor = fare ? offerFloor(fare.subtotal, config.minOfferPercent) : 0;

  const submit = async () => {
    if (!signedIn) {
      pushPath('/(auth)/login');
      return;
    }
    const found: Errors = validateRideForm({ ...values, fareMode, subtotal: fare?.subtotal ?? null }, config);
    if (Object.keys(found).length) {
      setErrors({ ...found, form: 'Check the highlighted details.' });
      return;
    }
    if (!body || !fare) {
      setErrors({ form: quote?.error ?? 'Wait for the fare to load, then send your request.' });
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const created = await createRideRequest({
        ...body,
        bookNow,
        ...(bookNow ? {} : { departAt: values.departAt?.toISOString() }),
        luggage: { bags, large },
        passengerName: name.trim(),
        passengerPhone: normalizePhone(phone),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(fareMode === 'bid' ? { offerAmount: Number(offer) } : {}),
      });
      router.replace(`/(customer)/intercity/${encodeURIComponent(created.id)}` as never);
    } catch (reason) {
      setErrors({ form: reason instanceof Error ? reason.message : 'We couldn’t send your request.' });
      setSubmitting(false);
    }
  };

  const cta = submitting ? 'Sending…' : !signedIn ? 'Sign in' : fareMode === 'bid' ? 'Send offer' : 'Request ride';
  const barValue = !body ? '—' : !settled ? '…' : fare ? (fareMode === 'bid' && offer ? formatRupees(Number(offer)) : formatRupees(fare.total)) : '—';
  const pinned = picker === 'pickup' ? pickup : picker === 'dropoff' ? dropoff : null;

  return (
    <>
      <ScrollView contentContainerStyle={[t.screen, { paddingBottom: 150 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ gap: 6 }}>
          <Text style={[t.heroTitle, { color: theme.text }]}>A ride from your door to theirs</Text>
          <Text style={[t.body, { color: theme.muted }]}>
            Choose where you’re picked up and dropped off. Drivers between those cities get your request.
          </Text>
        </View>

        <Section title="Where">
          <PickField
            label="Pickup"
            value={pickup?.address}
            placeholder="Where should the driver pick you up?"
            icon="radio-button-on"
            onPress={() => setPicker('pickup')}
            error={errors.pickup}
          />
          <PickField
            label="Drop-off"
            value={dropoff?.address}
            placeholder="Where are you going?"
            icon="location"
            iconColor={theme.coral}
            onPress={() => setPicker('dropoff')}
            error={errors.dropoff}
          />
          {fare ? (
            <View style={styles.routeLine}>
              <Ionicons name="git-branch-outline" size={14} color={theme.primary} />
              <Text style={[t.strong, { color: theme.primary, flex: 1, fontSize: 12 }]}>
                {fare.fromCity.name} → {fare.toCity.name} · about {Math.round(fare.distanceKm)} km · {formatDuration(fare.durationMinutes)}
              </Text>
            </View>
          ) : null}
        </Section>

        {pickup ? <NearbyPanel pickup={pickup} vehicleClass={classChosen ? vehicleClass : undefined} /> : null}

        <Section title="When">
          <Segmented
            value={bookNow ? 'now' : 'later'}
            onChange={(id) => setBookNow(id === 'now')}
            options={[
              { id: 'later', label: 'Schedule', hint: `At least ${config.minLeadMinutes / 60 >= 1 ? `${config.minLeadMinutes / 60} hours` : `${config.minLeadMinutes} minutes`} ahead.` },
              { id: 'now', label: 'Leave now', hint: 'The first driver to accept comes to you.' },
            ]}
          />
          {!bookNow ? (
            <View style={styles.pair}>
              <PickField style={styles.half} label="Date" value={departDate ? formatDate(departDate) : ''} placeholder="Pick a date" icon="calendar-outline" onPress={() => setPicker('departDate')} />
              <PickField style={styles.half} label="Time (Pakistan)" value={displayTime(departTime)} placeholder="Pick a time" icon="time-outline" onPress={() => setPicker('departTime')} />
            </View>
          ) : null}
          {errors.departAt ? <ErrorText text={errors.departAt} /> : null}
        </Section>

        <Section title="Vehicle & passengers">
          <Segmented
            value={rideType}
            onChange={setRideType}
            options={[
              { id: 'full_car', label: 'Full car', hint: 'The whole vehicle, just for you.' },
              { id: 'shared_seat', label: 'Shared seat', hint: 'Pay per seat and share the ride. One-way only.' },
            ]}
          />
          {errors.rideType ? <ErrorText text={errors.rideType} /> : null}
          <Chips
            value={vehicleClass}
            onChange={(key) => {
              setVehicleClass(key);
              setClassChosen(true);
              const max = config.classes.find((item) => item.key === key)?.seats ?? 1;
              setPassengers((count) => Math.min(count, max));
            }}
            options={config.classes.map((item) => ({ id: item.key, label: classLabel(item.key), sub: `up to ${item.seats}` }))}
          />
          <Divider />
          <Stepper icon="people-outline" label="Passengers" value={passengers} min={1} max={seats} onChange={setPassengers} />
          {errors.passengers ? <ErrorText text={errors.passengers} /> : null}
          <Stepper icon="bag-handle-outline" label="Bags" value={bags} min={0} max={20} onChange={setBags} />
          <Stepper icon="cube-outline" label="Large items" hint="Suitcases, boxes" value={large} min={0} max={10} onChange={setLarge} />
        </Section>

        <Section title="One way or return">
          <Segmented
            value={roundTrip ? 'round' : 'one'}
            onChange={(id) => setRoundTripChosen(id === 'round')}
            options={[
              { id: 'one', label: 'One way', hint: 'Drop me off.' },
              {
                id: 'round',
                label: 'Round trip',
                disabled: shared,
                hint: shared ? 'Not available for shared seats.' : 'The same driver brings you back.',
              },
            ]}
          />
          {shared ? <Text style={[t.small, { color: theme.muted }]}>Round trips are not available for shared seats.</Text> : null}
          {roundTrip ? (
            <>
              <View style={styles.pair}>
                <PickField style={styles.half} label="Return date" value={returnDate ? formatDate(returnDate) : ''} placeholder="Pick a date" icon="calendar-outline" onPress={() => setPicker('returnDate')} />
                <PickField style={styles.half} label="Return time" value={displayTime(returnTime)} placeholder="Pick a time" icon="time-outline" onPress={() => setPicker('returnTime')} />
              </View>
              {errors.returnAt ? <ErrorText text={errors.returnAt} /> : null}
              <Segmented
                value={waitMode}
                onChange={setWaitMode}
                options={[
                  { id: 'hourly', label: 'Driver waits', hint: `${formatRupees(config.waitingPerHour)} per hour of waiting.` },
                  { id: 'overnight', label: 'Stays overnight', hint: `${formatRupees(config.overnightCharge)} per night.` },
                ]}
              />
              {waitMode === 'hourly' ? (
                <Stepper icon="hourglass-outline" label="Hours the driver waits" value={waitHours} min={1} max={72} onChange={setWaitHours} />
              ) : (
                <Stepper icon="moon-outline" label="Nights the driver stays" value={nights} min={1} max={14} onChange={setNights} />
              )}
              {errors.waitHours || errors.nights ? <ErrorText text={(errors.waitHours ?? errors.nights)!} /> : null}
            </>
          ) : null}
        </Section>

        <Section title="Who is travelling">
          <Field label="Passenger name" icon="person-outline" value={name} onChangeText={setName} autoComplete="name" maxLength={100} placeholder="Full name" error={errors.passengerName} />
          <Field
            label="Phone the driver can call"
            icon="call-outline"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="03XX XXXXXXX"
            maxLength={20}
            error={errors.passengerPhone}
            hint="Shared with your driver only once the ride is booked."
          />
          <Field label="Note for the driver (optional)" icon="chatbox-ellipses-outline" value={notes} onChangeText={setNotes} maxLength={500} placeholder="Gate colour, nearby landmark…" />
        </Section>

        <Section title="Your fare">
          {!body ? (
            <Text style={[t.body, { color: theme.muted }]}>
              Choose your pickup and drop-off{roundTrip ? ', and when you come back,' : ''} to see the fare.
            </Text>
          ) : !settled ? (
            <Loading text="Working out the fare…" />
          ) : !fare ? (
            <ErrorText text={quote?.error ?? 'We couldn’t price this ride.'} />
          ) : (
            <>
              {fare.lines.map((line) => (
                <PriceLine key={line.code} label={line.label} value={formatRupees(line.amount)} />
              ))}
              {fare.tax > 0 ? <PriceLine label="Tax" value={formatRupees(fare.tax)} /> : null}
              {fare.serviceFee > 0 ? <PriceLine label="Service fee" value={formatRupees(fare.serviceFee)} /> : null}
              <Divider />
              <PriceLine label="Total" value={formatRupees(fare.total)} strong />
              {fare.bidAllowed ? (
                <Segmented
                  value={fareMode}
                  onChange={setFareChoice}
                  options={[
                    { id: 'fixed', label: 'This fare', hint: 'Drivers accept this price.' },
                    { id: 'bid', label: 'Offer my price', hint: `Offer at least ${formatRupees(floor)}. Drivers can accept or counter.` },
                  ]}
                />
              ) : null}
              {fareMode === 'bid' ? (
                <Field
                  label="Your offer (Rs)"
                  icon="cash-outline"
                  value={offer}
                  onChangeText={(text) => setOffer(text.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  placeholder={String(fare.subtotal)}
                  error={errors.offerAmount}
                />
              ) : null}
            </>
          )}
          <Notice icon="cash-outline" text={`Pay cash to the driver. Nothing is paid now. Free cancellation until ${config.freeCancelMinutes / 60 >= 1 ? `${config.freeCancelMinutes / 60} hours` : `${config.freeCancelMinutes} minutes`} before departure.`} />
        </Section>

        {errors.form ? (
          <View style={{ marginTop: 16 }}>
            <Notice tone="danger" text={errors.form} />
          </View>
        ) : null}
        {isProvider ? (
          <View style={{ marginTop: 16 }}>
            <Notice tone="warn" text="You are signed in as a service provider. Rides are requested from a traveller account." />
          </View>
        ) : null}
      </ScrollView>

      <BottomBar label={fareMode === 'bid' ? 'YOUR OFFER' : 'TOTAL FARE'} value={barValue} sub="Cash to the driver">
        <Button
          title={cta}
          onPress={() => void submit()}
          loading={submitting}
          disabled={submitting || isProvider}
          fullWidth={false}
          style={styles.barButton}
          icon={<Ionicons name="arrow-forward" size={16} color={theme.background} />}
          iconPosition="right"
        />
      </BottomBar>

      <LocationPinSheet
        visible={picker === 'pickup' || picker === 'dropoff'}
        title={picker === 'pickup' ? 'Pickup point' : 'Drop-off point'}
        confirmLabel={picker === 'pickup' ? 'Use this pickup' : 'Use this drop-off'}
        initial={pinned ? { latitude: pinned.lat, longitude: pinned.lng } : undefined}
        onClose={() => setPicker(null)}
        onConfirm={(picked) => {
          const address = formatPickedAddress(picked).trim();
          const point: PlacePoint = {
            address: address.length >= 3 ? address.slice(0, 300) : `${picked.latitude.toFixed(5)}, ${picked.longitude.toFixed(5)}`,
            lat: picked.latitude,
            lng: picked.longitude,
          };
          if (picker === 'pickup') setPickup(point);
          else setDropoff(point);
          setErrors((current) => ({ ...current, [picker === 'pickup' ? 'pickup' : 'dropoff']: undefined }));
          setPicker(null);
        }}
      />
      <DatePickerModal
        visible={picker === 'departDate' || picker === 'returnDate'}
        title={picker === 'returnDate' ? 'Return date' : 'Departure date'}
        value={picker === 'returnDate' ? returnDate || departDate : departDate}
        minimumDate={
          picker === 'returnDate'
            ? (fromPakistanInputs(bookNow ? initial.date : departDate, '00:00') ?? new Date())
            : (fromPakistanInputs(initial.date, '00:00') ?? new Date())
        }
        onChange={(value) => (picker === 'returnDate' ? setReturnDate(value) : setDepartDate(value))}
        onClose={() => setPicker(null)}
      />
      <TimePickerModal
        visible={picker === 'departTime' || picker === 'returnTime'}
        title={picker === 'returnTime' ? 'Return time' : 'Departure time'}
        value={picker === 'returnTime' ? returnTime : departTime}
        onChange={(value) => (picker === 'returnTime' ? setReturnTime(value) : setDepartTime(value))}
        onClose={() => setPicker(null)}
      />
    </>
  );
}

/** Drivers and listed rides around the pickup; the radius steps out 10 → 20 → 30 → 50 km. */
function NearbyPanel({ pickup, vehicleClass }: { pickup: PlacePoint; vehicleClass?: VehicleClassKey }) {
  const theme = useHomeDesign();
  const where = `${pickup.lat},${pickup.lng},${vehicleClass ?? ''}`;
  // A chip applies to this pickup and class only; a new pickup searches automatically again.
  const [chosen, setChosen] = useState<{ where: string; radiusKm: number } | null>(null);
  const radiusKm = chosen?.where === where ? chosen.radiusKm : undefined;
  const [state, setState] = useState<{ key: string; data?: NearbyResult; error?: string } | null>(null);
  const key = `${where}|${radiusKm ?? 'auto'}`;

  useEffect(() => {
    let live = true;
    getNearby({ lat: pickup.lat, lng: pickup.lng, vehicleClass, radiusKm })
      .then((data) => live && setState({ key, data }))
      .catch((reason) => live && setState({ key, error: reason instanceof Error ? reason.message : 'We couldn’t look for rides nearby.' }));
    return () => {
      live = false;
    };
  }, [key, pickup.lat, pickup.lng, vehicleClass, radiusKm]);

  // Keep the previous result on screen while a new radius loads.
  const data = state?.data;
  const loading = state?.key !== key;
  const found = data ? data.drivers.length + data.rides.length : 0;
  const message = data ? nearbyMessage({ ...data, found }) : null;

  const markers = useMemo(
    () => [
      ...(data?.drivers ?? []).map((driver) => ({
        id: `d-${driver.providerId}`,
        title: driver.name,
        subtitle: distanceLabel(driver.distanceKm),
        coordinate: { latitude: driver.approxLat, longitude: driver.approxLng },
      })),
      ...(data?.rides ?? []).map((ride) => ({
        id: `r-${ride.tripId}`,
        title: ride.route,
        subtitle: `${formatRupees(ride.price)} · ${ride.seatsLeft} left`,
        coordinate: { latitude: ride.lat, longitude: ride.lng },
      })),
    ],
    [data],
  );

  return (
    <Section
      title="Near your pickup"
      subtitle={data ? `${found} ${found === 1 ? 'driver or ride' : 'drivers and rides'} within ${data.radiusKm} km` : undefined}
      accessory={loading && data ? <Text style={[t.small, { color: theme.muted }]}>Updating…</Text> : null}
    >
      {data?.steps.length ? (
        <Chips value={data.radiusKm} onChange={(step) => setChosen({ where, radiusKm: step })} options={data.steps.map((step) => ({ id: step, label: `${step} km` }))} />
      ) : null}
      {!data && loading ? (
        <Loading text="Looking around your pickup…" />
      ) : !data ? (
        <Text style={[t.body, { color: theme.muted }]}>{state?.error ?? 'We couldn’t look for rides nearby.'}</Text>
      ) : (
        <>
          {message ? <Text style={[t.small, { color: theme.muted }]}>{message}</Text> : null}
          <View style={[styles.map, { borderColor: theme.border }]}>
            <InAppWebMap markers={markers} userLocation={{ latitude: pickup.lat, longitude: pickup.lng }} searchRadiusKm={data.radiusKm} height={200} />
          </View>
          {data.drivers.map((driver) => (
            <View key={driver.providerId} style={styles.listRow}>
              <View style={[styles.avatar, { backgroundColor: theme.soft }]}>
                <Ionicons name="person-outline" size={16} color={theme.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[t.strong, { color: theme.text }]} numberOfLines={1}>
                  {driver.name}
                </Text>
                <Text style={[t.small, { color: theme.muted }]} numberOfLines={2}>
                  {driver.totalReviews > 0 ? `★ ${driver.rating.toFixed(1)} (${driver.totalReviews})` : 'New driver'}
                  {driver.vehicles.length ? ` · ${driver.vehicles.map((v) => `${classLabel(v.class)} · ${v.seats} seats`).join(', ')}` : ''}
                </Text>
              </View>
              <Text style={[t.small, { color: theme.muted }]}>{distanceLabel(driver.distanceKm)}</Text>
            </View>
          ))}
          {data.rides.map((ride) => (
            <Pressable
              key={ride.tripId}
              onPress={() => pushPath(`/(customer)/trip/${encodeURIComponent(ride.tripId)}`)}
              accessibilityRole="link"
              style={styles.listRow}
            >
              <View style={[styles.avatar, { backgroundColor: theme.soft }]}>
                <Ionicons name="bus-outline" size={16} color={theme.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[t.strong, { color: theme.text }]} numberOfLines={1}>
                  {ride.route}
                </Text>
                <Text style={[t.small, { color: theme.muted }]} numberOfLines={2}>
                  {formatDate(ride.departureDate.slice(0, 10))} · {ride.departureTime.slice(0, 5)} · {ride.seatsLeft} {ride.seatsLeft === 1 ? 'seat' : 'seats'} left
                </Text>
              </View>
              <Text style={[styles.rowPrice, { color: theme.text }]}>{formatRupees(ride.price)}</Text>
            </Pressable>
          ))}
        </>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  routeLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  map: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rowPrice: { fontFamily: Fonts.bodySemiBold, fontSize: 12 },
  barButton: { borderRadius: 18, minHeight: 48, paddingHorizontal: 18 },
});

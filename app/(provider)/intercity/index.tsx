import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ErrorText,
  Field,
  Loading,
  Notice,
  Panel,
  Pill,
  ScreenTop,
  Section,
  StateCard,
  intercityStyles as t,
  useTones,
} from '@/components/intercity/IntercityUI';
import { Button } from '@/components/ui/Button';
import { TravelDesignProvider } from '@/components/ui/TravelDesignProvider';
import { useHomeDesign } from '@/constants/homeDesign';
import { useTripLocationSharing, type SharingStatus } from '@/hooks/useTripLocationSharing';
import {
  getDriverIntercitySettings,
  getDriverRideRequests,
  respondToRideRequest,
  setIntercityTripStatus,
  type DriverBalanceBanner,
  type DriverIntercitySettings,
  type DriverRideRequest,
  type DriverUpcomingTrip,
} from '@/services/intercity.service';
import { classLabel, formatPakistanTime, formatRupees } from '@/utils/intercity';
import { pushPath, safeBack } from '@/utils/navigation';

const UNDERWAY_KEY = 'banjara:intercity-underway-trips';

type Board = { requests: DriverRideRequest[]; upcoming: DriverUpcomingTrip[]; balance: DriverBalanceBanner | null };

/** Driver → City to City: incoming door-to-door requests and the driver's rides. */
export default function DriverIntercityScreen() {
  return (
    <TravelDesignProvider>
      <DriverBoard />
    </TravelDesignProvider>
  );
}

function DriverBoard() {
  const theme = useTones();
  const [settings, setSettings] = useState<DriverIntercitySettings | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [focused, setFocused] = useState(true);
  const [underway, setUnderway] = useState<string[]>([]);

  // Trips under way are remembered on the phone, so sharing resumes in a dead zone after a restart.
  useEffect(() => {
    AsyncStorage.getItem(UNDERWAY_KEY)
      .then((raw) => {
        const saved: unknown = JSON.parse(raw ?? '[]');
        const list = Array.isArray(saved) ? saved.filter((v): v is string => typeof v === 'string') : [];
        if (list.length) setUnderway((current) => (current.length ? current : list));
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    try {
      const next = await getDriverIntercitySettings();
      setSettings(next);
      if (!next.featureEnabled) return;
      const data = await getDriverRideRequests();
      setBoard(data);
      setError(null);
      // Only a real answer from the server changes which trips share location.
      const ids = data.upcoming.filter((trip) => trip.status === 'departed' || trip.status === 'inTransit').map((trip) => trip.tripId);
      setUnderway((current) => (current.join() === ids.join() ? current : ids));
      void AsyncStorage.setItem(UNDERWAY_KEY, JSON.stringify(ids)).catch(() => undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'City to City could not be loaded.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    if (!focused) return;
    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [focused, load]);

  const sharing = useTripLocationSharing(underway);

  let body;
  if (!settings) {
    body = error ? (
      <StateCard icon="cloud-offline-outline" title="City to City could not be loaded" body={error}>
        <Button title="Try again" onPress={() => void load()} />
      </StateCard>
    ) : (
      <Loading />
    );
  } else if (!settings.featureEnabled) {
    body = <StateCard title="City to City rides aren’t available yet" body="We’ll let you know when travellers can request them." />;
  } else {
    const requests = board?.requests ?? [];
    const upcoming = board?.upcoming ?? [];
    const balance = board?.balance ?? null;
    body = (
      <>
        <View style={{ gap: 6 }}>
          <Text style={[t.heroTitle, { color: theme.text }]}>Rides between cities</Text>
          <Text style={[t.body, { color: theme.muted }]}>Travellers ask for door-to-door rides. Accept the fare, counter it, or let it pass.</Text>
        </View>

        <View style={styles.notices}>
          {!settings.enabled ? (
            <Pressable onPress={() => pushPath('/(provider)/intercity/settings')} accessibilityRole="button">
              <Notice tone="warn" icon="map-outline" text="You are not receiving City to City requests. Tap to turn them on and choose your home city." />
            </Pressable>
          ) : null}
          {balance?.blocked ? (
            <Pressable onPress={() => pushPath('/(provider)/intercity/commission')} accessibilityRole="button">
              <Notice tone="danger" text={`${balance.message ?? 'Pay your BANJARA commission to take new City to City rides.'} Tap to see how to pay.`} />
            </Pressable>
          ) : null}
          {underway.length ? <SharingCard status={sharing} /> : null}
          {error && board ? <Notice tone="warn" icon="cloud-offline-outline" text="Showing the last update. We’ll keep trying." /> : null}
        </View>

        <Section title="Requests near you" accessory={<Pill text={String(requests.length)} tone={requests.length ? 'open' : 'off'} />} bare>
          {!board ? (
            <Panel>{error ? <ErrorText text={error} /> : <Loading />}</Panel>
          ) : requests.length ? (
            requests.map((request) => <RequestCard key={request.id} request={request} onChanged={load} />)
          ) : (
            <Panel>
              <Text style={[t.body, { color: theme.muted }]}>
                {balance?.blocked
                  ? 'Requests are paused. Pay your BANJARA commission and new requests start again once it’s confirmed.'
                  : 'No requests right now. New requests on your routes appear here on their own.'}
              </Text>
            </Panel>
          )}
        </Section>

        <Section title="Your upcoming rides" bare>
          {upcoming.length ? (
            upcoming.map((trip) => <UpcomingCard key={trip.tripId} trip={trip} onChanged={load} />)
          ) : (
            <Panel>
              <Text style={[t.body, { color: theme.muted }]}>When a traveller chooses your offer, the ride appears here.</Text>
            </Panel>
          )}
        </Section>

        <Section title="Account" bare>
          <LinkRow
            icon="wallet-outline"
            title="BANJARA commission"
            sub={
              balance
                ? balance.owed > 0
                  ? `You owe ${formatRupees(balance.owed)}${balance.pendingPayments ? ` · ${formatRupees(balance.pendingPayments)} waiting to be confirmed` : ''}`
                  : 'All paid'
                : 'Balance, how to pay and history'
            }
            danger={Boolean(balance?.blocked)}
            onPress={() => pushPath('/(provider)/intercity/commission')}
          />
          <LinkRow
            icon="settings-outline"
            title="City to City settings"
            sub={settings.enabled ? 'Receiving requests · home city and routes' : 'Requests are off'}
            onPress={() => pushPath('/(provider)/intercity/settings')}
          />
        </Section>
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScreenTop
        title="City to City"
        onBack={() => safeBack('/(provider)/(tabs)')}
        action={{ icon: 'settings-outline', label: 'City to City settings', onPress: () => pushPath('/(provider)/intercity/settings') }}
      />
      <ScrollView
        contentContainerStyle={t.screen}
        keyboardShouldPersistTaps="handled"
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
        {body}
      </ScrollView>
    </View>
  );
}

function LinkRow({ icon, title, sub, danger, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; danger?: boolean; onPress: () => void }) {
  const theme = useTones();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`}>
      <Panel style={[styles.linkRow, danger && { borderColor: theme.danger }]}>
        <View style={[styles.avatar, { backgroundColor: theme.soft }]}>
          <Ionicons name={icon} size={18} color={theme.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[t.strong, { color: theme.text }]}>{title}</Text>
          <Text style={[t.small, { color: danger ? theme.danger : theme.muted }]} numberOfLines={2}>
            {sub}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.muted} />
      </Panel>
    </Pressable>
  );
}

function SharingCard({ status }: { status: SharingStatus }) {
  const theme = useTones();
  return (
    <View style={[styles.sharing, { backgroundColor: theme.successSoft }]} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <Ionicons name="radio-button-on" size={14} color={theme.success} />
        <Text style={[t.strong, { color: theme.success, flex: 1 }]}>
          Sharing location{status.waiting ? ` · ${status.waiting} ${status.waiting === 1 ? 'point' : 'points'} waiting to send` : ' · up to date'}
        </Text>
      </View>
      {status.gpsError ? <Text style={[t.small, { color: theme.danger }]}>{status.gpsError}</Text> : null}
      {status.offline ? (
        <Text style={[t.small, { color: theme.text }]}>Weak signal is normal on mountain roads. Points are saved on this phone and sent when you’re back in coverage.</Text>
      ) : null}
      <Text style={[t.small, { color: theme.muted }]}>Keep this screen open during the trip so the traveller can follow you.</Text>
    </View>
  );
}

function RequestCard({ request: r, onChanged }: { request: DriverRideRequest; onChanged: () => Promise<void> }) {
  const theme = useHomeDesign();
  const [countering, setCountering] = useState(false);
  const [amount, setAmount] = useState(String(r.fare));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const respond = async (action: 'accept' | 'decline' | 'counter') => {
    setError('');
    const value = Math.round(Number(amount));
    if (action === 'counter' && !(value > 0)) return setError('Enter your price in whole rupees.');
    setBusy(action);
    try {
      await respondToRideRequest(r.id, action, action === 'counter' ? value : undefined);
      setCountering(false);
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We couldn’t send your answer.');
    } finally {
      setBusy(null);
    }
  };

  const returnText =
    r.journeyType === 'round_trip' && r.returnTrip
      ? `Return ${formatPakistanTime(r.returnTrip.departAt)} · ${r.returnTrip.waitMode === 'overnight' ? `${r.returnTrip.nights ?? 1} night(s)` : `waits ${r.returnTrip.waitHours ?? 0} h`}`
      : null;

  return (
    <Panel>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[t.title, { color: theme.text }]}>{r.route}</Text>
          <Text style={[t.small, { color: theme.muted }]}>
            {r.pickupArea} → {r.dropoffArea}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[t.price, { color: theme.text }]}>{formatRupees(r.fare)}</Text>
          <Text style={[t.small, { color: theme.muted }]}>{r.fareMode === 'bid' ? 'Traveller’s offer' : 'Fare'}</Text>
        </View>
      </View>
      <View style={styles.pills}>
        <Pill icon="time-outline" text={r.bookNow ? 'Leave now' : formatPakistanTime(r.departAt)} tone={r.bookNow ? 'warn' : 'open'} />
        {returnText ? <Pill icon="repeat" text={returnText} tone="done" /> : null}
        {r.rideType === 'shared_seat' ? <Pill icon="people-outline" text="Shared seat" tone="warn" /> : null}
      </View>
      <View style={[styles.meta, { borderColor: theme.border }]}>
        <Meta icon="car-outline" text={classLabel(r.vehicleClass)} />
        <Meta icon="people-outline" text={`${r.passengers} ${r.passengers === 1 ? 'person' : 'people'}`} />
        <Meta icon="bag-handle-outline" text={`${r.luggage.bags + r.luggage.large} ${r.luggage.bags + r.luggage.large === 1 ? 'bag' : 'bags'}`} />
        <Meta icon="git-branch-outline" text={`${Math.round(r.distanceKm)} km`} />
      </View>
      {error ? <ErrorText text={error} /> : null}
      {r.myOffer ? (
        <Notice tone="ok" text={`Offer sent: ${formatRupees(r.myOffer.amount)}${r.myOffer.kind === 'counter' ? ' (counter-offer)' : ''}. Waiting for the traveller to choose.`} />
      ) : countering ? (
        <>
          <Field label="Your price (Rs)" icon="cash-outline" value={amount} onChangeText={(text) => setAmount(text.replace(/\D/g, ''))} keyboardType="number-pad" />
          <View style={styles.actions}>
            <Button title="Back" variant="outline" disabled={Boolean(busy)} onPress={() => setCountering(false)} style={styles.flex1} />
            <Button title="Send offer" loading={busy === 'counter'} disabled={Boolean(busy)} onPress={() => void respond('counter')} style={styles.flex2} />
          </View>
        </>
      ) : (
        <>
          <Button title={`Accept ${formatRupees(r.fare)}`} loading={busy === 'accept'} disabled={Boolean(busy)} onPress={() => void respond('accept')} />
          <View style={styles.actions}>
            <Button title="Decline" variant="outline" textColor={theme.coral} loading={busy === 'decline'} disabled={Boolean(busy)} onPress={() => void respond('decline')} style={styles.flex1} />
            {r.canCounter ? <Button title="Counter" variant="outline" disabled={Boolean(busy)} onPress={() => setCountering(true)} style={styles.flex1} /> : null}
          </View>
        </>
      )}
    </Panel>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const theme = useHomeDesign();
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={13} color={theme.muted} />
      <Text style={[t.small, { color: theme.text }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const TRIP_STATUS: Record<string, string> = {
  scheduled: 'Scheduled',
  boarding: 'Boarding',
  departed: 'On the way',
  inTransit: 'On the way',
  completed: 'Completed',
};

function UpcomingCard({ trip, onChanged }: { trip: DriverUpcomingTrip; onChanged: () => Promise<void> }) {
  const theme = useHomeDesign();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const underway = trip.status === 'departed' || trip.status === 'inTransit';
  const canStart = trip.status === 'scheduled' || trip.status === 'boarding';

  const update = async (status: 'departed' | 'completed') => {
    setError('');
    setBusy(true);
    try {
      await setIntercityTripStatus(trip.tripId, status);
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We couldn’t update this trip.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[t.title, { color: theme.text }]}>{trip.route}</Text>
          <Text style={[t.small, { color: theme.muted }]}>
            {formatPakistanTime(trip.departAt)} · {trip.leg === 'return' ? 'Return leg' : 'Outbound'} ·{' '}
            {trip.bookingMode === 'vehicle' ? 'Whole vehicle' : `${trip.seatsLeft} seats left`}
          </Text>
        </View>
        <Pill text={TRIP_STATUS[trip.status] ?? trip.status} tone={underway ? 'done' : 'open'} />
      </View>
      {trip.bookings.map((booking) => (
        <Pressable
          key={booking.id}
          onPress={() => pushPath(`/(provider)/booking/${encodeURIComponent(booking.id)}`)}
          accessibilityRole="link"
          style={[styles.booking, { backgroundColor: theme.field }]}
        >
          <Ionicons name="receipt-outline" size={15} color={theme.primary} />
          <Text style={[t.strong, { color: theme.text, flex: 1 }]} numberOfLines={1}>
            Booking {booking.number || booking.id.slice(-6)} · {formatRupees(booking.total)}
          </Text>
          <Text style={[t.small, { color: theme.muted }]}>{booking.status}</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.muted} />
        </Pressable>
      ))}
      {error ? <ErrorText text={error} /> : null}
      {canStart ? (
        <Button title="Start trip" loading={busy} disabled={busy} onPress={() => void update('departed')} icon={<Ionicons name="play" size={15} color={theme.background} />} />
      ) : underway ? (
        <Button
          title="Complete trip"
          loading={busy}
          disabled={busy}
          onPress={() => void update('completed')}
          icon={<Ionicons name="checkmark-done" size={16} color={theme.background} />}
        />
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  notices: { gap: 10, marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTop: { flexDirection: 'row', gap: 10 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  metaItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: 6 },
  actions: { flexDirection: 'row', gap: 8 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sharing: { borderRadius: 16, padding: 12, gap: 4 },
  booking: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, minHeight: 44 },
});

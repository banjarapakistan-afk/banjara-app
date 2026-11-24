import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Loading, intercityStyles as t, useTones } from '@/components/intercity/IntercityUI';
import { InAppWebMap } from '@/components/map/InAppWebMap';
import { getTripLocation, type TripLocation } from '@/services/intercity.service';
import { formatPakistanTime, isLocationStale, lastSeenLabel } from '@/utils/intercity';

type State = { status: string; last: TripLocation | null } | 'loading' | 'error';

/**
 * The driver's last known position, refreshed every 10 seconds. Mountain roads drop
 * signal for long stretches, so an old position only reads "last seen", never cancelled.
 */
export function IntercityTracking({ tripId }: { tripId: string }) {
  const theme = useTones();
  const [state, setState] = useState<State>('loading');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const data = await getTripLocation(tripId);
        if (!live) return;
        setState({ status: data.status, last: data.lastLocation });
        setNow(new Date());
        if (data.status !== 'completed') timer = setTimeout(load, 10_000);
      } catch {
        if (!live) return;
        setState((current) => (typeof current === 'object' ? current : 'error'));
        timer = setTimeout(load, 20_000);
      }
    };
    void load();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [tripId]);

  // Keep "last seen" counting between polls.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const line = (icon: keyof typeof Ionicons.glyphMap, color: string, text: string) => (
    <View style={styles.line} accessibilityLiveRegion="polite">
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[t.strong, { color, flex: 1 }]}>{text}</Text>
    </View>
  );

  if (state === 'loading') return <Loading text="Loading the driver’s location…" />;
  if (state === 'error') return <Text style={[t.body, { color: theme.muted }]}>Live location appears here once your ride is under way.</Text>;
  if (state.status === 'completed') return line('checkmark-circle', theme.success, 'This trip is complete.');
  const last = state.last;
  if (!last) return <Text style={[t.body, { color: theme.muted }]}>Waiting for the driver’s location. It appears once they start the trip.</Text>;

  const stale = isLocationStale(last.at, now);
  const point = { latitude: last.lat, longitude: last.lng };
  return (
    <View style={{ gap: 10 }}>
      {stale
        ? line('cellular-outline', theme.warning, lastSeenLabel(last.at, now))
        : line('radio-button-on', theme.success, `Live · updated ${formatPakistanTime(last.at)}`)}
      {stale ? (
        <Text style={[t.small, { color: theme.muted }]}>Weak signal on mountain roads is normal. The position updates when the driver is back in coverage.</Text>
      ) : null}
      <View style={[styles.map, { borderColor: theme.border }]}>
        <InAppWebMap markers={[{ id: 'driver', title: 'Your driver', coordinate: point, selected: true }]} height={200} />
      </View>
      <Pressable
        accessibilityRole="link"
        style={styles.line}
        onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${last.lat},${last.lng}`)}
      >
        <Ionicons name="navigate-outline" size={15} color={theme.primary} />
        <Text style={[t.strong, { color: theme.primary }]}>Open in maps</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },
  map: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
});

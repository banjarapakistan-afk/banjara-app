import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Loading, Pill, ScreenTop, StateCard, intercityStyles as t, requestTone } from '@/components/intercity/IntercityUI';
import { Button } from '@/components/ui/Button';
import { TravelDesignProvider } from '@/components/ui/TravelDesignProvider';
import { useHomeDesign } from '@/constants/homeDesign';
import { listRideRequests, type RideRequest } from '@/services/intercity.service';
import { useAuthStore } from '@/store/authStore';
import { classLabel, formatPakistanTime, requestStatusLabel } from '@/utils/intercity';
import { pushPath, safeBack } from '@/utils/navigation';

/** Every City to City request the rider has sent, newest first. */
export default function MyRideRequestsScreen() {
  return (
    <TravelDesignProvider>
      <MyRides />
    </TravelDesignProvider>
  );
}

function MyRides() {
  const theme = useHomeDesign();
  const signedIn = useAuthStore((state) => state.isAuthenticated && Boolean(state.user));
  const [list, setList] = useState<RideRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const requests = await listRideRequests();
      setList([...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your rides could not be loaded.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (signedIn) void load();
    }, [signedIn, load]),
  );

  const newRequest = <Button title="New City to City request" onPress={() => pushPath('/(customer)/intercity')} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScreenTop title="My City to City rides" onBack={() => safeBack('/(customer)/intercity' as never)} />
      {!signedIn ? (
        <View style={t.screen}>
          <StateCard icon="log-in-outline" title="Sign in to see your rides" body="Your City to City requests are kept in your BANJARA account.">
            <Button title="Sign in" onPress={() => pushPath('/(auth)/login')} />
          </StateCard>
        </View>
      ) : !list ? (
        <View style={t.screen}>
          {error ? (
            <StateCard icon="cloud-offline-outline" title="We couldn’t load your rides" body={error}>
              <Button title="Try again" onPress={() => void load()} />
            </StateCard>
          ) : (
            <Loading />
          )}
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[t.screen, { gap: 10 }]}
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
          ListEmptyComponent={
            <StateCard title="No City to City rides yet" body="Request a door-to-door ride between cities and drivers will send you offers.">
              {newRequest}
            </StateCard>
          }
          ListFooterComponent={list.length ? <View style={{ marginTop: 10 }}>{newRequest}</View> : undefined}
          renderItem={({ item: r }) => (
            <Pressable
              onPress={() => pushPath(`/(customer)/intercity/${encodeURIComponent(r.id)}`)}
              accessibilityRole="button"
              accessibilityLabel={`${r.pickup.city || 'Pickup'} to ${r.dropoff.city || 'Drop-off'}, ${requestStatusLabel(r.status)}`}
              style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <View style={[styles.icon, { backgroundColor: theme.soft }]}>
                <Ionicons name="car-sport-outline" size={18} color={theme.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text style={[t.title, { color: theme.text }]} numberOfLines={1}>
                  {r.pickup.city || 'Pickup'} → {r.dropoff.city || 'Drop-off'}
                </Text>
                <Text style={[t.small, { color: theme.muted }]} numberOfLines={2}>
                  {r.bookNow ? `Requested ${formatPakistanTime(r.createdAt)}` : formatPakistanTime(r.departAt)} ·{' '}
                  {r.rideType === 'shared_seat' ? 'Shared seat' : classLabel(r.vehicleClass)} · {r.passengers}{' '}
                  {r.passengers === 1 ? 'passenger' : 'passengers'}
                </Text>
                <View style={{ marginTop: 3 }}>
                  <Pill text={requestStatusLabel(r.status)} tone={requestTone(r.status)} />
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.muted} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 20, padding: 14 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

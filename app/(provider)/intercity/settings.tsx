import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomBar,
  Divider,
  Loading,
  Notice,
  PickField,
  ScreenTop,
  Section,
  StateCard,
  intercityStyles as t,
} from '@/components/intercity/IntercityUI';
import { Button } from '@/components/ui/Button';
import { TravelDesignProvider } from '@/components/ui/TravelDesignProvider';
import { useHomeDesign } from '@/constants/homeDesign';
import {
  getDriverIntercitySettings,
  getIntercityCities,
  saveDriverIntercitySettings,
  type DriverIntercitySettings,
  type DriverRoute,
  type IntercityCity,
} from '@/services/intercity.service';
import { safeBack } from '@/utils/navigation';

/** Driver → City to City settings: receive requests, home city, preferred routes, shared seats. */
export default function DriverIntercitySettingsScreen() {
  return (
    <TravelDesignProvider>
      <SettingsScreen />
    </TravelDesignProvider>
  );
}

function SettingsScreen() {
  const theme = useHomeDesign();
  const [saved, setSaved] = useState<DriverIntercitySettings | null>(null);
  const [cities, setCities] = useState<IntercityCity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    Promise.all([getDriverIntercitySettings(), getIntercityCities()])
      .then(([settings, list]) => {
        if (!live) return;
        setSaved(settings);
        setCities(list);
      })
      .catch((reason) => live && setError(reason instanceof Error ? reason.message : 'Settings could not be loaded.'));
    return () => {
      live = false;
    };
  }, [attempt]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScreenTop title="City to City settings" onBack={() => safeBack('/(provider)/intercity' as never)} />
      {!saved ? (
        <View style={t.screen}>
          {error ? (
            <StateCard icon="cloud-offline-outline" title="Settings could not be loaded" body={error}>
              <Button title="Try again" onPress={() => setAttempt((n) => n + 1)} />
            </StateCard>
          ) : (
            <Loading />
          )}
        </View>
      ) : (
        <SettingsForm saved={saved} cities={cities} />
      )}
    </View>
  );
}

type CityPick = 'home' | 'from' | 'to' | null;

function SettingsForm({ saved, cities }: { saved: DriverIntercitySettings; cities: IntercityCity[] }) {
  const theme = useHomeDesign();
  const [enabled, setEnabled] = useState(saved.enabled);
  const [homeCityId, setHomeCityId] = useState(saved.homeCityId ?? '');
  const [routes, setRoutes] = useState<DriverRoute[]>(saved.preferredRoutes);
  const [acceptsShared, setAcceptsShared] = useState(saved.acceptsShared);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [picking, setPicking] = useState<CityPick>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const cityName = (id: string) => cities.find((city) => city.id === id)?.name ?? '';

  const addRoute = () => {
    setError('');
    if (!from || !to) return setError('Choose both cities for the route.');
    if (from === to) return setError('A route needs two different cities.');
    if (routes.some((r) => r.fromCityId === from && r.toCityId === to)) return setError('That route is already on your list.');
    if (routes.length >= 20) return setError('You can keep up to 20 routes.');
    setRoutes([...routes, { fromCityId: from, toCityId: to }]);
    setFrom('');
    setTo('');
  };

  const save = async () => {
    setError('');
    if (enabled && !homeCityId) return setError('Choose your home city to receive requests.');
    setBusy(true);
    try {
      await saveDriverIntercitySettings({ enabled, homeCityId: homeCityId || null, preferredRoutes: routes, acceptsShared });
      if (router.canGoBack()) router.back();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save.');
      setBusy(false);
    }
  };

  const toggle = (icon: keyof typeof Ionicons.glyphMap, title: string, hint: string, value: boolean, onChange: (next: boolean) => void) => (
    <View style={styles.toggle}>
      <View style={[styles.icon, { backgroundColor: theme.soft }]}>
        <Ionicons name={icon} size={17} color={theme.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[t.strong, { color: theme.text }]}>{title}</Text>
        <Text style={[t.small, { color: theme.muted }]}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={busy}
        accessibilityLabel={title}
        trackColor={{ true: theme.primary, false: theme.border }}
        thumbColor="#fff"
      />
    </View>
  );

  return (
    <>
      <ScrollView contentContainerStyle={[t.screen, { paddingBottom: 130 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={[t.body, { color: theme.muted }]}>Get door-to-door ride requests between cities. Travellers pay you in cash.</Text>

        <Section title="Requests">
          {toggle('notifications-outline', 'Receive City to City requests', 'Requests starting in or near your home city', enabled, setEnabled)}
          <Divider />
          {toggle('people-outline', 'Accept shared rides', 'Travellers book single seats and share your vehicle', acceptsShared, setAcceptsShared)}
        </Section>

        <Section title="Home city" subtitle="Requests that start near this city reach you.">
          <PickField label="Home city" value={cityName(homeCityId)} placeholder="Choose a city" icon="home-outline" onPress={() => setPicking('home')} />
        </Section>

        <Section title="Preferred routes" subtitle="Optional. Without routes you get requests from your home city.">
          {routes.map((route, index) => (
            <View key={`${route.fromCityId}-${route.toCityId}`} style={[styles.route, { backgroundColor: theme.field }]}>
              <Ionicons name="swap-horizontal" size={16} color={theme.primary} />
              <Text style={[t.strong, { color: theme.text, flex: 1 }]}>
                {cityName(route.fromCityId) || 'Unknown city'} → {cityName(route.toCityId) || 'Unknown city'}
              </Text>
              <Pressable
                onPress={() => setRoutes(routes.filter((_, i) => i !== index))}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${cityName(route.fromCityId)} to ${cityName(route.toCityId)}`}
                hitSlop={10}
                disabled={busy}
              >
                <Ionicons name="close-circle" size={20} color={theme.muted} />
              </Pressable>
            </View>
          ))}
          <View style={styles.pair}>
            <PickField style={styles.half} label="From" value={cityName(from)} placeholder="City" icon="radio-button-on" onPress={() => setPicking('from')} />
            <PickField style={styles.half} label="To" value={cityName(to)} placeholder="City" icon="location-outline" onPress={() => setPicking('to')} />
          </View>
          <Button title="Add route" variant="outline" onPress={addRoute} disabled={busy} icon={<Ionicons name="add" size={16} color={theme.primary} />} />
        </Section>

        {error ? (
          <View style={{ marginTop: 16 }}>
            <Notice tone="danger" text={error} />
          </View>
        ) : null}
      </ScrollView>

      <BottomBar label="REQUESTS" value={enabled ? 'On' : 'Off'} sub={enabled ? cityName(homeCityId) || 'Choose a home city' : 'You won’t get new requests'}>
        <Button title="Save" onPress={() => void save()} loading={busy} disabled={busy} fullWidth={false} style={styles.barButton} />
      </BottomBar>

      <CitySheet
        visible={picking !== null}
        title={picking === 'home' ? 'Home city' : picking === 'from' ? 'Route starts in' : 'Route ends in'}
        cities={cities}
        selected={picking === 'home' ? homeCityId : picking === 'from' ? from : to}
        onClose={() => setPicking(null)}
        onPick={(id) => {
          if (picking === 'home') setHomeCityId(id);
          else if (picking === 'from') setFrom(id);
          else if (picking === 'to') setTo(id);
          setPicking(null);
        }}
      />
    </>
  );
}

/** Full-screen searchable list of the cities BANJARA serves. */
function CitySheet({
  visible,
  title,
  cities,
  selected,
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  cities: IntercityCity[];
  selected: string;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const theme = useHomeDesign();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? cities.filter((city) => `${city.name} ${city.province}`.toLowerCase().includes(q)) : cities;
  }, [cities, query]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <ScreenTop title={title} onBack={onClose} />
        <View style={{ padding: 16, paddingBottom: 8 }}>
          <View style={[styles.search, { backgroundColor: theme.field, borderColor: theme.border }]}>
            <Ionicons name="search-outline" size={18} color={theme.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search cities"
              placeholderTextColor={theme.muted}
              autoFocus
              autoCorrect={false}
              accessibilityLabel="Search cities"
              style={[styles.searchInput, { color: theme.text }]}
            />
          </View>
        </View>
        <FlatList
          data={list}
          keyExtractor={(city) => city.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={<Text style={[t.body, { color: theme.muted, paddingVertical: 16 }]}>No city matches “{query}”.</Text>}
          renderItem={({ item: city }) => {
            const on = city.id === selected;
            return (
              <Pressable onPress={() => onPick(city.id)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={styles.cityRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[t.strong, { color: on ? theme.primary : theme.text }]}>{city.name}</Text>
                  {city.province ? <Text style={[t.small, { color: theme.muted }]}>{city.province}</Text> : null}
                </View>
                {on ? <Ionicons name="checkmark-circle" size={20} color={theme.primary} /> : null}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  route: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, minHeight: 46 },
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  barButton: { borderRadius: 18, minHeight: 48, paddingHorizontal: 28 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 24, paddingHorizontal: 14, minHeight: 48 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  cityRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 8 },
});

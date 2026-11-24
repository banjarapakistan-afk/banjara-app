import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useHomeDesign } from '@/constants/homeDesign';
import { Spacing } from '@/constants/spacing';
import { Fonts } from '@/constants/typography';
import { getDriverIntercitySettings, getDriverRideRequests, getIntercityConfigCached } from '@/services/intercity.service';
import { pushPath } from '@/utils/navigation';

/** "City to City" door-to-door rides, offered beside the ride search once BANJARA turns them on. */
export function CityToCityEntry() {
  const c = useHomeDesign();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let live = true;
    getIntercityConfigCached()
      .then((config) => live && setEnabled(config.enabled))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!enabled) return null;
  return (
    <Pressable
      onPress={() => pushPath('/(customer)/intercity')}
      accessibilityRole="button"
      accessibilityLabel="City to City: book a door-to-door ride between cities"
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
    >
      <LinearGradient colors={['#1FC77A', '#0F9B98']} style={styles.icon}>
        <Ionicons name="car-sport-outline" size={22} color="#fff" />
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: c.text }]}>City to City</Text>
        <Text style={[styles.text, { color: c.muted }]}>Door-to-door rides between cities. Name your price.</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={c.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: 20, padding: 14 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.display, fontSize: 16, lineHeight: 21 },
  text: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 17 },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontFamily: Fonts.bodyBold, fontSize: 12 },
});

/** Transporter dashboard → City to City board, with how many requests are waiting. */
export function DriverCityToCityEntry() {
  const c = useHomeDesign();
  const [state, setState] = useState<{ optedIn: boolean; requests: number; blocked: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        try {
          const settings = await getDriverIntercitySettings();
          if (!settings.featureEnabled) return live && setState(null);
          const board = settings.enabled ? await getDriverRideRequests() : null;
          if (live) setState({ optedIn: settings.enabled, requests: board?.requests.length ?? 0, blocked: Boolean(board?.balance?.blocked) });
        } catch {
          // Feature off or offline: the dashboard simply doesn't show the card.
        }
      })();
      return () => {
        live = false;
      };
    }, []),
  );

  if (!state) return null;
  const text = !state.optedIn
    ? 'Turn on door-to-door requests between cities.'
    : state.blocked
      ? 'Requests are paused until your commission is paid.'
      : state.requests
        ? `${state.requests} ${state.requests === 1 ? 'request is' : 'requests are'} waiting for your answer.`
        : 'No requests right now. We’ll show them here.';
  return (
    <Pressable
      onPress={() => pushPath('/(provider)/intercity')}
      accessibilityRole="button"
      accessibilityLabel={`City to City. ${text}`}
      style={[styles.card, { backgroundColor: c.surface, borderColor: state.blocked ? c.coral : c.border }]}
    >
      <LinearGradient colors={['#1FC77A', '#0F9B98']} style={styles.icon}>
        <Ionicons name="car-sport-outline" size={22} color="#fff" />
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: c.text }]}>City to City</Text>
        <Text style={[styles.text, { color: state.blocked ? c.coral : c.muted }]}>{text}</Text>
      </View>
      {state.requests ? (
        <View style={[styles.badge, { backgroundColor: c.action }]}>
          <Text style={styles.badgeText}>{state.requests}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={20} color={c.muted} />
    </Pressable>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type TravelIcon } from '@/components/ui/TravelPrimitives';
import { useExploreDesign } from '@/constants/exploreDesign';
import type { ExploreServiceTab } from '@/constants/exploreCatalog';
import { Fonts } from '@/constants/typography';
import { pushPath } from '@/utils/navigation';

const SERVICES: Array<{ id: ExploreServiceTab; label: string; title: string; icon: TravelIcon }> = [
  { id: 'transport', label: 'Ride', title: 'Transport', icon: 'car-sport' },
  { id: 'hotels', label: 'Stay', title: 'Stays', icon: 'business-outline' },
  { id: 'tours', label: 'Tours', title: 'Tours', icon: 'trail-sign-outline' },
  { id: 'guides', label: 'Guides', title: 'Guides', icon: 'compass-outline' },
  { id: 'restaurants', label: 'Restaurants', title: 'Restaurants', icon: 'restaurant' },
];

/** Equal-width service controls share one capsule and retain accessible service names. */
export function ExploreServiceSelector({
  value,
  onChange,
}: {
  value: ExploreServiceTab;
  onChange: (value: ExploreServiceTab) => void;
}) {
  const theme = useExploreDesign();
  return (
    <View style={[s.services, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {SERVICES.map((item) => {
        const selected = value === item.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => onChange(item.id)}
            accessibilityRole="tab"
            accessibilityLabel={item.title}
            accessibilityState={{ selected }}
            style={s.service}
          >
            <View
              style={[s.serviceIcon, { backgroundColor: selected ? theme.accent : theme.field }]}
            >
              <Ionicons name={item.icon} size={23} color={selected ? theme.primary : theme.muted} />
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[s.serviceLabel, { color: selected ? theme.primary : theme.muted }]}
            >
              {item.label}
            </Text>
            <View
              style={[
                s.serviceIndicator,
                { backgroundColor: selected ? theme.primary : 'transparent' },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export function ExploreHelp() {
  const theme = useExploreDesign();
  return (
    <View style={s.helpRow}>
      <Pressable
        onPress={() => pushPath('/(customer)/(tabs)/inbox')}
        accessibilityRole="button"
        accessibilityLabel="Travel help: open messages"
        style={[s.help, { backgroundColor: theme.coral }]}
      >
        <Ionicons name="headset-outline" size={17} color="white" />
        <Text style={s.helpText}>Travel help</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  services: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    paddingHorizontal: 4,
    paddingVertical: 8,
    flexDirection: 'row',
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
  },
  service: { flex: 1, alignItems: 'center', gap: 4, minHeight: 66 },
  serviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceLabel: { fontFamily: Fonts.bodyMedium, fontSize: 12, lineHeight: 17 },
  serviceIndicator: { width: 28, height: 2, borderRadius: 1 },
  helpRow: { position: 'absolute', right: 16, bottom: 12, alignItems: 'flex-end' },
  help: {
    minHeight: 44,
    borderRadius: 24,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  helpText: { color: 'rgb(255, 255, 255)', fontFamily: Fonts.bodySemiBold, fontSize: 12 },
});

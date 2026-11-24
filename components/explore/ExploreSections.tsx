import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TravelSection } from '@/components/ui/TravelPrimitives';
import { destinationImageFor } from '@/constants/destinations';
import { useExploreDesign } from '@/constants/exploreDesign';
import { Fonts } from '@/constants/typography';
import { pushPath } from '@/utils/navigation';

/**
 * Explore sections shared with the website's Explore page (banjara-admin
 * components/site/explore/website-explore.tsx): the short intro, the promo band and the
 * mountain pass notes. Keep the wording in step with the website.
 */

const BANNER = require('@/assets/explore/transport-banner.jpg');
/** Every ride on the map (Explore never lists rides). */
const RIDES_MAP = '/(customer)/explore/nearby';

const ROAD_PLANS = [
  {
    label: 'ALT. 4,173 m',
    title: 'Babusar Pass',
    body: 'Confirm seasonal opening, departure time, and the planned route with your provider before traveling.',
    note: 'Ask about the KKH alternative',
  },
  {
    label: 'N-35 ARTERY',
    title: 'KKH Lower Corridor',
    body: 'Confirm your pickup point, road access, and journey duration before setting out along the Karakoram Highway.',
    note: 'Check your operator’s route',
  },
  {
    label: 'DIR–CHITRAL LINK',
    title: 'Lowari Tunnel',
    body: 'Check the latest tunnel access and any travel restrictions with your operator before departure.',
    note: 'Confirm local access guidance',
  },
  {
    label: 'ALT. 4,114 m',
    title: 'Deosai High Plateau',
    body: 'Discuss seasonal access, weather preparation, and a suitable high-clearance vehicle with your local provider.',
    note: 'Plan a suitable mountain vehicle',
  },
];

/** Page title and one line, instead of a tall banner above the listings. */
export function ExploreIntro() {
  const theme = useExploreDesign();
  return (
    <View style={s.intro}>
      <Text accessibilityRole="header" style={[s.introTitle, { color: theme.text }]}>
        Explore Gilgit-Baltistan
      </Text>
      <Text style={[s.introText, { color: theme.muted }]}>Rides, stays, tours, guides and restaurants across the northern valleys.</Text>
    </View>
  );
}

/** "Northern escapes" band below the listings, with the road advisory. */
export function ExplorePromo({ onOpenRoads, onViewHunza }: { onOpenRoads: () => void; onViewHunza: () => void }) {
  return (
    <View style={s.promo}>
      <Image
        source={{ uri: destinationImageFor('Hunza') }}
        placeholder={BANNER}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        accessibilityLabel="Autumn landscape in Hunza Valley"
      />
      <LinearGradient
        colors={['rgba(7,30,29,0.15)', 'rgba(7,30,29,0.55)', 'rgba(7,30,29,0.92)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.promoBadge}>
        <Ionicons name="triangle-outline" size={12} color="#fff" />
        <Text style={s.promoBadgeText}>Northern escapes</Text>
      </View>
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={s.promoTitle}>
          Hunza Valley Autumn Expedition
        </Text>
        <Text style={s.promoText}>Golden poplar season, mountain terraces, turquoise waters and silk-route hospitality in the Karakoram.</Text>
        <View style={s.promoActions}>
          <Pressable onPress={onViewHunza} accessibilityRole="button" style={[s.promoButton, s.promoPrimary]}>
            <Text style={s.promoPrimaryText}>View rides & stays</Text>
            <Ionicons name="arrow-forward" size={15} color="#fff" />
          </Pressable>
          <Pressable onPress={onOpenRoads} accessibilityRole="button" style={[s.promoButton, s.promoSecondary]}>
            <Ionicons name="warning-outline" size={15} color="#fff" />
            <Text style={s.promoSecondaryText}>Road advisory</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Mountain passes & road information, one swipeable card per pass. */
export function ExploreRoads({ onOpenRoads }: { onOpenRoads: () => void }) {
  const theme = useExploreDesign();
  return (
    <TravelSection title="Mountain passes & roads" subtitle="Confirm live conditions with your provider before departure">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.passes} decelerationRate="fast" snapToInterval={252}>
        {ROAD_PLANS.map((road) => (
          <View key={road.title} style={[s.pass, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={s.passTop}>
              <Text style={[s.passLabel, { color: theme.muted }]}>{road.label}</Text>
              <View style={[s.passStatus, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="warning-outline" size={11} color="#B45309" />
                <Text style={s.passStatusText}>Check access</Text>
              </View>
            </View>
            <Text style={[s.passTitle, { color: theme.text }]}>{road.title}</Text>
            <Text style={[s.passBody, { color: theme.muted }]}>{road.body}</Text>
            <Pressable onPress={onOpenRoads} accessibilityRole="button" style={s.passLink} hitSlop={6}>
              <Text style={[s.passLinkText, { color: theme.primary }]}>{road.note}</Text>
              <Ionicons name="arrow-forward" size={14} color={theme.primary} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </TravelSection>
  );
}

/** The road advisory, as on the website (no live road data comes from the API). */
export function RoadAdvisorySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useExploreDesign();
  const insets = useSafeAreaInsets();
  const tips = [
    'Confirm the route, road opening, and departure time with your provider.',
    'Ask about the vehicle, planned stops, and alternatives for high passes.',
    'Carry suitable layers and follow current local travel guidance.',
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[s.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 16 }]} accessibilityViewIsModal>
          <View style={[s.handle, { backgroundColor: theme.border }]} />
          <Text accessibilityRole="header" style={[s.sheetTitle, { color: theme.text }]}>
            Road advisory
          </Text>
          <Text style={[s.sheetText, { color: theme.muted }]}>
            Mountain conditions change with weather and the season. Live road and weather data are not currently supplied by BANJARA.
          </Text>
          <View style={{ gap: 10, marginTop: 4 }}>
            {tips.map((tip) => (
              <View key={tip} style={s.tip}>
                <Ionicons name="checkmark-circle" size={18} color={theme.primary} />
                <Text style={[s.sheetText, { color: theme.text, flex: 1 }]}>{tip}</Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => {
              onClose();
              pushPath(RIDES_MAP);
            }}
            accessibilityRole="button"
            style={[s.sheetButton, { backgroundColor: theme.action }]}
          >
            <Text style={s.promoPrimaryText}>Find a transport provider</Text>
            <Ionicons name="arrow-forward" size={15} color="#fff" />
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" style={s.sheetClose}>
            <Text style={[s.passLinkText, { color: theme.muted }]}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Road advisory state for a screen: `open()` shows the sheet. */
export function useRoadAdvisory() {
  const [visible, setVisible] = useState(false);
  return {
    open: () => setVisible(true),
    sheet: <RoadAdvisorySheet visible={visible} onClose={() => setVisible(false)} />,
  };
}

const s = StyleSheet.create({
  intro: { paddingHorizontal: 16, paddingTop: 14, gap: 4 },
  introTitle: { fontFamily: Fonts.displayBold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  introText: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 19 },
  promo: { marginHorizontal: 16, marginTop: 32, minHeight: 260, borderRadius: 28, overflow: 'hidden', padding: 18, justifyContent: 'space-between', gap: 24 },
  promoBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(8,39,38,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  promoBadgeText: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: '#fff' },
  promoTitle: { fontFamily: Fonts.displayBold, fontSize: 22, lineHeight: 28, color: '#fff' },
  promoText: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 18, color: 'rgba(255,255,255,0.92)' },
  promoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  promoButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, borderRadius: 22, paddingHorizontal: 16 },
  promoPrimary: { backgroundColor: '#16B364' },
  promoPrimaryText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: '#fff' },
  promoSecondary: { backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  promoSecondaryText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: '#fff' },
  passes: { paddingHorizontal: 16, gap: 12 },
  pass: { width: 240, borderWidth: 1, borderRadius: 22, padding: 14, gap: 8 },
  passTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  passLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.4, flexShrink: 1 },
  passStatus: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  passStatusText: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: '#B45309' },
  passTitle: { fontFamily: Fonts.display, fontSize: 16, lineHeight: 21 },
  passBody: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 18, flexGrow: 1 },
  passLink: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  passLinkText: { fontFamily: Fonts.bodySemiBold, fontSize: 12 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,30,28,0.55)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, gap: 10 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 6 },
  sheetTitle: { fontFamily: Fonts.displayBold, fontSize: 21, lineHeight: 27 },
  sheetText: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 20 },
  tip: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  sheetButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 50, borderRadius: 25, marginTop: 8 },
  sheetClose: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
});

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Fonts } from '@/constants/typography';
import { getApiErrorMessage } from '@/services/apiError';
import { getProviderCounts } from '@/services/serviceCatalogService';
import { useAuthStore } from '@/store/authStore';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const SERVICES: { icon: IconName; label: string; hint: string }[] = [
  { icon: 'car-outline', label: 'Rides', hint: 'Vans, cars, buses' },
  { icon: 'bed-outline', label: 'Stays', hint: 'Hotels, guest houses' },
  { icon: 'map-outline', label: 'Tours', hint: 'Day trips, packages' },
  { icon: 'compass-outline', label: 'Guides', hint: 'Local experts' },
  { icon: 'restaurant-outline', label: 'Food', hint: 'Restaurants, cafés' },
];

const PERKS = [
  'Travellers find you in search and on the map',
  'All your bookings in one dashboard',
  'See your earnings for every booking',
  'Chat with travellers in BANJARA messages',
];

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'person-add-outline', title: 'Create your account', body: 'Takes about 2 minutes. No payment needed.' },
  { icon: 'storefront-outline', title: 'Add your service', body: "Photos, prices and when you're available." },
  { icon: 'shield-checkmark-outline', title: 'Get verified & booked', body: 'Our team checks you, then travellers can book.' },
];

/**
 * Home screen invitation to become a service provider, matching the website's home card.
 * Guests are invited to sign up; a signed-in traveller is told provider accounts are
 * separate. Provider accounts never see the traveller home screen.
 */
export function HomeProviderInvite({ signedIn }: { signedIn: boolean }) {
  const logout = useAuthStore((state) => state.logout);
  const [switching, setSwitching] = useState(false);
  const [counts, setCounts] = useState<{ joined: number; live: number } | null>(null);

  // Real numbers from the API; the card works without them.
  useEffect(() => {
    let live = true;
    getProviderCounts()
      .then((data) => live && setCounts({ joined: data.total.registered, live: data.total.approved }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const startProviderSignup = async () => {
    if (!signedIn) {
      router.push('/(provider)/register' as never);
      return;
    }
    setSwitching(true);
    try {
      await logout();
      router.replace('/(provider)/register' as never);
    } catch (error) {
      Alert.alert('Could not sign out', getApiErrorMessage(error));
    } finally {
      setSwitching(false);
    }
  };

  return (
    <View style={s.wrap}>
      <LinearGradient
        colors={['#0A3433', '#0F5752', '#0F7464']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.card}
      >
        {/* Pitch */}
        <View style={s.top}>
          <View style={s.eyebrow}>
            <Text style={s.eyebrowText}>FOR LOCAL BUSINESSES</Text>
          </View>
          <Text style={s.title} accessibilityRole="header">
            Earn with <Text style={s.titleAccent}>BANJARA</Text>
          </Text>
          <Text style={s.lead}>
            Run a ride, a stay, tours, a guide service or a restaurant in the north? List it on BANJARA
            and let travellers find and book you.
          </Text>

          <Pressable
            onPress={() => void startProviderSignup()}
            disabled={switching}
            style={({ pressed }) => [s.primary, { opacity: switching ? 0.7 : pressed ? 0.85 : 1 }]}
            accessibilityRole="button"
          >
            <Text style={s.primaryText}>
              {signedIn ? 'Sign out & become a provider' : 'Become a provider'}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#06302A" />
          </Pressable>
          {signedIn ? (
            <Text style={s.note}>
              Provider accounts are separate from traveller accounts, so use a different email for your
              business.
            </Text>
          ) : (
            <Pressable
              onPress={() => router.push('/(auth)/login')}
              style={s.secondary}
              accessibilityRole="link"
              hitSlop={6}
            >
              <Text style={s.secondaryText}>Already a provider? Log in</Text>
            </Pressable>
          )}

          {counts && counts.joined > 0 ? (
            <View style={s.proof}>
              <View style={s.proofDots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <View style={[s.proofDot, { backgroundColor: '#FFD38A' }]} />
                <View style={[s.proofDot, s.proofDotOverlap, { backgroundColor: '#5FF0A8' }]} />
                <View style={[s.proofDot, s.proofDotOverlap, { backgroundColor: '#9AD7FF' }]} />
              </View>
              <Text style={s.proofText}>
                <Text style={s.proofStrong}>{counts.joined.toLocaleString('en-PK')} providers</Text> have joined
                {counts.live ? ` · ${counts.live.toLocaleString('en-PK')} are live` : ''}
              </Text>
            </View>
          ) : null}
        </View>

        {/* What you can offer */}
        <View style={s.offer}>
          <Text style={s.sectionLabel}>WHAT CAN YOU OFFER?</Text>
          <View style={s.services}>
            {SERVICES.map((service) => (
              <View key={service.label} style={s.service}>
                <View style={s.serviceIcon}>
                  <Ionicons name={service.icon} size={21} color="#0F7D6E" />
                </View>
                <Text style={s.serviceLabel}>{service.label}</Text>
                <Text style={s.serviceHint}>{service.hint}</Text>
              </View>
            ))}
          </View>
          <View style={s.perks}>
            {PERKS.map((perk) => (
              <View key={perk} style={s.perk}>
                <View style={s.perkCheck}>
                  <Ionicons name="checkmark" size={13} color="#06302A" />
                </View>
                <Text style={s.perkText}>{perk}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* How it works */}
        <View style={s.how}>
          <Text style={s.sectionLabel}>HOW IT WORKS</Text>
          <View style={s.steps}>
            {STEPS.map((step, index) => (
              <View key={step.title} style={s.step}>
                <View style={s.stepIconWrap}>
                  <View style={s.stepIcon}>
                    <Ionicons name={step.icon} size={20} color="#0F7D6E" />
                  </View>
                  <View style={s.stepNumber}>
                    <Text style={s.stepNumberText}>{index + 1}</Text>
                  </View>
                  {index < STEPS.length - 1 ? <View style={s.stepLine} /> : null}
                </View>
                <View style={s.stepCopy}>
                  <Text style={s.stepTitle}>{step.title}</Text>
                  <Text style={s.stepBody}>{step.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginTop: 8, marginBottom: 24 },
  card: { borderRadius: 24, overflow: 'hidden' },

  top: { padding: 20, paddingBottom: 18 },
  eyebrow: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  eyebrowText: { fontFamily: Fonts.bodyBold, fontSize: 10.5, letterSpacing: 0.8, color: '#B8F5DC' },
  title: { marginTop: 12, fontFamily: Fonts.displayBold, fontSize: 30, lineHeight: 34, color: '#FFFFFF' },
  titleAccent: { color: '#5FF0A8' },
  lead: { marginTop: 8, fontFamily: Fonts.body, fontSize: 14.5, lineHeight: 22, color: '#D5ECE6' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    marginTop: 18,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: '#1FC77A',
  },
  primaryText: { fontFamily: Fonts.bodyBold, fontSize: 16, color: '#06302A', textAlign: 'center' },
  secondary: { alignSelf: 'center', marginTop: 14 },
  secondaryText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
  note: { marginTop: 10, fontFamily: Fonts.body, fontSize: 12.5, lineHeight: 18, color: '#A9CFC5', textAlign: 'center' },
  proof: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16 },
  proofDots: { flexDirection: 'row' },
  proofDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#0F5752' },
  proofDotOverlap: { marginLeft: -6 },
  proofText: { flexShrink: 1, fontFamily: Fonts.body, fontSize: 13, color: '#D5ECE6' },
  proofStrong: { fontFamily: Fonts.bodyBold, color: '#FFFFFF' },

  offer: {
    marginHorizontal: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  sectionLabel: { fontFamily: Fonts.bodyBold, fontSize: 11, letterSpacing: 0.8, color: '#B8F5DC' },
  services: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  service: {
    flexGrow: 1,
    flexBasis: '30%',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 4,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  serviceIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F6EE',
  },
  serviceLabel: { marginTop: 6, fontFamily: Fonts.bodyBold, fontSize: 13.5, color: '#1F2933' },
  serviceHint: { marginTop: 1, fontFamily: Fonts.body, fontSize: 10.5, lineHeight: 14, color: '#5B6B7C', textAlign: 'center' },
  perks: { gap: 10, marginTop: 16 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1FC77A',
  },
  perkText: { flex: 1, fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 19, color: '#EAF7F2' },

  how: {
    marginTop: 18,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  steps: { marginTop: 14, gap: 18 },
  step: { flexDirection: 'row', gap: 14 },
  stepIconWrap: { width: 44, alignItems: 'center' },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  stepNumber: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 21,
    height: 21,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1FC77A',
  },
  stepNumberText: { fontFamily: Fonts.bodyBold, fontSize: 11.5, color: '#06302A' },
  // Dashed line down to the next step.
  stepLine: {
    position: 'absolute',
    top: 50,
    bottom: -14,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  stepCopy: { flex: 1, paddingTop: 2 },
  stepTitle: { fontFamily: Fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
  stepBody: { marginTop: 3, fontFamily: Fonts.body, fontSize: 13, lineHeight: 19, color: '#C4E3DA' },
});

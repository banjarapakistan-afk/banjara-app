import { useBackendState, useBackendEffect as useEffect } from '@/hooks/useBackendData';
import { router, useNavigation } from 'expo-router';
import { useCallback, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { LoadingState } from '@/components/ui/EmptyState';
import { Colors } from '@/constants/colors';
import {
  SERVICE_OPTIONS,
  editServiceHref,
  normalizeServiceKey,
  serviceLabel,
} from '@/constants/providerOptions';
import { Radius, Spacing } from '@/constants/spacing';
import { Fonts, Typography } from '@/constants/typography';
import * as serviceCatalogService from '@/services/serviceCatalogService';
import type { CatalogService, ProviderCounts } from '@/services/serviceCatalogService';
import { useAuthStore } from '@/store/authStore';
import { useProviderStore } from '@/store/providerStore';
import { leaveProviderEditor, pushPath, useBlockBack } from '@/utils/navigation';
import { needsProviderOnboarding } from '@/utils/routing';

export default function ProviderSelectServicesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const user = useAuthStore((state) => state.user);
  const selected = useProviderStore((state) => state.draft.selectedServices);
  const toggleService = useProviderStore((state) => state.toggleService);
  const provider = useProviderStore((state) => state.provider);
  const loadProvider = useProviderStore((state) => state.loadProvider);
  const loadProviderByUser = useProviderStore((state) => state.loadProviderByUser);

  const [catalog, setCatalog] = useBackendState<CatalogService[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  // Real provider numbers per service; the cards still work if this fails.
  const [counts, setCounts] = useBackendState<ProviderCounts | null>(null);

  const inOnboarding = needsProviderOnboarding(user) || (provider?.services.includes('transport') && !provider.onboardingProgress?.completed);
  const lockedType = provider?.services?.[0]
    ? normalizeServiceKey(provider.services[0])
    : !inOnboarding && selected[0]
      ? normalizeServiceKey(selected[0])
      : undefined;
  const locked = Boolean(lockedType);
  const canLeave = !inOnboarding && (locked || Boolean(user?.providerId));

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      setCatalog(await serviceCatalogService.listActiveServices());
    } catch {
      setCatalog([]);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    let alive = true;
    // Never let the numbers break the screen (offline, older backend, …).
    Promise.resolve()
      .then(() => serviceCatalogService.getProviderCounts())
      .then((value) => {
        if (alive) setCounts(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // Load once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user?.providerId) {
      void loadProvider(user.providerId);
    } else if (user?.id) {
      void loadProviderByUser(user.id);
    }
  }, [user?.id, user?.providerId, loadProvider, loadProviderByUser]);

  useBlockBack(!canLeave);

  useEffect(() => {
    if (canLeave) return;

    navigation.setOptions?.({ gestureEnabled: false });
    const hardware = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => {
      hardware.remove();
    };
  }, [canLeave, navigation]);

  const lockedEmoji =
    catalog.find((item) => item.key === lockedType)?.emoji ??
    SERVICE_OPTIONS.find((item) => item.type === lockedType)?.emoji ??
    '✓';
  const lockedLabel = lockedType
    ? catalog.find((item) => item.key === lockedType)?.label ?? serviceLabel(lockedType)
    : '';
  const lockedDesc =
    catalog.find((item) => item.key === lockedType)?.description ??
    SERVICE_OPTIONS.find((item) => item.type === lockedType)?.description ??
    '';

  if (loadingCatalog && catalog.length === 0) {
    return <LoadingState title="Loading services..." />;
  }

  const options = catalog.length
    ? catalog
    : SERVICE_OPTIONS.map((item, index) => ({
        id: item.type,
        key: item.type,
        label: item.label,
        emoji: item.emoji,
        description: item.description,
        active: true,
        sortOrder: index + 1,
      }));

  return (
    <View style={styles.container}>
      <Header
        title={locked ? 'Your service' : 'Select service'}
        showBack={canLeave}
        fallbackHref={'/(provider)/(tabs)/services'}
        onBack={canLeave ? () => leaveProviderEditor(user) : undefined}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}>
        <Text style={styles.heading}>
          {locked ? 'This is the service you offer' : 'What service do you provide?'}
        </Text>
        <Text style={styles.sub}>
          {locked
            ? 'You can edit this service. BANJARA accounts offer one service only.'
            : 'Choose one — Transportation, Lodging, Tour Operators, Guides, or Restaurants.'}
        </Text>

        {locked && lockedType ? (
          <View style={[styles.card, styles.cardActive]}>
            <Text style={styles.emoji}>{lockedEmoji}</Text>
            <View style={styles.cardBody}>
              <Text style={styles.title}>{lockedLabel}</Text>
              {lockedDesc ? <Text style={styles.desc}>{lockedDesc}</Text> : null}
              <Text style={styles.check}>✓ Your service</Text>
            </View>
          </View>
        ) : (
          <View style={styles.list}>
            {counts && counts.total.registered > 0 ? (
              <View style={styles.community}>
                <Text style={styles.communityText}>
                  <Text style={styles.communityStrong}>{counts.total.registered.toLocaleString('en-PK')}</Text> providers have joined BANJARA
                  {counts.total.approved ? ` · ${counts.total.approved.toLocaleString('en-PK')} verified` : ''}
                </Text>
              </View>
            ) : null}
            {options.map((option) => {
              const key = normalizeServiceKey(option.key);
              const active = normalizeServiceKey(selected[0] ?? '') === key;
              return (
                <Pressable
                  key={option.key}
                  style={[styles.card, active && styles.cardActive]}
                  onPress={() => toggleService(key)}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={styles.emoji}>{option.emoji}</Text>
                  <View style={styles.cardBody}>
                    <Text style={styles.title}>{option.label}</Text>
                    <Text style={styles.desc} numberOfLines={2}>
                      {option.description}
                    </Text>
                    {counts ? <CountPill count={counts.services[key]} /> : null}
                    {active ? <Text style={styles.check}>✓ Selected</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: insets.bottom + Spacing.md }]}>
        {locked && lockedType && !inOnboarding ? (
          <Button
            title={`Edit ${lockedLabel || serviceLabel(lockedType)}`}
            onPress={() => pushPath(editServiceHref(lockedType))}
          />
        ) : (
          <Button
            title="Continue"
            disabled={!selected[0] && !lockedType}
            onPress={() => {
              const type = normalizeServiceKey(lockedType ?? selected[0] ?? '');
              if (!type) return;
              if (type === 'transport') {
                router.push('/(provider)/register/business');
                return;
              }
              // Create the provider profile at the location step first.
              // Guide APIs (/guides/me/profile) require a providerId — skipping
              // location caused CastError → "Invalid identifier".
              router.push({
                pathname: '/(provider)/location',
                params: { mode: 'onboarding' },
              } as never);
            }}
          />
        )}
      </View>
    </View>
  );
}

/** "9 on BANJARA · 8 verified", or an invitation when nobody has joined yet. */
function CountPill({ count }: { count?: { approved: number; registered: number } }) {
  if (!count?.registered) {
    return (
      <View style={[styles.pill, styles.pillNew]}>
        <Text style={[styles.pillText, styles.pillTextNew]}>✨ Be one of the first on BANJARA</Text>
      </View>
    );
  }
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>
        <Text style={styles.pillStrong}>{count.registered.toLocaleString('en-PK')}</Text> on BANJARA
        {count.approved ? ` · ${count.approved.toLocaleString('en-PK')} verified` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  community: { padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.primarySoft },
  communityText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.dark },
  communityStrong: { fontFamily: Fonts.bodySemiBold, color: Colors.primary },
  pill: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full, backgroundColor: Colors.primarySoft },
  pillNew: { backgroundColor: Colors.softAmber },
  pillText: { fontFamily: Fonts.body, fontSize: 11.5, color: Colors.primary },
  pillTextNew: { color: Colors.dark },
  pillStrong: { fontFamily: Fonts.bodySemiBold },
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, gap: Spacing.md },
  heading: { ...Typography.h2, color: Colors.dark },
  sub: { ...Typography.body, color: Colors.muted, lineHeight: 20 },
  list: { gap: Spacing.sm, marginTop: Spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  cardActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  emoji: { fontSize: 26, lineHeight: 32, marginTop: 2 },
  cardBody: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: Fonts.bodySemiBold, fontSize: 16, color: Colors.dark },
  desc: { ...Typography.caption, color: Colors.muted, lineHeight: 17 },
  check: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.primary, marginTop: 4 },
  cta: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
});

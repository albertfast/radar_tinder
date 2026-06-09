import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  useWindowDimensions,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { hasProAccess } from '../utils/access';
import { SubscriptionService } from '../services/SubscriptionService';
import { AnalyticsService } from '../services/AnalyticsService';
import { SubscriptionLegalBlock } from '../components/SubscriptionLegalBlock';
import {
  buildCtaLabel,
  formatPlanPricing,
  type PlanKey,
  type PlanPricing,
} from '../utils/subscriptionPricing';
import {
  findStoreProductForPlan,
  getStoreProductIdsForPlan,
  mapOfferingPackages,
} from '../utils/subscriptionPackages';
import type { PurchasesPackage, PurchasesStoreProduct } from 'react-native-purchases';

const FEATURES: Array<{ icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; key: string; color: string }> = [
  { icon: 'radar', key: 'realtimeAlerts', color: '#4ECDC4' },
  { icon: 'map-marker-path', key: 'smartRoutes', color: '#FFE66D' },
  { icon: 'car-cog', key: 'aiDiagnosis', color: '#FF8A65' },
  { icon: 'chart-line', key: 'driveAnalytics', color: '#7CE8DF' },
];

type PurchaseTarget = PurchasesPackage | PurchasesStoreProduct;

const isRevenueCatPackage = (target: PurchaseTarget): target is PurchasesPackage =>
  Boolean((target as PurchasesPackage)?.product);

const SubscriptionScreen = ({ navigation }: { navigation: { goBack: () => void; navigate: (name: string) => void } }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const isCompact = height < 740;

  const [selectedPlan, setSelectedPlan] = useState<PlanKey>('yearly');
  const [isTrialEnabled, setIsTrialEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [packagesByPlan, setPackagesByPlan] = useState<Record<PlanKey, PurchaseTarget | null>>({
    weekly: null,
    yearly: null,
    adfree: null,
  });
  const [pricingByPlan, setPricingByPlan] = useState<Partial<Record<PlanKey, PlanPricing | null>>>({});
  const { user } = useAuthStore();

  const trialAvailable = selectedPlan === 'yearly';
  const trialActive = trialAvailable && isTrialEnabled;
  const selectedPricing = pricingByPlan[selectedPlan];

  const loadPricing = useCallback(async () => {
    setPricingLoading(true);
    try {
      if (!SubscriptionService.isConfigured()) {
        setPackagesByPlan({ weekly: null, yearly: null, adfree: null });
        setPricingByPlan({});
        return;
      }
      const offering = await SubscriptionService.getOfferings();
      const availablePackages = offering?.availablePackages || [];
      const mapped = mapOfferingPackages(availablePackages, offering);
      const missingSubscriptionProductIds = (['weekly', 'yearly'] as PlanKey[])
        .filter((plan) => !mapped[plan])
        .flatMap((plan) => getStoreProductIdsForPlan(plan));
      const missingAdfreeProductIds = mapped.adfree ? [] : getStoreProductIdsForPlan('adfree');
      const [subscriptionProducts, oneTimeProducts] = await Promise.all([
        SubscriptionService.getStoreProducts(missingSubscriptionProductIds, 'subscription'),
        SubscriptionService.getStoreProducts(missingAdfreeProductIds, 'non_subscription'),
      ]);
      const storeProducts = [...subscriptionProducts, ...oneTimeProducts];
      const targets: Record<PlanKey, PurchaseTarget | null> = {
        weekly: mapped.weekly || findStoreProductForPlan(storeProducts, 'weekly'),
        yearly: mapped.yearly || findStoreProductForPlan(storeProducts, 'yearly'),
        adfree: mapped.adfree || findStoreProductForPlan(storeProducts, 'adfree'),
      };
      setPackagesByPlan(targets);
      setPricingByPlan({
        weekly: formatPlanPricing(targets.weekly, 'weekly'),
        yearly: formatPlanPricing(targets.yearly, 'yearly'),
        adfree: formatPlanPricing(targets.adfree, 'adfree'),
      });
    } catch {
      setPricingByPlan({});
    } finally {
      setPricingLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPricing().catch(() => {});
  }, [loadPricing]);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      if (!SubscriptionService.isConfigured()) {
        Alert.alert('Payments Not Configured', 'RevenueCat API key is missing.');
        return;
      }

      const planToPurchase = trialActive ? 'yearly' : selectedPlan;
      const targetPackage = packagesByPlan[planToPurchase];
      if (!targetPackage) {
        Alert.alert('Store Product Unavailable', t('subscription.priceUnavailable'));
        return;
      }

      await AnalyticsService.trackEvent('subscription_attempt', { plan: planToPurchase, trial: trialActive });
      const purchased = isRevenueCatPackage(targetPackage)
        ? await SubscriptionService.purchasePackage(targetPackage)
        : await SubscriptionService.purchaseStoreProduct(targetPackage);
      if (!purchased) {
        Alert.alert('Payment Failed', 'Purchase could not be completed.');
        return;
      }
      await SubscriptionService.syncAccessState().catch(() => {});
      await useAuthStore.getState().normalizeAccessState().catch(() => {});
      await AnalyticsService.trackEvent('subscription_success', { plan: planToPurchase });
      if (!hasProAccess(useAuthStore.getState().user)) {
        Alert.alert(
          'Subscription Pending',
          'Payment received. Restart the app if Pro features are not unlocked yet.'
        );
      }
      navigation.goBack();
    } catch (err) {
      console.error('Subscription purchase error:', err);
      Alert.alert('Payment Error', 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      const restored = await SubscriptionService.restorePurchases();
      if (!restored) {
        Alert.alert('Restore Failed', 'No previous purchase was found.');
        return;
      }

      const auth = useAuthStore.getState();
      if (!auth.user?.id) {
        const { FirebaseAuthService } = await import('../services/FirebaseAuthService');
        try {
          await FirebaseAuthService.signInAnonymously();
        } catch (firebaseError) {
          console.warn('Firebase anonymous auth failed:', firebaseError);
        }
        const signInResult = await auth.signInAnonymously();
        if (signInResult.error) {
          await auth.signInAsGuest();
        }
        const userId = useAuthStore.getState().user?.id;
        if (userId) {
          await SubscriptionService.setUserId(userId).catch(() => {});
        }
      }

      await SubscriptionService.syncAccessState().catch(() => {});
      await useAuthStore.getState().normalizeAccessState().catch(() => {});
      if (hasProAccess(useAuthStore.getState().user)) {
        navigation.goBack();
        return;
      }
      Alert.alert(
        'Restore Pending',
        'Purchase found. Restart the app if Pro features are not unlocked yet.'
      );
    } finally {
      setLoading(false);
    }
  };

  const ctaLabel = buildCtaLabel(selectedPlan, selectedPricing ?? null, trialActive, t);

  const periodSuffix =
    selectedPlan === 'yearly'
      ? t('subscription.perYear')
      : selectedPlan === 'weekly'
        ? t('subscription.perWeek')
        : t('subscription.once');

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F0A1E', '#1A1033', '#120A24']} style={StyleSheet.absoluteFill} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="close" iconColor="#F8FAFC" size={26} onPress={() => navigation.goBack()} />
        <TouchableOpacity onPress={handleRestore} disabled={loading}>
          <Text style={styles.restoreText}>{t('subscription.restore')}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.body, isCompact && styles.bodyCompact]}>
        <View style={styles.titleRow}>
          <MaterialCommunityIcons name="crown" size={28} color="#F5C842" />
          <View style={styles.titleCopy}>
            <Text style={styles.title}>{t('subscription.unlockPro')}</Text>
            <Text style={styles.subtitle}>{t('subscription.unlockSubtitle')}</Text>
          </View>
        </View>

        <View style={styles.featureGrid}>
          {FEATURES.map((item) => (
            <View key={item.key} style={styles.featureTile}>
              <MaterialCommunityIcons name={item.icon} size={20} color={item.color} />
              <Text style={styles.featureLabel}>{t(`features.${item.key}`)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.planRow}>
          <PlanCard
            label={t('subscription.weekly')}
            badge={t('subscription.flexible')}
            price={pricingByPlan.weekly?.priceString}
            period={t('subscription.perWeek')}
            trialNote={undefined}
            selected={selectedPlan === 'weekly'}
            onSelect={() => {
              setSelectedPlan('weekly');
              setIsTrialEnabled(false);
            }}
            loading={pricingLoading}
          />
          <PlanCard
            label={t('subscription.yearly')}
            badge={t('subscription.bestValue')}
            price={pricingByPlan.yearly?.priceString}
            period={t('subscription.perYear')}
            trialNote={pricingByPlan.yearly?.hasIntroTrial ? t('subscription.trialDays') : undefined}
            subNote={pricingByPlan.yearly?.monthlyEquivalent ? `~${pricingByPlan.yearly.monthlyEquivalent}/mo` : undefined}
            selected={selectedPlan === 'yearly'}
            highlight
            accentColor="#7C6CFF"
            onSelect={() => {
              setSelectedPlan('yearly');
              setIsTrialEnabled(true);
            }}
            loading={pricingLoading}
          />
        </View>

        <TouchableOpacity
          style={styles.adFreeRow}
          onPress={() => {
            setSelectedPlan('adfree');
            setIsTrialEnabled(false);
          }}
          activeOpacity={0.9}
        >
          <View style={[styles.radio, selectedPlan === 'adfree' && styles.radioOn]} />
          <Text style={styles.adFreeLabel}>{t('subscription.adFree')}</Text>
          {pricingLoading ? (
            <ActivityIndicator size="small" color="#94A3B8" />
          ) : (
            <Text style={styles.adFreePrice}>
              {pricingByPlan.adfree?.priceString || '—'} {t('subscription.once')}
            </Text>
          )}
        </TouchableOpacity>

        <SubscriptionLegalBlock
          selectedPlan={selectedPlan}
          trialActive={trialActive}
          pricingByPlan={pricingByPlan}
          onTermsPress={() => {
            Linking.openURL('https://albertfast.github.io/radar_tinder/terms-and-conditions').catch((err) =>
              console.warn('Failed to open Terms URL:', err)
            );
          }}
          onPrivacyPress={() => {
            Linking.openURL('https://albertfast.github.io/radar_tinder/privacy-policy').catch((err) =>
              console.warn('Failed to open Privacy URL:', err)
            );
          }}
          onRestorePress={handleRestore}
          compact
        />

        <TouchableOpacity
          style={[styles.cta, loading && { opacity: 0.75 }]}
          onPress={handleSubscribe}
          disabled={loading || pricingLoading}
          activeOpacity={0.92}
        >
          <LinearGradient colors={['#F5C842', '#E8A820']} style={styles.ctaGradient}>
            {loading ? (
              <ActivityIndicator color="#1A1408" />
            ) : (
              <>
                <MaterialCommunityIcons name="lightning-bolt" size={20} color="#1A1408" />
                <View style={styles.ctaTextCol}>
                  <Text style={styles.ctaTitle}>{ctaLabel}</Text>
                  {selectedPricing && (
                    <Text style={styles.ctaSub}>
                      {selectedPricing.priceString} / {periodSuffix}
                    </Text>
                  )}
                </View>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {!pricingLoading && !pricingByPlan[selectedPlan] && (
          <TouchableOpacity onPress={() => loadPricing()}>
            <Text style={styles.retryText}>{t('subscription.retry')}</Text>
          </TouchableOpacity>
        )}

        {user?.accountLinkRequiredUntil && (
          <Text style={styles.linkHint}>
            Link your account within 24h to keep access across devices.
          </Text>
        )}
      </View>
    </View>
  );
};

const PlanCard = ({
  label,
  badge,
  price,
  period,
  trialNote,
  subNote,
  selected,
  highlight,
  accentColor = '#7C6CFF',
  onSelect,
  loading,
}: {
  label: string;
  badge: string;
  price?: string;
  period: string;
  trialNote?: string;
  subNote?: string;
  selected: boolean;
  highlight?: boolean;
  accentColor?: string;
  onSelect: () => void;
  loading: boolean;
}) => (
  <TouchableOpacity
    style={[
      styles.planCard,
      selected && { borderColor: accentColor },
      highlight && { backgroundColor: `${accentColor}18` },
    ]}
    onPress={onSelect}
    activeOpacity={0.9}
  >
    <View style={styles.planCardTop}>
      <Text style={styles.planLabel}>{label}</Text>
      <View style={[styles.badge, highlight && { backgroundColor: `${accentColor}35` }]}>
        <Text style={[styles.badgeText, highlight && { color: accentColor }]}>{badge}</Text>
      </View>
    </View>
    {loading ? (
      <ActivityIndicator size="small" color="#94A3B8" style={{ marginTop: 8 }} />
    ) : (
      <>
        <Text style={[styles.planPrice, selected && { color: accentColor }]}>{price || '—'}</Text>
        <Text style={styles.planPeriod}>{period}</Text>
        {trialNote && <Text style={styles.planTrial}>{trialNote}</Text>}
        {subNote && <Text style={styles.planSub}>{subNote}</Text>}
      </>
    )}
    <View
      style={[
        styles.planRadio,
        selected && { backgroundColor: accentColor, borderColor: accentColor },
      ]}
    >
      {selected && <MaterialCommunityIcons name="check" size={14} color="#0F0A1E" />}
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0A1E' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  restoreText: { color: '#94A3B8', fontSize: 14, marginRight: 16, fontWeight: '600' },
  body: { flex: 1, paddingHorizontal: 20, paddingBottom: 24, justifyContent: 'flex-start' },
  bodyCompact: { paddingTop: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  titleCopy: { flex: 1 },
  title: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '900',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
  },
  subtitle: { color: '#94A3B8', fontSize: 13, marginTop: 4, lineHeight: 18 },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  featureTile: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  featureLabel: { color: '#CBD5E1', fontSize: 12, fontWeight: '700', flex: 1 },
  planRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  planCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    minHeight: 120,
  },
  planCardSelected: { borderColor: '#7C6CFF' },
  planCardHighlight: { backgroundColor: 'rgba(124,108,255,0.12)' },
  planCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planLabel: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  badgeHighlight: { backgroundColor: 'rgba(124,108,255,0.35)' },
  badgeText: { color: '#94A3B8', fontSize: 9, fontWeight: '800' },
  badgeTextHighlight: { color: '#C4B5FD' },
  planPrice: { color: '#F8FAFC', fontSize: 22, fontWeight: '900', marginTop: 8 },
  planPeriod: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  planTrial: { color: '#7CE8DF', fontSize: 10, fontWeight: '700', marginTop: 4 },
  planSub: { color: '#64748B', fontSize: 10, marginTop: 2 },
  planRadio: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRadioOn: { backgroundColor: '#7C6CFF', borderColor: '#7C6CFF' },
  adFreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  radioOn: { backgroundColor: '#F5C842', borderColor: '#F5C842' },
  adFreeLabel: { color: '#E2E8F0', fontSize: 14, fontWeight: '700', flex: 1 },
  adFreePrice: { color: '#94A3B8', fontSize: 13, fontWeight: '700' },
  trialRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  trialLabel: { color: '#CBD5E1', fontSize: 12, fontWeight: '600' },
  cta: { borderRadius: 16, overflow: 'hidden', marginTop: 12 },
  ctaGradient: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  ctaTitle: { color: '#1A1408', fontSize: 15, fontWeight: '900' },
  ctaSub: { color: 'rgba(26,20,8,0.65)', fontSize: 11, fontWeight: '700', marginTop: 2 },
  ctaTextCol: { alignItems: 'center' },
  retryText: { color: '#7CE8DF', textAlign: 'center', marginTop: 8, fontSize: 12 },
  linkHint: { color: '#64748B', fontSize: 10, textAlign: 'center', marginTop: 8 },
});

export default SubscriptionScreen;

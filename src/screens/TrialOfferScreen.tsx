import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { FirebaseAuthService } from '../services/FirebaseAuthService';
import { LocationService } from '../services/LocationService';
import { AdService } from '../services/AdService';
import { useAuthStore } from '../store/authStore';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AuthNavigator';
import { SubscriptionLegalBlock } from '../components/SubscriptionLegalBlock';
import { formatPlanPricing } from '../utils/subscriptionPricing';
import { mapOfferingPackages } from '../utils/subscriptionPackages';
import { SubscriptionService } from '../services/SubscriptionService';
import { visualTokens } from '../constants/visualTokens';

const { width, height } = Dimensions.get('window');
const allowLayoutAnimations = Platform.OS !== 'android';
const isCompactDevice = height < 940;
const heroRadarSize = isCompactDevice ? Math.min(width * 0.34, 132) : Math.min(width * 0.4, 158);
const FEATURES = [
  {
    id: 'live',
    title: 'Live radar',
    subtitle: 'Community radar stream',
    icon: 'radar',
    color: '#4ECDC4',
  },
  {
    id: 'graphic',
    title: 'Graphic mode',
    subtitle: 'Free stats & 3D radar panel',
    icon: 'chart-areaspline',
    color: '#FF8A65',
  },
  {
    id: 'route',
    title: 'Safe route',
    subtitle: 'Route-aware alerts',
    icon: 'map-marker-path',
    color: '#FFE66D',
  },
];

const TrialOfferScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { signInAnonymously, signInAsGuest } = useAuthStore();
  const [loadingAction, setLoadingAction] = useState<'subscribe' | 'ads' | 'location' | null>(null);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [isTrialEnabled, setIsTrialEnabled] = useState(true);
  const [yearlyPrice, setYearlyPrice] = useState<string | null>(null);
  const [weeklyPrice, setWeeklyPrice] = useState<string | null>(null);
  const [pricingByPlan, setPricingByPlan] = useState<any>({});
  const heroTitle = 'Avoid Police Radars';
  const heroSubtitle =
    'Real-time detection of speed traps and mobile patrols. No payment required for the ad-supported version.';
  const isBillingMisconfigured = (error: unknown) => {
    const message = String((error as any)?.message || error || '').toLowerCase();
    return (
      message.includes('not configured for billing') ||
      message.includes('billing') ||
      message.includes('itemunavailable') ||
      message.includes('developer_error')
    );
  };

  const loadPricing = useCallback(async () => {
    try {
      if (!SubscriptionService.isConfigured()) return;
      const offering = await SubscriptionService.getOfferings();
      const packages = offering?.availablePackages || [];
      const mapped = mapOfferingPackages(packages, offering);
      const yearly = formatPlanPricing(mapped.yearly, 'yearly');
      const weekly = formatPlanPricing(mapped.weekly, 'weekly');
      setYearlyPrice(yearly?.priceString || null);
      setWeeklyPrice(weekly?.priceString || null);
      setPricingByPlan({
        yearly,
        weekly,
        adfree: formatPlanPricing(mapped.adfree, 'adfree'),
      });
    } catch {
      setYearlyPrice(null);
    }
  }, []);

  useEffect(() => {
    loadPricing().catch(() => {});
  }, [loadPricing]);

  const ensureSession = async () => {
    try {
      await FirebaseAuthService.signInAnonymously();
    } catch (firebaseError) {
      console.warn('Firebase anonymous auth failed:', firebaseError);
    }

    const { error } = await signInAnonymously();
    if (error) {
      const guestResult = await signInAsGuest();
      if (guestResult.error) {
        throw guestResult.error instanceof Error
          ? guestResult.error
          : new Error('Could not start the app. Try again or check your connection.');
      }
    }
  };

  const requestLocation = async () => {
    setLoadingAction('location');
    try {
      await LocationService.requestLocationPermission();
      setLocationEnabled(true);
    } catch {
      Alert.alert(
        'Location Not Enabled',
        'You can continue without location and enable it later from settings.'
      );
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSubscribe = async () => {
    try {
      setLoadingAction('subscribe');
      if (!SubscriptionService.isConfigured()) {
        Alert.alert(
          'Billing Not Ready',
          'Google Play billing is not configured for this build yet. Use "Continue with limited access (Ads)" to enter the app for free.'
        );
        return;
      }

      await ensureSession();

      const offerings = await SubscriptionService.getOfferings();
      const mapped = mapOfferingPackages(offerings?.availablePackages || [], offerings);
      const yearlyPackage = mapped.yearly;

      if (!yearlyPackage) {
        throw new Error('No annual plan is available right now.');
      }

      const purchased = await SubscriptionService.purchasePackage(yearlyPackage);
      if (purchased) {
        await SubscriptionService.syncAccessState().catch(() => {});
      }
    } catch (err: any) {
      if (isBillingMisconfigured(err)) {
        Alert.alert(
          'Billing Not Configured',
          'This Play Store build is not set up for payments yet. Tap "Continue with limited access (Ads)" — no payment required.'
        );
        return;
      }
      const message =
        typeof err?.message === 'string' && err.message.trim().length > 0
          ? err.message
          : 'Subscription could not be started.';
      Alert.alert('Subscription Error', message);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleContinueWithAds = async () => {
    setLoadingAction('ads');
    try {
      // Never show app-open during onboarding — it caused a white fullscreen flash and bounced back.
      AdService.suppressAppOpenFor(60_000);
      await ensureSession();

      const { isAuthenticated } = useAuthStore.getState();
      if (!isAuthenticated) {
        throw new Error('Could not enter the app. Try again.');
      }
    } catch (err: any) {
      const message =
        typeof err?.message === 'string' && err.message.trim().length > 0
          ? err.message
          : 'Please check your internet connection and try again.';
      Alert.alert('Continue Failed', message);
      setLoadingAction(null);
    }
  };

  const handleRestore = async () => {
    try {
      setLoadingAction('subscribe');
      await ensureSession();
      const { SubscriptionService } = await import('../services/SubscriptionService');
      const restored = await SubscriptionService.restorePurchases();
      if (!restored) {
        Alert.alert('Restore Failed', 'No previous purchase was found.');
      }
    } catch (err: any) {
      Alert.alert('Restore Failed', err?.message || 'Could not restore purchases.');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#0A0A0A', '#121212']} style={StyleSheet.absoluteFill} />
      <View style={styles.backGlowLeft} />
      <View style={styles.backGlowRight} />

      <SafeAreaView style={styles.safeArea}>
        <Animated.View entering={allowLayoutAnimations ? FadeInDown.delay(80) : undefined} style={styles.header}>
          <View style={styles.brandRow}>
            <MaterialCommunityIcons name="radar" size={20} color="#FF5252" />
            <Text style={styles.brandText}>RADAR TINDER</Text>
          </View>
          <TouchableOpacity onPress={handleRestore} disabled={loadingAction !== null} style={styles.restoreHeaderBtn}>
            <Text style={styles.restoreHeaderText}>{t('subscription.restorePurchases')}</Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.main}>
          <Animated.View entering={allowLayoutAnimations ? FadeInDown.delay(120) : undefined} style={styles.heroPanel}>
            <View style={styles.badgeHero}>
              <MaterialCommunityIcons name="police-badge" size={isCompactDevice ? 72 : 88} color="#FF5252" />
            </View>
            <Text style={styles.heroTitleCenter}>{heroTitle}</Text>
            <Text style={styles.heroSubtitleCenter}>{heroSubtitle}</Text>

            <View style={styles.featureGrid}>
              {FEATURES.map((item) => (
                <View key={item.id} style={styles.featureTile}>
                  <View style={[styles.featureIcon, { backgroundColor: `${item.color}12`, borderColor: `${item.color}38` }]}>
                    <MaterialCommunityIcons name={item.icon as any} size={16} color={item.color} />
                  </View>
                  <Text style={styles.featureTitle}>{item.title}</Text>
                  <Text style={styles.featureSubtitle}>{item.subtitle}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          <Animated.View entering={allowLayoutAnimations ? FadeInDown.delay(200) : undefined} style={styles.offerPanel}>
            <View style={styles.offerHeaderRow}>
              <View>
                <Text style={styles.offerTag}>3-DAY FREE TRIAL</Text>
                <Text style={styles.offerTitle}>Go ad-free on the road</Text>
              </View>
              <View style={styles.offerPricePill}>
                <Text style={styles.offerPriceTop}>{yearlyPrice || '—'}</Text>
                <Text style={styles.offerPriceBottom}>{t('subscription.perYear')}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.trialToggleRow}
              onPress={() => setIsTrialEnabled(!isTrialEnabled)}
              activeOpacity={0.9}
            >
              <MaterialCommunityIcons
                name={isTrialEnabled ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={22}
                color={isTrialEnabled ? '#F5C842' : '#64748B'}
              />
              <Text style={styles.trialToggleText}>{t('subscription.enableTrial')}</Text>
            </TouchableOpacity>

            <View style={styles.offerBenefits}>
              <Benefit label="Graphic & trips" value="Free" color="#4ECDC4" />
              <Benefit label="Safe route" value="Included" color="#FFE66D" />
              <Benefit label="Ad-free" value="Premium" color="#FF8A65" />
            </View>

            {yearlyPrice || weeklyPrice ? (
              <Text style={styles.priceHint}>
                {yearlyPrice ? `Then ${yearlyPrice}/year` : ''}
                {weeklyPrice ? `${yearlyPrice ? ' · ' : ''}Or ${weeklyPrice}/week` : ''}
              </Text>
            ) : null}

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleSubscribe}
              disabled={loadingAction !== null}
              activeOpacity={0.92}
            >
              <LinearGradient colors={['#FF6B6B', '#FF5252']} style={styles.primaryButtonGradient}>
                {loadingAction === 'subscribe' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>START 3-DAY FREE TRIAL</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.freeEntryButton}
              onPress={handleContinueWithAds}
              disabled={loadingAction !== null}
              activeOpacity={0.9}
            >
              {loadingAction === 'ads' ? (
                <ActivityIndicator color="#F8FAFC" />
              ) : (
                <Text style={styles.freeEntryOutlineText}>Continue with Ads (Free)</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.locationLink}
              onPress={requestLocation}
              disabled={loadingAction !== null}
              activeOpacity={0.9}
            >
              {loadingAction === 'location' ? (
                <ActivityIndicator color={visualTokens.accentTurquoise} />
              ) : (
                <Text style={styles.locationLinkText}>
                  {locationEnabled ? 'Location enabled' : 'Enable location (optional)'}
                </Text>
              )}
            </TouchableOpacity>

            <SubscriptionLegalBlock
              selectedPlan="yearly"
              trialActive={isTrialEnabled}
              pricingByPlan={pricingByPlan}
              onTermsPress={() => navigation.navigate('Terms')}
              onPrivacyPress={() => navigation.navigate('Privacy')}
              compact
            />
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const Benefit = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <View style={styles.benefitCard}>
    <Text style={styles.benefitLabel}>{label}</Text>
    <Text style={[styles.benefitValue, { color }]}>{value}</Text>
  </View>
);

export default TrialOfferScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070B19',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 18,
  },
  backGlowLeft: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 999,
    left: -120,
    top: isCompactDevice ? 110 : 140,
    backgroundColor: 'rgba(45, 192, 191, 0.20)',
  },
  backGlowRight: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 999,
    right: -140,
    bottom: 120,
    backgroundColor: 'rgba(255, 125, 72, 0.16)',
  },
  header: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandText: {
    color: '#F7FAFC',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  restoreHeaderBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  restoreHeaderText: {
    color: visualTokens.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  main: {
    flex: 1,
    paddingTop: isCompactDevice ? 10 : 16,
    paddingBottom: 10,
    justifyContent: 'space-between',
  },
  heroPanel: {
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: 'rgba(7, 12, 24, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroTextColumn: {
    flex: 1,
    paddingRight: 8,
  },
  heroEyebrow: {
    color: '#FF8A8A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  freeEntryButton: {
    marginTop: 10,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.35)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  freeEntryOutlineText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  priceHint: {
    marginTop: 8,
    color: visualTokens.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  heroTitle: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: isCompactDevice ? 22 : 28,
    lineHeight: isCompactDevice ? 25 : 32,
    fontWeight: '900',
    maxWidth: isCompactDevice ? 150 : 210,
  },
  heroSubtitle: {
    marginTop: 8,
    color: '#97A4BC',
    fontSize: 13,
    lineHeight: 18,
    maxWidth: isCompactDevice ? 155 : 220,
  },
  radarShell: {
    width: heroRadarSize + 10,
    height: heroRadarSize + 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarOrbitGlow: {
    position: 'absolute',
    width: heroRadarSize + 6,
    height: heroRadarSize + 6,
    borderRadius: 999,
    backgroundColor: 'rgba(37, 208, 200, 0.08)',
  },
  infoRail: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 10,
  },
  infoChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: 16,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoChipText: {
    color: '#D5DEEC',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  featureGrid: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTile: {
    flex: 1,
    minHeight: isCompactDevice ? 78 : 88,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  featureTitle: {
    marginTop: 8,
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
  },
  featureSubtitle: {
    marginTop: 3,
    color: '#91A0B7',
    fontSize: 11,
    lineHeight: 15,
  },
  offerPanel: {
    marginTop: 10,
    borderRadius: 26,
    padding: 16,
    backgroundColor: 'rgba(17, 20, 31, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  offerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  badgeHero: {
    alignItems: 'center',
    marginBottom: 8,
  },
  heroTitleCenter: {
    color: '#FFFFFF',
    fontSize: isCompactDevice ? 26 : 32,
    fontWeight: '900',
    textAlign: 'center',
  },
  heroSubtitleCenter: {
    marginTop: 8,
    marginBottom: 12,
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  offerTag: {
    color: '#FF8A8A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  offerTitle: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: isCompactDevice ? 22 : 28,
    lineHeight: isCompactDevice ? 24 : 31,
    fontWeight: '900',
  },
  offerPricePill: {
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'flex-end',
  },
  offerPriceTop: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  offerPriceBottom: {
    color: '#97A4BC',
    fontSize: 10,
    fontWeight: '700',
  },
  offerBenefits: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  benefitCard: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'space-between',
  },
  benefitLabel: {
    color: '#8E9AAF',
    fontSize: 10,
    fontWeight: '700',
  },
  benefitValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  primaryButton: {
    marginTop: 12,
    borderRadius: 18,
    overflow: 'hidden',
  },
  primaryButtonGradient: {
    minHeight: 52,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  locationLink: {
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
  },
  locationLinkText: {
    color: visualTokens.accentTurquoise,
    fontSize: 13,
    fontWeight: '700',
  },
  trialToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  trialToggleText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
});

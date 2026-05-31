import React, { useState } from 'react';
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
import { RadarAnimation } from '../components/RadarAnimation';

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
    subtitle: 'Premium driving panel',
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
  const { signInAnonymously, signInAsGuest, normalizeAccessState } = useAuthStore();
  const [loadingAction, setLoadingAction] = useState<'subscribe' | 'ads' | 'location' | null>(null);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const heroTitle = isCompactDevice ? 'Premium drive, zero clutter' : 'Premium driving, built for the road';

  const ensureAnonymousSession = async () => {
    try {
      await FirebaseAuthService.signInAnonymously();
    } catch (firebaseError) {
      console.warn('Firebase anonymous auth failed:', firebaseError);
    }
    const { error } = await signInAnonymously();
    if (error) {
      await signInAsGuest();
    }
    const userId = useAuthStore.getState().user?.id;
    if (userId) {
      const { SubscriptionService } = await import('../services/SubscriptionService');
      await SubscriptionService.setUserId(userId).catch(() => {});
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
      await ensureAnonymousSession();

      const { SubscriptionService } = await import('../services/SubscriptionService');
      const offerings = await SubscriptionService.getOfferings();
      const yearlyPackage = offerings?.availablePackages?.find(
        (p: any) => p.identifier.includes('yearly') || p.identifier.includes('annual')
      );

      if (!yearlyPackage) {
        throw new Error('No annual plan is available right now.');
      }

      const purchased = await SubscriptionService.purchasePackage(yearlyPackage);
      if (purchased) {
        await SubscriptionService.syncAccessState().catch(() => {});
        await normalizeAccessState().catch(() => {});
      }
    } catch (err: any) {
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
    try {
      setLoadingAction('ads');
      await AdService.preloadAll().catch(() => {});
      await AdService.showAppOpen('trial_offer_continue_with_ads');
      await ensureAnonymousSession();
    } catch (err: any) {
      const message =
        typeof err?.message === 'string' && err.message.trim().length > 0
          ? err.message
          : 'Please check your internet connection and try again.';
      Alert.alert('Continue Failed', message);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRestore = async () => {
    try {
      setLoadingAction('subscribe');
      const { SubscriptionService } = await import('../services/SubscriptionService');
      const restored = await SubscriptionService.restorePurchases();
      if (!restored) {
        Alert.alert('Restore Failed', 'No previous purchase was found.');
        return;
      }
      await ensureAnonymousSession();
      await SubscriptionService.syncAccessState().catch(() => {});
      await normalizeAccessState().catch(() => {});
    } catch (err: any) {
      Alert.alert('Restore Failed', err?.message || 'Could not restore purchases.');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#070B19', '#0A1021', '#161121']} style={StyleSheet.absoluteFill} />
      <View style={styles.backGlowLeft} />
      <View style={styles.backGlowRight} />

      <SafeAreaView style={styles.safeArea}>
        <Animated.View entering={allowLayoutAnimations ? FadeInDown.delay(80) : undefined} style={styles.header}>
          <View style={styles.brandRow}>
            <MaterialCommunityIcons name="radar" size={20} color="#FF646B" />
            <Text style={styles.brandText}>RADAR TINDER</Text>
          </View>
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumBadgeText}>PREMIUM</Text>
          </View>
        </Animated.View>

        <View style={styles.main}>
          <Animated.View entering={allowLayoutAnimations ? FadeInDown.delay(140) : undefined} style={styles.heroPanel}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroTextColumn}>
                <Text style={styles.heroEyebrow}>PREMIUM ACCESS</Text>
                <Text style={styles.heroTitle}>{heroTitle}</Text>
                <Text style={styles.heroSubtitle}>
                  Subscribe with no ad interruption, or use the free ad-supported flow.
                </Text>
              </View>

              <View style={styles.radarShell}>
                <View style={styles.radarOrbitGlow} />
                <RadarAnimation
                  size={heroRadarSize}
                  rendererMode="life3d"
                  signalLevel={0.84}
                  dangerLevel={0.26}
                />
              </View>
            </View>

            <View style={styles.infoRail}>
              <View style={styles.infoChip}>
                <MaterialCommunityIcons name="shield-check-outline" size={16} color="#4ECDC4" />
                <Text style={styles.infoChipText}>No ad on subscribe</Text>
              </View>
              <View style={styles.infoChip}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={16} color="#7CE8DF" />
                <Text style={styles.infoChipText}>{locationEnabled ? 'Location enabled' : 'Location optional now'}</Text>
              </View>
            </View>

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
                <Text style={styles.offerTitle}>Unlock Graphic Drive</Text>
              </View>
              <View style={styles.offerPricePill}>
                <Text style={styles.offerPriceTop}>$19.99</Text>
                <Text style={styles.offerPriceBottom}>per year</Text>
              </View>
            </View>

            <View style={styles.offerBenefits}>
              <Benefit label="Graphic" value="Included" color="#4ECDC4" />
              <Benefit label="Safe route" value="Included" color="#FFE66D" />
              <Benefit label="Ad-free" value="Premium" color="#FF8A65" />
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleSubscribe}
              disabled={loadingAction !== null}
              activeOpacity={0.92}
            >
              <LinearGradient colors={['#FF6A6A', '#FF4F63']} style={styles.primaryButtonGradient}>
                {loadingAction === 'subscribe' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="shield-crown-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>Start Premium Trial</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.secondaryRow}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleContinueWithAds}
                disabled={loadingAction !== null}
                activeOpacity={0.9}
              >
                {loadingAction === 'ads' ? (
                  <ActivityIndicator color="#D6DEED" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="play-circle-outline" size={18} color="#D6DEED" />
                    <Text style={styles.secondaryButtonText}>Use Free with Ads</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.locationButton}
                onPress={requestLocation}
                disabled={loadingAction !== null}
                activeOpacity={0.9}
              >
                {loadingAction === 'location' ? (
                  <ActivityIndicator color="#4ECDC4" />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name={locationEnabled ? 'crosshairs-gps' : 'map-marker-radius-outline'}
                      size={18}
                      color="#4ECDC4"
                    />
                    <Text style={styles.locationButtonText}>
                      {locationEnabled ? 'Location enabled' : 'Enable location'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.restoreButton} onPress={handleRestore} disabled={loadingAction !== null}>
              <Text style={styles.restoreText}>Restore Purchase</Text>
            </TouchableOpacity>
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
  premiumBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  premiumBadgeText: {
    color: '#FFB2B6',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
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
    color: '#4ECDC4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
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
  offerTag: {
    color: '#FFB0B6',
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
  secondaryRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  secondaryButtonText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '800',
  },
  locationButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(78,205,196,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.20)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  locationButtonText: {
    color: '#7CE8DF',
    fontSize: 13,
    fontWeight: '800',
  },
  restoreButton: {
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 24,
  },
  restoreText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
});

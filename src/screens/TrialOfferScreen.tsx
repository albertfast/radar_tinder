import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
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
const isCompactDevice = height < 760;
const heroRadarSize = isCompactDevice ? Math.min(width * 0.46, 168) : Math.min(width * 0.5, 196);

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
  const { signInAnonymously } = useAuthStore();
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadingAction, setLoadingAction] = useState<'subscribe' | 'ads' | 'location' | null>(null);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextIndex = (activeIndex + 1) % FEATURES.length;
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      setActiveIndex(nextIndex);
    }, 3200);

    return () => clearInterval(interval);
  }, [activeIndex]);

  const activeFeature = FEATURES[activeIndex];
  const heroTitle = useMemo(
    () => (isCompactDevice ? 'Premium driving without the noise' : 'Premium driving that feels built for the road'),
    []
  );

  const ensureAnonymousSession = async () => {
    try {
      await FirebaseAuthService.signInAnonymously();
    } catch (firebaseError) {
      console.warn('Firebase anonymous auth failed:', firebaseError);
    }
    await signInAnonymously();
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

      await SubscriptionService.purchasePackage(yearlyPackage);
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
      await ensureAnonymousSession();
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

  const renderFeature = ({ item }: { item: (typeof FEATURES)[number] }) => (
    <View style={styles.featureSlide}>
      <View style={[styles.featureIcon, { backgroundColor: `${item.color}14`, borderColor: `${item.color}40` }]}>
        <MaterialCommunityIcons name={item.icon as any} size={18} color={item.color} />
      </View>
      <View style={styles.featureCopy}>
        <Text style={styles.featureTitle}>{item.title}</Text>
        <Text style={styles.featureSubtitle}>{item.subtitle}</Text>
      </View>
    </View>
  );

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
                  Subscribe directly with no ad interruption, or continue free and watch an ad first.
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

            <View style={styles.carouselShell}>
              <FlatList
                ref={flatListRef}
                data={FEATURES}
                renderItem={renderFeature}
                keyExtractor={(item) => item.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(ev) => {
                  const index = Math.round(ev.nativeEvent.contentOffset.x / (width - 40));
                  setActiveIndex(Math.max(0, Math.min(index, FEATURES.length - 1)));
                }}
                getItemLayout={(_, index) => ({
                  length: width - 40,
                  offset: (width - 40) * index,
                  index,
                })}
              />
              <View style={styles.pagination}>
                {FEATURES.map((item, index) => (
                  <View
                    key={item.id}
                    style={[
                      styles.dot,
                      index === activeIndex && { width: 18, backgroundColor: activeFeature.color },
                    ]}
                  />
                ))}
              </View>
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
              <Benefit label="Graphic mode" value="Included" color="#4ECDC4" />
              <Benefit label="Safe route" value="Included" color="#FFE66D" />
              <Benefit label="Ad-free" value="Premium only" color="#FF8A65" />
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
                    <Text style={styles.secondaryButtonText}>Continue with Ads</Text>
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
    marginTop: 4,
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
    paddingTop: isCompactDevice ? 14 : 18,
    paddingBottom: 14,
    justifyContent: 'space-between',
  },
  heroPanel: {
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
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
    fontSize: isCompactDevice ? 28 : 32,
    lineHeight: isCompactDevice ? 31 : 36,
    fontWeight: '900',
  },
  heroSubtitle: {
    marginTop: 10,
    color: '#97A4BC',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 210,
  },
  radarShell: {
    width: heroRadarSize + 18,
    height: heroRadarSize + 18,
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
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  infoChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 16,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoChipText: {
    color: '#D5DEEC',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  carouselShell: {
    marginTop: 12,
    minHeight: isCompactDevice ? 92 : 102,
    justifyContent: 'center',
  },
  featureSlide: {
    width: width - 40,
    minHeight: isCompactDevice ? 74 : 82,
    borderRadius: 18,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCopy: {
    flex: 1,
  },
  featureTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  featureSubtitle: {
    marginTop: 4,
    color: '#91A0B7',
    fontSize: 13,
    lineHeight: 18,
  },
  pagination: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  offerPanel: {
    marginTop: 14,
    borderRadius: 28,
    padding: 18,
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
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: isCompactDevice ? 28 : 30,
    lineHeight: isCompactDevice ? 30 : 33,
    fontWeight: '900',
  },
  offerPricePill: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'flex-end',
  },
  offerPriceTop: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  offerPriceBottom: {
    color: '#97A4BC',
    fontSize: 11,
    fontWeight: '700',
  },
  offerBenefits: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  benefitCard: {
    flex: 1,
    minHeight: 60,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'space-between',
  },
  benefitLabel: {
    color: '#8E9AAF',
    fontSize: 11,
    fontWeight: '700',
  },
  benefitValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  primaryButton: {
    marginTop: 14,
    borderRadius: 18,
    overflow: 'hidden',
  },
  primaryButtonGradient: {
    minHeight: 56,
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
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
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
    fontSize: 14,
    fontWeight: '800',
  },
  locationButton: {
    flex: 1,
    minHeight: 50,
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
    fontSize: 14,
    fontWeight: '800',
  },
  restoreButton: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 30,
  },
  restoreText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
});

import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  Dimensions, 
  TouchableOpacity, 
  FlatList, 
  Platform,
  Linking,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { FirebaseAuthService } from '../services/FirebaseAuthService';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  Easing,
  FadeInDown,
  withSequence,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Trial3DAnimation from '../components/Trial3DAnimation';

const { width, height } = Dimensions.get('window');
const allowLayoutAnimations = Platform.OS !== 'android';
type AccountLinkProvider = 'apple' | 'google';

const FEATURES = [
  {
    id: '1',
    title: 'Avoid Police Radars',
    subtitle: 'Real-time detection of speed traps and mobile patrols.',
    icon: 'police-badge',
    color: '#FF5252' // Vibrant Red
  },
  {
    id: '2',
    title: 'AI Diagnostics',
    subtitle: 'Scan dashboard lights with AI. Know your car\'s health.',
    icon: 'car-cog',
    color: '#4ECDC4' // Vibrant Teal
  },
  {
    id: '3',
    title: 'Safe Route Match',
    subtitle: 'Find the safest route with our community-driven data.',
    icon: 'map-marker-path',
    color: '#FFE66D' // Vibrant Yellow
  }
];

// --- 3D Radar Scan Animation ---
const RadarScan = () => {
    const rotation = useSharedValue(0);
    const scale = useSharedValue(1);
    const pulseScale = useSharedValue(0.9);
    const pulseOpacity = useSharedValue(0.2);
    
    useEffect(() => {
        rotation.value = withRepeat(
            withTiming(360, { duration: 4000, easing: Easing.linear }),
            -1,
            false
        );
        scale.value = withRepeat(
            withSequence(
                withTiming(1.2, { duration: 2000 }),
                withTiming(1, { duration: 2000 })
            ),
            -1,
            true
        );
        pulseScale.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 1200 }),
                withTiming(1.18, { duration: 1200 })
            ),
            -1,
            true
        );
        pulseOpacity.value = withRepeat(
            withSequence(
                withTiming(0.1, { duration: 1200 }),
                withTiming(0.28, { duration: 1200 })
            ),
            -1,
            true
        );
    }, []);

    const radarStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { rotate: `${rotation.value}deg` },
                { scale: scale.value }
            ]
        };
    });

    const pulseStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: pulseScale.value }],
            opacity: pulseOpacity.value,
        };
    });

    return (
        <View style={StyleSheet.absoluteFill}>
            <LinearGradient
                colors={['#000000', '#1A1A1A']}
                style={StyleSheet.absoluteFill}
            />
            
            {/* 3D Animation Background */}
            <Trial3DAnimation />
        </View>
    );
};

const TrialOfferScreen = ({ navigation }: any) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<'yearly' | 'weekly' | 'free' | 'restore' | null>(null);
  const { signInAnonymously } = useAuthStore();

  // Auto-scrolling logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    // Start auto-scroll after a slight delay
    const startAutoScroll = () => {
        interval = setInterval(() => {
            let nextIndex = activeIndex + 1;
            if (nextIndex >= FEATURES.length) {
                nextIndex = 0;
            }
            flatListRef.current?.scrollToIndex({
                index: nextIndex,
                animated: true,
            });
            setActiveIndex(nextIndex);
        }, 3000); // Change slide every 3 seconds
    };

    startAutoScroll();

    return () => clearInterval(interval);
  }, [activeIndex]);

  const handleLinkAccount = async (provider: AccountLinkProvider) => {
    try {
      setLoading(true);
      const { AccountLinkService } = await import('../services/AccountLinkService');
      const result = await AccountLinkService.linkCurrentUser(provider);
      if (!result.ok) {
        Alert.alert('Link Failed', result.message || 'Could not link your account right now.');
        return;
      }

      Alert.alert(
        'Account Linked',
        `Your purchase is now attached to your ${provider === 'apple' ? 'Apple' : 'Google'} sign-in and will restore across devices.`
      );
    } finally {
      setLoading(false);
    }
  };

  const promptForAccountLink = async () => {
    const currentUser = useAuthStore.getState().user;
    if (currentUser?.email) return;
    const { AccountLinkService } = await import('../services/AccountLinkService');

    const buttons: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'default' | 'destructive' }> = [
      { text: 'Later', style: 'cancel' },
    ];

    if (Platform.OS === 'ios' && AccountLinkService.isProviderSupported('apple')) {
      buttons.push({
        text: 'Link Apple ID',
        onPress: () => {
          void handleLinkAccount('apple');
        },
      });
    }

    if (AccountLinkService.isProviderSupported('google')) {
      buttons.push({
        text: 'Link Google',
        onPress: () => {
          void handleLinkAccount('google');
        },
      });
    }

    Alert.alert(
      'Protect Your Purchase',
      'Your subscription is active. Link it to Apple or Google so Pro restores across devices and stays mirrored in Supabase.',
      buttons
    );
  };

  const handleRestorePurchase = async () => {
    try {
      setLoading(true);
      setActiveAction('restore');
      try {
        await FirebaseAuthService.signInAnonymously();
      } catch (firebaseError) {
        console.warn('Firebase anonymous auth failed:', firebaseError);
      }
      await signInAnonymously();

      const { SubscriptionService } = await import('../services/SubscriptionService');
      const restored = await SubscriptionService.restorePurchases();

      if (!restored) {
        Alert.alert('Restore Failed', 'No previous purchase was found for this device.');
        return;
      }

      Alert.alert('Restored', 'Your purchase was restored successfully.');
      await promptForAccountLink();
    } catch (error: any) {
      Alert.alert(
        'Restore Failed',
        typeof error?.message === 'string' && error.message.trim()
          ? error.message
          : 'Could not restore purchases right now.'
      );
    } finally {
      setActiveAction(null);
      setLoading(false);
    }
  };

  const openExternalLink = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Link unavailable', 'Please try again in Safari.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Link unavailable', 'Please try again in Safari.');
    }
  };

  const bootstrapAnonymousSession = async () => {
    try {
      await FirebaseAuthService.signInAnonymously();
    } catch (firebaseError) {
      console.warn('Firebase anonymous auth failed:', firebaseError);
    }
    await signInAnonymously();
  };

  const purchasePlan = async (plan: 'yearly' | 'weekly'): Promise<boolean> => {
    const { SubscriptionService } = await import('../services/SubscriptionService');
    const resolution = await SubscriptionService.getPackageResolution(plan);
    console.log(`[TrialOffer] available ${plan} packages:`, resolution.debugPackages || 'None');

    if (resolution.targetPackage) {
      console.log(
        `[TrialOffer] selected ${plan} package:`,
        `${resolution.targetPackage.identifier} (${resolution.targetPackage.product?.identifier || 'no-product-id'}) [${(resolution.targetPackage as any)?.packageType || 'unknown'}]`
      );
      return SubscriptionService.purchasePackage(resolution.targetPackage);
    }

    const directResolution = await SubscriptionService.getDirectProductResolution(plan);
    console.log(`[TrialOffer] available ${plan} direct products:`, directResolution.debugProducts || 'None');

    if (directResolution.targetProduct) {
      console.log(
        `[TrialOffer] selected direct ${plan} product:`,
        directResolution.targetProduct.identifier
      );
      return SubscriptionService.purchaseStoreProduct(directResolution.targetProduct);
    }

    console.warn(
      `[TrialOffer] ${plan} package not found`,
      resolution.offering?.identifier || 'no-offering',
      resolution.expectedPackageIds,
      directResolution.expectedProductIds
    );
    return false;
  };

  const handlePurchase = async (plan: 'yearly' | 'weekly') => {
    try {
      setLoading(true);
      setActiveAction(plan);
      await bootstrapAnonymousSession();

      let didPurchase = false;
      try {
        didPurchase = await purchasePlan(plan);
      } catch (subError) {
        console.log(`${plan} subscription not started:`, subError);
      }

      if (didPurchase) {
        await promptForAccountLink();
      }
    } catch (err: any) {
      console.error('Silent identification error:', err);
      const message =
        typeof err?.message === 'string' && err.message.trim().length > 0
          ? err.message
          : 'Please check your internet connection and try again.';
      Alert.alert('Sign-in Error', message);
    } finally {
      setActiveAction(null);
      setLoading(false);
    }
  };

  const handleContinueFree = async () => {
    try {
      setLoading(true);
      setActiveAction('free');
      await bootstrapAnonymousSession();
    } catch (err: any) {
      console.error('Free entry sign-in error:', err);
      Alert.alert('Error', 'Please check your internet connection.');
    } finally {
      setActiveAction(null);
      setLoading(false);
    }
  };

  const renderItem = ({ item }: any) => (
    <View style={styles.slide}>
      <Animated.View
        style={[styles.iconContainer, { shadowColor: item.color }]}
        entering={allowLayoutAnimations ? FadeInDown.duration(400) : undefined}
      >
        <MaterialCommunityIcons name={item.icon} size={80} color={item.color} />
      </Animated.View>
      <Text style={styles.slideTitle}>{item.title}</Text>
      <Text style={[styles.slideSubtitle, { color: '#aaa' }]}>{item.subtitle}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <RadarScan />

      <SafeAreaView style={styles.content}>
        
        {/* Header */}
        <Animated.View entering={allowLayoutAnimations ? FadeInDown.delay(200) : undefined} style={styles.header}>
            <View style={styles.brandContainer}>
                <MaterialCommunityIcons name="radar" size={24} color="#FF5252" />
                <Text style={styles.appName}>{APP_DISPLAY_NAME.toUpperCase()}</Text>
            </View>
        </Animated.View>

        {/* Carousel */}
        <View style={styles.carouselContainer}>
            <FlatList
                ref={flatListRef}
                data={FEATURES}
                renderItem={renderItem}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(ev) => {
                    const index = Math.round(ev.nativeEvent.contentOffset.x / width);
                    setActiveIndex(index);
                }}
            />
            
            {/* Pagination Dots */}
            <View style={styles.pagination}>
                {FEATURES.map((feat, i) => (
                    <Animated.View 
                        key={i} 
                        style={[
                            styles.dot, 
                            { 
                                backgroundColor: i === activeIndex ? feat.color : '#333',
                                width: i === activeIndex ? 24 : 8 
                            }
                        ]} 
                    />
                ))}
            </View>
        </View>

        {/* Action Card */}
        <Animated.View
          entering={allowLayoutAnimations ? FadeInDown.delay(400).duration(400) : undefined}
          style={styles.footer}
        >
            <LinearGradient
                colors={['rgba(30,30,30,0.9)', 'rgba(10,10,10,0.95)']}
                style={styles.offerCard}
            >
                <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>CLEAR SUBSCRIPTION TERMS</Text>
                </View>
                <Text style={styles.trialText}>{APP_DISPLAY_NAME} Pro Yearly</Text>
                <Text style={styles.priceText}>
                  3-day free trial included, then $19.99/year. Auto-renews until cancelled.
                </Text>

                <View style={styles.offerSummary}>
                  <View style={styles.offerLine}>
                    <Text style={styles.offerLineTitle}>{APP_DISPLAY_NAME} Pro Weekly</Text>
                    <Text style={styles.offerLineBody}>
                      $3.99/week billed immediately. Auto-renews until cancelled.
                    </Text>
                  </View>
                </View>

                <TouchableOpacity 
                    style={styles.ctaButton}
                    onPress={() => {
                      void handlePurchase('yearly');
                    }}
                    disabled={loading}
                >
                    <LinearGradient
                        colors={['#FF5252', '#D32F2F']}
                        style={styles.ctaGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    >
                        {loading && activeAction === 'yearly' ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text style={styles.ctaText}>START 3-DAY FREE TRIAL</Text>
                        )}
                    </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.secondaryButton, loading && styles.secondaryButtonDisabled]}
                  onPress={() => {
                    void handlePurchase('weekly');
                  }}
                  disabled={loading}
                >
                  {loading && activeAction === 'weekly' ? (
                    <ActivityIndicator color="#F8FAFC" />
                  ) : (
                    <Text style={styles.secondaryButtonText}>GET WEEKLY PLAN</Text>
                  )}
                </TouchableOpacity>

                <Text style={styles.ctaSub}>
                  Location is requested later, when you actually start using radar and drive features.
                </Text>

                <Text style={styles.legalText}>
                  By subscribing you agree to the{' '}
                  <Text style={styles.legalLink} onPress={() => { void openExternalLink(APP_STANDARD_EULA_URL); }}>
                    Apple Standard EULA
                  </Text>
                  {' '}and our{' '}
                  <Text style={styles.legalLink} onPress={() => { void openExternalLink(APP_PRIVACY_POLICY_URL); }}>
                    Privacy Policy
                  </Text>
                  . Read our{' '}
                  <Text style={styles.legalLink} onPress={() => { void openExternalLink(APP_TERMS_URL); }}>
                    Terms & Conditions
                  </Text>
                  .
                </Text>

                <TouchableOpacity 
                    style={styles.skipBtn}
                    onPress={() => {
                      void handleContinueFree();
                    }}
                    disabled={loading}
                >
                    {loading && activeAction === 'free' ? (
                      <ActivityIndicator color="#CBD5E1" />
                    ) : (
                      <Text style={styles.skipText}>Continue Free</Text>
                    )}
                </TouchableOpacity>
            </LinearGradient>
            
            <TouchableOpacity style={styles.restoreBtn} onPress={handleRestorePurchase} disabled={loading}>
                <Text style={styles.restoreText}>
                  {loading && activeAction === 'restore' ? 'Restoring…' : 'Restore Purchase'}
                </Text>
            </TouchableOpacity>
        </Animated.View>

      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  // 3D/Radar Styles
  gridContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.2,
    transform: [{ perspective: 1000 }, { rotateX: '60deg' }, { scale: 2 }]
  },
  grid: {
    width: width * 2,
    height: height * 2,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: 'transparent',
    // In a real app, uses an image pattern or SVG for grid lines
  },
  radarContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ perspective: 1000 }, { rotateX: '45deg' }] // Adds depth tilt
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.3)',
  },
  scanner: {
    width: 600,
    height: 600,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerGradient: {
    width: 300, 
    height: 300,
    position: 'absolute',
    top: 0,
    left: 0,
    borderRightWidth: 2,
    borderColor: '#FF5252',
    transform: [{ rotate: '-45deg' }, { translateX: 150 }, { translateY: 150 }] // Half fan shape
  },

  // Content Styles
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 24,
    alignItems: 'center',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  appName: {
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 2,
    fontSize: 16,
  },
  loginLink: {
    color: '#FF5252',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  carouselContainer: {
    height: 380,
  },
  slide: {
    width: width,
    alignItems: 'center',
    padding: 20,
    justifyContent: 'center',
  },
  iconContainer: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    backgroundColor: 'transparent',
    // Note: Shadow requires bg color on iOS
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5, // Android
  },
  slideTitle: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  slideSubtitle: {
    fontSize: 18,
    textAlign: 'center',
    paddingHorizontal: 30,
    lineHeight: 26,
    fontWeight: '500',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    gap: 8,
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  footer: {
    padding: 20,
    paddingBottom: 30,
  },
  offerCard: {
    alignItems: 'center',
    padding: 25,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  planBadge: {
    backgroundColor: 'rgba(255, 82, 82, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.5)',
  },
  planBadgeText: {
    color: '#FF5252',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  trialText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  priceText: {
    color: '#94A3B8',
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  offerSummary: {
    width: '100%',
    marginBottom: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
  },
  offerLine: {
    gap: 4,
  },
  offerLineTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
  },
  offerLineBody: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
  },
  ctaButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#FF5252',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  ctaGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  ctaSub: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
  secondaryButton: {
    width: '100%',
    marginTop: 12,
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.72)',
  },
  secondaryButtonDisabled: {
    opacity: 0.75,
  },
  secondaryButtonText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  skipBtn: {
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
  },
  skipText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '700',
  },
  legalText: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 14,
  },
  legalLink: {
    color: '#9BDCF8',
    textDecorationLine: 'underline',
  },
  restoreBtn: {
    alignItems: 'center',
    marginTop: 16,
  },
  restoreText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  }
});

export default TrialOfferScreen;

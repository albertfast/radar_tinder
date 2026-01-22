import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  Dimensions, 
  Image, 
  TouchableOpacity, 
  FlatList, 
  Platform 
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { FirebaseAuthService } from '../services/FirebaseAuthService';
import { SubscriptionService } from '../services/SubscriptionService';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  Easing,
  FadeInDown,
  withSequence,
  withDelay
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');
const allowLayoutAnimations = Platform.OS !== 'android';

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
            transform: [{ scale: scale.value }],
            opacity: withRepeat(
                withSequence(
                    withTiming(0.1, { duration: 1000 }),
                    withTiming(0.3, { duration: 1000 })
                ),
                -1,
                true
            )
        };
    });

    return (
        <View style={StyleSheet.absoluteFill}>
            <LinearGradient
                colors={['#000000', '#1A1A1A']}
                style={StyleSheet.absoluteFill}
            />
            
            {/* 3D Grid Floor Effect */}
            <View style={styles.gridContainer}>
                <View style={styles.grid} />
            </View>

            {/* Radar Center */}
            <View style={styles.radarContainer}>
                 {/* Pulse Rings */}
                 <Animated.View style={[styles.pulseRing, pulseStyle, { width: 600, height: 600, borderRadius: 300 }]} />
                 <Animated.View style={[styles.pulseRing, pulseStyle, { width: 400, height: 400, borderRadius: 200 }]} />
                 
                 {/* Rotating Beam */}
                 <Animated.View style={[styles.scanner, radarStyle]}>
                    <LinearGradient
                        colors={['rgba(255, 82, 82, 0)', 'rgba(255, 82, 82, 0.4)']}
                        style={styles.scannerGradient}
                    />
                 </Animated.View>
            </View>
        </View>
    );
};

const TrialOfferScreen = ({ navigation }: any) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const [loading, setLoading] = useState(false);
  const { signInAnonymously } = useAuthStore();
  const scrollX = useSharedValue(0);

  // Auto-scrolling logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
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

  const renderItem = ({ item }: any) => (
    <View style={styles.slide}>
      <Animated.View
        style={[styles.iconContainer, { shadowColor: item.color }]}
        entering={allowLayoutAnimations ? FadeInDown.springify() : undefined}
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
                <Text style={styles.appName}>RADAR TINDER</Text>
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
          entering={allowLayoutAnimations ? FadeInDown.delay(400).springify() : undefined}
          style={styles.footer}
        >
            <LinearGradient
                colors={['rgba(30,30,30,0.9)', 'rgba(10,10,10,0.95)']}
                style={styles.offerCard}
            >
                <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>PREMIUM ACCESS</Text>
                </View>
                <Text style={styles.trialText}>3-Day Free Trial</Text>
                <Text style={styles.priceText}>Then $19.99/year. Or start weekly at $3.99/week.</Text>
                
                <TouchableOpacity 
                    style={styles.ctaButton}
                    onPress={async () => {
                        try {
                            setLoading(true);
                            
                            // 1. First sign in anonymously to create user session
                            try {
                                await FirebaseAuthService.signInAnonymously();
                            } catch (firebaseError) {
                                console.warn('Firebase anonymous auth failed:', firebaseError);
                            }
                            await signInAnonymously();
                            
                            // 2. Now try to start the subscription with free trial
                            // RevenueCat will handle the trial period
                            try {
                                const { SubscriptionService } = await import('../services/SubscriptionService');
                                const offerings = await SubscriptionService.getOfferings();
                                
                                // Find the yearly package with trial
                                const yearlyPackage = offerings?.availablePackages?.find(
                                    (p: any) => p.identifier.includes('yearly') || p.identifier.includes('annual')
                                );
                                
                                if (yearlyPackage) {
                                    await SubscriptionService.purchasePackage(yearlyPackage);
                                }
                            } catch (subError) {
                                // Subscription failed or cancelled - user continues with free tier
                                console.log('Subscription not started:', subError);
                            }
                            
                            // User enters app (authenticated now)
                        } catch (err: any) {
                            console.error('Silent identification error:', err);
                            const message =
                              typeof err?.message === 'string' && err.message.trim().length > 0
                                ? err.message
                                : 'Please check your internet connection and try again.';
                            Alert.alert('Sign-in Error', message);
                        } finally {
                            setLoading(false);
                        }
                    }}
                    disabled={loading}
                >
                    <LinearGradient
                        colors={['#FF5252', '#D32F2F']}
                        style={styles.ctaGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    >
                        {loading ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text style={styles.ctaText}>START 3-DAY FREE TRIAL</Text>
                        )}
                    </LinearGradient>
                </TouchableOpacity>
                
                <Text style={styles.ctaSub}>Unlocks all features. Weekly plan bills immediately.</Text>
                
                {/* Skip option for free tier with ads */}
                <TouchableOpacity 
                    style={styles.skipBtn}
                    onPress={async () => {
                        try {
                            setLoading(true);
                            try {
                                await FirebaseAuthService.signInAnonymously();
                            } catch (firebaseError) {
                                console.warn('Firebase anonymous auth failed:', firebaseError);
                            }
                            await signInAnonymously();
                            // User continues with free tier (will see ads)
                        } catch (err: any) {
                            console.error('Skip sign-in error:', err);
                            Alert.alert('Error', 'Please check your internet connection.');
                        } finally {
                            setLoading(false);
                        }
                    }}
                    disabled={loading}
                >
                    <Text style={styles.skipText}>Continue with Ads (Free)</Text>
                </TouchableOpacity>
            </LinearGradient>
            
            <TouchableOpacity style={styles.restoreBtn}>
                <Text style={styles.restoreText}>Restore Purchase</Text>
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
    // Note: Shadow requires bg color on iOS
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10, // Android
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
    marginBottom: 20,
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
  },
  skipBtn: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
  },
  skipText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
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

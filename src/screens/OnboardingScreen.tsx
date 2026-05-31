import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  StatusBar
} from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

interface OnboardingScreenProps {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [currentPage, setCurrentPage] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const handleNext = async () => {
    if (currentPage < 1) {
      // Animate transition
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -width,
          duration: 250,
          useNativeDriver: true,
        })
      ]).start(() => {
        setCurrentPage(1);
        slideAnim.setValue(width);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          })
        ]).start();
      });
    } else {
      await finishOnboarding();
    }
  };

  const handleSkip = async () => {
    await finishOnboarding();
  };

  const finishOnboarding = async () => {
    try {
      await AsyncStorage.setItem('has_seen_onboarding', 'true');
    } catch (e) {
      console.warn('Failed to save onboarding state:', e);
    }
    onComplete();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#0F172A', '#020617']}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Background Graphic */}
      <View style={styles.ambientGlow} />

      {/* Slide Content */}
      <Animated.View style={[
        styles.slideContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateX: slideAnim }]
        }
      ]}>
        {currentPage === 0 ? (
          <View style={styles.slide}>
            <Surface style={styles.iconWrapper} elevation={4}>
              <MaterialCommunityIcons name="navigation-variant" size={72} color="#06B6D4" />
            </Surface>
            <Text style={styles.title}>Premium Radar Navigation</Text>
            <Text style={styles.description}>
              Drive smarter with live ETA, speeds, and synchronized speed camera warnings seamlessly unified across Map, Basic, and Graphic HUD views.
            </Text>
            
            {/* Visual Mini Map Indicator */}
            <View style={styles.demoBox}>
              <MaterialCommunityIcons name="radar" size={32} color="#FF6B6B" style={styles.radarPing} />
              <Text style={styles.demoText}>Radar Camera Active Alert</Text>
            </View>
          </View>
        ) : (
          <View style={styles.slide}>
            <Surface style={styles.iconWrapper} elevation={4}>
              <MaterialCommunityIcons name="cpu-32-bit" size={72} color="#10B981" />
            </Surface>
            <Text style={styles.title}>AI Car Diagnostics</Text>
            <Text style={styles.description}>
              Instantly scan and analyze dashboard warning lights using our state-of-the-art, fully offline on-device AI. No internet needed.
            </Text>

            {/* Visual Scanner Indicator */}
            <View style={styles.demoBox}>
              <MaterialCommunityIcons name="text-box-search" size={32} color="#10B981" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={styles.scannerLine} />
                <Text style={[styles.demoText, { color: '#A7F3D0' }]}>Checking dashboard sensors...</Text>
              </View>
            </View>
          </View>
        )}
      </Animated.View>

      {/* Navigation & Controls */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        {/* Pagination Dots */}
        <View style={styles.dotContainer}>
          <View style={[styles.dot, currentPage === 0 ? styles.dotActive : null]} />
          <View style={[styles.dot, currentPage === 1 ? styles.dotActive : null]} />
        </View>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleNext} style={styles.nextButton}>
            <LinearGradient
              colors={currentPage === 0 ? ['#06B6D4', '#0891B2'] : ['#10B981', '#059669']}
              style={styles.gradientButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.buttonText}>
                {currentPage === 0 ? 'Next' : 'Get Started'}
              </Text>
              <MaterialCommunityIcons 
                name={currentPage === 0 ? "chevron-right" : "check"} 
                size={20} 
                color="white" 
                style={{ marginLeft: 6 }} 
              />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: '#020617',
  },
  ambientGlow: {
    position: 'absolute',
    top: height * 0.15,
    left: width * 0.15,
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: (width * 0.7) / 2,
    backgroundColor: '#06B6D4',
    opacity: 0.08,
    filter: 'blur(80px)',
  },
  slideContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slide: {
    width: width,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 36,
  },
  demoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#334155',
    width: width - 64,
  },
  demoText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
  },
  radarPing: {
    textShadowColor: '#FF6B6B',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  scannerLine: {
    height: 3,
    backgroundColor: '#10B981',
    borderRadius: 1.5,
    width: '100%',
    marginBottom: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  footer: {
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  dotContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#334155',
    marginHorizontal: 5,
  },
  dotActive: {
    width: 24,
    backgroundColor: '#06B6D4',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  skipButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  skipText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  gradientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

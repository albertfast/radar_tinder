import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Dimensions, Platform, UIManager } from 'react-native';
import Radar3DView from './Radar3DView';
import { logInfo } from '../utils/logger';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const SIZE = width * 0.8;

export const RadarAnimation = () => {
  const canUseRadar3D = useMemo(() => {
    if (Platform.OS !== 'android') return false;
    return !!UIManager.getViewManagerConfig?.('Radar3DView');
  }, []);

  useEffect(() => {
    if (canUseRadar3D) {
      logInfo('Radar3DView active');
    }
  }, [canUseRadar3D]);

  return (
    <View style={styles.container}>
      {canUseRadar3D ? (
        <Radar3DView style={styles.glView} />
      ) : (
        <RadarFallback />
      )}
    </View>
  );
};

const RadarFallback = () => {
  const sweep = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    sweep.value = withRepeat(
      withTiming(360, { duration: 2200, easing: Easing.linear }),
      -1,
      false
    );
    pulse.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }),
      -1,
      false
    );
  }, []);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sweep.value}deg` }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.3 + pulse.value * 0.7 }],
    opacity: 0.5 - pulse.value * 0.5,
  }));

  return (
    <View style={styles.fallbackContainer}>
      <View style={styles.radarBase} />
      <View style={styles.radarRing} />
      <View style={[styles.radarRing, styles.radarRingMid]} />
      <View style={[styles.radarRing, styles.radarRingOuter]} />
      <Animated.View style={[styles.pulseRing, pulseStyle]} />
      <Animated.View style={[styles.sweepContainer, sweepStyle]}>
        <LinearGradient
          colors={['rgba(78, 205, 196, 0.0)', 'rgba(78, 205, 196, 0.45)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.sweepBeam}
        />
      </Animated.View>
      <View style={styles.centerDot} />
      <View style={[styles.blip, { top: '28%', left: '62%' }]} />
      <View style={[styles.blip, { top: '54%', left: '22%' }]} />
      <View style={[styles.blip, { top: '70%', left: '58%' }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    width: SIZE,
    height: SIZE,
  },
  glView: {
    width: SIZE,
    height: SIZE,
    backgroundColor: 'transparent',
  },
  fallbackContainer: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarBase: {
    position: 'absolute',
    width: SIZE * 0.92,
    height: SIZE * 0.92,
    borderRadius: (SIZE * 0.92) / 2,
    backgroundColor: 'rgba(12, 20, 36, 0.9)',
    borderWidth: 2,
    borderColor: 'rgba(78, 205, 196, 0.15)',
  },
  radarRing: {
    position: 'absolute',
    width: SIZE * 0.35,
    height: SIZE * 0.35,
    borderRadius: (SIZE * 0.35) / 2,
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.35)',
  },
  radarRingMid: {
    width: SIZE * 0.58,
    height: SIZE * 0.58,
    borderRadius: (SIZE * 0.58) / 2,
    borderColor: 'rgba(78, 205, 196, 0.25)',
  },
  radarRingOuter: {
    width: SIZE * 0.8,
    height: SIZE * 0.8,
    borderRadius: (SIZE * 0.8) / 2,
    borderColor: 'rgba(78, 205, 196, 0.2)',
  },
  pulseRing: {
    position: 'absolute',
    width: SIZE * 0.9,
    height: SIZE * 0.9,
    borderRadius: (SIZE * 0.9) / 2,
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.3)',
  },
  sweepContainer: {
    position: 'absolute',
    width: SIZE * 0.9,
    height: SIZE * 0.9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sweepBeam: {
    width: SIZE * 0.45,
    height: 6,
    borderRadius: 3,
    marginLeft: SIZE * 0.22,
  },
  centerDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2196F3',
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5,
  },
  blip: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 82, 82, 0.9)',
    shadowColor: '#FF5252',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
});

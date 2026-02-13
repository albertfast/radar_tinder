import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Platform, UIManager, useWindowDimensions } from 'react-native';
import Radar3DView from './Radar3DView';
import { logInfo } from '../utils/logger';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ROTATION_TIMING, PULSE_TIMING, EASING_FUNCTIONS } from '../utils/animationConstants';

export interface RadarAnimationProps {
  size?: number;
}

export const RadarAnimation = ({ size }: RadarAnimationProps) => {
  const { width } = useWindowDimensions();
  const resolvedSize = size || Math.max(220, Math.min(Math.round(width * 0.8), 360));
  const dynamicStyles = useMemo(() => createDynamicStyles(resolvedSize), [resolvedSize]);

  const canUseRadar3D = useMemo(() => {
    if (Platform.OS !== 'android') return false;
    return !!UIManager.getViewManagerConfig?.('RTRadar3DGLView');
  }, []);

  useEffect(() => {
    if (canUseRadar3D) {
      logInfo('Java 3D radar animation active');
    }
  }, [canUseRadar3D]);

  return (
    <View style={[styles.container, dynamicStyles.container]}>
      {canUseRadar3D ? (
        <Radar3DView
          style={dynamicStyles.glView}
          rotationSpeed={1.0}
          pulseEnabled={true}
        />
      ) : (
        <RadarFallback size={resolvedSize} />
      )}
    </View>
  );
};

const RadarFallback = ({ size }: { size: number }) => {
  type Particle = {
    id: number;
    x: number;
    y: number;
    size: number;
    color: string;
  };

  const dynamicStyles = useMemo(() => createDynamicStyles(size), [size]);
  const sweep = useSharedValue(0);
  const pulse = useSharedValue(0);
  const breathing = useSharedValue(0);

  const particles = useMemo<Particle[]>(() => {
    const result: Particle[] = [];
    for (let i = 0; i < 12; i++) {
      result.push({
        id: i,
        x: Math.random() * size * 0.6 - size * 0.3,
        y: Math.random() * size * 0.4 - size * 0.2,
        size: 5 + Math.random() * 7,
        color: i % 3 === 0 ? 'rgba(255,82,82,0.9)' : 'rgba(78,205,196,0.9)',
      });
    }
    return result;
  }, [size]);

  useEffect(() => {
    sweep.value = withRepeat(
      withTiming(360, { duration: ROTATION_TIMING.SLOW, easing: EASING_FUNCTIONS.LINEAR }),
      -1,
      false
    );
    pulse.value = withRepeat(
      withTiming(1, { duration: PULSE_TIMING.SLOW, easing: EASING_FUNCTIONS.QUAD_OUT }),
      -1,
      false
    );
    breathing.value = withRepeat(
      withTiming(1, { duration: 3200, easing: EASING_FUNCTIONS.QUAD_IN_OUT }),
      -1,
      true
    );
  }, [breathing, pulse, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sweep.value}deg` }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.45 + pulse.value * 0.65 }],
    opacity: 0.35 - pulse.value * 0.25,
  }));

  const breathingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breathing.value * 0.04 }],
  }));

  return (
    <Animated.View style={[styles.fallbackContainer, dynamicStyles.fallbackContainer, breathingStyle]}>
      <View style={[styles.groundGlow, dynamicStyles.groundGlow]} />
      <View style={[styles.backGlow, dynamicStyles.backGlow]} />

      <View style={[styles.radarBase, dynamicStyles.radarBase]} />
      <View style={[styles.radarRing, dynamicStyles.radarRingSmall]} />
      <View style={[styles.radarRing, dynamicStyles.radarRingMedium]} />
      <View style={[styles.radarRing, dynamicStyles.radarRingLarge]} />

      <Animated.View style={[styles.sweepContainer, dynamicStyles.sweepContainer, sweepStyle]}>
        <LinearGradient
          colors={['rgba(78,205,196,0.0)', 'rgba(78,205,196,0.62)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.sweepBeam, dynamicStyles.sweepBeam]}
        />
      </Animated.View>

      <Animated.View style={[styles.pulseRing, dynamicStyles.pulseRing, pulseStyle]} />
      <View style={styles.centerDot} />

      {particles.map((blip) => (
        <Animated.View
          key={blip.id}
          style={[
            styles.blip,
            {
              top: size / 2 + blip.y,
              left: size / 2 + blip.x,
              width: blip.size,
              height: blip.size,
              borderRadius: blip.size / 2,
              backgroundColor: blip.color,
              shadowColor: blip.color.replace('0.9', '0.8'),
            },
          ]}
        />
      ))}
    </Animated.View>
  );
};

const createDynamicStyles = (size: number) =>
  StyleSheet.create({
    container: {
      width: size,
      height: size,
    },
    glView: {
      width: size,
      height: size,
      backgroundColor: 'transparent',
    },
    fallbackContainer: {
      width: size,
      height: size,
    },
    radarBase: {
      width: size * 0.92,
      height: size * 0.92,
      borderRadius: (size * 0.92) / 2,
    },
    radarRingSmall: {
      width: size * 0.35,
      height: size * 0.35,
      borderRadius: (size * 0.35) / 2,
    },
    radarRingMedium: {
      width: size * 0.58,
      height: size * 0.58,
      borderRadius: (size * 0.58) / 2,
    },
    radarRingLarge: {
      width: size * 0.8,
      height: size * 0.8,
      borderRadius: (size * 0.8) / 2,
    },
    pulseRing: {
      width: size * 0.9,
      height: size * 0.9,
      borderRadius: (size * 0.9) / 2,
    },
    sweepContainer: {
      width: size * 0.9,
      height: size * 0.9,
    },
    sweepBeam: {
      width: size * 0.45,
      marginLeft: size * 0.22,
    },
    groundGlow: {
      width: size * 1.15,
      height: size * 1.15,
      borderRadius: (size * 1.15) / 2,
      transform: [{ translateY: size * 0.08 }],
    },
    backGlow: {
      width: size,
      height: size,
      borderRadius: size / 2,
      transform: [{ translateY: size * 0.08 }],
    },
  });

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  radarBase: {
    position: 'absolute',
    backgroundColor: 'rgba(12, 20, 36, 0.9)',
    borderWidth: 2,
    borderColor: 'rgba(78, 205, 196, 0.15)',
  },
  radarRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.28)',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.3)',
  },
  sweepContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sweepBeam: {
    height: 6,
    borderRadius: 3,
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
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  groundGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(33, 150, 243, 0.14)',
  },
  backGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(12, 20, 36, 0.85)',
  },
});

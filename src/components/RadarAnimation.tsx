import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Dimensions, Platform, UIManager } from 'react-native';
import Radar3DView from './Radar3DView';
import { logInfo } from '../utils/logger';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ROTATION_TIMING, PULSE_TIMING, EASING_FUNCTIONS } from '../utils/animationConstants';

const { width } = Dimensions.get('window');
const SIZE = width * 0.8;

export const RadarAnimation = () => {
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
    <View style={styles.container}>
      {canUseRadar3D ? (
        <Radar3DView
          style={styles.glView}
          rotationSpeed={1.0}
          pulseEnabled={true}
        />
      ) : (
        <RadarFallback />
      )}
    </View>
  );
};

const RadarFallback = () => {
  type Particle = {
    id: number;
    x: number;
    y: number;
    size: number;
    color: string;
  };

  const sweep = useSharedValue(0);
  const pulse = useSharedValue(0);
  const rotationX = useSharedValue(0);
  const rotationY = useSharedValue(0);
  const breathing = useSharedValue(0);
  const orbit = useSharedValue(0);

  const particles = useMemo<Particle[]>(() => {
    const result: Particle[] = [];
    for (let i = 0; i < 12; i++) {
      result.push({
        id: i,
        x: Math.random() * SIZE * 0.6 - SIZE * 0.3,
        y: Math.random() * SIZE * 0.4 - SIZE * 0.2,
        size: 6 + Math.random() * 6,
        color: i % 3 === 0 ? 'rgba(255,82,82,0.9)' : 'rgba(78,205,196,0.9)',
      });
    }
    return result;
  }, []);

  const gridSlots = [0, 1, 2, 3, 4, 5];

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
    rotationX.value = withRepeat(
      withTiming(15, { duration: 4000, easing: EASING_FUNCTIONS.QUAD_IN_OUT }),
      -1,
      true
    );
    rotationY.value = withRepeat(
      withTiming(15, { duration: 6000, easing: EASING_FUNCTIONS.QUAD_IN_OUT }),
      -1,
      true
    );
    breathing.value = withRepeat(
      withTiming(1, { duration: 3200, easing: EASING_FUNCTIONS.QUAD_IN_OUT }),
      -1,
      true
    );
    orbit.value = withRepeat(
      withTiming(360, { duration: ROTATION_TIMING.FAST, easing: EASING_FUNCTIONS.LINEAR }),
      -1,
      false
    );
  }, []);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sweep.value}deg` }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.45 + pulse.value * 0.65 }],
    opacity: 0.35 - pulse.value * 0.25,
  }));

  const perspectiveStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateX: `${-6 + rotationX.value}deg` },
      { rotateY: `${rotationY.value - 6}deg` },
      { scale: 1 + breathing.value * 0.05 },
    ],
  }));

  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbit.value}deg` }],
  }));

  return (
    <Animated.View style={[styles.fallbackContainer, perspectiveStyle]}>
      <View style={styles.groundGlow} />
      <View style={styles.backGlow} />
      <Animated.View style={[styles.gridPlane, orbitStyle]}>
        {gridSlots.map((i) => (
          <View key={`v-${i}`} style={[styles.gridLine, { left: `${15 + i * 14}%` }]} />
        ))}
        {gridSlots.map((i) => (
          <View key={`h-${i}`} style={[styles.gridLine, { top: `${20 + i * 12}%`, width: '100%', height: 1 }]} />
        ))}
      </Animated.View>

      {/* 3B Derinlik Katmanları */}
      <View style={[styles.radarBase, { opacity: 0.9 }]} />
      <View style={[styles.radarBase, {
        width: SIZE * 0.85,
        height: SIZE * 0.85,
        borderRadius: (SIZE * 0.85) / 2,
        opacity: 0.6,
        backgroundColor: 'rgba(26, 47, 74, 0.8)',
        transform: [{ translateX: SIZE * 0.075 }, { translateY: SIZE * 0.075 }]
      }]} />
      <View style={[styles.radarBase, {
        width: SIZE * 0.7,
        height: SIZE * 0.7,
        borderRadius: (SIZE * 0.7) / 2,
        opacity: 0.4,
        backgroundColor: 'rgba(42, 63, 90, 0.7)',
        transform: [{ translateX: SIZE * 0.15 }, { translateY: SIZE * 0.15 }]
      }]} />
      
      {/* Radar Halkaları - 3B Efektli */}
      <View style={styles.radarRing} />
      <View style={[styles.radarRing, styles.radarRingMid]} />
      <View style={[styles.radarRing, styles.radarRingOuter]} />
      
      {/* 3B Halkalar - Dikey Gölgeler */}
      <View style={[styles.radarRing, {
        width: SIZE * 0.35,
        height: SIZE * 0.35,
        borderRadius: (SIZE * 0.35) / 2,
        borderWidth: 1,
        borderColor: 'rgba(78, 205, 196, 0.3)',
        backgroundColor: 'transparent',
        transform: [{ translateX: SIZE * 0.05 }, { translateY: 4 }]
      }]} />
      <View style={[styles.radarRing, {
        width: SIZE * 0.58,
        height: SIZE * 0.58,
        borderRadius: (SIZE * 0.58) / 2,
        borderWidth: 1,
        borderColor: 'rgba(78, 205, 196, 0.2)',
        backgroundColor: 'transparent',
        transform: [{ translateX: SIZE * 0.04 }, { translateY: 6 }]
      }]} />
      <View style={[styles.radarRing, {
        width: SIZE * 0.8,
        height: SIZE * 0.8,
        borderRadius: (SIZE * 0.8) / 2,
        borderWidth: 1,
        borderColor: 'rgba(78, 205, 196, 0.15)',
        backgroundColor: 'transparent',
        transform: [{ translateX: SIZE * 0.03 }, { translateY: 8 }]
      }]} />
      
      {/* Gelişmiş Tarama Işığı */}
      <Animated.View style={[styles.sweepContainer, sweepStyle]}>
        <LinearGradient
          colors={['rgba(78, 205, 196, 0.0)', 'rgba(78, 205, 196, 0.6)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.sweepBeam, { height: 8 }]}
        />
        {/* 3B Efekt için Işık Hüzmesi */}
        <LinearGradient
          colors={['rgba(78, 205, 196, 0.0)', 'rgba(78, 205, 196, 0.3)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.sweepBeam, {
            height: 4,
            width: SIZE * 0.3,
            opacity: 0.6,
            transform: [{ translateY: -6 }]
          }]}
        />
      </Animated.View>
      
      <Animated.View style={[styles.pulseRing, pulseStyle]} />

      {/* Orbiting halo for extra depth */}
      <Animated.View style={[styles.orbitRing, orbitStyle]}>
        <LinearGradient
          colors={['rgba(78,205,196,0.0)', 'rgba(78,205,196,0.45)', 'rgba(78,205,196,0.0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.orbitSweep}
        />
      </Animated.View>
      
      {/* Gelişmiş Merkez Noktası - 3B Efektli */}
      <View style={[styles.centerDot, {
        shadowColor: '#2196F3',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 15,
        elevation: 8
      }]} />
      <View style={[styles.centerDot, {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(33, 150, 243, 0.3)',
        transform: [{ scale: 1.5 }]
      }]} />
      
      {/* Gelişmiş Radar Hedefleri - 3B Efektli */}
      {particles.map((blip) => (
        <Animated.View
          key={blip.id}
          style={[
            styles.blip,
            {
              top: SIZE / 2 + blip.y,
              left: SIZE / 2 + blip.x,
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
    overflow: 'hidden',
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
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  groundGlow: {
    position: 'absolute',
    width: SIZE * 1.15,
    height: SIZE * 1.15,
    borderRadius: (SIZE * 1.15) / 2,
    backgroundColor: 'rgba(33, 150, 243, 0.14)',
    transform: [{ translateY: SIZE * 0.08 }],
  },
  backGlow: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: 'rgba(12, 20, 36, 0.85)',
    transform: [{ translateY: SIZE * 0.08 }],
  },
  gridPlane: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    overflow: 'hidden',
    opacity: 0.18,
    transform: [{ perspective: 1200 }, { rotateX: '64deg' }, { translateY: SIZE * 0.08 }],
  },
  gridLine: {
    position: 'absolute',
    width: 1,
    height: '100%',
    backgroundColor: '#4ECDC4',
  },
  orbitRing: {
    position: 'absolute',
    width: SIZE * 0.98,
    height: SIZE * 0.98,
    borderRadius: (SIZE * 0.98) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5,
  },
  orbitSweep: {
    width: '100%',
    height: 6,
    borderRadius: 3,
  },
});

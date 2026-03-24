import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, UIManager, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { logInfo } from '../utils/logger';
import { ROTATION_TIMING, PULSE_TIMING, EASING_FUNCTIONS } from '../utils/animationConstants';
import RadarLife3DView, { RadarLifeThemeVariant } from './RadarLife3DView';

export type RadarRendererMode = 'auto' | 'legacy2d' | 'life3d';

export interface RadarAnimationProps {
  size?: number;
  preferFallback?: boolean;
  rendererMode?: RadarRendererMode;
  artPreset?: RadarLifeThemeVariant;
  signalLevel?: number;
  dangerLevel?: number;
  rotationSpeed?: number;
  pulseEnabled?: boolean;
  paused?: boolean;
}

const clamp01 = (value: number) => Math.max(0, Math.min(value, 1));

const normalizeRendererMode = (value?: string | null): RadarRendererMode => {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'life3d') return 'life3d';
  if (normalized === 'auto') return 'auto';
  return 'legacy2d';
};

const ENV_RENDERER_MODE = normalizeRendererMode(process.env.EXPO_PUBLIC_RADAR_RENDERER);

export const RadarAnimation = ({
  size,
  preferFallback = false,
  rendererMode,
  artPreset = 'contour_orbit',
  signalLevel = 0,
  dangerLevel = 0,
  rotationSpeed = 1,
  pulseEnabled = true,
  paused = false,
}: RadarAnimationProps) => {
  const { width } = useWindowDimensions();
  const resolvedSize = size || Math.max(220, Math.min(Math.round(width * 0.8), 360));
  const dynamicStyles = useMemo(() => createDynamicStyles(resolvedSize), [resolvedSize]);

  const canUseLife3D = useMemo(() => {
    return !!UIManager.getViewManagerConfig?.('RTRadarLife3DView');
  }, []);

  const selectedMode = rendererMode || ENV_RENDERER_MODE;
  const shouldUseLife3D = useMemo(() => {
    if (preferFallback) return false;
    if (selectedMode === 'legacy2d') return false;
    if (selectedMode === 'auto') return canUseLife3D;
    return canUseLife3D;
  }, [canUseLife3D, preferFallback, selectedMode]);

  useEffect(() => {
    if (shouldUseLife3D) {
      logInfo('Life3D radar renderer active');
    } else if (selectedMode === 'life3d' && !canUseLife3D) {
      logInfo('Life3D requested but native view unavailable, using legacy 2D fallback');
    }
  }, [canUseLife3D, selectedMode, shouldUseLife3D]);

  return (
    <View style={[styles.container, dynamicStyles.container]}>
      {shouldUseLife3D ? (
        <RadarLife3DView
          style={dynamicStyles.glView}
          rotationSpeed={rotationSpeed}
          pulseEnabled={pulseEnabled}
          signalLevel={clamp01(signalLevel)}
          dangerLevel={clamp01(dangerLevel)}
          themeVariant={artPreset}
          paused={paused}
        />
      ) : (
        <RadarFallback size={resolvedSize} signalLevel={signalLevel} dangerLevel={dangerLevel} />
      )}
    </View>
  );
};

const RadarFallback = ({
  size,
  signalLevel,
  dangerLevel,
}: {
  size: number;
  signalLevel: number;
  dangerLevel: number;
}) => {
  type Particle = {
    id: number;
    x: number;
    y: number;
    size: number;
    depth: number;
    color: string;
    shadowColor: string;
    opacity: number;
  };

  const dynamicStyles = useMemo(() => createDynamicStyles(size), [size]);
  const globeSize = size * 0.9 * 0.82;
  const globeCenter = globeSize / 2;
  const sweep = useSharedValue(0);
  const pulse = useSharedValue(0);
  const breathing = useSharedValue(0);
  const orbit = useSharedValue(0);

  const particles = useMemo<Particle[]>(() => {
    const result: Particle[] = [];
    const count = 18 + Math.round(clamp01(signalLevel) * 18);
    const radius = size * 0.34;
    const dangerChance = clamp01(0.18 + dangerLevel * 0.62);

    for (let i = 0; i < count; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const distance = Math.cbrt(0.12 + Math.random() * 0.88);
      const x3d = Math.sin(phi) * Math.cos(theta) * distance;
      const y3d = Math.cos(phi) * distance;
      const z3d = Math.sin(phi) * Math.sin(theta) * distance;
      const depth = clamp01((z3d + 1) / 2);
      const isDanger = Math.random() < dangerChance;
      const particleSize = (2.4 + Math.random() * 2.2 + dangerLevel * 1.2) * (0.75 + depth * 0.95);

      const alpha = isDanger ? 0.42 + depth * 0.52 : 0.3 + depth * 0.56;
      const color = isDanger
        ? `rgba(255, 96, 92, ${alpha.toFixed(3)})`
        : `rgba(78, 205, 196, ${alpha.toFixed(3)})`;

      result.push({
        id: i,
        x: x3d * radius * 0.95,
        y: y3d * radius * 0.56 + z3d * radius * 0.16,
        depth,
        size: particleSize,
        color,
        shadowColor: isDanger ? 'rgba(255, 96, 92, 0.85)' : 'rgba(78, 205, 196, 0.85)',
        opacity: 0.34 + depth * 0.66,
      });
    }
    return result;
  }, [dangerLevel, signalLevel, size]);

  const rearParticles = useMemo(() => particles.filter((particle) => particle.depth < 0.5), [particles]);
  const frontParticles = useMemo(() => particles.filter((particle) => particle.depth >= 0.5), [particles]);

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
    orbit.value = withRepeat(
      withTiming(360, { duration: Math.round(ROTATION_TIMING.SLOW * 1.35), easing: EASING_FUNCTIONS.LINEAR }),
      -1,
      false
    );
  }, [breathing, orbit, pulse, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sweep.value}deg` }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.44 + pulse.value * 0.64 }],
    opacity: 0.32 - pulse.value * 0.24,
  }));

  const breathingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breathing.value * 0.03 }],
  }));

  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbit.value}deg` }],
  }));

  return (
    <Animated.View style={[styles.fallbackContainer, dynamicStyles.fallbackContainer, breathingStyle]}>
      <View style={[styles.outerGlow, dynamicStyles.outerGlow]} />
      <View style={[styles.circleMask, dynamicStyles.circleMask]}>
        <LinearGradient
          colors={['rgba(39, 171, 200, 0.18)', 'rgba(7, 18, 34, 0.9)']}
          start={{ x: 0.4, y: 0 }}
          end={{ x: 0.6, y: 1 }}
          style={[styles.sphereBackdrop, dynamicStyles.sphereBackdrop]}
        />
        <View style={[styles.backGlow, dynamicStyles.backGlow]} />
        <View style={[styles.horizonGlow, dynamicStyles.horizonGlow]} />
        <View style={[styles.radarBase, dynamicStyles.radarBase]} />

        <Animated.View style={[styles.globePlane, dynamicStyles.globePlane, orbitStyle]}>
          <View style={[styles.ellipseRing, dynamicStyles.ellipseRingInner]} />
          <View style={[styles.ellipseRing, dynamicStyles.ellipseRingMiddle]} />
          <View style={[styles.ellipseRing, dynamicStyles.ellipseRingOuter]} />
          <View style={[styles.meridianArc, dynamicStyles.meridianArcWide]} />
          <View style={[styles.meridianArc, styles.meridianArcTilted, dynamicStyles.meridianArcWide]} />
          <View style={[styles.meridianArc, styles.meridianArcTight, dynamicStyles.meridianArcTight]} />
          {rearParticles.map((particle) => (
            <View
              key={`rear-${particle.id}`}
              style={[
                styles.blip,
                {
                  top: globeCenter + particle.y - particle.size / 2,
                  left: globeCenter + particle.x - particle.size / 2,
                  width: particle.size,
                  height: particle.size,
                  borderRadius: particle.size / 2,
                  opacity: particle.opacity * 0.72,
                  backgroundColor: particle.color,
                  shadowColor: particle.shadowColor,
                },
              ]}
            />
          ))}
        </Animated.View>

        <Animated.View style={[styles.sweepContainer, dynamicStyles.sweepContainer, sweepStyle]}>
          <LinearGradient
            colors={['rgba(78, 205, 196, 0)', 'rgba(78, 205, 196, 0.26)', 'rgba(78, 205, 196, 0.72)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.sweepBeam, dynamicStyles.sweepBeam]}
          />
        </Animated.View>

        <Animated.View style={[styles.pulseRing, dynamicStyles.pulseRing, pulseStyle]} />
        <Animated.View style={[styles.globePlane, dynamicStyles.globePlane, orbitStyle]}>
          {frontParticles.map((particle) => (
            <View
              key={`front-${particle.id}`}
              style={[
                styles.blip,
                {
                  top: globeCenter + particle.y - particle.size / 2,
                  left: globeCenter + particle.x - particle.size / 2,
                  width: particle.size,
                  height: particle.size,
                  borderRadius: particle.size / 2,
                  opacity: particle.opacity,
                  backgroundColor: particle.color,
                  shadowColor: particle.shadowColor,
                },
              ]}
            />
          ))}
        </Animated.View>
        <View style={[styles.centerBloom, dynamicStyles.centerBloom]} />
        <View style={styles.centerDot} />
        <LinearGradient
          colors={['rgba(0, 0, 0, 0)', 'rgba(0, 8, 18, 0.44)']}
          start={{ x: 0.5, y: 0.55 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.vignette, dynamicStyles.vignette]}
        />
      </View>
    </Animated.View>
  );
};

const createDynamicStyles = (size: number) => {
  const disk = size * 0.9;
  const globe = disk * 0.82;

  return StyleSheet.create({
    container: {
      width: size,
      height: size,
      borderRadius: size / 2,
      overflow: 'hidden',
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
    circleMask: {
      width: disk,
      height: disk,
      borderRadius: disk / 2,
    },
    sphereBackdrop: {
      width: disk,
      height: disk,
      borderRadius: disk / 2,
    },
    horizonGlow: {
      width: globe * 1.06,
      height: globe * 0.42,
      borderRadius: globe * 0.22,
    },
    radarBase: {
      width: disk * 0.96,
      height: disk * 0.96,
      borderRadius: (disk * 0.96) / 2,
    },
    globePlane: {
      width: globe,
      height: globe,
    },
    ellipseRingInner: {
      width: globe * 0.44,
      height: globe * 0.44,
      borderRadius: (globe * 0.44) / 2,
    },
    ellipseRingMiddle: {
      width: globe * 0.66,
      height: globe * 0.66,
      borderRadius: (globe * 0.66) / 2,
    },
    ellipseRingOuter: {
      width: globe * 0.88,
      height: globe * 0.88,
      borderRadius: (globe * 0.88) / 2,
    },
    meridianArcWide: {
      width: globe * 0.46,
      height: globe * 0.9,
      borderRadius: (globe * 0.9) / 2,
    },
    meridianArcTight: {
      width: globe * 0.26,
      height: globe * 0.9,
      borderRadius: (globe * 0.9) / 2,
    },
    pulseRing: {
      width: globe * 0.92,
      height: globe * 0.92,
      borderRadius: (globe * 0.92) / 2,
    },
    sweepContainer: {
      width: globe * 0.96,
      height: globe * 0.96,
    },
    sweepBeam: {
      width: globe * 0.64,
      marginLeft: globe * 0.26,
    },
    outerGlow: {
      width: size,
      height: size,
      borderRadius: size / 2,
    },
    backGlow: {
      width: disk,
      height: disk,
      borderRadius: disk / 2,
    },
    centerBloom: {
      width: globe * 0.22,
      height: globe * 0.22,
      borderRadius: (globe * 0.22) / 2,
    },
    vignette: {
      width: disk,
      height: disk,
      borderRadius: disk / 2,
    },
  });
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleMask: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sphereBackdrop: {
    position: 'absolute',
  },
  outerGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
  },
  backGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(8, 17, 32, 0.92)',
  },
  horizonGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(45, 198, 208, 0.16)',
    transform: [{ translateY: -8 }],
  },
  radarBase: {
    position: 'absolute',
    backgroundColor: 'rgba(8, 15, 30, 0.9)',
    borderWidth: 2,
    borderColor: 'rgba(78, 205, 196, 0.18)',
  },
  globePlane: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ellipseRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.34)',
    transform: [{ scaleY: 0.56 }],
  },
  meridianArc: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.16)',
    transform: [{ scaleX: 0.32 }],
  },
  meridianArcTilted: {
    transform: [{ scaleX: 0.32 }, { rotate: '22deg' }],
  },
  meridianArcTight: {
    transform: [{ scaleX: 0.24 }, { rotate: '-18deg' }],
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.28)',
  },
  sweepContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sweepBeam: {
    height: 10,
    borderRadius: 5,
  },
  centerBloom: {
    position: 'absolute',
    backgroundColor: 'rgba(71, 203, 208, 0.28)',
  },
  centerDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2196F3',
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 10,
    elevation: 6,
  },
  blip: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 6,
    elevation: 4,
  },
  vignette: {
    position: 'absolute',
  },
});

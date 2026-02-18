import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Platform, UIManager, useWindowDimensions } from 'react-native';
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
    if (Platform.OS !== 'android') return false;
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
    color: string;
  };

  const dynamicStyles = useMemo(() => createDynamicStyles(size), [size]);
  const sweep = useSharedValue(0);
  const pulse = useSharedValue(0);
  const breathing = useSharedValue(0);

  const particles = useMemo<Particle[]>(() => {
    const result: Particle[] = [];
    const count = 10 + Math.round(clamp01(signalLevel) * 8);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = (0.12 + Math.random() * 0.74) * size * 0.42;
      const isDanger = Math.random() < clamp01(0.25 + dangerLevel * 0.55);
      const blipSize = 4 + Math.random() * 6 + dangerLevel * 2;
      result.push({
        id: i,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        size: blipSize,
        color: isDanger ? 'rgba(255,82,82,0.92)' : 'rgba(78,205,196,0.92)',
      });
    }
    return result;
  }, [dangerLevel, signalLevel, size]);

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
    transform: [{ scale: 0.44 + pulse.value * 0.64 }],
    opacity: 0.32 - pulse.value * 0.24,
  }));

  const breathingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breathing.value * 0.03 }],
  }));

  return (
    <Animated.View style={[styles.fallbackContainer, dynamicStyles.fallbackContainer, breathingStyle]}>
      <View style={[styles.outerGlow, dynamicStyles.outerGlow]} />
      <View style={[styles.circleMask, dynamicStyles.circleMask]}>
        <View style={[styles.backGlow, dynamicStyles.backGlow]} />
        <View style={[styles.radarBase, dynamicStyles.radarBase]} />
        <View style={[styles.radarRing, dynamicStyles.radarRingSmall]} />
        <View style={[styles.radarRing, dynamicStyles.radarRingMedium]} />
        <View style={[styles.radarRing, dynamicStyles.radarRingLarge]} />

        <Animated.View style={[styles.sweepContainer, dynamicStyles.sweepContainer, sweepStyle]}>
          <LinearGradient
            colors={['rgba(78,205,196,0)', 'rgba(78,205,196,0.68)']}
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
                shadowColor: blip.color.replace('0.92', '0.8'),
              },
            ]}
          />
        ))}
      </View>
    </Animated.View>
  );
};

const createDynamicStyles = (size: number) => {
  const disk = size * 0.9;
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
    radarBase: {
      width: disk * 0.96,
      height: disk * 0.96,
      borderRadius: (disk * 0.96) / 2,
    },
    radarRingSmall: {
      width: disk * 0.32,
      height: disk * 0.32,
      borderRadius: (disk * 0.32) / 2,
    },
    radarRingMedium: {
      width: disk * 0.56,
      height: disk * 0.56,
      borderRadius: (disk * 0.56) / 2,
    },
    radarRingLarge: {
      width: disk * 0.78,
      height: disk * 0.78,
      borderRadius: (disk * 0.78) / 2,
    },
    pulseRing: {
      width: disk * 0.9,
      height: disk * 0.9,
      borderRadius: (disk * 0.9) / 2,
    },
    sweepContainer: {
      width: disk * 0.9,
      height: disk * 0.9,
    },
    sweepBeam: {
      width: disk * 0.46,
      marginLeft: disk * 0.22,
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
  outerGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
  },
  backGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(12, 20, 36, 0.92)',
  },
  radarBase: {
    position: 'absolute',
    backgroundColor: 'rgba(10, 16, 32, 0.92)',
    borderWidth: 2,
    borderColor: 'rgba(78, 205, 196, 0.16)',
  },
  radarRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.3)',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.34)',
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
});

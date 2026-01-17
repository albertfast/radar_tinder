import React from 'react';
import { StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

interface GlassmorphismProps {
  children?: React.ReactNode;
  intensity?: number;
  style?: ViewStyle;
  colors?: string[];
}

/**
 * Glassmorphism component with frosted glass effect
 * Uses BlurView + gradient for premium aesthetic
 */
export const GlassmorphicCard: React.FC<GlassmorphismProps> = ({
  children,
  intensity = 90,
  style,
  colors = ['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.05)'],
}) => {
  return (
    <BlurView intensity={intensity} style={[styles.blur, style]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {children}
      </LinearGradient>
    </BlurView>
  );
};

/**
 * Neumorphic button with glassmorphism effect
 */
export const GlassmorphicButton: React.FC<any> = ({
  children,
  onPress,
  style,
  intensity = 80,
}) => {
  return (
    <BlurView intensity={intensity}>
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.05)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.button, style]}
      >
        <TouchableOpacity onPress={onPress}>
          {children}
        </TouchableOpacity>
      </LinearGradient>
    </BlurView>
  );
};

/**
 * Animated gradient background with glassmorphism overlay
 */
export const AnimatedGradientBackground = ({
  colors = ['#0F172A', '#020617'],
  children,
}: any) => {
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fullScreen}
    >
      {/* Glassmorphic overlay */}
      <BlurView intensity={20} style={styles.overlay} />
      {children}
    </LinearGradient>
  );
};

/**
 * Card with glassmorphism + gradient border effect
 */
export const GlassmorphicCardWithBorder: React.FC<any> = ({
  children,
  borderColor = 'rgba(78, 205, 196, 0.3)',
  style,
}) => {
  return (
    <BlurView intensity={85} style={[styles.cardWithBorder, style]}>
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.03)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.gradient,
          {
            borderWidth: 1,
            borderColor: borderColor,
          },
        ]}
      >
        {children}
      </LinearGradient>
    </BlurView>
  );
};

const styles = StyleSheet.create({
  blur: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  gradient: {
    padding: 16,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  fullScreen: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardWithBorder: {
    borderRadius: 12,
    overflow: 'hidden',
  },
});

export default {
  GlassmorphicCard,
  GlassmorphicButton,
  AnimatedGradientBackground,
  GlassmorphicCardWithBorder,
};

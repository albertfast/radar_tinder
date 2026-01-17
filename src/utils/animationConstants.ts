/**
 * Centralized animation timing and easing constants
 * Used across the app for consistent animation behavior
 */

import { Easing } from 'react-native-reanimated';

// Animation Durations (milliseconds)
export const ANIMATION_TIMING = {
  INSTANT: 0,
  MICRO: 150,     // Quick feedback for micro interactions (hover, tap)
  FAST: 200,      // Fast transitions (fade, scale)
  BASE: 220,      // Standard transitions (default)
  SLOW: 300,      // Slow transitions (complex animations)
  SLOWER: 400,    // Slower for entrance animations
  LONG: 500,      // Long animations (carousel, slides)
  EXTRA_LONG: 800, // Extra long for dramatic effects
};

// Easing Functions
export const EASING_FUNCTIONS = {
  IN: Easing.in(Easing.cubic),
  OUT: Easing.out(Easing.cubic),
  IN_OUT: Easing.inOut(Easing.cubic),
  LINEAR: Easing.linear,
  QUAD_IN: Easing.in(Easing.quad),
  QUAD_OUT: Easing.out(Easing.quad),
  QUAD_IN_OUT: Easing.inOut(Easing.quad),
  ELASTIC: Easing.elastic(1.2),
  BOUNCE: Easing.bounce,
};

// Spring Animation Configs
export const SPRING_CONFIGS = {
  GENTLE: {
    damping: 12,
    stiffness: 90,
    mass: 1,
    overshootClamping: true,
  },
  NORMAL: {
    damping: 10,
    stiffness: 100,
    mass: 1,
    overshootClamping: false,
  },
  BOUNCY: {
    damping: 8,
    stiffness: 120,
    mass: 1,
    overshootClamping: false,
  },
  STIFF: {
    damping: 15,
    stiffness: 150,
    mass: 1,
    overshootClamping: true,
  },
};

// Animation Presets
export const ANIMATION_PRESETS = {
  // Fade animations
  FADE_IN: {
    duration: ANIMATION_TIMING.BASE,
    easing: EASING_FUNCTIONS.OUT,
  },
  FADE_OUT: {
    duration: ANIMATION_TIMING.FAST,
    easing: EASING_FUNCTIONS.IN,
  },

  // Scale animations
  SCALE_IN: {
    duration: ANIMATION_TIMING.SLOW,
    easing: EASING_FUNCTIONS.QUAD_OUT,
  },
  SCALE_OUT: {
    duration: ANIMATION_TIMING.FAST,
    easing: EASING_FUNCTIONS.QUAD_IN,
  },

  // Slide animations
  SLIDE_IN_UP: {
    duration: ANIMATION_TIMING.BASE,
    easing: EASING_FUNCTIONS.OUT,
  },
  SLIDE_IN_DOWN: {
    duration: ANIMATION_TIMING.BASE,
    easing: EASING_FUNCTIONS.OUT,
  },
  SLIDE_IN_LEFT: {
    duration: ANIMATION_TIMING.SLOW,
    easing: EASING_FUNCTIONS.OUT,
  },
  SLIDE_IN_RIGHT: {
    duration: ANIMATION_TIMING.SLOW,
    easing: EASING_FUNCTIONS.OUT,
  },

  // Tab transitions
  TAB_ENTER: {
    duration: ANIMATION_TIMING.SLOW,
    easing: EASING_FUNCTIONS.OUT,
  },
  TAB_EXIT: {
    duration: ANIMATION_TIMING.FAST,
    easing: EASING_FUNCTIONS.IN,
  },

  // Alert animations
  ALERT_ENTER: {
    duration: ANIMATION_TIMING.BASE,
    easing: EASING_FUNCTIONS.QUAD_OUT,
  },
  ALERT_EXIT: {
    duration: ANIMATION_TIMING.FAST,
    easing: EASING_FUNCTIONS.QUAD_IN,
  },

  // List item stagger
  LIST_ITEM_DELAY_BASE: 30, // ms delay between items
};

// Layout Animation Delays (for staggered animations)
export const STAGGER_DELAYS = {
  ITEM_BASE: 30,   // 30ms between list items
  ITEM_SLOW: 50,   // 50ms for slower animations
  ITEM_FAST: 20,   // 20ms for quick sequences
};

// Rotation Durations (for spinning loaders, etc)
export const ROTATION_TIMING = {
  SLOW: 2200,      // 2.2s full rotation (radar sweep)
  NORMAL: 2000,    // 2s full rotation
  FAST: 1500,      // 1.5s full rotation
};

// Pulse/Heartbeat Animations
export const PULSE_TIMING = {
  SLOW: 1800,      // Slow pulse
  NORMAL: 1500,    // Normal pulse
  FAST: 1000,      // Fast pulse
};

export default {
  ANIMATION_TIMING,
  EASING_FUNCTIONS,
  SPRING_CONFIGS,
  ANIMATION_PRESETS,
  STAGGER_DELAYS,
  ROTATION_TIMING,
  PULSE_TIMING,
};

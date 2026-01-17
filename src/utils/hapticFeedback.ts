let Haptics: any = null;
let HapticFeedbackStyle: any = null;

// Gracefully handle missing haptics module
try {
  const hapticModule = require('expo-haptics');
  Haptics = hapticModule.default || hapticModule.Haptics || hapticModule;
  HapticFeedbackStyle = hapticModule.HapticFeedbackStyle;
} catch (error) {
  console.log('Haptics module not available, using no-op fallbacks');
}

export const HapticPatterns = {
  // Light tap feedback
  light: async () => {
    try {
      if (Haptics?.notificationAsync) {
        await Haptics.notificationAsync(HapticFeedbackStyle?.Light || 2);
      }
    } catch (error) {
      // Silently fail if haptics not available
    }
  },

  // Medium feedback for button presses
  medium: async () => {
    try {
      if (Haptics?.notificationAsync) {
        await Haptics.notificationAsync(HapticFeedbackStyle?.Medium || 1);
      }
    } catch (error) {
      // Silently fail if haptics not available
    }
  },

  // Strong feedback for important actions
  heavy: async () => {
    try {
      if (Haptics?.notificationAsync) {
        await Haptics.notificationAsync(HapticFeedbackStyle?.Heavy || 0);
      }
    } catch (error) {
      // Silently fail if haptics not available
    }
  },

  // Success pattern (double tap)
  success: async () => {
    try {
      if (Haptics?.notificationAsync) {
        await Haptics.notificationAsync(HapticFeedbackStyle?.Medium || 1);
        await new Promise(resolve => setTimeout(resolve, 100));
        await Haptics.notificationAsync(HapticFeedbackStyle?.Medium || 1);
      }
    } catch (error) {
      // Silently fail if haptics not available
    }
  },

  // Warning pattern (long hold)
  warning: async () => {
    try {
      if (Haptics?.notificationAsync) {
        await Haptics.notificationAsync(HapticFeedbackStyle?.Heavy || 0);
        await new Promise(resolve => setTimeout(resolve, 150));
        await Haptics.notificationAsync(HapticFeedbackStyle?.Heavy || 0);
      }
    } catch (error) {
      // Silently fail if haptics not available
    }
  },

  // Error pattern (triple quick)
  error: async () => {
    try {
      if (Haptics?.notificationAsync) {
        await Haptics.notificationAsync(HapticFeedbackStyle?.Heavy || 0);
        await new Promise(resolve => setTimeout(resolve, 80));
        await Haptics.notificationAsync(HapticFeedbackStyle?.Heavy || 0);
        await new Promise(resolve => setTimeout(resolve, 80));
        await Haptics.notificationAsync(HapticFeedbackStyle?.Heavy || 0);
      }
    } catch (error) {
      // Silently fail if haptics not available
    }
  },

  // Selection feedback (small tap)
  selection: async () => {
    try {
      if (Haptics?.selectionAsync) {
        await Haptics.selectionAsync();
      }
    } catch (error) {
      // Silently fail if haptics not available
    }
  },
};

export default HapticPatterns;

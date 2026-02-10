import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { NavigationContainer, DarkTheme as NavigationDarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppState, View, ActivityIndicator, Dimensions } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';

// Reanimated compatibility check and polyfill for both iOS and Android
console.log('Setting up Reanimated compatibility...');

// Check if we're running in a Reanimated 4 environment
const reanimatedVersion = (Reanimated as any).version || 'unknown';
console.log('Reanimated version:', reanimatedVersion);

// Platform-specific compatibility fixes
import { Platform } from 'react-native';

// Disable Reanimated 4 features that cause issues
if (reanimatedVersion.startsWith('4.')) {
  console.warn('Reanimated 4 detected, applying compatibility fixes...');
  
  // Android-specific fixes
  if (Platform.OS === 'android') {
    console.log('Applying Android-specific Reanimated fixes...');
    
    // Force disable Reanimated 4 on Android by replacing it with basic Animated
    if (typeof require !== 'undefined') {
      try {
        const { Animated } = require('react-native');
        
        // Replace Reanimated with basic Animated for Android
        (Reanimated as any).createAnimatedComponent = Animated.createAnimatedComponent;
        (Reanimated as any).useSharedValue = (initial: any) => new Animated.Value(initial);
        (Reanimated as any).useAnimatedStyle = (animatedProps: any) => ({
          transform: animatedProps.transform || [],
        });
        (Reanimated as any).withTiming = Animated.timing;
        (Reanimated as any).withSpring = Animated.spring;
        (Reanimated as any).Easing = Animated.Easing;
        
        // Create a simple animation hook for Android
        (Reanimated as any).useAnimatedGestureHandler = (config: any) => {
          console.log('Using Animated gesture handler fallback for Android');
          return {
            onStart: config.onStart || (() => {}),
            onActive: config.onActive || (() => {}),
            onEnd: config.onEnd || (() => {})
          };
        };
        
        console.log('Reanimated successfully replaced with Animated fallback for Android');
      } catch (e) {
        console.warn('Could not set up Animated fallback for Android:', e);
      }
    }
  }
  
  // iOS-specific fixes
  if (Platform.OS === 'ios') {
    console.log('Applying iOS-specific Reanimated fixes...');
    
    // Disable useAnimatedGestureHandler polyfill for React Native 0.76+
    if (typeof require !== 'undefined') {
      try {
        const reactNativeVersion = require('react-native').NativeModules?.RNDeviceInfo?.systemVersion || '0.76';
        if (reactNativeVersion >= '0.76') {
          console.log('React Native 0.76+ detected, removing Reanimated 4 polyfill');
          delete (Reanimated as any).useAnimatedGestureHandler;
        }
      } catch (e) {
        console.warn('Could not check React Native version:', e);
      }
    }
  }
}

// Comprehensive Reanimated compatibility fixes
if (!(Reanimated as any).useAnimatedGestureHandler) {
  console.warn('Reanimated useAnimatedGestureHandler not found, using polyfill');
  (Reanimated as any).useAnimatedGestureHandler = (handlers: any) => {
    const { useEvent, runOnJS } = Reanimated;
    const context = React.useRef({}).current;

    return useEvent(
      (event: any) => {
        'worklet';
        const { state } = event;
        
        if (state === 2 && handlers.onStart) runOnJS(handlers.onStart)(event, context);
        if (state === 4 && handlers.onActive) runOnJS(handlers.onActive)(event, context);
        if (state === 5 && handlers.onEnd) runOnJS(handlers.onEnd)(event, context);
        if (state === 1 && handlers.onFail) runOnJS(handlers.onFail)(event, context);
        if (state === 3 && handlers.onCancel) runOnJS(handlers.onCancel)(event, context);
        if (handlers.onFinish) {
          runOnJS(handlers.onFinish)(event, context, state === 5 || state === 1 || state === 3);
        }
      },
      ['onGestureHandlerEvent', 'onGestureHandlerStateChange']
    );
  };
}

// Add fallback for critical animations
if (!(Reanimated as any).clock) {
  (Reanimated as any).clock = {
    start: () => {},
    stop: () => {},
    attach: () => {},
    detach: () => {},
  };
}

// Disable Reanimated animations if not compatible
if (!reanimatedVersion || reanimatedVersion.startsWith('4.')) {
  console.warn('Reanimated 4 detected, which may have compatibility issues');
  
  // Add additional fallbacks
  if (!(Reanimated as any).runOnJS) {
    (Reanimated as any).runOnJS = (fn: any) => fn;
  }
  
  if (!(Reanimated as any).useSharedValue) {
    (Reanimated as any).useSharedValue = (initial: any) => React.useState(initial)[0];
  }
  
  if (!(Reanimated as any).useAnimatedStyle) {
    (Reanimated as any).useAnimatedStyle = () => ({});
  }
  
  if (!(Reanimated as any).withTiming) {
    (Reanimated as any).withTiming = (value: any) => value;
  }
  
  if (!(Reanimated as any).withSpring) {
    (Reanimated as any).withSpring = (value: any) => value;
  }
}

// Log compatibility status
console.log('Reanimated compatibility setup completed');
import { 
  MaterialCommunityIcons, 
  Ionicons, 
  FontAwesome, 
  FontAwesome5, 
  MaterialIcons,
  Feather,
  AntDesign,
  Entypo
} from '@expo/vector-icons';

import MainDrawerNavigator from './src/navigation/MainDrawerNavigator';
import ReportRadarScreen from './src/screens/ReportRadarScreen';
import { useAuthStore } from './src/store/authStore';
import { darkTheme } from './src/utils/theme';
import { BackgroundService } from './src/services/BackgroundService';
import { AnalyticsService } from './src/services/AnalyticsService';
import { CrashReportingService } from './src/services/CrashReportingService';
import { OfflineService } from './src/services/OfflineService';
import { AdService } from './src/services/AdService';
import { SubscriptionService } from './src/services/SubscriptionService';
import { FirebaseAuthService } from './src/services/FirebaseAuthService';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { supabase } from './utils/supabase';

const Stack = createNativeStackNavigator();

// Optimized QueryClient with caching strategies
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (cacheTime is deprecated, use gcTime)
      retry: (failureCount, error: any) => {
        // Don't retry on 404s or authentication errors
        if (error?.status === 404 || error?.message?.includes('auth')) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: 1,
    },
  },
});

// Keep splash screen visible while loading
SplashScreen.preventAutoHideAsync().catch(() => {});

// Combine Paper dark theme with Navigation dark theme
const combinedDarkTheme = {
  ...NavigationDarkTheme,
  ...darkTheme,
  colors: {
    ...NavigationDarkTheme.colors,
    ...darkTheme.colors,
  },
};

const prefix = Linking.createURL('/');

export default function App() {
  const { isAuthenticated, user } = useAuthStore();
  
  // Load all icon fonts using useFonts hook
  const [fontsLoaded] = useFonts({
    ...MaterialCommunityIcons.font,
    ...Ionicons.font,
    ...FontAwesome.font,
    ...FontAwesome5.font,
    ...MaterialIcons.font,
    ...Feather.font,
    ...AntDesign.font,
    ...Entypo.font,
  });

  // Memoized onLayoutRootView to prevent unnecessary re-renders
  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // Memoized screen options for Stack Navigator
  const stackScreenOptions = useMemo(() => ({
    headerShown: false,
    gestureEnabled: true,
  }), []);

  // Optimized service initialization with error boundaries
  useEffect(() => {
    // Initialize services with proper error isolation
    const initializeServices = async () => {
      // Initialize crash reporting first (but don't let it crash the app)
      try {
        await CrashReportingService.init();
      } catch (error) {
        console.error('Error initializing crash reporting:', error);
      }

      // Initialize other services with individual error handling
      try {
        await AnalyticsService.init();
      } catch (error) {
        console.error('Error initializing analytics:', error);
      }

      try {
        await OfflineService.init();
      } catch (error) {
        console.error('Error initializing offline service:', error);
      }

      try {
        await BackgroundService.init();
      } catch (error) {
        console.error('Error initializing background service:', error);
      }

      try {
        await AdService.init();
      } catch (error) {
        console.error('Error initializing ad service:', error);
      }

      try {
        await SubscriptionService.init();
      } catch (error) {
        console.error('Error initializing subscription service:', error);
      }

      try {
        FirebaseAuthService.configureGoogle();
      } catch (error) {
        console.error('Error configuring Google Auth:', error);
      }

      // Track app launch (optional, won't crash if it fails)
      try {
        await AnalyticsService.trackEvent('app_launch', {
          authenticated: useAuthStore.getState().isAuthenticated,
        });
      } catch (error) {
        console.error('Error tracking app launch:', error);
      }
    };

    // Use requestIdleCallback for non-critical initialization
    const initTimeout = setTimeout(initializeServices, 100);
    return () => clearTimeout(initTimeout);
  }, []);

  useEffect(() => {
    let hasSupabaseSession = false;
    const authSub = supabase.auth.onAuthStateChange((_event, session) => {
      hasSupabaseSession = Boolean(session);
      try {
        if (hasSupabaseSession && AppState.currentState === 'active') {
          supabase.auth.startAutoRefresh?.();
        } else {
          supabase.auth.stopAutoRefresh?.();
        }
      } catch (e) {}
    });

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      try {
        if (nextState === 'active' && hasSupabaseSession) {
          supabase.auth.startAutoRefresh?.();
        } else {
          supabase.auth.stopAutoRefresh?.();
        }
      } catch (e) {}
    });

    // Cleanup on unmount
    return () => {
      authSub.data.subscription.unsubscribe();
      appStateSub.remove();
      BackgroundService.stop().catch(console.error);
    };
  }, []);

  // Optimized auth state tracking
  useEffect(() => {
    // Track launch/session state changes and update user-scoped services
    AnalyticsService.trackEvent('auth_state_change', { authenticated: isAuthenticated }).catch(() => {});

    if (user) {
      AnalyticsService.setUserProperties({
        subscription_type: user.subscriptionType,
        user_id: user.id,
      }).catch(() => {});
      AnalyticsService.setUserId(user.id).catch(() => {});
      SubscriptionService.setUserId(user.id).catch(() => {});
    } else {
      AnalyticsService.setUserId(null).catch(() => {});
    }
  }, [isAuthenticated, user]);

  // Don't render until fonts are loaded
  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B0F1A' }}>
        <ActivityIndicator size="large" color="#4ECDC4" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <PaperProvider theme={combinedDarkTheme}>
              <NavigationContainer
                theme={combinedDarkTheme}
                linking={{
                  prefixes: [prefix, 'radartinder://'],
                  config: {
                    screens: {
                      Main: {
                        screens: {
                          MainTabs: {
                            screens: {
                              Home: {
                                screens: {
                                  RadarMain: {
                                    path: 'navigate',
                                  },
                                },
                              },
                              Map: {
                                path: 'map',
                              },
                              Diagnose: {
                                path: 'diagnose',
                              },
                            },
                          },
                        },
                      },
                    },
                  } as any,
                }}
                onStateChange={async () => {
                  // Track screen changes
                  await AnalyticsService.trackEvent('navigation_change', {
                    authenticated: isAuthenticated,
                  });
                }}
              >
                <StatusBar style="light" />
                <Stack.Navigator screenOptions={stackScreenOptions}>
                  {isAuthenticated ? (
                    <>
                      <Stack.Screen name="Main" component={MainDrawerNavigator} />
                      <Stack.Screen
                        name="ReportRadar"
                        component={ReportRadarScreen}
                        options={{
                          headerShown: true,
                          title: 'Report Radar',
                          headerStyle: {
                            backgroundColor: combinedDarkTheme.colors.surface,
                          },
                          headerTintColor: combinedDarkTheme.colors.text,
                        }}
                      />
                    </>
                  ) : (
                    <Stack.Screen
                      name="Auth"
                      component={require('./src/navigation/AuthNavigator').default}
                    />
                  )}
                </Stack.Navigator>
              </NavigationContainer>
            </PaperProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

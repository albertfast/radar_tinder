import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { NavigationContainer, DarkTheme as NavigationDarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppState, View, ActivityIndicator } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';

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
import AdminLoginScreen from './src/screens/AdminLoginScreen';
import { useAuthStore } from './src/store/authStore';
import { darkTheme } from './src/utils/theme';
import { BackgroundService } from './src/services/BackgroundService';
import { AnalyticsService } from './src/services/AnalyticsService';
import { CrashReportingService } from './src/services/CrashReportingService';
import { OfflineService } from './src/services/OfflineService';
import { AdService } from './src/services/AdService';
import { SubscriptionService } from './src/services/SubscriptionService';
import { FirebaseAuthService } from './src/services/FirebaseAuthService';
import { NotificationService } from './src/services/NotificationService';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { supabase } from './utils/supabase';
import { useSettingsStore } from './src/store/settingsStore';

const isTruthyFlag = (value?: string) => value === '1' || value === 'true' || value === 'yes';
const isAdDebugEnabled = () => __DEV__ || isTruthyFlag(process.env.EXPO_PUBLIC_AD_DEBUG);

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
  const {
    isAuthenticated,
    user,
    hydrateFromSupabaseSession,
    normalizeAccessState,
    refreshProfile,
  } = useAuthStore();
  const [authBootstrapComplete, setAuthBootstrapComplete] = useState(false);
  const hasSettingsHydrated = useSettingsStore((state) => state.hasHydrated);
  const voiceWarningsEnabled = useSettingsStore((state) => state.voiceWarningsEnabled);
  const warningVolume = useSettingsStore((state) => state.warningVolume);
  
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
        if (isAdDebugEnabled()) {
          console.log('[ADS] init state', AdService.getAdsDebugState());
        }
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
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const hydrated = await hydrateFromSupabaseSession();
        if (cancelled) return;
        if (hydrated) {
          await refreshProfile();
          if (cancelled) return;
        }
        await normalizeAccessState();
      } catch (error) {
        console.warn('Initial auth normalization failed:', error);
      } finally {
        if (!cancelled) {
          setAuthBootstrapComplete(true);
        }
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [hydrateFromSupabaseSession, normalizeAccessState, refreshProfile]);

  useEffect(() => {
    if (!hasSettingsHydrated) return;
    if (!voiceWarningsEnabled || warningVolume <= 0) {
      NotificationService.silenceAllAudioNow().catch(() => {});
    }
  }, [hasSettingsHydrated, voiceWarningsEnabled, warningVolume]);

  useEffect(() => {
    let hasSupabaseSession = false;
    const authSub =
      supabase.auth?.onAuthStateChange?.((_event: string, session: any) => {
        hasSupabaseSession = Boolean(session);
        try {
          if (hasSupabaseSession && AppState.currentState === 'active') {
            supabase.auth.startAutoRefresh?.();
          } else {
            supabase.auth.stopAutoRefresh?.();
          }
        } catch (e) {}
      }) ??
      ({
        data: {
          subscription: {
            unsubscribe: () => {},
          },
        },
      } as any);

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      try {
        if (nextState === 'active' && hasSupabaseSession) {
          supabase.auth.startAutoRefresh?.();
          refreshProfile().catch(() => {});
          normalizeAccessState().catch(() => {});
        } else {
          supabase.auth.stopAutoRefresh?.();
        }
      } catch (e) {}
    });

    // Cleanup on unmount
    return () => {
      authSub?.data?.subscription?.unsubscribe?.();
      appStateSub.remove();
      BackgroundService.stop().catch(console.error);
    };
  }, [normalizeAccessState, refreshProfile]);

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
  if (!fontsLoaded || !authBootstrapComplete) {
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
                theme={combinedDarkTheme as any}
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
                              Drive: {
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
                      <Stack.Screen
                        name="AdminLogin"
                        component={AdminLoginScreen}
                        options={{
                          presentation: 'modal',
                          animation: 'slide_from_bottom',
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

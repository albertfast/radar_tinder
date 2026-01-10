import React, { useEffect } from 'react';
import { NavigationContainer, DarkTheme as NavigationDarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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

const Stack = createNativeStackNavigator();
const queryClient = new QueryClient();

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

  useEffect(() => {
    // Initialize services
    const initializeServices = async () => {
      try {
        await AnalyticsService.init();
        await CrashReportingService.init();
        await OfflineService.init();
        await BackgroundService.init();
        await AdService.init();
        await SubscriptionService.init();
        FirebaseAuthService.configureGoogle();
        
        // Track app launch
        await AnalyticsService.trackEvent('app_launch', {
          authenticated: isAuthenticated,
        });
        
        // Set user properties if authenticated
        if (user) {
          await AnalyticsService.setUserProperties({
            subscription_type: user.subscriptionType,
            user_id: user.id,
          });
        }
      } catch (error) {
        console.error('Error initializing services:', error);
        await CrashReportingService.reportHandledError(error as Error, {
          context: 'app_initialization',
        });
      }
    };

    initializeServices();

    // Cleanup on unmount
    return () => {
      BackgroundService.stop().catch(console.error);
    };
  }, [isAuthenticated, user]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
                            Radar: {
                              screens: {
                                RadarMain: {
                                  path: 'navigate',
                                },
                              },
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
              <Stack.Navigator screenOptions={{ headerShown: false }}>
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
                  <Stack.Screen name="Auth" component={require('./src/navigation/AuthNavigator').default} />
                )}
              </Stack.Navigator>
            </NavigationContainer>
          </PaperProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

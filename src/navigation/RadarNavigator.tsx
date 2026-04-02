import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import RadarScreen from '../screens/RadarScreen';
import RadarSettingsScreen from '../screens/RadarSettingsScreen';
import AIDiagnoseScreen from '../screens/AIDiagnoseScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import PermitTestScreen from '../screens/PermitTestScreen';
import HistoryScreen from '../screens/HistoryScreen';
import TripDetailScreen from '../screens/TripDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import ComponentsShowcaseScreen from '../screens/ComponentsShowcaseScreen';
import AlertsScreen from '../screens/AlertsScreen';
import MapScreen from '../screens/MapScreen';
import AdminLoginScreen from '../screens/AdminLoginScreen';
import RadarDriveNavigationScreen from '../screens/RadarDriveNavigationScreen';
import { ErrorBoundary } from '../components/ErrorBoundary';

const Stack = createNativeStackNavigator();

const STACK_ROUTE_NAMES = new Set([
  'RadarMain',
  'RadarSettings',
  'AIDiagnose',
  'PermitTest',
  'History',
  'TripDetail',
  'Profile',
  'Leaderboard',
  'Settings',
  'Alerts',
  'RadarDriveNavigation',
  'MapLegacy',
  'AdminLogin',
  'Subscription',
  'ComponentsShowcase',
]);

const extractRouteParams = (value: any) => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const params = { ...value };
  delete params.screen;
  delete params.params;

  return Object.keys(params).length > 0 ? params : undefined;
};

const resolveNestedScreenRequest = (value: any) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const screen = typeof value.screen === 'string' ? value.screen : null;
  if (!screen || !STACK_ROUTE_NAMES.has(screen)) {
    return null;
  }

  const directParams = extractRouteParams(value);
  const nestedParams =
    value.params && typeof value.params === 'object' ? value.params : undefined;
  const mergedParams =
    directParams || nestedParams
      ? {
          ...(directParams || {}),
          ...(nestedParams || {}),
        }
      : undefined;

  return {
    screen,
    params: mergedParams,
  };
};

const buildRequestSignature = (
  request: { screen: string; params?: Record<string, unknown> } | null
) =>
  request
    ? `${request.screen}:${JSON.stringify(request.params || null)}`
    : null;

const RouteRecoveryFallback = ({
  title,
  subtitle,
  errorMessage,
}: {
  title: string;
  subtitle: string;
  errorMessage?: string | null;
}) => (
  <View style={styles.routeFallback}>
    <ActivityIndicator size="small" color="#4ECDC4" />
    <Text style={styles.routeFallbackTitle}>{title}</Text>
    <Text style={styles.routeFallbackSubtitle}>{subtitle}</Text>
    {__DEV__ && errorMessage ? (
      <View style={styles.routeErrorBox}>
        <Text style={styles.routeErrorLabel}>Dev Error</Text>
        <Text style={styles.routeErrorText}>{errorMessage}</Text>
      </View>
    ) : null}
  </View>
);

const RadarDriveNavigationRoute = (props: any) => {
  const didRecoverRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const handleError = useCallback((error: Error) => {
    const nextMessage = error?.stack
      ? `${error.message}\n\n${error.stack}`
      : error?.message || 'Unknown drive route error';
    console.error('[RadarDriveNavigationRoute] drive route crashed', error);
    setErrorMessage(nextMessage);

    if (__DEV__) {
      return;
    }

    if (didRecoverRef.current) {
      return;
    }

    didRecoverRef.current = true;
    setTimeout(() => {
      props.navigation.replace('RadarMain');
    }, 0);
  }, [props.navigation]);

  return (
    <ErrorBoundary
      onError={handleError}
      fallback={
        <RouteRecoveryFallback
          title="Returning to radar"
          subtitle="Drive mode hit a runtime issue. Returning to the dashboard instead of loading the legacy map."
          errorMessage={errorMessage}
        />
      }
    >
      <RadarDriveNavigationScreen {...props} />
    </ErrorBoundary>
  );
};

const LegacyMapRoute = (props: any) => {
  const didRecoverRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const handleError = useCallback((error: Error) => {
    const nextMessage = error?.stack
      ? `${error.message}\n\n${error.stack}`
      : error?.message || 'Unknown legacy map error';
    console.error('[LegacyMapRoute] legacy map crashed', error);
    setErrorMessage(nextMessage);

    if (__DEV__) {
      return;
    }

    if (didRecoverRef.current) {
      return;
    }

    didRecoverRef.current = true;
    setTimeout(() => {
      props.navigation.replace('RadarMain');
    }, 0);
  }, [props.navigation]);

  return (
    <ErrorBoundary
      onError={handleError}
      fallback={
        <RouteRecoveryFallback
          title="Returning to radar"
          subtitle="Map recovery also failed, so the app is returning to the main dashboard."
          errorMessage={errorMessage}
        />
      }
    >
      <MapScreen {...props} />
    </ErrorBoundary>
  );
};

const RadarNavigator = ({ route, navigation }: any) => {
  // Home is a wrapper around the real stack, so nested route requests have to be
  // translated into an inner-stack initial route here instead of navigating the tab navigator.
  const initialRequest = useMemo(
    () => resolveNestedScreenRequest(route?.params),
    [route?.params]
  );
  const radarMainParams = useMemo(() => extractRouteParams(route?.params), [route?.params]);
  const handledRequestSignatureRef = useRef<string | null>(
    buildRequestSignature(initialRequest)
  );
  const [stackRequest, setStackRequest] = useState(() => ({
    routeName: initialRequest?.screen || 'RadarMain',
    params:
      initialRequest?.screen === 'RadarMain'
        ? initialRequest?.params || radarMainParams
        : initialRequest?.params,
    revision: 0,
  }));

  const requestSignature = useMemo(
    () => buildRequestSignature(initialRequest),
    [initialRequest]
  );

  useEffect(() => {
    if (!requestSignature || !initialRequest) {
      handledRequestSignatureRef.current = null;
      return;
    }

    if (handledRequestSignatureRef.current !== requestSignature) {
      handledRequestSignatureRef.current = requestSignature;
      setStackRequest((current) => ({
        routeName: initialRequest.screen,
        params: initialRequest.params,
        revision: current.revision + 1,
      }));
    }

    navigation.setParams?.({
      screen: undefined,
      params: undefined,
    });
  }, [initialRequest, navigation, requestSignature]);

  useEffect(() => {
    if (stackRequest.routeName !== 'RadarMain') {
      return;
    }

    setStackRequest((current) => {
      const currentSignature = JSON.stringify(current.params || null);
      const nextSignature = JSON.stringify(radarMainParams || null);
      if (currentSignature === nextSignature) {
        return current;
      }

      return {
        ...current,
        params: radarMainParams,
      };
    });
  }, [radarMainParams, stackRequest.routeName]);

  const navigatorKey = `${stackRequest.routeName}:${stackRequest.revision}`;

  return (
    <Stack.Navigator
      id="radar-stack"
      key={navigatorKey}
      initialRouteName={stackRequest.routeName}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen
        name="RadarMain"
        component={RadarScreen}
        initialParams={stackRequest.routeName === 'RadarMain' ? stackRequest.params : radarMainParams}
      />
      <Stack.Screen name="RadarSettings" component={RadarSettingsScreen} />
      <Stack.Screen name="AIDiagnose" component={AIDiagnoseScreen} />
      <Stack.Screen name="PermitTest" component={PermitTestScreen} />
      <Stack.Screen
        name="History"
        component={HistoryScreen}
        initialParams={stackRequest.routeName === 'History' ? stackRequest.params : undefined}
      />
      <Stack.Screen
        name="TripDetail"
        component={TripDetailScreen}
        initialParams={stackRequest.routeName === 'TripDetail' ? stackRequest.params : undefined}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        initialParams={stackRequest.routeName === 'Profile' ? stackRequest.params : undefined}
      />
      <Stack.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        initialParams={stackRequest.routeName === 'Leaderboard' ? stackRequest.params : undefined}
      />
      <Stack.Screen
        name="Settings"
        component={RadarSettingsScreen}
        initialParams={stackRequest.routeName === 'Settings' ? stackRequest.params : undefined}
      />
      <Stack.Screen
        name="Alerts"
        component={AlertsScreen}
        initialParams={stackRequest.routeName === 'Alerts' ? stackRequest.params : undefined}
      />
      <Stack.Screen
        name="RadarDriveNavigation"
        component={RadarDriveNavigationRoute}
        initialParams={stackRequest.routeName === 'RadarDriveNavigation' ? stackRequest.params : undefined}
      />
      <Stack.Screen
        name="MapLegacy"
        component={LegacyMapRoute}
        initialParams={stackRequest.routeName === 'MapLegacy' ? stackRequest.params : undefined}
      />
      <Stack.Screen
        name="AdminLogin"
        component={AdminLoginScreen}
        initialParams={stackRequest.routeName === 'AdminLogin' ? stackRequest.params : undefined}
      />
      <Stack.Screen 
        name="Subscription" 
        component={SubscriptionScreen} 
        initialParams={stackRequest.routeName === 'Subscription' ? stackRequest.params : undefined}
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="ComponentsShowcase"
        component={ComponentsShowcaseScreen}
        initialParams={stackRequest.routeName === 'ComponentsShowcase' ? stackRequest.params : undefined}
      />
    </Stack.Navigator>
  );
};

export default RadarNavigator;

const styles = StyleSheet.create({
  routeFallback: {
    flex: 1,
    backgroundColor: '#050C18',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  routeFallbackTitle: {
    marginTop: 14,
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  routeFallbackSubtitle: {
    marginTop: 8,
    color: '#AFC4DD',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  routeErrorBox: {
    marginTop: 16,
    width: '100%',
    maxWidth: 420,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.35)',
  },
  routeErrorLabel: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  routeErrorText: {
    marginTop: 8,
    color: '#F8FAFC',
    fontSize: 12,
    lineHeight: 18,
  },
});

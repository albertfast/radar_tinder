import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  MapFlowNavigationScreen,
  useNavigationStore,
  type MapOverlayMarker,
} from '../mapflow-navigation-kit';
import { useAuthStore } from '../store/authStore';
import { useRadarStore } from '../store/radarStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { RadarService } from '../services/RadarService';
import { LocationService } from '../services/LocationService';
import { hasProAccess } from '../utils/access';
import { RadarGraphicView } from './components/RadarGraphicView';
import { RadarBasicTab } from './radar/components/driving/RadarBasicTab';

const RADAR_REFRESH_MS = 15000;
const DRIVE_MODES = ['Basic', 'Map', 'Graphic'] as const;

type DriveMode = (typeof DRIVE_MODES)[number];

const toRouteCoordinates = (geometry: [number, number][] | null | undefined) =>
  Array.isArray(geometry)
    ? geometry
        .map((point) => {
          const longitude = Number(point?.[0]);
          const latitude = Number(point?.[1]);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
          }
          return { latitude, longitude };
        })
        .filter((point): point is { latitude: number; longitude: number } => point !== null)
    : [];

const resolveDriveMode = (value?: string | null): DriveMode =>
  DRIVE_MODES.includes(value as DriveMode) ? (value as DriveMode) : 'Map';

const calculateDisplaySpeed = (speedMetersPerSecond: number, unitSystem: 'imperial' | 'metric') =>
  Math.max(0, speedMetersPerSecond * (unitSystem === 'imperial' ? 2.23694 : 3.6));

const DriveScreen = ({ navigation, route }: any) => {
  const { user } = useAuthStore();
  const canUsePro = hasProAccess(user);
  const userLocation = useNavigationStore((state) => state.userLocation);
  const userHeading = useNavigationStore((state) => state.userHeading);
  const userSpeed = useNavigationStore((state) => state.userSpeed);
  const routeState = useNavigationStore((state) => state.route);
  const isNavigating = useNavigationStore((state) => state.isNavigating);
  const navCountryCode = useNavigationStore((state) => state.countryCode);
  const setNavUnitSystem = useNavigationStore((state) => state.setUnitSystem);
  const setRouteGuidanceActive = useRadarStore((state) => state.setRouteGuidanceActive);
  const setRouteGuidancePath = useRadarStore((state) => state.setRouteGuidancePath);
  const keepAwakeWhileDriving = useSettingsStore((state) => state.keepAwakeWhileDriving);
  const unitSystem = useSettingsStore((state) => state.unitSystem);
  const hideTabBar = useUiStore((state) => state.hideTabBar);
  const showTabBar = useUiStore((state) => state.showTabBar);
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [activeMode, setActiveMode] = useState<DriveMode>(
    resolveDriveMode(route?.params?.initialMode)
  );
  const [overlayMarkers, setOverlayMarkers] = useState<MapOverlayMarker[]>([]);
  const [nearbyRadars, setNearbyRadars] = useState<any[]>([]);
  const [driveStartTime, setDriveStartTime] = useState<Date | null>(null);
  const [tripDistanceKm, setTripDistanceKm] = useState(0);

  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const routeCoordinates = useMemo(() => toRouteCoordinates(routeState?.geometry), [routeState?.geometry]);
  const hasRoutePreview = routeCoordinates.length > 1;
  const hasActiveRoute = isNavigating && hasRoutePreview;
  const chromeTopOffset = insets.top + 108;
  const currentSpeedDisplay = useMemo(
    () => calculateDisplaySpeed(userSpeed, unitSystem),
    [unitSystem, userSpeed]
  );

  useEffect(() => {
    setNavUnitSystem(unitSystem, navCountryCode);
  }, [navCountryCode, setNavUnitSystem, unitSystem]);

  useEffect(() => {
    const requestedMode = resolveDriveMode(route?.params?.initialMode);
    if (route?.params?.initialMode) {
      setActiveMode(requestedMode);
      navigation.setParams?.({ initialMode: undefined });
    }
  }, [navigation, route?.params?.initialMode]);

  useFocusEffect(
    useCallback(() => {
      hideTabBar('drive_screen');
      setDriveStartTime(new Date());
      setTripDistanceKm(0);
      lastLocationRef.current = null;
      return () => showTabBar('drive_screen');
    }, [hideTabBar, showTabBar])
  );

  useEffect(() => {
    if (isFocused && keepAwakeWhileDriving) {
      activateKeepAwakeAsync().catch(() => {});
      return () => {
        deactivateKeepAwake();
      };
    }

    deactivateKeepAwake();
    return () => {
      deactivateKeepAwake();
    };
  }, [isFocused, keepAwakeWhileDriving]);

  useEffect(() => {
    setRouteGuidanceActive(hasActiveRoute);
    setRouteGuidancePath(hasActiveRoute ? routeCoordinates : []);
  }, [hasActiveRoute, routeCoordinates, setRouteGuidanceActive, setRouteGuidancePath]);

  useEffect(
    () => () => {
      setRouteGuidanceActive(false);
      setRouteGuidancePath([]);
    },
    [setRouteGuidanceActive, setRouteGuidancePath]
  );

  useEffect(() => {
    if (!userLocation || !isFocused) return;

    if (!driveStartTime) {
      setDriveStartTime(new Date());
    }

    const previous = lastLocationRef.current;
    if (previous) {
      const movedKm = LocationService.calculateDistanceSync(
        previous.lat,
        previous.lng,
        userLocation.lat,
        userLocation.lng
      );
      if (movedKm > 0.003) {
        setTripDistanceKm((current) => current + movedKm);
      }
    }

    lastLocationRef.current = {
      lat: userLocation.lat,
      lng: userLocation.lng,
    };
  }, [driveStartTime, isFocused, userLocation]);

  const refreshOverlayMarkers = useCallback(async () => {
    if (!userLocation) {
      setOverlayMarkers([]);
      setNearbyRadars([]);
      return;
    }

    const nearby = await RadarService.getNearbyRadars(
      userLocation.lat,
      userLocation.lng,
      canUsePro ? 10 : 5
    );
    const filtered =
      hasRoutePreview && routeCoordinates.length > 1
        ? RadarService.filterRouteRelevantRadars(nearby, {
            currentLocation: {
              latitude: userLocation.lat,
              longitude: userLocation.lng,
              heading: Number.isFinite(userHeading) ? userHeading : null,
            },
            routeCoords: routeCoordinates,
            speedKph: Math.max(10, userSpeed * 3.6),
            maxCorridorMeters: 180,
            maxHeadingDeltaDeg: 75,
            etaSecondsWindow: [0, 3600],
            requireEtaWindow: false,
          })
        : nearby;

    setNearbyRadars(filtered);
    setOverlayMarkers(
      filtered.slice(0, 48).map((radar) => ({
        id: radar.id,
        latitude: radar.latitude,
        longitude: radar.longitude,
        type: radar.type,
        markerKind: radar.markerKind,
        speedLimit: radar.speedLimit,
      }))
    );
  }, [canUsePro, hasRoutePreview, routeCoordinates, userHeading, userLocation, userSpeed]);

  useEffect(() => {
    if (!isFocused) return undefined;

    refreshOverlayMarkers().catch(() => {});
    const intervalId = setInterval(() => {
      refreshOverlayMarkers().catch(() => {});
    }, RADAR_REFRESH_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [isFocused, refreshOverlayMarkers]);

  const handleNavigateHome = useCallback(() => {
    navigation.navigate('Home');
  }, [navigation]);

  const handleOpenSettings = useCallback(() => {
    navigation.navigate('Home', { screen: 'RadarSettings' });
  }, [navigation]);

  const handleOpenSubscription = useCallback(() => {
    navigation.navigate('Home', { screen: 'Subscription' });
  }, [navigation]);

  const handleSelectMode = useCallback(
    (mode: DriveMode) => {
      if (mode === 'Graphic' && !canUsePro) {
        handleOpenSubscription();
        return;
      }
      setActiveMode(mode);
    },
    [canUsePro, handleOpenSubscription]
  );

  return (
    <View style={styles.container}>
      {activeMode === 'Graphic' ? (
        <LinearGradient colors={['#020617', '#020617']} style={StyleSheet.absoluteFill} />
      ) : activeMode === 'Basic' ? (
        <RadarBasicTab
          nearbyRadars={nearbyRadars}
          topContentInset={chromeTopOffset}
          bottomContentInset={Math.max(insets.bottom, 16)}
          unitSystem={unitSystem}
        />
      ) : (
        <MapFlowNavigationScreen
          overlayMarkers={overlayMarkers}
          topOverlayOffset={chromeTopOffset}
        />
      )}

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={handleNavigateHome} style={styles.headerButton}>
            <MaterialCommunityIcons name="home-variant" size={22} color="#F8FAFC" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>DRIVING MODE</Text>
            <Text style={styles.headerSubtitle}>{activeMode.toUpperCase()}</Text>
          </View>

          <TouchableOpacity onPress={handleOpenSettings} style={styles.headerButton}>
            <MaterialCommunityIcons name="cog" size={22} color="#F8FAFC" />
          </TouchableOpacity>
        </View>

        <View style={styles.tabBarWrap} pointerEvents="box-none">
          <View style={styles.tabBar}>
            {DRIVE_MODES.map((mode) => (
              <Pressable
                key={mode}
                onPress={() => handleSelectMode(mode)}
                style={[styles.tabItem, activeMode === mode && styles.tabItemActive]}
              >
                <Text style={[styles.tabText, activeMode === mode && styles.tabTextActive]}>
                  {mode}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {activeMode === 'Graphic' ? (
          <View style={styles.graphicWrap}>
            <RadarGraphicView
              totalDistance={tripDistanceKm}
              drivingStartTime={driveStartTime}
              currentSpeed={currentSpeedDisplay}
              unitSystem={unitSystem}
              topOverlayInset={chromeTopOffset + 8}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
};

export default DriveScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000000',
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#F8FAFC',
    fontWeight: '900',
    fontSize: 16,
  },
  headerSubtitle: {
    color: '#4ECDC4',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tabBarWrap: {
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: '#000000',
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,17,17,0.96)',
    borderRadius: 12,
    padding: 4,
  },
  tabItem: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemActive: {
    backgroundColor: '#222',
  },
  tabText: {
    color: '#888',
    fontWeight: '800',
    fontSize: 12,
  },
  tabTextActive: {
    color: '#FF5252',
  },
  graphicWrap: {
    flex: 1,
  },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MapFlowNavigationScreen, useNavigationStore } from '../mapflow-navigation-kit/src';
import { RadarMapMarker } from '../mapflow-navigation-kit/src/types/map';
import { formatDistance as formatMapDistance } from '../mapflow-navigation-kit/src/utils/units';
import { LocationPermissionGate } from '../components/LocationPermissionGate';
import { useAuthStore } from '../store/authStore';
import { useRadarStore } from '../store/radarStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { RadarAlert, RadarLocation } from '../types';
import { AdService } from '../services/AdService';
import { LocationService } from '../services/LocationService';
import { OfflineService } from '../services/OfflineService';
import { RadarService } from '../services/RadarService';
import { SupabaseService } from '../services/SupabaseService';
import { hasProAccess } from '../utils/access';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import { RadarGraphicView } from './components/RadarGraphicView';
import { RadarBasicTab } from './radar/components/driving/RadarBasicTab';
import { RadarDrivingShell } from './radar/components/driving/RadarDrivingShell';
import { useDrivingSession } from './radar/hooks/useDrivingSession';
import { useLocationPermission } from './radar/hooks/useLocationPermission';
import { useRadarSignalLevels } from './radar/hooks/useRadarSignalLevels';
import { useVoiceMode } from './radar/hooks/useVoiceMode';
import { TabType } from './radar/types';
import { ErrorBoundary } from '../components/ErrorBoundary';

const NOOP_SET_ACTIVE_TAB = () => {};
const RADAR_DRIVE_NAV_KEEP_AWAKE_TAG = 'radar_drive_navigation';

const toRadarLocation = (
  userLocation: { lat: number; lng: number } | null,
  heading: number,
  speed: number
) =>
  userLocation
    ? {
        latitude: userLocation.lat,
        longitude: userLocation.lng,
        heading,
        speed,
      }
    : null;

const toRouteCoordinates = (geometry?: [number, number][]) =>
  Array.isArray(geometry)
    ? geometry
        .map((point) => ({
          latitude: Number(point?.[1]),
          longitude: Number(point?.[0]),
        }))
        .filter(
          (point) =>
            Number.isFinite(point.latitude) &&
            Number.isFinite(point.longitude)
        )
    : [];

const resolveInitialTab = (value: unknown): TabType => {
  if (value === 'Basic' || value === 'Map' || value === 'Graphic') {
    return value;
  }
  return 'Map';
};

const buildLocationSignature = (
  location:
    | {
        latitude: number;
        longitude: number;
        heading?: number | null;
        speed?: number | null;
      }
    | null
) => {
  if (!location) return 'none';
  return [
    location.latitude.toFixed(6),
    location.longitude.toFixed(6),
    typeof location.heading === 'number' ? location.heading.toFixed(1) : 'na',
    typeof location.speed === 'number' ? location.speed.toFixed(2) : 'na',
  ].join(':');
};

const buildRoutePathSignature = (
  coords: Array<{ latitude: number; longitude: number }>
) =>
  coords.length > 0
    ? coords.map((coord) => `${coord.latitude.toFixed(5)},${coord.longitude.toFixed(5)}`).join('|')
    : 'empty';

const buildRadarListSignature = (radars: Array<RadarLocation & { distance: number }>) =>
  radars.length > 0
    ? radars
        .map((radar) => {
          const distance = Number.isFinite(radar.distance) ? radar.distance.toFixed(3) : 'inf';
          return `${radar.id}:${distance}:${radar.type}:${radar.markerKind || 'na'}`;
        })
        .join('|')
    : 'empty';

function DriveTabFallback({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <View style={styles.tabFallback}>
      <Text style={styles.tabFallbackTitle}>{title}</Text>
      <Text style={styles.tabFallbackBody}>{body}</Text>
    </View>
  );
}

export default function RadarDriveNavigationScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { user, refreshProfile } = useAuthStore();
  const canUsePro = hasProAccess(user);
  const {
    userLocation,
    userHeading,
    userSpeed,
    route: navigationRoute,
    isNavigating,
    unitSystem,
    destinationName,
    currentStepIndex,
    remainingStepDistance,
    hasArrived,
    stopNavigation,
  } = useNavigationStore();
  const {
    hasHydrated,
    voiceWarningsEnabled,
    hapticAlertsEnabled,
    warningVolume,
    setVoiceWarningsEnabled,
    setWarningVolume,
  } = useSettingsStore();
  const hideTabBar = useUiStore((state) => state.hideTabBar);
  const showTabBar = useUiStore((state) => state.showTabBar);
  const activeAlerts = useRadarStore((state) => state.activeAlerts);
  const acknowledgeAlert = useRadarStore((state) => state.acknowledgeAlert);
  const setRadarLocations = useRadarStore((state) => state.setRadarLocations);
  const setRouteGuidanceActive = useRadarStore((state) => state.setRouteGuidanceActive);
  const setRouteGuidancePath = useRadarStore((state) => state.setRouteGuidancePath);
  const setStoreCurrentLocation = useRadarStore((state) => state.setCurrentLocation);

  const [nearbyRadars, setNearbyRadars] = useState<Array<RadarLocation & { distance: number }>>([]);
  const [routeRadars, setRouteRadars] = useState<Array<RadarLocation & { distance: number }>>([]);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [mapUnavailableReason, setMapUnavailableReason] = useState<string | null>(null);
  const requestedInitialTab = resolveInitialTab(route?.params?.initialTab);
  const [activeTab, setActiveTab] = useState<TabType>(requestedInitialTab);
  const {
    permissionStatus,
    locationPermissionGranted,
    isRequestingPermission,
    requestLocationAccess,
  } = useLocationPermission();

  const currentLocation = useMemo(
    () => toRadarLocation(userLocation, userHeading, userSpeed),
    [userHeading, userLocation, userSpeed]
  );
  const currentLocationRef = useRef(currentLocation);
  const hasStartedDriveSessionRef = useRef(false);
  const lastCurrentLocationSignatureRef = useRef('none');
  const lastGuidanceActiveRef = useRef<boolean | null>(null);
  const lastRoutePathSignatureRef = useRef('empty');
  const lastRadarListSignatureRef = useRef('empty');

  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

  useEffect(() => {
    setActiveTab((current) => (current === requestedInitialTab ? current : requestedInitialTab));
  }, [requestedInitialTab]);

  const driving = useDrivingSession({
    user,
    currentLocation,
    currentLocationRef,
  });
  const {
    isDriving,
    totalDistance,
    drivingStartTime,
    setTotalDistance,
    lastPositionRef,
    saveTripIfNeeded,
    startDrivingSession,
    resetDrivingSession,
  } = driving;
  const saveTripIfNeededRef = useRef(saveTripIfNeeded);
  const resetDrivingSessionRef = useRef(resetDrivingSession);
  const stopNavigationRef = useRef(stopNavigation);

  useEffect(() => {
    saveTripIfNeededRef.current = saveTripIfNeeded;
  }, [saveTripIfNeeded]);

  useEffect(() => {
    resetDrivingSessionRef.current = resetDrivingSession;
  }, [resetDrivingSession]);

  useEffect(() => {
    stopNavigationRef.current = stopNavigation;
  }, [stopNavigation]);

  useEffect(() => {
    if (hasStartedDriveSessionRef.current || !currentLocation) {
      return;
    }

    hasStartedDriveSessionRef.current = true;
    startDrivingSession({
        setActiveTab: NOOP_SET_ACTIVE_TAB,
        activateMapTab: false,
        source: 'force_tab',
        hasActiveRoute: Boolean(isNavigating && navigationRoute?.geometry?.length),
      })
      .catch(() => {});
  }, [currentLocation, isNavigating, navigationRoute?.geometry?.length, startDrivingSession]);

  useEffect(() => {
    if (!isDriving || !currentLocation) {
      return;
    }

    const previous = lastPositionRef.current;
    if (previous) {
      const movedKm = LocationService.calculateDistanceSync(
        previous.latitude,
        previous.longitude,
        currentLocation.latitude,
        currentLocation.longitude
      );
      if (movedKm > 0.005) {
        setTotalDistance((value) => value + movedKm);
        lastPositionRef.current = currentLocation;
      }
      return;
    }

    lastPositionRef.current = currentLocation;
  }, [currentLocation, isDriving, lastPositionRef, setTotalDistance]);

  const routeCoords = useMemo(
    () => toRouteCoordinates(navigationRoute?.geometry),
    [navigationRoute?.geometry]
  );
  const hasRoute = routeCoords.length > 1;
  const isTurnByTurnActive = isNavigating && hasRoute;
  const tabBarInset = TAB_BAR_HEIGHT + Math.max(insets.bottom, 10) + 16;
  const currentSpeedKph = Math.max(0, userSpeed * 3.6);
  const currentStep = navigationRoute?.steps?.[currentStepIndex] || null;
  const navDistanceLabel = hasRoute
    ? formatMapDistance(remainingStepDistance || currentStep?.distance || 0, unitSystem)
    : '';
  const radarRendererMode = useMemo(() => {
    const configured = (process.env.EXPO_PUBLIC_RADAR_RENDERER || 'legacy2d').trim().toLowerCase();
    if (configured === 'life3d' || configured === 'legacy2d' || configured === 'auto') {
      return configured;
    }
    return 'legacy2d';
  }, []);
  const { toggleVoiceWarnings } = useVoiceMode({
    hasHydrated,
    voiceWarningsEnabled,
    hapticAlertsEnabled,
    warningVolume,
    setVoiceWarningsEnabled,
    setWarningVolume,
  });

  useFocusEffect(
    useCallback(() => {
      AdService.markDrivingState(true, isTurnByTurnActive);
      return () => {
        AdService.markDrivingState(false, false);
      };
    }, [isTurnByTurnActive])
  );

  useFocusEffect(
    useCallback(() => {
      activateKeepAwakeAsync(RADAR_DRIVE_NAV_KEEP_AWAKE_TAG).catch(() => {});
      return () => {
        deactivateKeepAwake(RADAR_DRIVE_NAV_KEEP_AWAKE_TAG);
      };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      hideTabBar('radar_drive_navigation');
      return () => {
        showTabBar('radar_drive_navigation');
      };
    }, [hideTabBar, showTabBar])
  );

  useEffect(() => {
    if (!currentLocation) {
      return;
    }

    const nextSignature = buildLocationSignature(currentLocation);
    if (lastCurrentLocationSignatureRef.current === nextSignature) {
      return;
    }

    lastCurrentLocationSignatureRef.current = nextSignature;
    setStoreCurrentLocation(currentLocation);
  }, [currentLocation, setStoreCurrentLocation]);

  useEffect(() => {
    if (lastGuidanceActiveRef.current === isTurnByTurnActive) {
      return;
    }

    lastGuidanceActiveRef.current = isTurnByTurnActive;
    setRouteGuidanceActive(isTurnByTurnActive);
  }, [isTurnByTurnActive, setRouteGuidanceActive]);

  useEffect(() => {
    const nextSignature = buildRoutePathSignature(routeCoords);
    if (lastRoutePathSignatureRef.current === nextSignature) {
      return;
    }

    lastRoutePathSignatureRef.current = nextSignature;
    setRouteGuidancePath(routeCoords);
  }, [routeCoords, setRouteGuidancePath]);

  const refreshNearbyRadars = useCallback(async () => {
    const liveLocation = currentLocationRef.current;
    if (!liveLocation) {
      setNearbyRadars([]);
      return;
    }

    const nextRadars = await RadarService.getNearbyRadars(
      liveLocation.latitude,
      liveLocation.longitude,
      10
    );
    setNearbyRadars(nextRadars);
  }, []);

  const refreshRouteRadars = useCallback(async () => {
    if (routeCoords.length < 2) {
      setRouteRadars([]);
      return;
    }

    const baseRadars = await RadarService.getRadarsAlongRoute(routeCoords);
    const liveLocation = currentLocationRef.current;
    const withDistance = baseRadars
      .map((radar) => ({
        ...radar,
        distance: liveLocation
          ? LocationService.calculateDistanceSync(
              liveLocation.latitude,
              liveLocation.longitude,
              radar.latitude,
              radar.longitude
            )
          : Number.POSITIVE_INFINITY,
      }))
      .sort((left, right) => left.distance - right.distance);

    setRouteRadars(withDistance);
  }, [routeCoords]);

  useEffect(() => {
    if (hasRoute) {
      setNearbyRadars([]);
      refreshRouteRadars().catch(() => {});
      const intervalId = setInterval(() => {
        refreshRouteRadars().catch(() => {});
      }, 25000);
      return () => clearInterval(intervalId);
    }

    setRouteRadars([]);
    if (!currentLocation) {
      setNearbyRadars([]);
      return;
    }

    refreshNearbyRadars().catch(() => {});
    const intervalId = setInterval(() => {
      refreshNearbyRadars().catch(() => {});
    }, 15000);
    return () => clearInterval(intervalId);
  }, [currentLocation, hasRoute, refreshNearbyRadars, refreshRouteRadars]);

  const displayRadars = useMemo(() => {
    if (!hasRoute) {
      return nearbyRadars;
    }

    if (!currentLocation) {
      return routeRadars;
    }

    return [...routeRadars]
      .map((radar) => ({
        ...radar,
        distance: LocationService.calculateDistanceSync(
          currentLocation.latitude,
          currentLocation.longitude,
          radar.latitude,
          radar.longitude
        ),
      }))
      .sort((left, right) => left.distance - right.distance);
  }, [currentLocation, hasRoute, nearbyRadars, routeRadars]);

  useEffect(() => {
    const nextSignature = buildRadarListSignature(displayRadars);
    if (lastRadarListSignatureRef.current === nextSignature) {
      return;
    }

    lastRadarListSignatureRef.current = nextSignature;
    setRadarLocations(displayRadars);
  }, [displayRadars, setRadarLocations]);

  const activeAlert = useMemo<RadarAlert | null>(() => {
    const safeAlerts = Array.isArray(activeAlerts) ? (activeAlerts as RadarAlert[]) : [];
    const unacknowledged = safeAlerts.filter((alert) => !alert.acknowledged);
    return unacknowledged.sort((left, right) => left.distance - right.distance)[0] || null;
  }, [activeAlerts]);
  const { signalLevel: radarSignalLevel, dangerLevel: radarDangerLevel } = useRadarSignalLevels(
    displayRadars,
    displayRadars[0] || null
  );

  const radarMarkers = useMemo<RadarMapMarker[]>(() => [], []);

  const handleReportRadar = useCallback(
    async (
      type: RadarLocation['type'],
      reportTag: 'default' | 'missed_camera' = 'default'
    ) => {
      setReportModalVisible(false);
      if (!user) {
        Alert.alert('Login required', 'Please log in to report hazards.');
        return;
      }

      const liveLocation =
        currentLocationRef.current ||
        (await LocationService.getCurrentLocation().catch(() => null));
      if (!liveLocation) {
        Alert.alert('Location unavailable', 'Please enable location services and try again.');
        return;
      }

      try {
        await RadarService.reportRadarLocation({
          latitude: liveLocation.latitude,
          longitude: liveLocation.longitude,
          type,
          confidence: reportTag === 'missed_camera' ? 0.75 : 0.7,
          lastConfirmed: new Date(),
          reportedBy: user.id,
        });

        if (hasRoute) {
          await refreshRouteRadars();
        } else {
          await refreshNearbyRadars();
        }
        await refreshProfile();

        Alert.alert(
          'Thanks',
          reportTag === 'missed_camera'
            ? 'Missed camera feedback was sent.'
            : 'Report sent. Nearby drivers will be notified.'
        );
      } catch {
        try {
          await OfflineService.saveRadarLocationOffline({
            id: `offline-${Date.now()}`,
            latitude: liveLocation.latitude,
            longitude: liveLocation.longitude,
            type,
            confidence: 0.7,
            lastConfirmed: new Date(),
            reportedBy: user.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as RadarLocation);

          Alert.alert(
            'Saved offline',
            reportTag === 'missed_camera'
              ? 'Missed camera feedback will sync when you are online.'
              : 'Your report will sync when you are online.'
          );
        } catch {
          Alert.alert('Report failed', 'Please try again.');
        }
      }
    },
    [hasRoute, refreshNearbyRadars, refreshProfile, refreshRouteRadars, user]
  );

  const handleConfirmAlert = useCallback(async () => {
    if (!activeAlert || !user) {
      if (!user) {
        Alert.alert('Login required', 'Please log in to confirm reports.');
      }
      return;
    }

    const liveLocation = currentLocationRef.current || currentLocation;
    if (!liveLocation) {
      Alert.alert('Location unavailable', 'Please enable location services and try again.');
      return;
    }

    const reportId = await SupabaseService.confirmNearbyReport({
      latitude: liveLocation.latitude,
      longitude: liveLocation.longitude,
      radiusMeters: 150,
      type: activeAlert.type,
    });

    if (!reportId) {
      Alert.alert('Nothing to confirm', 'No nearby community report was found.');
      return;
    }

    await refreshProfile();
    Alert.alert('Thanks', 'Confirmation recorded.');
  }, [activeAlert, currentLocation, refreshProfile, user]);

  const handleExitDrive = useCallback(async () => {
    stopNavigation();
    await saveTripIfNeeded().catch(() => {});
    resetDrivingSession();
    showTabBar('radar_drive_navigation');
    showTabBar('driving_mode');
    navigation.reset({
      index: 0,
      routes: [{ name: 'RadarMain' }],
    });
  }, [navigation, resetDrivingSession, saveTripIfNeeded, showTabBar, stopNavigation]);

  useEffect(() => {
    if (!mapUnavailableReason) {
      return;
    }

    Alert.alert(
      'Map unavailable',
      'The new drive map could not be prepared in this build. Please reopen drive mode after the next build.'
    );
  }, [mapUnavailableReason]);

  useEffect(() => {
    return () => {
      stopNavigationRef.current();
      saveTripIfNeededRef.current().catch(() => {});
      resetDrivingSessionRef.current();
      lastGuidanceActiveRef.current = false;
      lastRoutePathSignatureRef.current = 'empty';
      lastRadarListSignatureRef.current = 'empty';
      setRouteGuidanceActive(false);
      setRouteGuidancePath([]);
      AdService.markDrivingState(false, false);
    };
  }, [setRouteGuidanceActive, setRouteGuidancePath]);

  if (!locationPermissionGranted) {
    return (
      <LocationPermissionGate
        title="Location unlocks Drive mode"
        body="Turn on location when you want route-aware radar alerts, live speed context, and turn-by-turn drive tools. You can go back without leaving the app."
        permissionStatus={permissionStatus}
        isRequestingPermission={isRequestingPermission}
        onContinue={() => {
          void requestLocationAccess();
        }}
        onOpenSettings={() => {
          void Linking.openSettings();
        }}
        onDismiss={() => {
          showTabBar('radar_drive_navigation');
          showTabBar('driving_mode');
          navigation.reset({
            index: 0,
            routes: [{ name: 'RadarMain' }],
          });
        }}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <RadarDrivingShell
        insetsTop={insets.top}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        canUsePro={canUsePro}
        onOpenSubscription={() => navigation.navigate('Subscription')}
        onExitHome={handleExitDrive}
        onOpenSettings={() => navigation.navigate('RadarSettings')}
        isNavigationStarted={isTurnByTurnActive}
        isMapNavigationActive={isTurnByTurnActive && activeTab === 'Map'}
        activeAlert={activeAlert}
        unitSystem={unitSystem}
        acknowledgeAlert={acknowledgeAlert}
        routeCoords={routeCoords}
        routeMetaDestinationLabel={destinationName || 'Navigation active'}
        navInstruction={currentStep?.instruction || 'Follow the highlighted route'}
        navDistanceLabel={navDistanceLabel}
        hasArrived={hasArrived}
        onEndTrip={handleExitDrive}
        basicContent={
          <ErrorBoundary
            fallback={
              <DriveTabFallback
                title="Basic view unavailable"
                body="The drive dashboard could not render in this build."
              />
            }
          >
            <RadarBasicTab
              currentSpeed={currentSpeedKph}
              unitSystem={unitSystem}
              nearbyRadars={displayRadars}
              tabBarInset={tabBarInset}
              currentLocation={currentLocation}
            />
          </ErrorBoundary>
        }
        mapContent={
          <ErrorBoundary
            onError={(error) => {
              setMapUnavailableReason((current) => current || error.message || 'map_render_error');
            }}
            fallback={
              <DriveTabFallback
                title="Map view unavailable"
                body="The new MapFlow renderer failed in this build, but Basic and Graphic tabs are still available."
              />
            }
          >
            <MapFlowNavigationScreen
              radarMarkers={radarMarkers}
              highlightedRadarId={activeAlert?.radarId || null}
              onMapUnavailable={(reason) => {
                setMapUnavailableReason((current) => current || reason);
              }}
            />
          </ErrorBoundary>
        }
        graphicContent={
          <ErrorBoundary
            fallback={
              <DriveTabFallback
                title="Graphic view unavailable"
                body="Drive analytics could not render in this build."
              />
            }
          >
            <RadarGraphicView
              totalDistance={totalDistance}
              drivingStartTime={drivingStartTime}
              currentSpeed={currentSpeedKph}
              unitSystem={unitSystem}
              radarRendererMode={radarRendererMode}
              radarSignalLevel={radarSignalLevel}
              radarDangerLevel={radarDangerLevel}
            />
          </ErrorBoundary>
        }
        floatingFabBottom={insets.bottom + 112}
        reportModalVisible={reportModalVisible}
        setReportModalVisible={setReportModalVisible}
        onReportRadar={handleReportRadar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050C18',
  },
  tabFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#050C18',
  },
  tabFallbackTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  tabFallbackBody: {
    marginTop: 10,
    color: '#AFC4DD',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  alertBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    minHeight: 76,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(7, 18, 31, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(88, 214, 216, 0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 20,
    elevation: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertCopy: {
    flex: 1,
    gap: 2,
  },
  alertTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
  },
  alertSubtitle: {
    color: '#AFC4DD',
    fontSize: 11,
    lineHeight: 16,
  },
  alertActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#67E8F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportFab: {
    position: 'absolute',
    right: 16,
    minWidth: 62,
    height: 62,
    borderRadius: 20,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(17, 24, 39, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(251, 113, 133, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  reportFabLabel: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.54)',
  },
  modalSheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#08111E',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
    gap: 12,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.4)',
    marginBottom: 6,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: -4,
  },
  modalOptions: {
    gap: 10,
    paddingTop: 6,
  },
  modalOption: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionCopy: {
    flex: 1,
    gap: 2,
  },
  modalOptionTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  modalOptionHint: {
    color: '#94A3B8',
    fontSize: 11,
  },
  exitDriveButton: {
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 18,
    paddingVertical: 14,
    backgroundColor: 'rgba(127, 29, 29, 0.24)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.24)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  exitDriveLabel: {
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: '700',
  },
});

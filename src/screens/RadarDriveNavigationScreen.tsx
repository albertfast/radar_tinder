import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { MapFlowNavigationScreen, useNavigationStore } from '../mapflow-navigation-kit/src';
import { RadarMapMarker } from '../mapflow-navigation-kit/src/types/map';
import { useAuthStore } from '../store/authStore';
import { useRadarStore } from '../store/radarStore';
import { RadarAlert, RadarLocation } from '../types';
import { AdService } from '../services/AdService';
import { LocationService } from '../services/LocationService';
import { OfflineService } from '../services/OfflineService';
import { RadarService } from '../services/RadarService';
import { SupabaseService } from '../services/SupabaseService';
import { formatDistance } from '../utils/format';
import {
  formatRadarSpeedLimitText,
  formatRadarTimingText,
  formatRadarTypeLabel,
  getRadarShortLocation,
} from '../utils/radarAlerts';
import { useRadarMarkerAssetUris } from './drive/useRadarMarkerAssetUris';
import { useDrivingSession } from './radar/hooks/useDrivingSession';

type IncidentOption = {
  id: 'radar' | 'police' | 'crash' | 'roadwork' | 'missed';
  label: string;
  icon: string;
  color: string;
  reportType: RadarLocation['type'];
  reportTag?: 'default' | 'missed_camera';
};

const INCIDENT_OPTIONS: IncidentOption[] = [
  {
    id: 'radar',
    label: 'Radar',
    icon: 'camera',
    color: '#22D3EE',
    reportType: 'speed_camera',
  },
  {
    id: 'police',
    label: 'Police',
    icon: 'police-badge',
    color: '#60A5FA',
    reportType: 'police',
  },
  {
    id: 'crash',
    label: 'Crash',
    icon: 'car-emergency',
    color: '#FB7185',
    reportType: 'traffic_enforcement',
  },
  {
    id: 'roadwork',
    label: 'Road Work',
    icon: 'traffic-cone',
    color: '#F59E0B',
    reportType: 'mobile',
  },
  {
    id: 'missed',
    label: 'Missed Camera',
    icon: 'target-variant',
    color: '#F97316',
    reportType: 'speed_camera',
    reportTag: 'missed_camera',
  },
];

const NOOP_SET_ACTIVE_TAB = () => {};

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

export default function RadarDriveNavigationScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { user, refreshProfile } = useAuthStore();
  const {
    userLocation,
    userHeading,
    userSpeed,
    route,
    isNavigating,
    unitSystem,
    searchResults,
    stopNavigation,
  } = useNavigationStore();
  const activeAlerts = useRadarStore((state) => state.activeAlerts);
  const acknowledgeAlert = useRadarStore((state) => state.acknowledgeAlert);
  const setRadarLocations = useRadarStore((state) => state.setRadarLocations);
  const setRouteGuidanceActive = useRadarStore((state) => state.setRouteGuidanceActive);
  const setRouteGuidancePath = useRadarStore((state) => state.setRouteGuidancePath);
  const setStoreCurrentLocation = useRadarStore((state) => state.setCurrentLocation);
  const { assetUris, resolveMarkerAssetKey } = useRadarMarkerAssetUris();

  const [nearbyRadars, setNearbyRadars] = useState<Array<RadarLocation & { distance: number }>>([]);
  const [routeRadars, setRouteRadars] = useState<Array<RadarLocation & { distance: number }>>([]);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const currentLocation = useMemo(
    () => toRadarLocation(userLocation, userHeading, userSpeed),
    [userHeading, userLocation, userSpeed]
  );
  const currentLocationRef = useRef(currentLocation);
  const hasStartedDriveSessionRef = useRef(false);

  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

  const driving = useDrivingSession({
    user,
    currentLocation,
    currentLocationRef,
  });

  useEffect(() => {
    if (hasStartedDriveSessionRef.current || !currentLocation) {
      return;
    }

    hasStartedDriveSessionRef.current = true;
    driving
      .startDrivingSession({
        setActiveTab: NOOP_SET_ACTIVE_TAB,
        activateMapTab: false,
        source: 'force_tab',
        hasActiveRoute: Boolean(isNavigating && route?.geometry?.length),
      })
      .catch(() => {});
  }, [currentLocation, driving, isNavigating, route?.geometry?.length]);

  useEffect(() => {
    if (!driving.isDriving || !currentLocation) {
      return;
    }

    const previous = driving.lastPositionRef.current;
    if (previous) {
      const movedKm = LocationService.calculateDistanceSync(
        previous.latitude,
        previous.longitude,
        currentLocation.latitude,
        currentLocation.longitude
      );
      if (movedKm > 0.005) {
        driving.setTotalDistance((value) => value + movedKm);
        driving.lastPositionRef.current = currentLocation;
      }
      return;
    }

    driving.lastPositionRef.current = currentLocation;
  }, [currentLocation, driving]);

  const routeCoords = useMemo(
    () => toRouteCoordinates(route?.geometry),
    [route?.geometry]
  );
  const hasRoute = routeCoords.length > 1;
  const isTurnByTurnActive = isNavigating && hasRoute;

  useFocusEffect(
    useCallback(() => {
      AdService.markDrivingState(true, isTurnByTurnActive);
      return () => {
        AdService.markDrivingState(false, false);
      };
    }, [isTurnByTurnActive])
  );

  useEffect(() => {
    if (!currentLocation) {
      return;
    }

    setStoreCurrentLocation(currentLocation);
  }, [currentLocation, setStoreCurrentLocation]);

  useEffect(() => {
    setRouteGuidanceActive(isTurnByTurnActive);
    return () => setRouteGuidanceActive(false);
  }, [isTurnByTurnActive, setRouteGuidanceActive]);

  useEffect(() => {
    setRouteGuidancePath(routeCoords);
    return () => setRouteGuidancePath([]);
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
    setRadarLocations(displayRadars);
  }, [displayRadars, setRadarLocations]);

  const activeAlert = useMemo<RadarAlert | null>(() => {
    const unacknowledged = (activeAlerts as RadarAlert[]).filter((alert) => !alert.acknowledged);
    return unacknowledged.sort((left, right) => left.distance - right.distance)[0] || null;
  }, [activeAlerts]);

  const radarMarkers = useMemo<RadarMapMarker[]>(() => {
    if (!assetUris) {
      return [];
    }

    return displayRadars.map((radar) => {
      const assetKey = resolveMarkerAssetKey(radar.markerKind, radar.type);
      return {
        id: radar.id,
        lat: radar.latitude,
        lng: radar.longitude,
        type: radar.type,
        markerKind: radar.markerKind,
        speedLimit: radar.speedLimit,
        active: activeAlert?.radarId === radar.id,
        iconUri: assetUris[assetKey],
      };
    });
  }, [activeAlert?.radarId, assetUris, displayRadars, resolveMarkerAssetKey]);

  const alertBannerTop = isNavigating
    ? insets.top + 92
    : insets.top + (searchResults.length > 0 ? 154 : 84);

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
    await driving.saveTripIfNeeded().catch(() => {});
    driving.resetDrivingSession();
    navigation.navigate('RadarMain');
  }, [driving, navigation, stopNavigation]);

  useEffect(() => {
    return () => {
      stopNavigation();
      driving.saveTripIfNeeded().catch(() => {});
      driving.resetDrivingSession();
      setRouteGuidanceActive(false);
      setRouteGuidancePath([]);
      AdService.markDrivingState(false, false);
    };
  }, [driving, setRouteGuidanceActive, setRouteGuidancePath, stopNavigation]);

  return (
    <View style={styles.screen}>
      <MapFlowNavigationScreen
        radarMarkers={radarMarkers}
        highlightedRadarId={activeAlert?.radarId || null}
      />

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {activeAlert ? (
          <View
            style={[
              styles.alertBanner,
              {
                top: alertBannerTop,
              },
            ]}
            pointerEvents="auto"
          >
            <View style={styles.alertIcon}>
              <MaterialCommunityIcons name="alert" size={18} color="#FF6B6B" />
            </View>
            <View style={styles.alertCopy}>
              <Text style={styles.alertTitle}>
                {activeAlert.type ? formatRadarTypeLabel(activeAlert.type) : 'Alert'}
              </Text>
              <Text style={styles.alertSubtitle} numberOfLines={2}>
                {formatDistance(activeAlert.distance, unitSystem)}
                {getRadarShortLocation(activeAlert.locationLabel)
                  ? ` • ${getRadarShortLocation(activeAlert.locationLabel)}`
                  : ''}
                {formatRadarSpeedLimitText(activeAlert, unitSystem)
                  ? ` • ${formatRadarSpeedLimitText(activeAlert, unitSystem)}`
                  : ''}
                {' • '}
                {formatRadarTimingText(activeAlert)}
              </Text>
            </View>
            <View style={styles.alertActions}>
              <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmAlert}>
                <MaterialCommunityIcons name="check-bold" size={16} color="#08131F" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dismissButton}
                onPress={() => acknowledgeAlert(activeAlert.id)}
              >
                <MaterialCommunityIcons name="close" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.reportFab,
            {
              bottom: insets.bottom + (isNavigating ? 152 : 112),
            },
          ]}
          onPress={() => setReportModalVisible(true)}
        >
          <MaterialCommunityIcons name="alert-plus" size={20} color="#FEF2F2" />
          <Text style={styles.reportFabLabel}>Report</Text>
        </TouchableOpacity>

        <Modal
          visible={reportModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setReportModalVisible(false)}
        >
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={() => setReportModalVisible(false)} />
            <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 18 }]}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Report incident</Text>
              <Text style={styles.modalSubtitle}>
                Share what you see without leaving the map.
              </Text>

              <ScrollView
                contentContainerStyle={styles.modalOptions}
                showsVerticalScrollIndicator={false}
              >
                {INCIDENT_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={styles.modalOption}
                    onPress={() =>
                      handleReportRadar(option.reportType, option.reportTag || 'default')
                    }
                  >
                    <View
                      style={[
                        styles.modalOptionIcon,
                        { backgroundColor: `${option.color}22`, borderColor: `${option.color}55` },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={option.icon as any}
                        size={20}
                        color={option.color}
                      />
                    </View>
                    <View style={styles.modalOptionCopy}>
                      <Text style={styles.modalOptionTitle}>{option.label}</Text>
                      <Text style={styles.modalOptionHint}>
                        {option.id === 'missed'
                          ? 'Flag missing enforcement coverage.'
                          : 'Send a quick community report.'}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#64748B" />
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.exitDriveButton} onPress={handleExitDrive}>
                <MaterialCommunityIcons name="exit-run" size={18} color="#FCA5A5" />
                <Text style={styles.exitDriveLabel}>Exit drive mode</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050C18',
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

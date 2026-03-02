import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView from 'react-native-maps';
import RadarMap from '../../../../components/RadarMap';
import { AddressSuggestion, RadarLocation } from '../../../../types';
import {
  getResponsiveFontSize,
  getResponsivePadding,
} from '../../../../constants/layout';
import { NavStep, RouteMeta } from '../../types';
import { radarScreenStyles as styles } from '../../styles/radarScreenStyles';
import { GoogleMapsService } from '../../../../services/GoogleMapsService';
import { LocationService } from '../../../../services/LocationService';
import { AnalyticsService } from '../../../../services/AnalyticsService';
import { formatDistance } from '../../../../utils/format';
import { SPEED_LIMIT_V2_ENABLED } from '../../constants';
import { readBooleanFlag } from '../../../../utils/flags';

const SPEED_HUD_V2_ENABLED = readBooleanFlag('EXPO_PUBLIC_SPEED_HUD_V2', true);

type RadarMapTabProps = {
  currentLocation: any;
  nearbyRadars: any[];
  routeCoords: any[];
  mapRef: React.RefObject<MapView | null>;
  destinationCoord: { latitude: number; longitude: number } | null;
  mapPadding: { top: number; right: number; bottom: number; left: number };
  isMapInputLockActive: boolean;
  onRadarPress: (radar: RadarLocation) => void;
  handleMapTouchStart: () => void;
  handleMapTap: () => void;
  mapOverlayTop: number;
  mapOverlayInset: number;
  mapControlGap: number;
  destinationInputRef: React.RefObject<TextInput | null>;
  destination: string;
  handleTextChange: (text: string) => void;
  handleNavigate: () => void;
  onClearDestination: () => void;
  centerMap: () => void;
  suggestions: AddressSuggestion[];
  handleSelectSuggestion: (suggestion: AddressSuggestion) => void;
  recentDestinations: AddressSuggestion[];
  handleInputPressIn: () => void;
  handleInputFocus: (params: {
    isDestinationEmpty: boolean;
    hasRecentDestinations: boolean;
    onShowRecent?: () => void;
    onBeginInteracting?: () => void;
  }) => void;
  handleInputBlur: (onBlurFinalize?: () => void) => void;
  isMapNavigationActive: boolean;
  routeMeta: RouteMeta | null;
  navSteps: NavStep[];
  currentStepIndex: number;
  formatStepDistance: (meters?: number | null) => string;
  getStepDistanceMeters: (step?: NavStep) => number | null;
  getManeuverIcon: (maneuver?: string) => string;
  mapNavDockBottom: number;
  hideMapAd: boolean;
  mapAdBottom: number;
  mapControlsBottom: number;
  mapControlSize: number;
  followHeading: boolean;
  compassRotation: string;
  zoomMap: (delta: number) => void;
  resumeFollowMode: () => void;
  onCenterRoute: () => void;
  showCenterRouteAction?: boolean;
  arrivalState: 'none' | 'approaching' | 'arrived';
  distanceToDestinationMeters: number | null;
  hasArrived: boolean;
  onEndTrip: () => void;
  suppressAds?: boolean;
  resetRoute: () => void;
  setSuggestions: (suggestions: AddressSuggestion[]) => void;
  voiceWarningsEnabled: boolean;
  onToggleVoiceWarnings: () => void;
  onOpenIncidentPanel: () => void;
  currentSpeed: number;
  unitSystem: 'metric' | 'imperial';
};

export function RadarMapTab({
  currentLocation,
  nearbyRadars,
  routeCoords,
  mapRef,
  destinationCoord,
  mapPadding,
  isMapInputLockActive,
  onRadarPress,
  handleMapTouchStart,
  handleMapTap,
  mapOverlayTop,
  mapOverlayInset,
  mapControlGap,
  destinationInputRef,
  destination,
  handleTextChange,
  handleNavigate,
  onClearDestination,
  centerMap,
  suggestions,
  handleSelectSuggestion,
  recentDestinations,
  handleInputPressIn,
  handleInputFocus,
  handleInputBlur,
  isMapNavigationActive,
  routeMeta,
  navSteps,
  currentStepIndex,
  formatStepDistance,
  getStepDistanceMeters,
  getManeuverIcon,
  mapNavDockBottom,
  hideMapAd,
  mapAdBottom,
  mapControlsBottom,
  mapControlSize,
  followHeading,
  compassRotation,
  resumeFollowMode,
  onCenterRoute,
  showCenterRouteAction = false,
  arrivalState,
  distanceToDestinationMeters,
  hasArrived,
  onEndTrip,
  suppressAds = false,
  resetRoute,
  setSuggestions,
  voiceWarningsEnabled,
  onToggleVoiceWarnings,
  onOpenIncidentPanel,
  currentSpeed,
  unitSystem,
}: RadarMapTabProps) {
  const [speedLimit, setSpeedLimit] = useState<{ value: number; units: 'KPH' | 'MPH' } | null>(null);
  const [speedLimitSource, setSpeedLimitSource] = useState<
    'roads_api' | 'osm' | 'unknown' | 'roads_unavailable' | null
  >(null);
  const lastSpeedLimitFetchAtRef = useRef(0);
  const lastSpeedLimitLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastSpeedLimitSourceTelemetryRef = useRef<{ source: string | null; at: number }>({
    source: null,
    at: 0,
  });

  useEffect(() => {
    if (!currentLocation) return;
    if (!SPEED_LIMIT_V2_ENABLED) {
      setSpeedLimit(null);
      setSpeedLimitSource('unknown');
      return;
    }

    const now = Date.now();
    const lastLocation = lastSpeedLimitLocationRef.current;
    const movedMeters = lastLocation
      ? LocationService.calculateDistanceSync(
          currentLocation.latitude,
          currentLocation.longitude,
          lastLocation.latitude,
          lastLocation.longitude
        ) * 1000
      : Number.POSITIVE_INFINITY;

    if (now - lastSpeedLimitFetchAtRef.current < 18000 && movedMeters < 90) {
      return;
    }

    let cancelled = false;
    lastSpeedLimitFetchAtRef.current = now;
    lastSpeedLimitLocationRef.current = {
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
    };

    (async () => {
      const result = await GoogleMapsService.getSpeedLimitForCoordinate(
        currentLocation.latitude,
        currentLocation.longitude
      );
      if (cancelled) return;
      if (!result || result.speedLimit <= 0) {
        setSpeedLimit(null);
        setSpeedLimitSource(result?.source || 'unknown');
        return;
      }
      setSpeedLimit({ value: result.speedLimit, units: result.units });
      setSpeedLimitSource(result.source);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentLocation]);

  useEffect(() => {
    if (!speedLimitSource) return;
    const now = Date.now();
    const previous = lastSpeedLimitSourceTelemetryRef.current;
    const shouldEmit =
      previous.source !== speedLimitSource || now - previous.at >= 45000;
    if (!shouldEmit) return;
    lastSpeedLimitSourceTelemetryRef.current = { source: speedLimitSource, at: now };
    AnalyticsService.trackEvent('speed_limit_source', {
      source: speedLimitSource,
      has_value: Boolean(speedLimit && speedLimit.value > 0),
    }).catch(() => {});
  }, [speedLimit, speedLimitSource]);

  const currentSpeedDisplay = useMemo(() => {
    if (unitSystem === 'imperial') return Math.max(0, Math.round(currentSpeed * 0.621371));
    return Math.max(0, Math.round(currentSpeed));
  }, [currentSpeed, unitSystem]);

  const speedLimitDisplay = useMemo(() => {
    if (!speedLimit) return null;
    if (unitSystem === 'imperial') {
      return Math.round(speedLimit.units === 'MPH' ? speedLimit.value : speedLimit.value * 0.621371);
    }
    return Math.round(speedLimit.units === 'KPH' ? speedLimit.value : speedLimit.value * 1.60934);
  }, [speedLimit, unitSystem]);

  const speedUnitLabel = unitSystem === 'imperial' ? 'MPH' : 'KM/H';
  const overspeedRatio =
    speedLimitDisplay && speedLimitDisplay > 0
      ? (currentSpeedDisplay - speedLimitDisplay) / speedLimitDisplay
      : 0;
  const speedTone =
    overspeedRatio > 0.1
      ? '#ef4444'
      : overspeedRatio > 0.05
        ? '#f97316'
        : overspeedRatio > 0
          ? '#facc15'
          : '#67e8f9';

  const arrivalDistanceLabel =
    distanceToDestinationMeters != null ? formatStepDistance(distanceToDestinationMeters) : null;
  const activeStep = navSteps[currentStepIndex];
  const currentStepDistance = formatStepDistance(getStepDistanceMeters(activeStep)) || '...';
  const stepInstruction = activeStep?.instruction || 'Follow the highlighted route';
  const routeDistanceLabel = useMemo(() => {
    if (typeof routeMeta?.distanceMeters === 'number' && Number.isFinite(routeMeta.distanceMeters)) {
      return formatDistance(Math.max(0, routeMeta.distanceMeters / 1000), unitSystem);
    }
    return routeMeta?.distanceText || '';
  }, [routeMeta?.distanceMeters, routeMeta?.distanceText, unitSystem]);
  const summaryDistance = hasArrived
    ? 'Arrived'
    : arrivalState === 'approaching' && arrivalDistanceLabel
      ? arrivalDistanceLabel
      : routeDistanceLabel || arrivalDistanceLabel || '—';
  const summaryEta = hasArrived ? 'ETA 0 min' : `ETA ${routeMeta?.etaText || '—'}`;
  const summaryDestination = hasArrived
    ? 'Destination reached'
    : routeMeta?.destinationLabel || destination || 'Destination';
  const speedHudEstimatedHeight = SPEED_HUD_V2_ENABLED ? 72 : 120;
  const speedHudBottomCeiling = mapControlsBottom - speedHudEstimatedHeight - mapControlGap - 4;
  const speedHudBottomBySummary = isMapNavigationActive ? mapNavDockBottom + 116 : 0;
  const speedHudFloorBottom = hideMapAd || suppressAds ? 12 : mapAdBottom + 6;
  const speedHudPreferredBottom =
    Math.max(speedHudFloorBottom, speedHudBottomBySummary) +
    (SPEED_HUD_V2_ENABLED ? getResponsivePadding(6) : 0);
  const speedHudBottom = isMapNavigationActive
    ? Math.max(8, Math.min(speedHudBottomCeiling, speedHudPreferredBottom))
    : Math.max(8, speedHudBottomCeiling);

  return (
    <View style={{ flex: 1 }}>
      <View style={StyleSheet.absoluteFill}>
        <RadarMap
          location={currentLocation || { latitude: 37.7749, longitude: -122.4194 }}
          radars={nearbyRadars}
          routeCoords={routeCoords}
          mapRef={mapRef}
          showsUserLocation
          destinationPoint={destinationCoord}
          mapPadding={mapPadding}
          onRadarPress={onRadarPress}
          onMapTouchStart={handleMapTouchStart}
          mapInteractionEnabled={!isMapInputLockActive}
          onMapTap={handleMapTap}
        />
      </View>

      <View
        style={[styles.mapOverlay, { top: mapOverlayTop, left: mapOverlayInset, right: mapOverlayInset }]}
        pointerEvents="auto"
      >
        {routeCoords.length === 0 ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: mapControlGap }}>
              <View style={{ flex: 1 }}>
                <TextInput
                  ref={destinationInputRef}
                  placeholder="Enter destination"
                  placeholderTextColor="#aaa"
                  style={[
                    styles.mapInput,
                    {
                      paddingVertical: getResponsivePadding(10),
                      paddingHorizontal: getResponsivePadding(12),
                      fontSize: getResponsiveFontSize(15),
                    },
                  ]}
                  value={destination}
                  onChangeText={handleTextChange}
                  onSubmitEditing={handleNavigate}
                  returnKeyType="search"
                  blurOnSubmit
                  enablesReturnKeyAutomatically
                  autoCorrect={false}
                  autoCapitalize="none"
                  keyboardType="default"
                  autoFocus={false}
                  showSoftInputOnFocus
                  onTouchStart={(event) => {
                    event.stopPropagation();
                  }}
                  onPressIn={() => {
                    handleInputPressIn();
                    destinationInputRef.current?.focus();
                  }}
                  onFocus={() =>
                    handleInputFocus({
                      isDestinationEmpty: !destination.trim(),
                      hasRecentDestinations: recentDestinations.length > 0,
                      onShowRecent: () => setSuggestions(recentDestinations.slice(0, 6)),
                    })
                  }
                  onBlur={() =>
                    handleInputBlur(() => {
                      setSuggestions([]);
                    })
                  }
                />
              </View>

              <TouchableOpacity
                style={[styles.iconBtn, { backgroundColor: '#2979FF', padding: 12 }]}
                onPress={handleNavigate}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>GO</Text>
              </TouchableOpacity>

              {destination.length > 0 && (
                <TouchableOpacity
                  style={[styles.iconBtn, { backgroundColor: '#FF5252', padding: 12 }]}
                  onPress={onClearDestination}
                >
                  <MaterialCommunityIcons name="close" size={24} color="white" />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.iconBtn, { backgroundColor: 'rgba(0,0,0,0.8)', padding: 12 }]}
                onPress={centerMap}
              >
                <MaterialCommunityIcons name="crosshairs-gps" size={24} color="#2979FF" />
              </TouchableOpacity>
            </View>

            {suggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                {suggestions.map((item, index) => (
                  <TouchableOpacity
                    key={item.id || `${item.label}-${index}`}
                    style={styles.suggestionItem}
                    onPress={() => handleSelectSuggestion(item)}
                  >
                    <MaterialCommunityIcons name="map-marker-outline" size={20} color="#94A3B8" />
                    <Text style={styles.suggestionText} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        ) : hasArrived ? (
          <View style={styles.navTopCard}>
            <View style={[styles.navTopIconShell, { backgroundColor: 'rgba(78,205,196,0.18)' }]}>
              <MaterialCommunityIcons name="flag-checkered" size={22} color="#4ECDC4" />
            </View>
            <View style={styles.navTopCopy}>
              <Text style={styles.navTopDistance}>You have arrived</Text>
              <Text style={styles.navTopInstruction} numberOfLines={1}>
                End the trip when parked safely.
              </Text>
            </View>
            <TouchableOpacity style={styles.navTopActionPrimary} onPress={onEndTrip}>
              <Text style={styles.navTopActionPrimaryText}>End</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.navTopCard}>
            <View style={styles.navTopIconShell}>
              <MaterialCommunityIcons
                name={getManeuverIcon(activeStep?.maneuver) as any}
                size={22}
                color="#E2E8F0"
              />
            </View>
            <View style={styles.navTopCopy}>
              <Text style={styles.navTopDistance}>{currentStepDistance}</Text>
              <Text style={styles.navTopInstruction} numberOfLines={1}>
                {stepInstruction}
              </Text>
            </View>
            <TouchableOpacity style={styles.navTopClose} onPress={resetRoute}>
              <MaterialCommunityIcons name="close" size={20} color="#E2E8F0" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View
        style={[
          styles.mapLeftControls,
          {
            left: mapOverlayInset,
            bottom: mapControlsBottom,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.mapControlButton,
            followHeading && styles.mapControlButtonActive,
            { width: mapControlSize, height: mapControlSize, marginBottom: mapControlGap },
          ]}
          onPress={resumeFollowMode}
        >
          <View style={{ transform: [{ rotate: compassRotation }] }}>
            <MaterialCommunityIcons
              name="navigation"
              size={getResponsiveFontSize(20)}
              color={followHeading ? '#0B1424' : 'white'}
            />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.mapControlButton,
            voiceWarningsEnabled && styles.mapControlButtonActive,
            { width: mapControlSize, height: mapControlSize, marginBottom: mapControlGap },
          ]}
          onPress={onToggleVoiceWarnings}
        >
          <MaterialCommunityIcons
            name={voiceWarningsEnabled ? 'volume-high' : 'volume-mute'}
            size={getResponsiveFontSize(20)}
            color={voiceWarningsEnabled ? '#0B1424' : 'white'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.mapControlButton,
            styles.mapIncidentButton,
            { width: mapControlSize, height: mapControlSize },
          ]}
          onPress={onOpenIncidentPanel}
        >
          <MaterialCommunityIcons name="alert-plus" size={getResponsiveFontSize(20)} color="#FEF2F2" />
        </TouchableOpacity>
      </View>

      {SPEED_HUD_V2_ENABLED && showCenterRouteAction && routeCoords.length > 0 && (
        <TouchableOpacity
          style={[
            localStyles.centerRouteButton,
            {
              left: mapOverlayInset,
              bottom: speedHudBottom + getResponsivePadding(72),
            },
          ]}
          onPress={onCenterRoute}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={14} color="#67E8F9" />
          <Text style={localStyles.centerRouteText}>Center Route</Text>
        </TouchableOpacity>
      )}

      {routeCoords.length > 0 && isMapNavigationActive && !hasArrived && (
        <View
          style={[
            styles.bottomNavDock,
            { left: mapOverlayInset, right: mapOverlayInset, bottom: mapNavDockBottom },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.navSummaryCard}>
            <Text style={styles.navSummaryDistance}>{summaryDistance}</Text>
            <Text style={styles.navSummaryEta}>{summaryEta}</Text>
            <Text style={styles.navSummaryDestination} numberOfLines={1}>
              {summaryDestination}
            </Text>
          </View>
        </View>
      )}

      <View
        style={[
          SPEED_HUD_V2_ENABLED ? localStyles.speedHudWrap : localStyles.speedHudWrapLegacy,
          SPEED_HUD_V2_ENABLED
            ? {
                position: 'absolute',
                left: mapOverlayInset,
                bottom: speedHudBottom,
              }
            : {
                position: 'absolute',
                right: mapOverlayInset,
                bottom: mapControlsBottom + 4,
              },
        ]}
        pointerEvents="none"
      >
        <View
          style={[
            SPEED_HUD_V2_ENABLED ? localStyles.speedMain : localStyles.speedMainLegacy,
            { borderColor: speedTone, shadowColor: speedTone },
          ]}
        >
          <Text style={SPEED_HUD_V2_ENABLED ? localStyles.speedTitle : localStyles.speedTitleLegacy}>
            SPEED
          </Text>
          <Text style={[localStyles.speedValue, { color: speedTone }]}>{currentSpeedDisplay}</Text>
          <Text style={localStyles.speedUnit}>{speedUnitLabel}</Text>
          {!SPEED_HUD_V2_ENABLED && overspeedRatio > 0 && (
            <View style={[localStyles.overspeedBadge, { backgroundColor: speedTone }]}>
              <Text style={localStyles.overspeedBadgeText}>+{Math.round(overspeedRatio * 100)}%</Text>
            </View>
          )}
        </View>
        <View style={SPEED_HUD_V2_ENABLED ? localStyles.limitBadge : localStyles.limitBadgeLegacy}>
          <Text style={localStyles.limitLabel}>LIMIT</Text>
          <Text style={localStyles.limitValue}>{speedLimitDisplay ?? '--'}</Text>
          <Text style={localStyles.limitUnit}>{speedUnitLabel}</Text>
          {!SPEED_HUD_V2_ENABLED && speedLimitSource === 'osm' && <Text style={localStyles.limitSource}>PUBLIC</Text>}
          {!SPEED_HUD_V2_ENABLED && speedLimitSource === 'roads_unavailable' && (
            <Text style={localStyles.limitSource}>ROADS OFF</Text>
          )}
          {!SPEED_HUD_V2_ENABLED && speedLimitSource === 'unknown' && (
            <Text style={localStyles.limitSource}>UNKNOWN</Text>
          )}
        </View>
      </View>
    </View>
  );
}

export type { RadarMapTabProps };

const localStyles = StyleSheet.create({
  speedHudWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  speedHudWrapLegacy: {
    alignSelf: 'flex-end',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
  },
  speedMain: {
    borderRadius: 12,
    paddingHorizontal: getResponsivePadding(6),
    paddingVertical: getResponsivePadding(6),
    backgroundColor: 'rgba(3,10,24,0.92)',
    borderWidth: 2,
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
  },
  speedMainLegacy: {
    borderRadius: 16,
    paddingHorizontal: getResponsivePadding(18),
    paddingVertical: getResponsivePadding(12),
    backgroundColor: 'rgba(3,10,24,0.92)',
    borderWidth: 2,
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    alignItems: 'center',
    minWidth: 104,
  },
  speedTitle: {
    color: '#64748b',
    fontSize: 6,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  speedTitleLegacy: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  speedValue: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
    letterSpacing: -0.5,
  },
  speedUnit: {
    color: '#94a3b8',
    fontSize: 7,
    fontWeight: '700',
    marginTop: 0,
  },
  overspeedBadge: {
    marginTop: 5,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignItems: 'center',
  },
  overspeedBadgeText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 9,
  },
  limitBadge: {
    borderRadius: 12,
    paddingHorizontal: getResponsivePadding(6),
    paddingVertical: getResponsivePadding(6),
    backgroundColor: 'rgba(3,10,24,0.88)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
  },
  limitBadgeLegacy: {
    borderRadius: 14,
    paddingHorizontal: getResponsivePadding(14),
    paddingVertical: getResponsivePadding(10),
    backgroundColor: 'rgba(3,10,24,0.88)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    minWidth: 92,
  },
  limitLabel: {
    color: '#64748b',
    fontSize: 6,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  limitValue: {
    color: '#e2e8f0',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  limitUnit: {
    color: '#64748b',
    fontSize: 7,
    fontWeight: '700',
    marginTop: 0,
  },
  limitSource: {
    color: '#475569',
    fontSize: 7,
    marginTop: 1,
  },
  centerRouteButton: {
    position: 'absolute',
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(2,6,23,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.35)',
  },
  centerRouteText: {
    color: '#67E8F9',
    fontSize: 11,
    fontWeight: '700',
  },
});

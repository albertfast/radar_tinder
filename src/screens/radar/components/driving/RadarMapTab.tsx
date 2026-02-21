import React from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView from 'react-native-maps';
import AdBanner from '../../../../components/AdBanner';
import RadarMap from '../../../../components/RadarMap';
import { AddressSuggestion, RadarLocation } from '../../../../types';
import {
  getResponsiveFontSize,
  getResponsivePadding,
} from '../../../../constants/layout';
import { NavStep, RouteMeta } from '../../types';
import { radarScreenStyles as styles } from '../../styles/radarScreenStyles';

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
  uiScale: number;
  mapNavDockBottom: number;
  hideMapAd: boolean;
  mapAdBottom: number;
  mapControlsBottom: number;
  mapControlSize: number;
  followHeading: boolean;
  compassRotation: string;
  zoomMap: (delta: number) => void;
  resumeFollowMode: () => void;
  arrivalState: 'none' | 'approaching' | 'arrived';
  distanceToDestinationMeters: number | null;
  hasArrived: boolean;
  onEndTrip: () => void;
  suppressAds?: boolean;
  resetRoute: () => void;
  setSuggestions: (suggestions: AddressSuggestion[]) => void;
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
  uiScale,
  mapNavDockBottom,
  hideMapAd,
  mapAdBottom,
  mapControlsBottom,
  mapControlSize,
  followHeading,
  compassRotation,
  zoomMap,
  resumeFollowMode,
  arrivalState,
  distanceToDestinationMeters,
  hasArrived,
  onEndTrip,
  suppressAds = false,
  resetRoute,
  setSuggestions,
}: RadarMapTabProps) {
  const arrivalDistanceLabel =
    distanceToDestinationMeters != null ? formatStepDistance(distanceToDestinationMeters) : null;

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
        pointerEvents="box-none"
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
                  onPressIn={handleInputPressIn}
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
                style={[styles.iconBtn, { backgroundColor: '#4ECDC4', padding: 12 }]}
                onPress={handleNavigate}
              >
                <Text style={{ color: 'black', fontWeight: 'bold' }}>GO</Text>
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
                <MaterialCommunityIcons name="crosshairs-gps" size={24} color="#4ECDC4" />
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
        ) : (
          <View style={styles.navCompactRow}>
            <View style={styles.navCompactInfo}>
              <Text style={styles.navCompactTitle} numberOfLines={1}>
                {hasArrived ? 'You have arrived' : routeMeta?.destinationLabel || destination || 'Destination'}
              </Text>
              <Text style={styles.navCompactMeta}>
                {hasArrived
                  ? 'Tap End Trip when parked safely.'
                  : arrivalState === 'approaching' && arrivalDistanceLabel
                    ? `${arrivalDistanceLabel} to destination • ${nearbyRadars.length} radars`
                    : `${routeMeta?.distanceText || '—'} • ETA ${routeMeta?.etaText || '—'} • ${nearbyRadars.length} radars`}
              </Text>
            </View>
            <TouchableOpacity style={styles.navCompactButton} onPress={centerMap}>
              <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#4ECDC4" />
            </TouchableOpacity>
            {hasArrived ? (
              <TouchableOpacity
                style={[styles.navCompactButton, { backgroundColor: '#4ECDC4', borderColor: '#4ECDC4' }]}
                onPress={onEndTrip}
              >
                <MaterialCommunityIcons name="flag-checkered" size={20} color="#0B1424" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.navCompactButton, styles.navCompactButtonDanger]} onPress={resetRoute}>
                <MaterialCommunityIcons name="close" size={20} color="#F8FAFC" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {isMapNavigationActive && (
        <View
          style={[
            styles.bottomNavDock,
            { left: mapOverlayInset, right: mapOverlayInset, bottom: mapNavDockBottom },
          ]}
          pointerEvents="box-none"
        >
          {hasArrived ? (
            <View style={[styles.navInstructionBox, styles.navInstructionDock, { padding: Math.round(10 * uiScale) }]}>
              <MaterialCommunityIcons name="flag-checkered" size={24} color="#4ECDC4" />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ color: 'white', fontSize: Math.round(14 * uiScale), fontWeight: 'bold' }}>
                  You have arrived
                </Text>
                <Text style={{ color: '#cbd5f5', fontSize: Math.round(11 * uiScale) }} numberOfLines={2}>
                  End the trip when you park safely.
                </Text>
              </View>
              <TouchableOpacity
                onPress={onEndTrip}
                style={{
                  backgroundColor: '#4ECDC4',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: '#0B1424', fontWeight: '800' }}>END</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.navInstructionBox, styles.navInstructionDock, { padding: Math.round(10 * uiScale) }]}>
              <MaterialCommunityIcons
                name={getManeuverIcon(navSteps[currentStepIndex]?.maneuver) as any}
                size={24}
                color="white"
              />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ color: 'white', fontSize: Math.round(14 * uiScale), fontWeight: 'bold' }}>
                  {formatStepDistance(getStepDistanceMeters(navSteps[currentStepIndex])) || '...'}
                </Text>
                <Text style={{ color: '#cbd5f5', fontSize: Math.round(11 * uiScale) }} numberOfLines={2}>
                  {navSteps[currentStepIndex]?.instruction || 'Follow the highlighted route'}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      <View
        pointerEvents={hideMapAd || suppressAds ? 'none' : 'auto'}
        style={[
          styles.mapAdContainer,
          {
            left: mapOverlayInset,
            right: mapOverlayInset,
            bottom: mapAdBottom,
            opacity: hideMapAd || suppressAds ? 0 : 1,
          },
        ]}
      >
        <AdBanner suppressAds={suppressAds} />
      </View>

      <View
        style={[
          styles.mapControls,
          {
            right: mapOverlayInset,
            bottom: mapControlsBottom,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.mapControlButton,
            { width: mapControlSize, height: mapControlSize, marginBottom: mapControlGap },
          ]}
          onPress={() => zoomMap(1)}
        >
          <MaterialCommunityIcons name="plus" size={getResponsiveFontSize(20)} color="white" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.mapControlButton,
            { width: mapControlSize, height: mapControlSize, marginBottom: mapControlGap },
          ]}
          onPress={() => zoomMap(-1)}
        >
          <MaterialCommunityIcons name="minus" size={getResponsiveFontSize(20)} color="white" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.mapControlButton,
            followHeading && styles.mapControlButtonActive,
            { width: mapControlSize, height: mapControlSize },
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
      </View>
    </View>
  );
}

export type { RadarMapTabProps };

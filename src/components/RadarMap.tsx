import React, { useEffect, useMemo, useRef } from 'react';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { modernMapStyle } from '../utils/modernMapStyle';
import { getResponsiveWidth, getResponsiveHeight, getResponsiveMargin, getResponsivePadding } from '../constants/layout';

const MAP_COORD_TRACE_ENABLED =
  __DEV__ || /^(1|true|yes)$/i.test(process.env.EXPO_PUBLIC_MAP_TRACE || '');

const ROUTE_VISUAL_TOKENS = Platform.select({
  ios: {
    // High-contrast turquoise route for iOS: glow + solid body + bright core.
    casingColor: 'rgba(0, 246, 226, 0.30)',
    fillColor: '#00F7E6',
    highlightColor: 'rgba(245, 255, 254, 0.95)',
    casingWidth: 8,
    fillWidth: 5,
    highlightWidth: 2.4,
  },
  default: {
    casingColor: 'rgba(0, 246, 226, 0.26)',
    fillColor: '#00F0DD',
    highlightColor: 'rgba(232, 255, 252, 0.88)',
    casingWidth: getResponsiveWidth(9),
    fillWidth: getResponsiveWidth(6),
    highlightWidth: getResponsiveWidth(2),
  },
})!;

const USER_MARKER_TOKENS = {
  shell: getResponsiveWidth(52),
  outer: getResponsiveWidth(46),
  outerBorder: 1.5,
  inner: getResponsiveWidth(32),
  plate: getResponsiveWidth(30),
  plateRadius: getResponsiveWidth(9),
  arrowWrapWidth: getResponsiveWidth(23),
  arrowWrapHeight: getResponsiveHeight(30),
  arrowBodySide: getResponsiveWidth(6),
  arrowBodyBottom: getResponsiveHeight(18),
  arrowBodyInnerSide: getResponsiveWidth(3),
  arrowBodyInnerBottom: getResponsiveHeight(11),
  arrowBodyInnerOffset: getResponsiveHeight(5),
  arrowTailWidth: getResponsiveWidth(8),
  arrowTailHeight: getResponsiveHeight(4),
  arrowTailRadius: getResponsiveWidth(2),
  arrowTailBottom: getResponsiveHeight(2),
  coreSize: getResponsiveWidth(9),
  coreBorder: 1.5,
  coreBottom: getResponsiveHeight(10),
  centerDotSize: getResponsiveWidth(3),
  centerDotBottom: getResponsiveHeight(13),
};

type LatLng = { latitude: number; longitude: number };

const toValidCoordinate = (value: any): LatLng | null => {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
};

const toNormalizedHeading = (value: any): number => {
  const heading = Number(value);
  if (!Number.isFinite(heading) || heading < 0) return 0;
  const normalized = heading % 360;
  return normalized >= 0 ? normalized : normalized + 360;
};

// Optimized Marker (moved here or kept in same file)
const OptimizedMarker = React.memo(({ coordinate, type, speedLimit, onPress }: any) => {
  // ... logic (can copy from RadarScreen or keep simplistic)
  return (
    <Marker
      coordinate={coordinate}
      tracksViewChanges={false} // Force false for stability, or use the timer logic if image issues persist
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={onPress}
    >
      <View style={[styles.markerBadge, { backgroundColor: type === 'police' ? '#F44336' : '#FF5252' }]}>
        {type === 'fixed' && speedLimit ? (
          <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>{speedLimit}</Text>
        ) : (
          <MaterialCommunityIcons
            name={type === 'police' ? "police-badge" : "camera"}
            size={20}
            color="white"
          />
        )}
      </View>
    </Marker>
  );
});

const RadarArrowUserMarker = React.memo(({ coordinate, heading }: { coordinate: LatLng; heading: number }) => (
  <Marker
    coordinate={coordinate}
    anchor={{ x: 0.5, y: 0.5 }}
    zIndex={60}
  >
    <View style={styles.userMarkerShell} collapsable={false}>
      <View style={styles.userPulseOuter}>
        <View style={styles.userPulseInner} />
      </View>
      <View style={styles.userMarkerPlate} />
      <View style={[styles.userArrowWrap, { transform: [{ rotate: `${heading}deg` }] }]}>
        <View style={styles.userArrowBody} />
        <View style={styles.userArrowBodyInner} />
        <View style={styles.userArrowTail} />
      </View>
      <View style={styles.userArrowCore} />
      <View style={styles.userCenterDot} />
    </View>
  </Marker>
));

const RadarMap = React.memo(({
  location,
  radars,
  routeCoords,
  mapRef,
  showsUserLocation = true,
  onRadarPress,
  destinationPoint,
  mapPadding,
  onMapTouchStart,
  mapInteractionEnabled = true,
  onMapTap,
}: any) => {
  const safeLocation = useMemo(() => toValidCoordinate(location), [location]);
  const safeHeading = useMemo(() => toNormalizedHeading(location?.heading), [location?.heading]);
  const onRadarPressRef = useRef(onRadarPress);
  useEffect(() => { onRadarPressRef.current = onRadarPress; }, [onRadarPress]);
  const initialRegionRef = useRef({
    latitude: safeLocation?.latitude ?? 37.7749,
    longitude: safeLocation?.longitude ?? -122.4194,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const initialRegion = initialRegionRef.current;

  const routeInputLength = Array.isArray(routeCoords) ? routeCoords.length : 0;
  const sanitizedRouteCoords = useMemo(() => {
    if (!Array.isArray(routeCoords)) {
      return [] as LatLng[];
    }
    return routeCoords
      .map((point: any) => toValidCoordinate(point))
      .filter((point: LatLng | null): point is LatLng => point !== null);
  }, [routeCoords]);
  const invalidRouteCoordCount = Math.max(0, routeInputLength - sanitizedRouteCoords.length);

  const sanitizedRadars = useMemo(() => {
    const validEntries: Array<{ key: string | number; radar: any; coordinate: LatLng }> = [];
    let invalidCount = 0;

    if (!Array.isArray(radars)) {
      return { validEntries, invalidCount };
    }

    radars.forEach((radar: any, index: number) => {
      const coordinate = toValidCoordinate({
        latitude: radar?.latitude,
        longitude: radar?.longitude,
      });

      if (!coordinate) {
        invalidCount += 1;
        return;
      }

      validEntries.push({
        key: radar?.id || index,
        radar,
        coordinate,
      });
    });

    return { validEntries, invalidCount };
  }, [radars]);

  const sanitizedDestination = useMemo(() => toValidCoordinate(destinationPoint), [destinationPoint]);
  const invalidDestinationPoint = Boolean(destinationPoint) && !sanitizedDestination;

  const finalDestination = useMemo(() => {
    if (sanitizedDestination) {
      return sanitizedDestination;
    }
    return sanitizedRouteCoords.length > 0 ? sanitizedRouteCoords[sanitizedRouteCoords.length - 1] : null;
  }, [sanitizedDestination, sanitizedRouteCoords]);

  const mapChildren = useMemo(() => {
    const children: React.ReactElement[] = [];

    if (sanitizedRouteCoords.length > 0) {
      children.push(
        <Polyline
          key="route-casing"
          coordinates={sanitizedRouteCoords}
          strokeWidth={ROUTE_VISUAL_TOKENS.casingWidth}
          strokeColor={ROUTE_VISUAL_TOKENS.casingColor}
          lineCap="round"
          lineJoin="round"
          zIndex={120}
        />
      );

      children.push(
        <Polyline
          key="route-polyline"
          coordinates={sanitizedRouteCoords}
          strokeWidth={ROUTE_VISUAL_TOKENS.fillWidth}
          strokeColor={ROUTE_VISUAL_TOKENS.fillColor}
          lineCap="round"
          lineJoin="round"
          zIndex={121}
        />
      );

      children.push(
        <Polyline
          key="route-highlight"
          coordinates={sanitizedRouteCoords}
          strokeWidth={ROUTE_VISUAL_TOKENS.highlightWidth}
          strokeColor={ROUTE_VISUAL_TOKENS.highlightColor}
          lineCap="round"
          lineJoin="round"
          zIndex={122}
        />
      );
    }

    if (safeLocation) {
      children.push(
        <RadarArrowUserMarker
          key="user-marker"
          coordinate={safeLocation}
          heading={safeHeading}
        />
      );
    }

    if (finalDestination) {
      children.push(
        <Marker key="route-destination" coordinate={finalDestination} anchor={{ x: 0.5, y: 1 }}>
          <View style={styles.destinationMarker}>
            <MaterialCommunityIcons name="flag-checkered" size={16} color="#0B1424" />
          </View>
        </Marker>
      );
    }

    sanitizedRadars.validEntries.forEach(({ key, radar, coordinate }) => {
      children.push(
        <OptimizedMarker
          key={key}
          coordinate={coordinate}
          type={radar?.type}
          speedLimit={radar?.speedLimit}
          onPress={() => onRadarPressRef.current?.(radar)}
        />
      );
    });

    return children;
  }, [finalDestination, safeHeading, safeLocation, sanitizedRadars.validEntries, sanitizedRouteCoords]);

  const invalidSummaryRef = useRef('');
  const invalidRadarCount = sanitizedRadars.invalidCount;
  useEffect(() => {
    if (!MAP_COORD_TRACE_ENABLED) return;

    const summary = `route:${invalidRouteCoordCount}|radar:${invalidRadarCount}|dest:${invalidDestinationPoint ? 1 : 0}`;
    if (summary === invalidSummaryRef.current) return;
    invalidSummaryRef.current = summary;

    if (invalidRouteCoordCount > 0 || invalidRadarCount > 0 || invalidDestinationPoint) {
      console.debug('[RadarMap] Dropped invalid map coordinates', {
        route: invalidRouteCoordCount,
        radars: invalidRadarCount,
        destination: invalidDestinationPoint ? 1 : 0,
      });
    }
  }, [invalidDestinationPoint, invalidRadarCount, invalidRouteCoordCount]);

  const padding = mapPadding || { top: 200, right: 40, bottom: 280, left: 40 };

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      customMapStyle={modernMapStyle}
      provider={PROVIDER_GOOGLE}
      initialRegion={initialRegion}
      showsUserLocation={false}
      showsMyLocationButton={false}
      userLocationUpdateInterval={1000}
      userLocationFastestInterval={500}
      showsCompass={false}
      showsTraffic={false}
      mapPadding={padding}
      pitchEnabled={mapInteractionEnabled}
      rotateEnabled={mapInteractionEnabled}
      zoomEnabled={mapInteractionEnabled}
      scrollEnabled={mapInteractionEnabled}
      toolbarEnabled={false}
      zoomControlEnabled={false}
      moveOnMarkerPress={false}
      onPanDrag={() => {
        if (mapInteractionEnabled) onMapTouchStart?.();
      }}
      onRegionChangeComplete={(_region: any, details?: { isGesture?: boolean }) => {
        if (!mapInteractionEnabled) return;
        if (details?.isGesture) {
          onMapTouchStart?.();
        }
      }}
      onPress={() => {
        if (!mapInteractionEnabled) return;
        onMapTap?.();
      }}
    >
      {mapChildren}
    </MapView>
  );
}, (prev, next) => {
  // Custom comparison to prevent re-renders on minor updates if needed
  // For now, let's rely on React.memo shallow diff or standard behavior
  // If location changes slightly (user moving), we WANT to re-render user location dot, 
  // BUT MapView handles user location internally via showsUserLocation={true}.
  // We only need to re-render if radars or route change.

  // Changing props: location (used for initialRegion only? No, maybe updates?), radars.

  // We render a custom user marker, so location/heading changes must trigger updates.

  return (
    prev.radars === next.radars &&
    prev.routeCoords === next.routeCoords &&
    prev.destinationPoint?.latitude === next.destinationPoint?.latitude &&
    prev.destinationPoint?.longitude === next.destinationPoint?.longitude &&
    prev.mapPadding === next.mapPadding &&
    prev.mapInteractionEnabled === next.mapInteractionEnabled &&
    prev.location?.latitude === next.location?.latitude &&
    prev.location?.longitude === next.location?.longitude &&
    prev.location?.heading === next.location?.heading
    // Ignore location changes as MapView handles user location dot and camera is controlled via ref
  );
});

const styles = StyleSheet.create({
  markerBadge: {
    width: getResponsiveWidth(36),
    height: getResponsiveHeight(36),
    borderRadius: getResponsiveMargin(18),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5
  },
  destinationMarker: {
    paddingHorizontal: getResponsivePadding(12),
    paddingVertical: getResponsivePadding(8),
    borderRadius: getResponsiveMargin(16),
    backgroundColor: '#FCD34D',
    borderWidth: 2,
    borderColor: '#0B1424',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 6
  },
  userMarkerShell: {
    width: USER_MARKER_TOKENS.shell,
    height: USER_MARKER_TOKENS.shell,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  userPulseOuter: {
    position: 'absolute',
    width: USER_MARKER_TOKENS.outer,
    height: USER_MARKER_TOKENS.outer,
    borderRadius: USER_MARKER_TOKENS.outer / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: USER_MARKER_TOKENS.outerBorder,
    borderColor: 'rgba(88, 231, 219, 0.62)',
    shadowColor: 'rgba(88, 231, 219, 0.28)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 1,
  },
  userPulseInner: {
    width: USER_MARKER_TOKENS.inner,
    height: USER_MARKER_TOKENS.inner,
    borderRadius: USER_MARKER_TOKENS.inner / 2,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(88, 231, 219, 0.42)',
  },
  userMarkerPlate: {
    position: 'absolute',
    width: USER_MARKER_TOKENS.plate,
    height: USER_MARKER_TOKENS.plate,
    borderRadius: USER_MARKER_TOKENS.plateRadius,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 2,
    borderColor: 'rgba(88, 231, 219, 0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  userArrowWrap: {
    width: USER_MARKER_TOKENS.arrowWrapWidth,
    height: USER_MARKER_TOKENS.arrowWrapHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userArrowBody: {
    width: 0,
    height: 0,
    borderLeftWidth: USER_MARKER_TOKENS.arrowBodySide,
    borderRightWidth: USER_MARKER_TOKENS.arrowBodySide,
    borderBottomWidth: USER_MARKER_TOKENS.arrowBodyBottom,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(88, 231, 219, 0.96)',
  },
  userArrowBodyInner: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: USER_MARKER_TOKENS.arrowBodyInnerSide,
    borderRightWidth: USER_MARKER_TOKENS.arrowBodyInnerSide,
    borderBottomWidth: USER_MARKER_TOKENS.arrowBodyInnerBottom,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(15,23,42,0.8)',
    bottom: USER_MARKER_TOKENS.arrowBodyInnerOffset,
  },
  userArrowTail: {
    position: 'absolute',
    bottom: USER_MARKER_TOKENS.arrowTailBottom,
    width: USER_MARKER_TOKENS.arrowTailWidth,
    height: USER_MARKER_TOKENS.arrowTailHeight,
    borderRadius: USER_MARKER_TOKENS.arrowTailRadius,
    backgroundColor: 'rgba(15,23,42,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(88, 231, 219, 0.72)',
  },
  userArrowCore: {
    position: 'absolute',
    width: USER_MARKER_TOKENS.coreSize,
    height: USER_MARKER_TOKENS.coreSize,
    borderRadius: USER_MARKER_TOKENS.coreSize / 2,
    backgroundColor: 'rgba(88, 231, 219, 0.96)',
    borderWidth: USER_MARKER_TOKENS.coreBorder,
    borderColor: '#ffffff',
    bottom: USER_MARKER_TOKENS.coreBottom,
    shadowColor: 'rgba(88, 231, 219, 0.44)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
    elevation: 4,
  },
  userCenterDot: {
    position: 'absolute',
    width: USER_MARKER_TOKENS.centerDotSize,
    height: USER_MARKER_TOKENS.centerDotSize,
    borderRadius: USER_MARKER_TOKENS.centerDotSize / 2,
    backgroundColor: '#ffffff',
    bottom: USER_MARKER_TOKENS.centerDotBottom,
  },
});

export default RadarMap;

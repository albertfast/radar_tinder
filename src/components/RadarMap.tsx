import React, { useEffect, useMemo, useRef } from 'react';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import { View, StyleSheet, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { modernMapStyle } from '../utils/modernMapStyle';
import { getResponsiveWidth, getResponsiveHeight, getResponsiveMargin, getResponsivePadding } from '../constants/layout';

const MAP_COORD_TRACE_ENABLED =
  __DEV__ || /^(1|true|yes)$/i.test(process.env.EXPO_PUBLIC_MAP_TRACE || '');

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
    tracksViewChanges={false}
    anchor={{ x: 0.5, y: 0.5 }}
    zIndex={20}
  >
    <View style={styles.userPulseOuter}>
      <View style={styles.userPulseInner} />
      <View style={[styles.userArrowWrap, { transform: [{ rotate: `${heading}deg` }] }]}>
        <View style={styles.userArrowBody} />
        <View style={styles.userArrowCore} />
      </View>
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
      const routeCasingColor = 'rgba(6, 14, 28, 0.92)';
      const routeFillColor = '#34F5E4';

      children.push(
        <Polyline
          key="route-casing"
          coordinates={sanitizedRouteCoords}
          strokeWidth={getResponsiveWidth(12)}
          strokeColor={routeCasingColor}
          lineCap="round"
          lineJoin="round"
          zIndex={9}
        />
      );

      children.push(
        <Polyline
          key="route-polyline"
          coordinates={sanitizedRouteCoords}
          strokeWidth={getResponsiveWidth(7)}
          strokeColor={routeFillColor}
          lineCap="round"
          lineJoin="round"
          zIndex={10}
        />
      );

      children.push(
        <Polyline
          key="route-highlight"
          coordinates={sanitizedRouteCoords}
          strokeWidth={getResponsiveWidth(3)}
          strokeColor="rgba(190, 255, 248, 0.92)"
          lineCap="round"
          lineJoin="round"
          zIndex={11}
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
          onPress={() => onRadarPress?.(radar)}
        />
      );
    });

    return children;
  }, [finalDestination, onRadarPress, safeHeading, safeLocation, sanitizedRadars.validEntries, sanitizedRouteCoords]);

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
  userPulseOuter: {
    width: getResponsiveWidth(34),
    height: getResponsiveHeight(34),
    borderRadius: getResponsiveMargin(17),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.45)',
  },
  userPulseInner: {
    position: 'absolute',
    width: getResponsiveWidth(22),
    height: getResponsiveHeight(22),
    borderRadius: getResponsiveMargin(11),
    backgroundColor: 'rgba(249,115,22,0.2)',
  },
  userArrowWrap: {
    width: getResponsiveWidth(20),
    height: getResponsiveHeight(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  userArrowBody: {
    width: 0,
    height: 0,
    borderLeftWidth: getResponsiveWidth(6),
    borderRightWidth: getResponsiveWidth(6),
    borderBottomWidth: getResponsiveHeight(14),
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#22D3EE',
    marginBottom: -2,
  },
  userArrowCore: {
    position: 'absolute',
    width: getResponsiveWidth(8),
    height: getResponsiveHeight(8),
    borderRadius: getResponsiveMargin(4),
    backgroundColor: '#FB923C',
    borderWidth: 1,
    borderColor: '#082F49',
    bottom: 0,
  },
});

export default RadarMap;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { modernMapStyle } from '../utils/modernMapStyle';
import { getResponsiveWidth, getResponsiveHeight, getResponsiveMargin, getResponsivePadding } from '../constants/layout';
import { RadarService } from '../services/RadarService';

// SVG Components
import MapMarkerSvg from '../../assets/mapmarker.svg';
import SpeedCamSvg from '../../assets/speedcam.svg';
import PoliceMarkerSvg from '../../assets/police-marker.svg';
import DestinationFlagSvg from '../../assets/destination-flag.svg';

const MAP_COORD_TRACE_ENABLED =
  __DEV__ || /^(1|true|yes)$/i.test(process.env.EXPO_PUBLIC_MAP_TRACE || '');
const RADAR_MARKER_RENDER_CAP = 120;
const RADAR_ROUTE_PRIORITY_CORRIDOR_METERS = 180;
const REGION_PADDING_FACTOR = 0.2;

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

type LatLng = { latitude: number; longitude: number };
type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

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

const toValidRegion = (value: any): MapRegion | null => {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  const latitudeDelta = Number(value?.latitudeDelta);
  const longitudeDelta = Number(value?.longitudeDelta);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitudeDelta) ||
    !Number.isFinite(longitudeDelta) ||
    latitudeDelta <= 0 ||
    longitudeDelta <= 0
  ) {
    return null;
  }
  return { latitude, longitude, latitudeDelta, longitudeDelta };
};

const buildPaddedRegion = (region: MapRegion, paddingFactor: number): MapRegion => ({
  ...region,
  latitudeDelta: region.latitudeDelta * (1 + paddingFactor),
  longitudeDelta: region.longitudeDelta * (1 + paddingFactor),
});

const isCoordinateInsideRegion = (coordinate: LatLng, region: MapRegion): boolean => {
  const halfLat = region.latitudeDelta / 2;
  const halfLon = region.longitudeDelta / 2;
  return (
    coordinate.latitude >= region.latitude - halfLat &&
    coordinate.latitude <= region.latitude + halfLat &&
    coordinate.longitude >= region.longitude - halfLon &&
    coordinate.longitude <= region.longitude + halfLon
  );
};

const shouldUpdateRegion = (prev: MapRegion, next: MapRegion): boolean => {
  const centerDelta = Math.abs(prev.latitude - next.latitude) + Math.abs(prev.longitude - next.longitude);
  const zoomDelta =
    Math.abs(prev.latitudeDelta - next.latitudeDelta) +
    Math.abs(prev.longitudeDelta - next.longitudeDelta);
  return centerDelta > 0.00015 || zoomDelta > 0.00015;
};

const distanceKm = (aLat: number, aLon: number, bLat: number, bLon: number): number => {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const arc =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 6371 * (2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc)));
};

// Optimized Marker - SVG based
const OptimizedMarker = React.memo(({ coordinate, type, speedLimit, onPress }: any) => {
  const MarkerIcon = type === 'police' ? PoliceMarkerSvg : SpeedCamSvg;
  
  return (
    <Marker
      coordinate={coordinate}
      tracksViewChanges={false}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={onPress}
    >
      {type === 'fixed' && speedLimit ? (
        <View style={styles.speedLimitBadge}>
          <Text style={styles.speedLimitText}>{speedLimit}</Text>
        </View>
      ) : (
        <MarkerIcon 
          width={getResponsiveWidth(36)}
          height={getResponsiveHeight(36)}
        />
      )}
    </Marker>
  );
});

const RadarArrowUserMarker = React.memo(({ coordinate, heading }: { coordinate: LatLng; heading: number }) => (
  <Marker
    coordinate={coordinate}
    anchor={{ x: 0.5, y: 0.5 }}
    zIndex={600}
    tracksViewChanges
  >
    <View style={[styles.userMarkerContainer, { transform: [{ rotate: `${heading}deg` }] }]}>
      <MapMarkerSvg 
        width={getResponsiveWidth(64)}
        height={getResponsiveHeight(88)}
      />
    </View>
  </Marker>
));

const RadarMap = React.memo(({
  location,
  radars,
  routeCoords,
  mapRef,
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
  const [visibleRegion, setVisibleRegion] = useState<MapRegion>(initialRegion);

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

  const selectedRadarEntries = useMemo(() => {
    const region = toValidRegion(visibleRegion) || initialRegion;
    const paddedRegion = buildPaddedRegion(region, REGION_PADDING_FACTOR);

    const visibleEntries = sanitizedRadars.validEntries.filter((entry) =>
      isCoordinateInsideRegion(entry.coordinate, paddedRegion)
    );

    const scored = visibleEntries.map((entry) => {
      const confidence = Number(entry.radar?.confidence);
      const proximityKm = Number.isFinite(Number(entry.radar?.distance))
        ? Number(entry.radar.distance)
        : safeLocation
          ? distanceKm(
              safeLocation.latitude,
              safeLocation.longitude,
              entry.coordinate.latitude,
              entry.coordinate.longitude
            )
          : Number.MAX_SAFE_INTEGER;
      const routeDistanceMeters =
        sanitizedRouteCoords.length > 1
          ? RadarService.minDistanceToRouteMeters(entry.coordinate, sanitizedRouteCoords)
          : Number.POSITIVE_INFINITY;
      const routePriority =
        routeDistanceMeters <= RADAR_ROUTE_PRIORITY_CORRIDOR_METERS ? 1 : 0;

      return {
        ...entry,
        score: {
          routePriority,
          proximityKm,
          confidence: Number.isFinite(confidence) ? confidence : 0,
        },
      };
    });

    scored.sort((a, b) => {
      if (b.score.routePriority !== a.score.routePriority) {
        return b.score.routePriority - a.score.routePriority;
      }
      if (a.score.proximityKm !== b.score.proximityKm) {
        return a.score.proximityKm - b.score.proximityKm;
      }
      return b.score.confidence - a.score.confidence;
    });

    const rendered = scored.slice(0, RADAR_MARKER_RENDER_CAP);
    const routePrioritizedCount = rendered.filter(
      (entry) => entry.score.routePriority > 0
    ).length;

    return {
      rendered,
      visibleCount: visibleEntries.length,
      inputCount: sanitizedRadars.validEntries.length,
      droppedByCap: Math.max(0, visibleEntries.length - rendered.length),
      routePrioritizedCount,
    };
  }, [initialRegion, sanitizedRadars.validEntries, sanitizedRouteCoords, safeLocation, visibleRegion]);

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
          zIndex={90}
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
          zIndex={91}
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
          zIndex={92}
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
        <Marker 
          key="route-destination" 
          coordinate={finalDestination} 
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={false}
        >
          <DestinationFlagSvg 
            width={getResponsiveWidth(32)}
            height={getResponsiveHeight(40)}
          />
        </Marker>
      );
    }

    selectedRadarEntries.rendered.forEach(({ key, radar, coordinate }) => {
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
  }, [finalDestination, safeHeading, safeLocation, selectedRadarEntries.rendered, sanitizedRouteCoords]);

  const invalidSummaryRef = useRef('');
  const invalidRadarCount = sanitizedRadars.invalidCount;
  useEffect(() => {
    if (!MAP_COORD_TRACE_ENABLED) return;

    const summary = `route:${invalidRouteCoordCount}|radar:${invalidRadarCount}|dest:${invalidDestinationPoint ? 1 : 0}|cap:${selectedRadarEntries.droppedByCap}`;
    if (summary === invalidSummaryRef.current) return;
    invalidSummaryRef.current = summary;

    if (
      invalidRouteCoordCount > 0 ||
      invalidRadarCount > 0 ||
      invalidDestinationPoint ||
      selectedRadarEntries.droppedByCap > 0
    ) {
      console.debug('[RadarMap] Dropped invalid map coordinates', {
        route: invalidRouteCoordCount,
        radars: invalidRadarCount,
        destination: invalidDestinationPoint ? 1 : 0,
        droppedByCap: selectedRadarEntries.droppedByCap,
      });
    }
  }, [
    invalidDestinationPoint,
    invalidRadarCount,
    invalidRouteCoordCount,
    selectedRadarEntries.droppedByCap,
  ]);

  const markerTelemetryRef = useRef('');
  useEffect(() => {
    const summary = `${selectedRadarEntries.inputCount}|${selectedRadarEntries.visibleCount}|${selectedRadarEntries.rendered.length}|${selectedRadarEntries.droppedByCap}|${selectedRadarEntries.routePrioritizedCount}`;
    if (summary === markerTelemetryRef.current) return;
    markerTelemetryRef.current = summary;

    RadarService.trackMarkerRenderStats({
      inputCount: selectedRadarEntries.inputCount,
      visibleCount: selectedRadarEntries.visibleCount,
      renderedCount: selectedRadarEntries.rendered.length,
      droppedByCap: selectedRadarEntries.droppedByCap,
      routePrioritizedCount: selectedRadarEntries.routePrioritizedCount,
    });
  }, [selectedRadarEntries]);

  const padding = mapPadding || { top: 200, right: 40, bottom: 280, left: 40 };

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      customMapStyle={modernMapStyle}
      provider={PROVIDER_GOOGLE}
      initialRegion={initialRegion}
      showsUserLocation
      showsMyLocationButton={false}
      followsUserLocation={false}
      userLocationUpdateInterval={1000}
      userLocationFastestInterval={500}
      showsCompass={false}
      showsTraffic={false}
      showsBuildings={false}
      showsIndoors={false}
      showsIndoorLevelPicker={false}
      mapPadding={padding}
      pitchEnabled={false}
      rotateEnabled={false}
      zoomEnabled={mapInteractionEnabled}
      scrollEnabled={mapInteractionEnabled}
      toolbarEnabled={false}
      zoomControlEnabled={false}
      moveOnMarkerPress={false}
      onPanDrag={() => {
        if (mapInteractionEnabled) onMapTouchStart?.();
      }}
      onRegionChangeComplete={(region: any, details?: { isGesture?: boolean }) => {
        const normalizedRegion = toValidRegion(region);
        if (normalizedRegion) {
          setVisibleRegion((prev) =>
            shouldUpdateRegion(prev, normalizedRegion) ? normalizedRegion : prev
          );
        }
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
  // Radar marker badges
  speedLimitBadge: {
    width: getResponsiveWidth(36),
    height: getResponsiveHeight(36),
    borderRadius: getResponsiveMargin(18),
    backgroundColor: '#FF5252',
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
  speedLimitText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold'
  },
  
  // User marker container
  userMarkerContainer: {
    width: getResponsiveWidth(64),
    height: getResponsiveHeight(88),
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default RadarMap;

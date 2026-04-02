import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView, { Circle, Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import { StyleSheet, Platform, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { modernMapStyle } from '../utils/modernMapStyle';
import { getResponsiveWidth } from '../constants/layout';
import { RadarService } from '../services/RadarService';

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


const getRadarMarkerKind = (type: string | undefined, markerKind?: string) => {
  if (markerKind) return markerKind;
  if (type === 'red_light') return 'red_light';
  if (type === 'police') return 'police';
  if (type === 'mobile') return 'mobile';
  if (type === 'traffic_enforcement') return 'traffic_enforcement';
  return 'camera';
};

const getRadarMarkerConfig = (type: string | undefined, markerKind?: string) => {
  const kind = getRadarMarkerKind(type, markerKind);

  if (kind === 'red_light') {
    return {
      backgroundColor: '#3A0910',
      borderColor: '#FF5B5B',
      coreColor: '#FFE8E8',
    };
  }
  if (kind === 'police') {
    return {
      backgroundColor: '#0E2748',
      borderColor: '#60A5FA',
      coreColor: '#E0F2FE',
    };
  }
  if (kind === 'mobile') {
    return {
      backgroundColor: '#3B1D07',
      borderColor: '#F59E0B',
      coreColor: '#FEF3C7',
    };
  }
  if (kind === 'traffic_enforcement') {
    return {
      backgroundColor: '#3A0D17',
      borderColor: '#FB7185',
      coreColor: '#FFE4E6',
    };
  }
  return {
    backgroundColor: '#3A0F0A',
    borderColor: '#FF7849',
    coreColor: '#FFF4EE',
  };
};

const getRadarTitle = (type: string | undefined): string => {
  if (type === 'police') return 'Police';
  if (type === 'red_light') return 'Red Light Camera';
  if (type === 'fixed') return 'Fixed Camera';
  if (type === 'mobile') return 'Mobile Trap';
  if (type === 'traffic_enforcement') return 'Traffic Enforcement';
  return 'Speed Camera';
};

const RadarMarker = React.memo(({ coordinate, radar, onPress }: any) => {
  const type = radar?.type;
  const markerConfig = getRadarMarkerConfig(type, radar?.markerKind);
  const title = getRadarTitle(type);
  const description =
    type === 'fixed' && Number.isFinite(Number(radar?.speedLimit))
      ? `Speed limit ${Number(radar.speedLimit)}`
      : undefined;

  return (
    <Marker
      coordinate={coordinate}
      tracksViewChanges={false}
      title={title}
      description={description}
      onPress={onPress}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View
        style={[
          styles.radarMarker,
          {
            backgroundColor: markerConfig.backgroundColor,
            borderColor: markerConfig.borderColor,
          },
        ]}
      >
        <View
          style={[
            styles.radarMarkerCore,
            { backgroundColor: markerConfig.coreColor },
          ]}
        />
      </View>
    </Marker>
  );
}, (prevProps, nextProps) => {
  // Daha derinlemesine karşılaştırma için props kontrolü
  return (
    prevProps.coordinate?.latitude === nextProps.coordinate?.latitude &&
    prevProps.coordinate?.longitude === nextProps.coordinate?.longitude &&
    prevProps.radar?.type === nextProps.radar?.type &&
    prevProps.radar?.markerKind === nextProps.radar?.markerKind &&
    prevProps.radar?.speedLimit === nextProps.radar?.speedLimit &&
    prevProps.onPress === nextProps.onPress
  );
});

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
  showRadarMarkers = false,
}: any) => {
  const toValidCoordinate = useCallback((value: any): LatLng | null => {
    const latitude = Number(value?.latitude);
    const longitude = Number(value?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return null;
    }

    return { latitude, longitude };
  }, []);

  const toValidRegion = useCallback((value: any): MapRegion | null => {
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
  }, []);

  const buildPaddedRegion = useCallback((region: MapRegion, paddingFactor: number): MapRegion => ({
    ...region,
    latitudeDelta: region.latitudeDelta * (1 + paddingFactor),
    longitudeDelta: region.longitudeDelta * (1 + paddingFactor),
  }), []);

  const isCoordinateInsideRegion = useCallback((coordinate: LatLng, region: MapRegion): boolean => {
    const halfLat = region.latitudeDelta / 2;
    const halfLon = region.longitudeDelta / 2;
    return (
      coordinate.latitude >= region.latitude - halfLat &&
      coordinate.latitude <= region.latitude + halfLat &&
      coordinate.longitude >= region.longitude - halfLon &&
      coordinate.longitude <= region.longitude + halfLon
    );
  }, []);

  const shouldUpdateRegion = useCallback((prev: MapRegion, next: MapRegion): boolean => {
    const centerDelta = Math.abs(prev.latitude - next.latitude) + Math.abs(prev.longitude - next.longitude);
    const zoomDelta =
      Math.abs(prev.latitudeDelta - next.latitudeDelta) +
      Math.abs(prev.longitudeDelta - next.longitudeDelta);
    return centerDelta > 0.00015 || zoomDelta > 0.00015;
  }, []);

  const distanceKm = useCallback((aLat: number, aLon: number, bLat: number, bLon: number): number => {
    const dLat = ((bLat - aLat) * Math.PI) / 180;
    const dLon = ((bLon - aLon) * Math.PI) / 180;
    const arc =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((aLat * Math.PI) / 180) *
        Math.cos((bLat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return 6371 * (2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc)));
  }, []);

  const safeLocation = useMemo(() => toValidCoordinate(location), [location]);
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
  const locationAccuracyMeters = useMemo(() => {
    const value = Number(location?.accuracy);
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [location?.accuracy]);

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

    if (finalDestination) {
      children.push(
        <Marker
          key="route-destination"
          coordinate={finalDestination}
          title="Destination"
          tracksViewChanges={false}
          anchor={{ x: 0.5, y: 0.9 }}
        >
          <View style={styles.destinationMarker}>
            <MaterialCommunityIcons name="flag-checkered" size={16} color="#0B1424" />
          </View>
        </Marker>
      );
    }

    if (safeLocation) {
      if (locationAccuracyMeters != null && locationAccuracyMeters <= 180) {
        children.push(
          <Circle
            key="user-accuracy"
            center={safeLocation}
            radius={Math.max(12, Math.min(locationAccuracyMeters, 140))}
            fillColor="rgba(77, 149, 255, 0.12)"
            strokeColor="rgba(77, 149, 255, 0.22)"
            strokeWidth={1}
            zIndex={94}
          />
        );
      }

      children.push(
        <Marker
          key="user-location"
          coordinate={safeLocation}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          zIndex={95}
        >
          <View style={styles.userMarkerOuter}>
            <View style={styles.userMarkerInner} />
          </View>
        </Marker>
      );
    }

    if (showRadarMarkers) {
      selectedRadarEntries.rendered.forEach(({ key, radar, coordinate }) => {
        children.push(
          <RadarMarker
            key={key}
            coordinate={coordinate}
            radar={radar}
            onPress={() => onRadarPressRef.current?.(radar)}
          />
        );
      });
    }

    return children;
  }, [finalDestination, locationAccuracyMeters, safeLocation, selectedRadarEntries.rendered, sanitizedRouteCoords, showRadarMarkers]);

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
      showsUserLocation={false}
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
      rotateEnabled={mapInteractionEnabled}
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
      loadingEnabled={true}
      loadingBackgroundColor="#f8fafc"
      loadingIndicatorColor="#3b82f6"
      onMapReady={() => {
        // Harita hazır olduğunda performans için başlangıç animasyonu
        if (mapRef.current && safeLocation) {
          mapRef.current.animateToRegion({
            latitude: safeLocation.latitude,
            longitude: safeLocation.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 800);
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
  return (
    prev.radars === next.radars &&
    prev.routeCoords === next.routeCoords &&
    prev.destinationPoint?.latitude === next.destinationPoint?.latitude &&
    prev.destinationPoint?.longitude === next.destinationPoint?.longitude &&
    prev.mapPadding === next.mapPadding &&
    prev.mapInteractionEnabled === next.mapInteractionEnabled &&
    prev.showRadarMarkers === next.showRadarMarkers &&
    prev.location?.latitude === next.location?.latitude &&
    prev.location?.longitude === next.location?.longitude &&
    prev.location?.accuracy === next.location?.accuracy
  );
});

const styles = StyleSheet.create({
  radarMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  radarMarkerCore: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  destinationMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ECDC4',
    borderWidth: 1.5,
    borderColor: '#D9FFFB',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  userMarkerOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(109, 174, 255, 0.26)',
    borderWidth: 2,
    borderColor: 'rgba(224, 242, 254, 0.96)',
  },
  userMarkerInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4D95FF',
    borderWidth: 1,
    borderColor: '#F8FAFC',
  },
});

export default RadarMap;

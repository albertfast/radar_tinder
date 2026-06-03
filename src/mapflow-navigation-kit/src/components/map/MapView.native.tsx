import React, { useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import RNMapView, {
  LatLng,
  MapPressEvent,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  Region,
} from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';

import { MAP_MARKER_ICON_URIS } from '../../../../native/mapMarkerSvgAssets';
import type { MapOverlayMarker, MapPoiMarker, MapMessage, RouteChoice, RouteData } from '../../types/map';
import type { MapViewport } from '../../types/viewport';
import type { NativeMapHandle } from './map-bridge';

export { useMapBridge } from './map-bridge';

type MapPoint = { lat: number; lng: number };
type NativeRoute = RouteChoice | (RouteData & { id?: string; label?: string });
type UserMarkerState = MapPoint & {
  heading?: number | null;
  routeHeading?: number | null;
  vehicleMarkerId?: string | null;
};

interface MapViewProps {
  onMapReady?: () => void;
  onMapError?: (message: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  onOverlayMarkerPress?: (markerId: string) => void;
  onRouteSelect?: (routeId: string) => void;
  onViewportChange?: (viewport: MapViewport) => void;
  webViewRef?: React.Ref<NativeMapHandle | null>;
  initialLocation?: MapPoint | null;
  reloadToken?: number;
}

const INITIAL_DELTA = 0.024;
const ROUTE_COLOR = '#2DD4BF';
const ROUTE_SHADOW = 'rgba(20, 184, 166, 0.34)';
const ALT_ROUTE_COLOR = 'rgba(148, 163, 184, 0.58)';

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#08111f' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#b8c7dc' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#050b14' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1f3b57' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#071423' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#0f2f27' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.government', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.place_of_worship', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#17613a' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#a7f3d0' }] },
  { featureType: 'poi.park', elementType: 'labels.text.stroke', stylers: [{ color: '#062017' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1d3554' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0b1627' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#244d77' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a8f86' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#0e3d3a' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#17304e' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#164e73' }] },
] as const;

function isFiniteCoordinate(lat?: number, lng?: number): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function normalizeBearing(value?: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const normalized = value % 360;
  return normalized >= 0 ? normalized : normalized + 360;
}

function resolveBearing(heading?: number | null, routeHeading?: number | null, preferRoute = false): number {
  const gpsBearing = typeof heading === 'number' && Number.isFinite(heading) && heading > 0 ? heading : null;
  const routeBearing =
    typeof routeHeading === 'number' && Number.isFinite(routeHeading) ? routeHeading : null;
  return normalizeBearing(
    preferRoute
      ? routeBearing ?? gpsBearing ?? 0
      : gpsBearing ?? routeBearing ?? 0
  );
}

function destinationPoint(lat: number, lng: number, bearing: number, meters: number): MapPoint {
  if (!isFiniteCoordinate(lat, lng) || !Number.isFinite(bearing) || !Number.isFinite(meters) || meters <= 0) {
    return { lat, lng };
  }

  const radius = 6378137;
  const angularDistance = meters / radius;
  const theta = (bearing * Math.PI) / 180;
  const phi1 = (lat * Math.PI) / 180;
  const lambda1 = (lng * Math.PI) / 180;
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(angularDistance) +
      Math.cos(phi1) * Math.sin(angularDistance) * Math.cos(theta)
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(angularDistance) * Math.cos(phi1),
      Math.cos(angularDistance) - Math.sin(phi1) * Math.sin(phi2)
    );

  return {
    lat: (phi2 * 180) / Math.PI,
    lng: (((lambda2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

function routeCoordinatePairToLatLng(pair: [number, number]): LatLng | null {
  const first = Number(pair?.[0]);
  const second = Number(pair?.[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;

  if (Math.abs(first) > 90 && isFiniteCoordinate(second, first)) {
    return { latitude: second, longitude: first };
  }

  if (Math.abs(second) > 90 && isFiniteCoordinate(first, second)) {
    return { latitude: first, longitude: second };
  }

  if (isFiniteCoordinate(second, first)) {
    return { latitude: second, longitude: first };
  }

  if (isFiniteCoordinate(first, second)) {
    return { latitude: first, longitude: second };
  }

  return null;
}

function routeCoordinates(route?: NativeRoute | null): LatLng[] {
  if (!route?.geometry?.length) return [];
  return route.geometry
    .map(routeCoordinatePairToLatLng)
    .filter((point): point is LatLng => Boolean(point));
}

function toLocalMeters(lat: number, lng: number, originLat: number, originLng: number) {
  const metersPerLng = Math.max(1, Math.abs(Math.cos((originLat * Math.PI) / 180) * 111320));
  return {
    x: (lng - originLng) * metersPerLng,
    y: (lat - originLat) * 111320,
    metersPerLng,
  };
}

function projectToRoute(lat: number, lng: number, route?: NativeRoute | null) {
  const coordinates = routeCoordinates(route);
  if (coordinates.length < 2) return null;

  let best: { lat: number; lng: number; distanceMeters: number } | null = null;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const startMeters = toLocalMeters(start.latitude, start.longitude, lat, lng);
    const endMeters = toLocalMeters(end.latitude, end.longitude, lat, lng);
    const dx = endMeters.x - startMeters.x;
    const dy = endMeters.y - startMeters.y;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq > 0
        ? Math.max(0, Math.min(1, ((0 - startMeters.x) * dx + (0 - startMeters.y) * dy) / lengthSq))
        : 0;
    const projectedX = startMeters.x + dx * t;
    const projectedY = startMeters.y + dy * t;
    const projectedLat = lat + projectedY / 111320;
    const projectedLng = lng + projectedX / startMeters.metersPerLng;
    const distanceMeters = Math.hypot(projectedX, projectedY);

    if (isFiniteCoordinate(projectedLat, projectedLng) && (!best || distanceMeters < best.distanceMeters)) {
      best = { lat: projectedLat, lng: projectedLng, distanceMeters };
    }
  }

  return best;
}

function regionToViewport(region: Region): MapViewport {
  const halfLat = region.latitudeDelta / 2;
  const halfLng = region.longitudeDelta / 2;
  const zoom = Math.max(0, Math.min(21, Math.log2(360 / Math.max(region.longitudeDelta, 0.000001))));

  return {
    center: { lat: region.latitude, lng: region.longitude },
    zoom,
    bounds: {
      north: Math.min(90, region.latitude + halfLat),
      south: Math.max(-90, region.latitude - halfLat),
      east: Math.min(180, region.longitude + halfLng),
      west: Math.max(-180, region.longitude - halfLng),
    },
  };
}

function normalizeRouteList(payload: any): { selectedRouteId?: string; routes: NativeRoute[] } {
  if (payload?.routes && Array.isArray(payload.routes)) {
    return {
      selectedRouteId: payload.selectedRouteId,
      routes: payload.routes.filter((route: NativeRoute) => route?.geometry?.length > 1),
    };
  }

  if (payload?.geometry?.length > 1) {
    return {
      selectedRouteId: payload.id,
      routes: [payload],
    };
  }

  return { selectedRouteId: undefined, routes: [] };
}

function markerIconKey(marker: MapOverlayMarker): keyof typeof MAP_MARKER_ICON_URIS {
  const type = String(marker.type || '').toLowerCase();
  const kind = String(marker.markerKind || '').toLowerCase();
  if (type === 'red_light' || kind === 'red_light') return 'redLight';
  return 'speedCamera';
}

function fallbackPoiIcon(category?: string): keyof typeof MaterialCommunityIcons.glyphMap {
  const normalized = String(category || '').toLowerCase();
  if (normalized.includes('gas')) return 'gas-station';
  if (normalized.includes('park')) return 'parking';
  if (normalized.includes('hospital') || normalized.includes('clinic')) return 'hospital-box';
  if (normalized.includes('restaurant') || normalized.includes('cafe')) return 'silverware-fork-knife';
  if (normalized.includes('school') || normalized.includes('university')) return 'school';
  if (normalized.includes('hotel')) return 'bed';
  return 'map-marker';
}

function svgDataUriToXml(uri?: string): string | null {
  if (!uri || !uri.startsWith('data:image/svg+xml')) return null;
  const commaIndex = uri.indexOf(',');
  if (commaIndex === -1) return null;
  const encoded = uri.slice(commaIndex + 1);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function NativeSvgMarker({
  uri,
  size,
  fallback,
  fallbackColor,
  compact = false,
}: {
  uri?: string;
  size: number;
  fallback: keyof typeof MaterialCommunityIcons.glyphMap;
  fallbackColor: string;
  compact?: boolean;
}) {
  const xml = svgDataUriToXml(uri);
  return (
    <View style={[styles.markerShell, compact && styles.markerShellCompact, { width: size, height: size }]}>
      {xml ? (
        <SvgXml width={size} height={size} xml={xml} />
      ) : (
        <MaterialCommunityIcons name={fallback} size={Math.max(16, size - 8)} color={fallbackColor} />
      )}
    </View>
  );
}

function VehicleMarker({ marker }: { marker: UserMarkerState }) {
  const uri = MAP_MARKER_ICON_URIS.vehicle;
  const xml = svgDataUriToXml(uri);
  const bearing = resolveBearing(marker.heading, marker.routeHeading, false);

  return (
    <View style={[styles.vehicleRotator, { transform: [{ rotate: `${bearing}deg` }] }]}>
      {xml ? (
        <SvgXml width={42} height={42} xml={xml} />
      ) : (
        <MaterialCommunityIcons name="navigation" size={30} color="#FACC15" />
      )}
    </View>
  );
}

export default function MapView({
  onMapReady,
  onMapClick,
  onOverlayMarkerPress,
  onRouteSelect,
  onViewportChange,
  webViewRef,
  initialLocation,
}: MapViewProps) {
  const nativeMapRef = useRef<RNMapView | null>(null);
  const cameraZoomRef = useRef(16.2);
  const userMarkerRef = useRef<UserMarkerState | null>(
    initialLocation ? { ...initialLocation, heading: 0, routeHeading: null } : null
  );
  const rawUserPointRef = useRef<MapPoint | null>(initialLocation ?? null);
  const routesRef = useRef<NativeRoute[]>([]);
  const selectedRouteIdRef = useRef<string | undefined>(undefined);
  const [userMarker, setUserMarkerState] = useState<UserMarkerState | null>(
    initialLocation ? { ...initialLocation, heading: 0, routeHeading: null } : null
  );
  const [destination, setDestinationState] = useState<MapPoint | null>(null);
  const [routes, setRoutes] = useState<NativeRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | undefined>(undefined);
  const [overlayMarkers, setOverlayMarkers] = useState<MapOverlayMarker[]>([]);
  const [poiMarkers, setPoiMarkers] = useState<MapPoiMarker[]>([]);

  const updateUserMarker = useCallback((next: UserMarkerState | null) => {
    userMarkerRef.current = next;
    setUserMarkerState(next);
  }, []);

  const updateDestination = useCallback((next: MapPoint | null) => {
    setDestinationState(next);
  }, []);

  const initialRegion = useMemo<Region>(
    () => ({
      latitude: initialLocation?.lat ?? 37.7749,
      longitude: initialLocation?.lng ?? -122.4194,
      latitudeDelta: INITIAL_DELTA,
      longitudeDelta: INITIAL_DELTA,
    }),
    [initialLocation?.lat, initialLocation?.lng]
  );

  const selectedRoute = useMemo(() => {
    if (!routes.length) return null;
    return routes.find((route) => route.id && route.id === selectedRouteId) ?? routes[0];
  }, [routes, selectedRouteId]);

  const activeRouteFromRefs = useCallback((explicitRoute?: NativeRoute | null) => {
    if (explicitRoute) return explicitRoute;
    const list = routesRef.current;
    const selectedId = selectedRouteIdRef.current;
    return list.find((route) => route.id && route.id === selectedId) ?? list[0] ?? null;
  }, []);

  const routeDisplayPoint = useCallback(
    (lat: number, lng: number, navigationMode: boolean, explicitRoute?: NativeRoute | null): MapPoint => {
      const route = activeRouteFromRefs(explicitRoute);
      const projection = route ? projectToRoute(lat, lng, route) : null;
      const maxSnapDistance = navigationMode ? 180 : 900;

      if (projection && projection.distanceMeters <= maxSnapDistance) {
        return { lat: projection.lat, lng: projection.lng };
      }

      return { lat, lng };
    },
    [activeRouteFromRefs]
  );

  const animateToPayload = useCallback((payload: any, followMode = false) => {
    const lat = Number(payload?.lat);
    const lng = Number(payload?.lng);
    if (!isFiniteCoordinate(lat, lng)) return;

    const navigationMode = Boolean(payload?.navigation || followMode);
    const displayPoint = routeDisplayPoint(lat, lng, navigationMode);
    const bearing = navigationMode
      ? resolveBearing(payload?.heading, payload?.routeHeading, true)
      : resolveBearing(payload?.heading, payload?.routeHeading, false);
    const speed = Number.isFinite(Number(payload?.speed)) ? Number(payload.speed) : 0;
    const leadMeters = navigationMode ? Math.max(45, Math.min(180, 65 + speed * 4.2)) : 0;
    const target = leadMeters > 0
      ? destinationPoint(displayPoint.lat, displayPoint.lng, bearing, leadMeters)
      : displayPoint;
    const zoom =
      typeof payload?.zoom === 'number' && Number.isFinite(payload.zoom)
        ? payload.zoom
        : navigationMode
          ? Math.max(16.4, Math.min(18.2, 17.2 + Math.min(speed, 22) / 48))
          : cameraZoomRef.current;

    cameraZoomRef.current = zoom;
    nativeMapRef.current?.animateCamera(
      {
        center: { latitude: target.lat, longitude: target.lng },
        heading: bearing,
        pitch: 0,
        zoom,
      },
      { duration: followMode ? 700 : 850 }
    );
  }, [routeDisplayPoint]);

  const fitRoute = useCallback((route: NativeRoute | null) => {
    const coordinates = routeCoordinates(route);
    if (coordinates.length < 2) return;
    setTimeout(() => {
      nativeMapRef.current?.fitToCoordinates(coordinates, {
        animated: true,
        edgePadding: { top: 118, right: 54, bottom: 238, left: 54 },
      });
    }, 80);
  }, []);

  const focusRoutePreview = useCallback(
    (route: NativeRoute | null) => {
      if (!route) return;
      const currentUser = rawUserPointRef.current ?? userMarkerRef.current;
      if (!currentUser) {
        fitRoute(route);
        return;
      }

      const focusPoint = routeDisplayPoint(currentUser.lat, currentUser.lng, false, route);
      const zoom =
        typeof route.distance === 'number' && route.distance > 9000
          ? 13.4
          : typeof route.distance === 'number' && route.distance > 3500
            ? 14.2
            : 15.1;

      cameraZoomRef.current = zoom;
      nativeMapRef.current?.animateCamera(
        {
          center: { latitude: focusPoint.lat, longitude: focusPoint.lng },
          heading: 0,
          pitch: 0,
          zoom,
        },
        { duration: 700 }
      );
    },
    [fitRoute, routeDisplayPoint]
  );

  const zoomBy = useCallback(async (delta: number) => {
    try {
      const camera = await nativeMapRef.current?.getCamera();
      const currentZoom = typeof camera?.zoom === 'number' ? camera.zoom : cameraZoomRef.current;
      const nextZoom = Math.max(3, Math.min(20, currentZoom + delta));
      cameraZoomRef.current = nextZoom;
      nativeMapRef.current?.animateCamera({ zoom: nextZoom }, { duration: 220 });
    } catch {
      cameraZoomRef.current = Math.max(3, Math.min(20, cameraZoomRef.current + delta));
    }
  }, []);

  const dispatchMapMessage = useCallback(
    (message: MapMessage) => {
      switch (message.type) {
        case 'updateLocation': {
          const lat = Number(message.payload?.lat);
          const lng = Number(message.payload?.lng);
          if (!isFiniteCoordinate(lat, lng)) return;
          const navigationMode = Boolean(message.payload?.navigation);
          rawUserPointRef.current = { lat, lng };
          const displayPoint = routeDisplayPoint(lat, lng, navigationMode);
          updateUserMarker({
            lat: displayPoint.lat,
            lng: displayPoint.lng,
            heading: message.payload?.heading,
            routeHeading: message.payload?.routeHeading,
            vehicleMarkerId: message.payload?.vehicleMarkerId,
          });
          break;
        }
        case 'updateDestination': {
          const lat = Number(message.payload?.lat);
          const lng = Number(message.payload?.lng);
          updateDestination(isFiniteCoordinate(lat, lng) ? { lat, lng } : null);
          break;
        }
        case 'updateRoute':
        case 'updateRoutes': {
          const next = normalizeRouteList(message.payload);
          const activeRoute = next.routes.find((route) => route.id && route.id === next.selectedRouteId) ?? next.routes[0] ?? null;
          routesRef.current = next.routes;
          selectedRouteIdRef.current = activeRoute?.id ?? next.selectedRouteId;
          setRoutes(next.routes);
          setSelectedRouteId(activeRoute?.id ?? next.selectedRouteId);
          focusRoutePreview(activeRoute);
          break;
        }
        case 'clearRoute':
          routesRef.current = [];
          selectedRouteIdRef.current = undefined;
          setRoutes([]);
          setSelectedRouteId(undefined);
          updateDestination(null);
          break;
        case 'updateOverlays':
          setOverlayMarkers(Array.isArray(message.payload?.markers) ? message.payload.markers : []);
          break;
        case 'clearOverlays':
          setOverlayMarkers([]);
          break;
        case 'updatePoiMarkers':
          setPoiMarkers(Array.isArray(message.payload?.markers) ? message.payload.markers : []);
          break;
        case 'flyTo':
          animateToPayload(message.payload, false);
          break;
        case 'followUser':
          animateToPayload(message.payload, true);
          break;
        case 'zoomBy':
          void zoomBy(Number(message.payload?.delta) || 0);
          break;
        case 'zoomIn':
          void zoomBy(1);
          break;
        case 'zoomOut':
          void zoomBy(-1);
          break;
        default:
          break;
      }
    },
    [animateToPayload, focusRoutePreview, routeDisplayPoint, updateDestination, updateUserMarker, zoomBy]
  );

  useImperativeHandle(webViewRef, () => ({ dispatchMapMessage }), [dispatchMapMessage]);

  const handleMapReady = useCallback(() => {
    onMapReady?.();
    if (initialLocation) {
      animateToPayload({ lat: initialLocation.lat, lng: initialLocation.lng, zoom: 16.4 }, false);
    }
  }, [animateToPayload, initialLocation, onMapReady]);

  const handlePress = useCallback(
    (event: MapPressEvent) => {
      const coordinate = event.nativeEvent.coordinate;
      if (!coordinate) return;
      onMapClick?.(coordinate.latitude, coordinate.longitude);
    },
    [onMapClick]
  );

  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
      cameraZoomRef.current = Math.max(3, Math.min(20, Math.log2(360 / Math.max(region.longitudeDelta, 0.000001))));
      onViewportChange?.(regionToViewport(region));
    },
    [onViewportChange]
  );

  const renderRoute = (route: NativeRoute, active: boolean, index: number) => {
    const coordinates = routeCoordinates(route);
    if (coordinates.length < 2) return null;
    const routeId = route.id ?? `route-${index}`;

    return (
      <React.Fragment key={routeId}>
        {active ? (
          <Polyline
            coordinates={coordinates}
            strokeColor={ROUTE_SHADOW}
            strokeWidth={13}
            lineCap="round"
            lineJoin="round"
            zIndex={18}
          />
        ) : null}
        <Polyline
          coordinates={coordinates}
          strokeColor={active ? ROUTE_COLOR : ALT_ROUTE_COLOR}
          strokeWidth={active ? 7 : 4}
          lineCap="round"
          lineJoin="round"
          tappable
          onPress={() => route.id && onRouteSelect?.(route.id)}
          zIndex={active ? 20 : 14}
        />
      </React.Fragment>
    );
  };

  return (
    <View style={styles.container}>
      <RNMapView
        ref={nativeMapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={initialRegion}
        customMapStyle={DARK_MAP_STYLE as any}
        mapType="standard"
        loadingEnabled
        loadingBackgroundColor="#050c18"
        loadingIndicatorColor={ROUTE_COLOR}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        showsBuildings
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled
        moveOnMarkerPress={false}
        onMapReady={handleMapReady}
        onPress={handlePress}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {routes.map((route, index) => renderRoute(route, route === selectedRoute, index))}

        {destination ? (
          <Marker
            coordinate={{ latitude: destination.lat, longitude: destination.lng }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={35}
          >
            <NativeSvgMarker
              uri={MAP_MARKER_ICON_URIS.destination}
              size={34}
              fallback="flag-checkered"
              fallbackColor="#34D399"
            />
          </Marker>
        ) : null}

        {poiMarkers.slice(0, 56).map((marker) => {
          const uri = MAP_MARKER_ICON_URIS[marker.iconKey as keyof typeof MAP_MARKER_ICON_URIS];
          return (
            <Marker
              key={`poi-${marker.id}`}
              coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={8 + Math.min(20, marker.priority || 0)}
            >
              <NativeSvgMarker
                uri={uri}
                size={24}
                compact
                fallback={fallbackPoiIcon(marker.category)}
                fallbackColor="#5EEAD4"
              />
            </Marker>
          );
        })}

        {overlayMarkers.slice(0, 80).map((marker) => {
          const iconKey = markerIconKey(marker);
          const isRedLight = iconKey === 'redLight';
          return (
            <Marker
              key={`overlay-${marker.id}`}
              coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={isRedLight ? 42 : 46}
              onPress={() => onOverlayMarkerPress?.(String(marker.id))}
            >
              <NativeSvgMarker
                uri={MAP_MARKER_ICON_URIS[iconKey]}
                size={isRedLight ? 25 : 30}
                fallback={isRedLight ? 'traffic-light' : 'camera'}
                fallbackColor={isRedLight ? '#F87171' : '#22D3EE'}
              />
            </Marker>
          );
        })}

        {userMarker ? (
          <Marker
            coordinate={{ latitude: userMarker.lat, longitude: userMarker.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={60}
            flat
          >
            <VehicleMarker marker={userMarker} />
          </Marker>
        ) : null}
      </RNMapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050c18',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  markerShell: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  markerShellCompact: {
    opacity: 0.95,
  },
  vehicleRotator: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

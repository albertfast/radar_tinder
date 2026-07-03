import React, { useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
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
import { MAP_ROUTE_COLORS } from '../../utils/mapTheme';
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
const ROUTE_COLOR = MAP_ROUTE_COLORS.line;
const ROUTE_SHADOW = MAP_ROUTE_COLORS.glow;
const ROUTE_HIGHLIGHT = MAP_ROUTE_COLORS.highlight;
const ALT_ROUTE_COLOR = MAP_ROUTE_COLORS.altLine;


const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#071016' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#D7E4E9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#061015' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#28404B' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0A151A' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#0B171D' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#123225' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.government', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.place_of_worship', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#145136' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#97E8BE' }] },
  { featureType: 'poi.park', elementType: 'labels.text.stroke', stylers: [{ color: '#061B14' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#273944' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0E1A21' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#B9C9D1' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#35525A' }] },
  { featureType: 'road.arterial', elementType: 'geometry.stroke', stylers: [{ color: '#13252B' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1F8F86' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#0D3F3C' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#ECFFFB' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#21313C' }] },
  { featureType: 'road.local', elementType: 'geometry.stroke', stylers: [{ color: '#101B23' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#123C47' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#8ECFD2' }] },
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
  // iOS Apple Maps fires the map's onPress even when a tappable polyline is
  // tapped. Without this guard, tapping an alternative route line both selects
  // the route AND drops a new destination pin (triggering a reroute). We record
  // when a route polyline was tapped and swallow the map press that follows.
  const routePressedAtRef = useRef(0);
  const userMarkerRef = useRef<UserMarkerState | null>(
    initialLocation ? { ...initialLocation, heading: 0, routeHeading: null } : null
  );
  const rawUserPointRef = useRef<MapPoint | null>(initialLocation ?? null);
  const routesRef = useRef<NativeRoute[]>([]);
  const selectedRouteIdRef = useRef<string | undefined>(undefined);
  const [destination, setDestinationState] = useState<MapPoint | null>(null);
  const [routes, setRoutes] = useState<NativeRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | undefined>(undefined);
  const [overlayMarkers, setOverlayMarkers] = useState<MapOverlayMarker[]>([]);
  const [poiMarkers, setPoiMarkers] = useState<MapPoiMarker[]>([]);

  // Kullanıcı/araç konumu artık native konum göstergesiyle (showsUserLocation)
  // çiziliyor. Bu ref sadece rota önizleme odaklamasında (focusRoutePreview)
  // yedek başlangıç noktası olarak kullanılıyor; haritada bir Marker render
  // edilmiyor. Özel SvgXml child marker'ı seyir sırasında iOS'ta cached
  // snapshot'un boşalması yüzünden kayboluyordu — native gösterge bundan muaf.
  const updateUserMarker = useCallback((next: UserMarkerState | null) => {
    userMarkerRef.current = next;
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
      const maxSnapDistance = navigationMode ? 70 : 900;

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
          if (!message.payload?.navigation) {
            focusRoutePreview(activeRoute);
          }
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
      // Ignore the synthetic map press that iOS emits alongside a polyline tap.
      if (Date.now() - routePressedAtRef.current < 400) return;
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
    const color = active ? ROUTE_COLOR : ALT_ROUTE_COLOR;

    // NOTE: Do not pass `strokeColors` here. Every value we would supply is the
    // same color twice (a no-op gradient), but providing it forces
    // react-native-maps onto its custom AIRMapPolylineRenderer gradient path,
    // which crashes on iOS when overlays are removed/re-added while switching
    // the active route. A solid `strokeColor` uses the stable MKPolylineRenderer.
    return (
      <React.Fragment key={routeId}>
        {active ? (
          <Polyline
            coordinates={coordinates}
            strokeColor={ROUTE_SHADOW}
            strokeWidth={MAP_ROUTE_COLORS.glowWidth}
            lineCap="round"
            lineJoin="round"
            zIndex={18}
          />
        ) : null}
        <Polyline
          coordinates={coordinates}
          strokeColor={color}
          strokeWidth={active ? MAP_ROUTE_COLORS.lineWidth : 4}
          lineCap="round"
          lineJoin="round"
          tappable
          onPress={() => {
            routePressedAtRef.current = Date.now();
            if (route.id) onRouteSelect?.(route.id);
          }}
          zIndex={active ? 20 : 14}
        />
        {active ? (
          <Polyline
            coordinates={coordinates}
            strokeColor={ROUTE_HIGHLIGHT}
            strokeWidth={MAP_ROUTE_COLORS.highlightWidth}
            lineCap="round"
            lineJoin="round"
            zIndex={21}
          />
        ) : null}
      </React.Fragment>
    );
  };

  return (
    <View style={styles.container}>
      <RNMapView
        ref={nativeMapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={styles.map}
        initialRegion={initialRegion}
        // customMapStyle (DARK_MAP_STYLE) only applies to Google Maps (Android).
        // On iOS we use the free Apple Maps, which ignores customMapStyle and is
        // instead forced into dark appearance via userInterfaceStyle below.
        customMapStyle={DARK_MAP_STYLE as any}
        userInterfaceStyle="dark"
        mapType="standard"
        loadingEnabled
        loadingBackgroundColor="#050c18"
        loadingIndicatorColor={ROUTE_COLOR}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        // Let Apple Maps render its own native POI icons on iOS.
        showsPointsOfInterest
        showsBuildings
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled
        moveOnMarkerPress={false}
        onMapReady={handleMapReady}
        onPress={handlePress}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {routes.map((route, index) => {
          // Compare by ID to avoid reference equality issues across state updates
          const isActive = selectedRoute != null && (
            (route.id != null && route.id === selectedRoute.id) || route === selectedRoute
          );
          return renderRoute(route, isActive, index);
        })}

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

        {/* Custom POI icons only on Android (Google dark style hides native POIs).
            On iOS we rely on Apple Maps' own native POI icons instead. */}
        {Platform.OS === 'android' && poiMarkers.slice(0, 56).map((marker) => {
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
});

import React, { useEffect, useMemo, useRef, useState } from 'react';
import MapView, { Circle, Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import { StyleSheet, Platform, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { modernMapStyle } from '../utils/modernMapStyle';
import { RadarService } from '../services/RadarService';

// --- Constants & Config ---

const RADAR_MARKER_CAP = 120;
const ROUTE_CORRIDOR_METERS = 180;

const ROUTE_TOKENS = Platform.select({
  ios: { casing: 'rgba(0, 246, 226, 0.30)', fill: '#00F7E6', highlight: 'rgba(245, 255, 254, 0.95)', cW: 8, fW: 5, hW: 2.4 },
  default: { casing: 'rgba(0, 246, 226, 0.26)', fill: '#00F0DD', highlight: 'rgba(232, 255, 252, 0.88)', cW: 9, fW: 6, hW: 2 },
}) || { casing: 'rgba(0, 246, 226, 0.26)', fill: '#00F0DD', highlight: 'rgba(232, 255, 252, 0.88)', cW: 9, fW: 6, hW: 2 };

const RADAR_CONFIG: Record<string, any> = {
  red_light: { icon: 'traffic-light-outline', bg: '#3A0910', border: '#FF5B5B', color: '#FFE8E8', title: 'Red Light Camera' },
  police: { icon: 'police-badge', bg: '#0E2748', border: '#60A5FA', color: '#E0F2FE', title: 'Police' },
  mobile: { icon: 'car-outline', bg: '#3B1D07', border: '#F59E0B', color: '#FEF3C7', title: 'Mobile Trap' },
  traffic_enforcement: { icon: 'shield-alert', bg: '#3A0D17', border: '#FB7185', color: '#FFE4E6', title: 'Traffic Enforcement' },
  default: { icon: 'cctv', bg: '#3A0F0A', border: '#FF7849', color: '#FFF4EE', title: 'Speed Camera' },
};

const getRadarStyle = (type?: string, kind?: string) => 
  RADAR_CONFIG[kind || type || 'default'] || RADAR_CONFIG.default;

// --- Helpers ---

const isValid = (c: any): c is { latitude: number; longitude: number } => 
  c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180;

const distKm = (a: any, b: any) => {
  if (!a || !b) return Infinity;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.sin(dLat/2)**2 + Math.cos(a.latitude*Math.PI/180) * Math.cos(b.latitude*Math.PI/180) * Math.sin(dLon/2)**2), Math.sqrt(1 - Math.sin(dLat/2)**2));
};

// --- Components ---

const RadarMarker = React.memo(({ coordinate, radar, onPress }: any) => {
  const style = getRadarStyle(radar?.type, radar?.markerKind);
  return (
    <Marker coordinate={coordinate} tracksViewChanges={false} onPress={onPress} anchor={{ x: 0.5, y: 0.5 }} title={style.title}>
      <View style={[styles.radarBase, { backgroundColor: style.bg, borderColor: style.border }]}>
        <MaterialCommunityIcons name={style.icon} size={14} color={style.color} />
      </View>
    </Marker>
  );
}, (p, n) => p.coordinate?.latitude === n.coordinate?.latitude && p.radar?.id === n.radar?.id);

const RadarMap = React.memo(({ location, radars, routeCoords, mapRef, onRadarPress, destinationPoint, mapPadding, onMapTouchStart, mapInteractionEnabled = true, onMapTap }: any) => {
  const [visibleRegion, setVisibleRegion] = useState<any>(null);
  const onRadarPressRef = useRef(onRadarPress);
  useEffect(() => { onRadarPressRef.current = onRadarPress; }, [onRadarPress]);

  const safeLoc = useMemo(() => isValid(location) ? location : null, [location]);
  const validRoute = useMemo(() => (Array.isArray(routeCoords) ? routeCoords : []).filter(isValid), [routeCoords]);
  const finalDest = useMemo(() => isValid(destinationPoint) ? destinationPoint : validRoute.length ? validRoute[validRoute.length - 1] : null, [destinationPoint, validRoute]);

  const markers = useMemo(() => {
    if (!Array.isArray(radars)) return [];
    
    // Filter valid radars
    const validRadars = radars.map((r: any, i: number) => ({ r, coord: isValid(r) ? r : null, key: r.id || i })).filter((x: any) => x.coord);
    
    // Sort by priority (Route distance) then proximity
    const scored = validRadars.map((x: any) => {
      const routeDist = validRoute.length > 1 ? RadarService.minDistanceToRouteMeters(x.coord, validRoute) : Infinity;
      return { ...x, score: routeDist <= ROUTE_CORRIDOR_METERS ? 0 : (safeLoc ? distKm(safeLoc, x.coord) : 0) };
    }).sort((a, b) => a.score - b.score);

    return scored.slice(0, RADAR_MARKER_CAP);
  }, [radars, validRoute, safeLoc]);

  const mapChildren = useMemo(() => {
    const arr: any[] = [];
    if (validRoute.length > 0) {
      arr.push(<Polyline key="c" coordinates={validRoute} strokeColor={ROUTE_TOKENS.casing} strokeWidth={ROUTE_TOKENS.cW} zIndex={90} />);
      arr.push(<Polyline key="f" coordinates={validRoute} strokeColor={ROUTE_TOKENS.fill} strokeWidth={ROUTE_TOKENS.fW} zIndex={91} />);
      arr.push(<Polyline key="h" coordinates={validRoute} strokeColor={ROUTE_TOKENS.highlight} strokeWidth={ROUTE_TOKENS.hW} zIndex={92} />);
    }
    if (finalDest) arr.push(<Marker key="dest" coordinate={finalDest} tracksViewChanges={false} anchor={{ x: 0.5, y: 0.9 }}><View style={styles.dest}><MaterialCommunityIcons name="flag-checkered" size={16} color="#0B1424" /></View></Marker>);
    if (safeLoc) {
      if (location?.accuracy > 0 && location?.accuracy <= 180) arr.push(<Circle key="acc" center={safeLoc} radius={location.accuracy} fillColor="rgba(77, 149, 255, 0.12)" strokeColor="rgba(77, 149, 255, 0.22)" strokeWidth={1} />);
      arr.push(<Marker key="loc" coordinate={safeLoc} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}><View style={styles.locOuter}><View style={styles.locInner} /></View></Marker>);
    }
    markers.forEach((m: any) => arr.push(<RadarMarker key={m.key} coordinate={m.coord} radar={m.r} onPress={() => onRadarPressRef.current?.(m.r)} />));
    return arr;
  }, [validRoute, finalDest, safeLoc, markers, location?.accuracy]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      customMapStyle={modernMapStyle}
      provider={PROVIDER_GOOGLE}
      initialRegion={{ latitude: safeLoc?.latitude ?? 37.7749, longitude: safeLoc?.longitude ?? -122.4194, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
      showsUserLocation={false}
      showsMyLocationButton={false}
      followsUserLocation={false}
      showsCompass={false}
      showsTraffic={false}
      showsBuildings={false}
      showsIndoors={false}
      mapPadding={mapPadding || { top: 200, right: 40, bottom: 280, left: 40 }}
      pitchEnabled={false}
      rotateEnabled={mapInteractionEnabled}
      zoomEnabled={mapInteractionEnabled}
      scrollEnabled={mapInteractionEnabled}
      toolbarEnabled={false}
      zoomControlEnabled={false}
      moveOnMarkerPress={false}
      onPanDrag={() => mapInteractionEnabled && onMapTouchStart?.()}
      onRegionChangeComplete={(region, details) => {
        setVisibleRegion(region);
        if (mapInteractionEnabled && details?.isGesture) onMapTouchStart?.();
      }}
      loadingEnabled={true}
      loadingBackgroundColor="#f8fafc"
      loadingIndicatorColor="#3b82f6"
      onMapReady={() => mapRef.current?.animateToRegion({ latitude: safeLoc?.latitude, longitude: safeLoc?.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 800)}
      onPress={() => mapInteractionEnabled && onMapTap?.()}
    >
      {mapChildren}
    </MapView>
  );
}, (p, n) => p.radars === n.radars && p.routeCoords === n.routeCoords && p.location === n.location && p.destinationPoint === n.destinationPoint && p.mapInteractionEnabled === n.mapInteractionEnabled);

const styles = StyleSheet.create({
  radarBase: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  dest: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4ECDC4', borderWidth: 1.5, borderColor: '#D9FFFB', elevation: 4 },
  locOuter: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(109, 174, 255, 0.26)', borderWidth: 2, borderColor: 'rgba(224, 242, 254, 0.96)' },
  locInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4D95FF', borderWidth: 1, borderColor: '#F8FAFC' },
});

export default RadarMap;
import React, { useMemo } from 'react';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import { View, StyleSheet, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { darkMapStyle } from '../utils/mapStyle';

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
                    <Text style={{color:'white', fontSize:12, fontWeight:'bold'}}>{speedLimit}</Text>
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
    onMapTouchEnd,
}: any) => {
    
    const initialRegion = useMemo(() => ({
        latitude: location?.latitude || 37.7749,
        longitude: location?.longitude || -122.4194,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
    }), [location?.latitude, location?.longitude]);

    const finalDestination = useMemo(() => {
      if (destinationPoint?.latitude && destinationPoint?.longitude) {
        return destinationPoint;
      }
      return routeCoords?.length ? routeCoords[routeCoords.length - 1] : null;
    }, [destinationPoint, routeCoords]);

    const padding = mapPadding || { top: 200, right: 40, bottom: 280, left: 40 };

    return (
        <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            customMapStyle={darkMapStyle}
            provider={PROVIDER_GOOGLE}
            initialRegion={initialRegion}
            showsUserLocation={showsUserLocation}
            showsMyLocationButton={false}
            showsCompass={false}
            showsTraffic
            mapPadding={padding}
            pitchEnabled
            rotateEnabled
            toolbarEnabled={false}
            zoomControlEnabled={false}
            moveOnMarkerPress={false}
            onPanDrag={() => onMapTouchStart?.()}
            onPress={() => onMapTouchStart?.()}
            onTouchStart={() => onMapTouchStart?.()}
            onTouchEnd={() => onMapTouchEnd?.()}
            onRegionChangeComplete={() => onMapTouchEnd?.()}
        >
            {routeCoords.length > 0 && (
                <Polyline 
                  coordinates={routeCoords} 
                  strokeWidth={6} 
                  strokeColor="#4ECDC4" 
                  lineCap="round"
                  lineJoin="round"
                />
            )}
            {finalDestination && (
              <Marker coordinate={finalDestination} anchor={{ x: 0.5, y: 1 }}>
                  <View style={styles.destinationMarker}>
                      <MaterialCommunityIcons name="flag-checkered" size={16} color="#0B1424" />
                  </View>
              </Marker>
            )}
            
            {radars.map((r: any, i: number) => (
                <OptimizedMarker 
                    key={r.id || i}
                    coordinate={{latitude: r.latitude, longitude: r.longitude}}
                    type={r.type}
                    speedLimit={r.speedLimit}
                    onPress={() => onRadarPress?.(r)}
                />
            ))}
        </MapView>
    );
}, (prev, next) => {
    // Custom comparison to prevent re-renders on minor updates if needed
    // For now, let's rely on React.memo shallow diff or standard behavior
    // If location changes slightly (user moving), we WANT to re-render user location dot, 
    // BUT MapView handles user location internally via showsUserLocation={true}.
    // We only need to re-render if radars or route change.
    
    // Changing props: location (used for initialRegion only? No, maybe updates?), radars.
    
    // Actually, passing `location` prop to MapView usually isn't needed if showsUserLocation={true} 
    // handles the dot. We only used it for initialRegion.
    
    return (
        prev.radars === next.radars && 
        prev.routeCoords === next.routeCoords &&
        prev.destinationPoint?.latitude === next.destinationPoint?.latitude &&
        prev.destinationPoint?.longitude === next.destinationPoint?.longitude &&
        prev.location?.latitude === next.location?.latitude &&
        prev.location?.longitude === next.location?.longitude &&
        prev.mapPadding === next.mapPadding
    );
});

const styles = StyleSheet.create({
  markerBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white', elevation: 5 },
  destinationMarker: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#FCD34D', borderWidth: 1, borderColor: '#0B1424', elevation: 6 },
});

export default RadarMap;

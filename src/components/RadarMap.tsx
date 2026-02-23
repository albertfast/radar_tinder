import React, { useMemo, useRef } from 'react';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import { View, StyleSheet, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { modernMapStyle } from '../utils/modernMapStyle';
import { getResponsiveWidth, getResponsiveHeight, getResponsiveMargin, getResponsivePadding } from '../constants/layout';

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
    mapInteractionEnabled = true,
    onMapTap,
}: any) => {
    
    const initialRegionRef = useRef({
      latitude: location?.latitude || 37.7749,
      longitude: location?.longitude || -122.4194,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
    const initialRegion = initialRegionRef.current;

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
            customMapStyle={modernMapStyle}
            provider={PROVIDER_GOOGLE}
            initialRegion={initialRegion}
            showsUserLocation={showsUserLocation}
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
            onPress={() => {
              if (!mapInteractionEnabled) return;
              onMapTap?.();
            }}
        >
            {routeCoords.length > 0 && (
                <Polyline
                  coordinates={routeCoords}
                  strokeWidth={getResponsiveWidth(6)}
                  strokeColor="#4ECDC4"
                  lineCap="round"
                  lineJoin="round"
                  zIndex={10}
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
        prev.mapPadding === next.mapPadding &&
        prev.mapInteractionEnabled === next.mapInteractionEnabled
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
});

export default RadarMap;

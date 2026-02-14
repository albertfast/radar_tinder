import React from 'react';
import { StyleSheet } from 'react-native';
import MapView from 'react-native-maps';
import Animated, { FadeInDown } from 'react-native-reanimated';
import RadarMap from '../../components/RadarMap';
import { ANIMATION_TIMING } from '../../utils/animationConstants';

interface RadarMapViewProps {
  currentLocation: { latitude: number; longitude: number } | null;
  nearbyRadars: any[];
  mapRef: React.RefObject<MapView>;
  routeCoords?: Array<{ latitude: number; longitude: number }>;
  destinationPoint?: { latitude: number; longitude: number } | null;
  mapPadding?: { top: number; right: number; bottom: number; left: number };
  onMapTouchStart?: () => void;
  onMapTouchEnd?: () => void;
  mapInteractionEnabled?: boolean;
  onMapTap?: () => void;
}

export const RadarMapView: React.FC<RadarMapViewProps> = ({
  currentLocation,
  nearbyRadars,
  mapRef,
  routeCoords = [],
  destinationPoint = null,
  mapPadding,
  onMapTouchStart,
  onMapTouchEnd,
  mapInteractionEnabled = true,
  onMapTap,
}) => {
  return (
    <Animated.View
      style={styles.container}
      entering={FadeInDown.duration(ANIMATION_TIMING.BASE)}
    >
      <RadarMap
        mapRef={mapRef}
        location={currentLocation || { latitude: 37.7749, longitude: -122.4194 }}
        radars={nearbyRadars}
        routeCoords={routeCoords}
        destinationPoint={destinationPoint}
        mapPadding={mapPadding}
        onMapTouchStart={onMapTouchStart}
        onMapTouchEnd={onMapTouchEnd}
        mapInteractionEnabled={mapInteractionEnabled}
        onMapTap={onMapTap}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
});

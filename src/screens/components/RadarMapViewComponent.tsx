import React, { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Animated, { FadeInDown } from 'react-native-reanimated';
import RadarMap from '../../components/RadarMap';
import { ANIMATION_TIMING } from '../../utils/animationConstants';

interface RadarMapViewProps {
  currentLocation: any;
  nearbyRadars: any[];
  mapRef: React.RefObject<MapView>;
  unitSystem: 'metric' | 'imperial';
}

export const RadarMapView: React.FC<RadarMapViewProps> = ({
  currentLocation,
  nearbyRadars,
  mapRef,
  unitSystem,
}) => {
  return (
    <Animated.View
      style={styles.container}
      entering={FadeInDown.duration(ANIMATION_TIMING.BASE)}
    >
      <RadarMap
        ref={mapRef}
        radars={nearbyRadars}
        currentLocation={currentLocation}
        unitSystem={unitSystem}
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

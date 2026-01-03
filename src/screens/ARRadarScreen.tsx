import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { Text, IconButton, ActivityIndicator } from 'react-native-paper';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import { DeviceMotion } from 'expo-sensors';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRadarStore } from '../store/radarStore';
import { LocationService } from '../services/LocationService';

const { width, height } = Dimensions.get('window');

const ARRadarScreen = ({ navigation }: any) => {
  const [permission, requestPermission] = useCameraPermissions();
  const { currentLocation, radarLocations } = useRadarStore();
  const [deviceOrientation, setDeviceOrientation] = useState<any>(null);
  const [visibleRadars, setVisibleRadars] = useState<any[]>([]);

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission]);

  useEffect(() => {
    const subscription = DeviceMotion.addListener((data) => {
      setDeviceOrientation(data.rotation);
    });
    DeviceMotion.setUpdateInterval(100);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (currentLocation && deviceOrientation && radarLocations.length > 0) {
      calculateRadarPositions();
    }
  }, [currentLocation, deviceOrientation, radarLocations]);

  const calculateRadarPositions = () => {
    const { alpha, beta, gamma } = deviceOrientation; // alpha is compass heading
    
    // Convert rotation to degrees
    const heading = (alpha * 180) / Math.PI;
    
    const newVisibleRadars = radarLocations.map(radar => {
      if (!currentLocation) return null;
      
      const distance = LocationService.calculateDistanceSync(
        currentLocation.latitude,
        currentLocation.longitude,
        radar.latitude,
        radar.longitude
      );

      // Only show radars within 2km in AR
      if (distance > 2) return null;

      // Calculate bearing
      const bearing = calculateBearing(
        currentLocation.latitude,
        currentLocation.longitude,
        radar.latitude,
        radar.longitude
      );

      // Relative bearing to device heading
      let relativeBearing = bearing - heading;
      if (relativeBearing < -180) relativeBearing += 360;
      if (relativeBearing > 180) relativeBearing -= 360;

      // Field of view (approx 60 degrees)
      if (Math.abs(relativeBearing) < 30) {
        // Map relative bearing to screen X position
        const x = (width / 2) + (relativeBearing * (width / 60));
        // Simple Y position based on distance (further = higher)
        const y = (height / 2) - (distance * 100); 

        return {
          ...radar,
          x,
          y,
          distance
        };
      }
      return null;
    }).filter(r => r !== null);

    setVisibleRadars(newVisibleRadars);
  };

  const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return ((θ * 180) / Math.PI + 360) % 360;
  };

  if (!permission) {
    return <View style={styles.container}><ActivityIndicator /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Camera permission is required for AR view</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.button}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back">
        <View style={styles.overlay}>
          {/* Header */}
          <View style={styles.header}>
            <IconButton 
              icon="close" 
              iconColor="white" 
              size={30} 
              onPress={() => navigation.goBack()} 
            />
            <Text style={styles.headerTitle}>AR Radar View</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* AR Markers */}
          {visibleRadars.map((radar, index) => (
            <View 
              key={index} 
              style={[
                styles.markerContainer, 
                { left: radar.x - 50, top: radar.y - 40 }
              ]}
            >
              <View style={[styles.markerGlow, { 
                backgroundColor: radar.type === 'police' ? 'rgba(255, 215, 0, 0.8)' : 
                               radar.type === 'red_light' ? 'rgba(255, 82, 82, 0.8)' : 
                               'rgba(33, 150, 243, 0.8)' 
              }]}>
                <MaterialCommunityIcons 
                  name={
                    radar.type === 'police' ? 'police-badge' : 
                    radar.type === 'red_light' ? 'traffic-light' : 
                    radar.type === 'speed_camera' ? 'video' : 
                    radar.type === 'fixed' ? 'camera' : 'car-emergency'
                  } 
                  size={30} 
                  color="white" 
                />
              </View>
              <View style={styles.markerLabel}>
                <Text style={styles.markerText}>{Math.round(radar.distance * 1000)}m</Text>
                <Text style={styles.markerType}>
                  {radar.type === 'speed_camera' ? 'Speed Cam' : 
                   radar.type === 'police' ? 'Police' : 
                   radar.type === 'red_light' ? 'Red Light' : 
                   radar.type === 'fixed' ? 'Fixed Radar' : 'Mobile Radar'}
                </Text>
              </View>
            </View>
          ))}

          {/* Compass/Info */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {visibleRadars.length} Radars in view
            </Text>
          </View>
        </View>
      </CameraView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  camera: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'transparent' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingTop: 50, 
    paddingHorizontal: 10 
  },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  text: { color: 'white', textAlign: 'center', marginTop: 100 },
  button: { backgroundColor: '#2196F3', padding: 15, borderRadius: 10, margin: 20 },
  buttonText: { color: 'white', textAlign: 'center', fontWeight: 'bold' },
  markerContainer: { position: 'absolute', alignItems: 'center', width: 100 },
  markerGlow: { 
    width: 50, 
    height: 50, 
    borderRadius: 25, 
    backgroundColor: 'rgba(255, 82, 82, 0.8)', 
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white'
  },
  markerLabel: { 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    borderRadius: 8, 
    padding: 4, 
    marginTop: 5,
    alignItems: 'center'
  },
  markerText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  markerType: { color: '#8E8E93', fontSize: 10 },
  footer: { position: 'absolute', bottom: 40, width: '100%', alignItems: 'center' },
  footerText: { color: 'white', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 }
});

export default ARRadarScreen;

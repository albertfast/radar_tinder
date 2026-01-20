// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { 
  View, 
  StyleSheet, 
  Dimensions, 
  TextInput,
  TouchableOpacity,
  FlatList
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Text, useTheme, Surface, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRadarStore } from '../store/radarStore';
import { RadarService } from '../services/RadarService';

const { width, height } = Dimensions.get('window');

const darkMapStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] }
];

const MapScreen = () => {
  const theme = useTheme();
  const { currentLocation, radarLocations, setRadarLocations } = useRadarStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const hasLoggedMapReady = useRef(false);
  const hasLoggedMapLoaded = useRef(false);
  const hasLoggedEnv = useRef(false);
  
  const [mapRegion, setMapRegion] = useState({
    latitude: 37.7749,
    longitude: -122.4194,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  });

  useEffect(() => {
    if (currentLocation) {
      setMapRegion(prev => ({
        ...prev,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      }));
    }
  }, [currentLocation]);

  useEffect(() => {
    if (hasLoggedEnv.current) return;
    const hasMapsKey = !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    console.info('[MapScreen] Google Maps API key present:', hasMapsKey);
    hasLoggedEnv.current = true;
  }, []);

  const handleSearch = async () => {
    if (!searchQuery) return;
    setIsSearching(true);
    
    // In a real app, you would geocode the address here.
    // For demo, we shift the map and fetch radars in that area.
    try {
      // Simulation: user searches for an area, we move there and show cameras
      const fakeNewLat = mapRegion.latitude + 0.02;
      const fakeNewLon = mapRegion.longitude + 0.02;
      
      setMapRegion(prev => ({
        ...prev,
        latitude: fakeNewLat,
        longitude: fakeNewLon,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }));

      const locations = await RadarService.getAllRadarLocations(fakeNewLat, fakeNewLon, 20);
      setRadarLocations(locations);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={mapRegion}
        onRegionChangeComplete={setMapRegion}
        showsUserLocation={true}
        customMapStyle={darkMapStyle}
        provider={PROVIDER_GOOGLE}
        onMapReady={() => {
          if (!hasLoggedMapReady.current) {
            console.info('[MapScreen] Map ready');
            hasLoggedMapReady.current = true;
          }
        }}
        onMapLoaded={() => {
          if (!hasLoggedMapLoaded.current) {
            console.info('[MapScreen] Map tiles loaded');
            hasLoggedMapLoaded.current = true;
          }
        }}
      >
        {radarLocations.map((radar) => (
          <Marker
            key={radar.id}
            coordinate={{
              latitude: radar.latitude,
              longitude: radar.longitude,
            }}
          >
             <View style={styles.customMarker}>
               <MaterialCommunityIcons name="video" size={14} color="white" />
             </View>
          </Marker>
        ))}
      </MapView>

      {/* Top Search Bar */}
      <View style={styles.searchContainer}>
        <Surface style={styles.searchBar} elevation={4}>
          <MaterialCommunityIcons name="magnify" size={24} color="#8E8E93" style={{ marginLeft: 15 }} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Search address or destination..."
            placeholderTextColor="#8E8E93"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
          />
          {searchQuery !== '' && (
            <IconButton 
              icon="close-circle" 
              size={20} 
              iconColor="#8E8E93" 
              onPress={() => setSearchQuery('')} 
            />
          )}
        </Surface>
      </View>

      {/* Floating Action Buttons */}
      <View style={styles.fabColumn}>
        <Surface style={styles.fab} elevation={2}>
          <IconButton icon="layers-outline" iconColor="white" size={24} />
        </Surface>
        <Surface style={[styles.fab, { marginTop: 15 }]} elevation={2}>
          <IconButton icon="crosshairs-gps" iconColor="#2196F3" size={24} />
        </Surface>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  map: {
    width: width,
    height: height,
  },
  searchContainer: {
    position: 'absolute',
    top: 60,
    width: '100%',
    paddingHorizontal: 20,
  },
  searchBar: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: 25,
    alignItems: 'center',
    height: 50,
    borderWidth: 1,
    borderColor: '#333',
    minHeight: 50,
  },
  searchInput: {
    flex: 1,
    color: 'white',
    fontSize: 16,
    paddingHorizontal: 10,
  },
  customMarker: {
    backgroundColor: '#FF5252',
    padding: 6,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: 'white',
    elevation: 5,
  },
  fabColumn: {
    position: 'absolute',
    right: 20,
    bottom: 40,
  },
  fab: {
    backgroundColor: '#1C1C1E',
    borderRadius: 30,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    minHeight: 50,
    minWidth: 50,
  }
});

export default MapScreen;
// @ts-nocheck

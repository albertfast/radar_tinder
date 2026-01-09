import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  TextInput,
  Clipboard,
  Keyboard,
  FlatList,
  Platform,
  Linking,
  Modal 
} from 'react-native';
import { 
  Text, 
  IconButton,
  Surface,
  FAB,
  Button
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
    FadeInDown, 
    FadeInUp, 
    withRepeat, 
    withTiming, 
    useSharedValue, 
    useAnimatedStyle,
    Easing 
} from 'react-native-reanimated';
import { useRadarStore } from '../store/radarStore';
import { useAuthStore } from '../store/authStore';
import { RadarService } from '../services/RadarService';
import { GoogleMapsService } from '../services/GoogleMapsService';
import { LocationService } from '../services/LocationService';
import { OfflineService } from '../services/OfflineService';
import { SupabaseService } from '../services/SupabaseService';
import { RadarAnimation } from '../components/RadarAnimation';
import RadarMap from '../components/RadarMap';
import { RadarLocation } from '../types';
import { BlurView } from 'expo-blur';
import { useSettingsStore } from '../store/settingsStore';
import { formatDistance, formatSpeed } from '../utils/format';

const { width, height } = Dimensions.get('window');

const darkMapStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#171717" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#8f8f8f" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#171717" }] },
  { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#bdbdbd" }] },
  { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#8f8f8f" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#2c2c2c" }] },
  { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#1c1c1c" }] },
  { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#3c3c3c" }] },
  { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#2c2c2c" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#000000" }] }
];

type TabType = 'Basic' | 'Map' | 'Graphic';
type NavStep = {
  instruction: string;
  distanceMeters: number | null;
  maneuver?: string;
  endLocation?: { latitude: number; longitude: number };
};

const PRO_FEATURES = [
    { title: 'Unlock All Radars', subtitle: 'See Police & Mobile traps', icon: 'shield-star', color: '#FFD700' },
    { title: 'AI Diagnostics', subtitle: 'Unlimited dashboard scans', icon: 'car-cog', color: '#4ECDC4' },
    { title: 'No Ads', subtitle: 'Distraction free driving', icon: 'block-helper', color: '#FF5252' },
];

// OPTIMIZED MARKER COMPONENT
const OptimizedMarker = React.memo(({ coordinate, type, speedLimit }: any) => {
    const [tracksViewChanges, setTracksViewChanges] = useState(true);

    // Stop tracking changes after initial render to save performance
    useEffect(() => {
        const timer = setTimeout(() => {
            setTracksViewChanges(false);
        }, 500); // Wait for image load/render
        return () => clearTimeout(timer);
    }, []);

    return (
        <Marker
          coordinate={coordinate}
          tracksViewChanges={tracksViewChanges}
          anchor={{ x: 0.5, y: 0.5 }}
        >
            <View style={[styles.markerBadge, { backgroundColor: type === 'police' ? '#FF5252' : '#4ECDC4' }]}>
                {type === 'fixed' && speedLimit ? (
                    <Text style={{color:'black', fontSize:10, fontWeight:'bold'}}>{speedLimit}</Text>
                ) : (
                    <MaterialCommunityIcons 
                      name={type === 'police' ? "police-badge" : "camera"} 
                      size={14} 
                      color="black" 
                    />
                )}
            </View>
        </Marker>
    );
});

const RadarScreen = ({ navigation, route }: any) => {
  const { user, refreshProfile } = useAuthStore();
  const { unitSystem } = useSettingsStore();
  const setRadarLocations = useRadarStore((state) => state.setRadarLocations);
  const activeAlerts = useRadarStore((state) => state.activeAlerts);
  const acknowledgeAlert = useRadarStore((state) => state.acknowledgeAlert);
  const mapRef = useRef<MapView>(null);

  // Stats & States
  const [activeTab, setActiveTab] = useState<TabType>('Basic');
  const [isDriving, setIsDriving] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [nearbyRadars, setNearbyRadars] = useState<any[]>([]);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [destination, setDestination] = useState('');
  const [routeCoords, setRouteCoords] = useState<any[]>([]);
  const [navSteps, setNavSteps] = useState<NavStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [drivingStartTime, setDrivingStartTime] = useState<Date | null>(null);
  const [totalDistance, setTotalDistance] = useState<number>(0);

  // Refs for logic
  const currentLocationRef = useRef(currentLocation);
  const nearbyRadarsRef = useRef<any[]>([]);
  const isInteractingRef = useRef(false);
  const lastCameraUpdateRef = useRef(0);
  const autocompleteTimer = useRef<NodeJS.Timeout | null>(null);
  const proSliderRef = useRef<FlatList>(null);
  const [proSliderIndex, setProSliderIndex] = useState(0);

  // Refs for cleanup
  const lastPositionRef = useRef<any>(null);

  const activeAlert = useMemo(() => {
    const unacknowledged = activeAlerts.filter((alert) => !alert.acknowledged);
    return unacknowledged.sort((a, b) => a.distance - b.distance)[0];
  }, [activeAlerts]);

  // --- Effects ---

  // Auto-scroll Pro Slider
  useEffect(() => {
    if (isDriving) return;
    const interval = setInterval(() => {
        let next = proSliderIndex + 1;
        if (next >= PRO_FEATURES.length) next = 0;
        setProSliderIndex(next);
        proSliderRef.current?.scrollToIndex({ index: next, animated: true });
    }, 4000);
    return () => clearInterval(interval);
  }, [proSliderIndex, isDriving]);

  // General Location Tracking
  useEffect(() => {
    const unsubscribe = useRadarStore.subscribe((state) => {
        const location = state.currentLocation;
        // Check if location actually changed to avoid loop
        if (location && (
            !currentLocationRef.current || 
            location.latitude !== currentLocationRef.current.latitude || 
            location.longitude !== currentLocationRef.current.longitude
        )) {
            currentLocationRef.current = location;
            setCurrentLocation(location);
            if (location.speed !== null && location.speed !== undefined) {
                setCurrentSpeed(location.speed * 3.6);
            }
            
            // Smooth Camera Follow
            if (isDriving && activeTab === 'Map' && !isInteractingRef.current) {
                const now = Date.now();
                if (now - lastCameraUpdateRef.current >= 2000) {
                    mapRef.current?.animateCamera({
                        center: { latitude: location.latitude, longitude: location.longitude },
                        pitch: 50,
                        heading: location.heading || 0,
                        altitude: 800,
                        zoom: 17
                    }, { duration: 1500 });
                    lastCameraUpdateRef.current = now;
                }
            }
        }
    });

    return unsubscribe;
  }, [isDriving, activeTab]);

  // Periodic Radar Fetch
  useEffect(() => {
    const fetchNearby = async () => {
        const loc = currentLocationRef.current || await LocationService.getCurrentLocation();
        if (loc) {
            const radars = await RadarService.getNearbyRadars(loc.latitude, loc.longitude, 10);
            setNearbyRadars(radars);
            setRadarLocations(radars); // Update store for map
            nearbyRadarsRef.current = radars;
        }
    };
    fetchNearby();
    const interval = setInterval(fetchNearby, 15000);
    return () => clearInterval(interval);
  }, []);

  // Driving Logic (Distance & Alerts)
  useEffect(() => {
    if (!isDriving) return;
    const interval = setInterval(() => {
        if (currentLocationRef.current && lastPositionRef.current) {
            const dist = LocationService.calculateDistanceSync(
                currentLocationRef.current.latitude, currentLocationRef.current.longitude,
                lastPositionRef.current.latitude, lastPositionRef.current.longitude
            );
            if(dist > 0.005) { // moving
                setTotalDistance(p => p + dist);
                lastPositionRef.current = currentLocationRef.current;
            }
        } else if (currentLocationRef.current) {
            lastPositionRef.current = currentLocationRef.current;
        }
        
        // Alerts check could go here...
    }, 2000);
    return () => clearInterval(interval);
  }, [isDriving]);

  // Turn-by-turn step progression
  useEffect(() => {
    if (!isDriving || navSteps.length === 0) return;
    const loc = currentLocationRef.current || currentLocation;
    const step = navSteps[currentStepIndex];
    if (!loc || !step?.endLocation) return;

    const distanceKm = LocationService.calculateDistanceSync(
      loc.latitude,
      loc.longitude,
      step.endLocation.latitude,
      step.endLocation.longitude
    );
    const distanceMeters = distanceKm * 1000;
    const threshold = step.distanceMeters
      ? Math.max(15, Math.min(60, step.distanceMeters * 0.25))
      : 25;

    if (distanceMeters <= threshold && currentStepIndex < navSteps.length - 1) {
      setCurrentStepIndex((prev) => Math.min(prev + 1, navSteps.length - 1));
    }
  }, [currentLocation, currentStepIndex, navSteps, isDriving]);

  // --- Handlers ---

  const decodeHtmlEntities = (text: string) =>
    text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

  const stripHtml = (html: string) =>
    decodeHtmlEntities(html.replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();

  const formatStepDistance = (meters?: number | null) => {
    if (meters === null || meters === undefined) return '';
    if (unitSystem === 'imperial') {
      const feet = meters * 3.28084;
      if (feet < 1000) return `${Math.round(feet)} ft`;
      const miles = meters / 1609.344;
      return `${miles.toFixed(1)} mi`;
    }
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const getManeuverIcon = (maneuver?: string) => {
    switch (maneuver) {
      case 'turn-left':
        return 'arrow-left';
      case 'turn-right':
        return 'arrow-right';
      case 'turn-slight-left':
      case 'keep-left':
        return 'arrow-top-left';
      case 'turn-slight-right':
      case 'keep-right':
        return 'arrow-top-right';
      case 'turn-sharp-left':
        return 'arrow-bottom-left';
      case 'turn-sharp-right':
        return 'arrow-bottom-right';
      case 'uturn-left':
      case 'uturn-right':
        return 'backup-restore';
      case 'merge':
        return 'call-merge';
      case 'roundabout-left':
      case 'roundabout-right':
        return 'rotate-right';
      case 'ramp-left':
        return 'arrow-top-left';
      case 'ramp-right':
        return 'arrow-top-right';
      case 'straight':
      case 'continue':
      default:
        return 'arrow-up';
    }
  };

  const formatRadarLabel = (type?: RadarLocation['type']) => {
    switch (type) {
      case 'red_light':
        return 'Red Light Camera';
      case 'fixed':
        return 'Fixed Camera';
      case 'mobile':
        return 'Mobile Radar';
      case 'police':
        return 'Police';
      case 'traffic_enforcement':
        return 'Traffic Enforcement';
      case 'speed_camera':
      default:
        return 'Speed Camera';
    }
  };

  const canConfirmRadar = (radar?: RadarLocation) => {
    if (!radar?.id) return false;
    return (
      !radar.id.startsWith('osm-') &&
      !radar.id.startsWith('google-') &&
      !radar.id.startsWith('mock-')
    );
  };

  const getStepDistanceMeters = (step?: NavStep) => {
    if (!step) return null;
    const loc = currentLocationRef.current || currentLocation;
    if (loc && step.endLocation) {
      const distanceKm = LocationService.calculateDistanceSync(
        loc.latitude,
        loc.longitude,
        step.endLocation.latitude,
        step.endLocation.longitude
      );
      return distanceKm * 1000;
    }
    return step.distanceMeters;
  };

  const toggleDrivingMode = () => {
    if (!isDriving) {
        setDrivingStartTime(new Date());
        setTotalDistance(0);
        setIsMuted(true);
    }
    setIsDriving(!isDriving);
  };

  const centerMap = () => {
    if (currentLocation && mapRef.current) {
        mapRef.current.animateCamera({
            center: {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
            },
            zoom: 17,
            heading: currentLocation.heading || 0,
            pitch: 60,
        }, { duration: 1000 });
        isInteractingRef.current = false;
    }
  };

  const handleTextChange = (text: string) => {
      setDestination(text);
      setDestination(text);
      if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current);
      
      if (text.length === 0) {
          setSuggestions([]);
          return;
      }
      
      autocompleteTimer.current = setTimeout(async () => {
          if (text.length > 2) {
              const results = await GoogleMapsService.getPlaceAutocomplete(text);
              setSuggestions(results);
          } else {
              setSuggestions([]);
          }
      }, 500);
  };

  const handleSelectSuggestion = (desc: string) => {
      setDestination(desc);
      setSuggestions([]); // clear
      handleNavigate(desc);
  };

  const handleNavigate = async (targetDest?: string) => {
      const finalDest = targetDest || destination;
      // Simplified navigate logic
      if (!finalDest || !currentLocation) return;

      // Unfocus keyboard
      if (Platform.OS === 'android') {
        const Keyboard = require('react-native').Keyboard;
        Keyboard.dismiss();
      }

      const res = await GoogleMapsService.getDirections(
          currentLocation.latitude, currentLocation.longitude, finalDest
      );
      if(res?.coordinates) {
          setRouteCoords(res.coordinates);
          setIsDriving(true);
          setActiveTab('Map');
          const steps = res?.legs?.[0]?.steps || [];
          const parsedSteps: NavStep[] = steps.map((step: any) => ({
            instruction: stripHtml(step.html_instructions || step.instructions || ''),
            distanceMeters: step.distance?.value ?? null,
            maneuver: step.maneuver,
            endLocation: step.end_location
              ? { latitude: step.end_location.lat, longitude: step.end_location.lng }
              : undefined
          }));
          setNavSteps(parsedSteps);
          setCurrentStepIndex(0);
          // Also fetch radars along route
          const rawRouteRadars = await RadarService.getRadarsAlongRoute(res.coordinates);
          
          // Calculate distance from current location for proper display
          const routeRadarsWithDist = await Promise.all(rawRouteRadars.map(async (r) => {
              const d = await LocationService.calculateDistance(
                  currentLocation.latitude, currentLocation.longitude,
                  r.latitude, r.longitude
              );
              return { ...r, distance: d };
          }));

          setNearbyRadars(routeRadarsWithDist.sort((a,b) => a.distance - b.distance));
          
          // Clear suggestions just in case
          setSuggestions([]);
      }
  };

  const handleReportRadar = async (type: RadarLocation['type']) => {
      setReportModalVisible(false);
      if (!user) {
        alert('Please log in to report hazards.');
        return;
      }

      const loc = currentLocationRef.current || await LocationService.getCurrentLocation().catch(() => null);
      if (!loc) {
        alert('Location unavailable. Please enable location services.');
        return;
      }

      try {
        await RadarService.reportRadarLocation({
          latitude: loc.latitude,
          longitude: loc.longitude,
          type,
          confidence: 0.7,
          lastConfirmed: new Date(),
          reportedBy: user.id,
        });

        const refreshed = await RadarService.getNearbyRadars(loc.latitude, loc.longitude, 10);
        setNearbyRadars(refreshed);
        setRadarLocations(refreshed);

        await refreshProfile();
        alert('Report sent. Nearby drivers will be notified.');
      } catch (error) {
        console.error('Report hazard failed:', error);
        try {
          await OfflineService.saveRadarLocationOffline({
            id: `offline-${Date.now()}`,
            latitude: loc.latitude,
            longitude: loc.longitude,
            type,
            confidence: 0.7,
            lastConfirmed: new Date(),
            reportedBy: user.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any);
          alert('Saved offline. Will sync when online.');
        } catch (offlineError) {
          alert('Failed to report hazard. Please try again.');
        }
      }
  };

  const handleConfirmRadar = async (radar: RadarLocation) => {
      if (!user) {
        alert('Please log in to confirm reports.');
        return;
      }

      const loc = currentLocationRef.current || currentLocation;
      if (!loc) {
        alert('Location unavailable. Please enable location services.');
        return;
      }

      const reportId = await SupabaseService.confirmNearbyReport({
        latitude: loc.latitude,
        longitude: loc.longitude,
        radiusMeters: 150,
        type: radar.type,
      });

      if (reportId) {
        await refreshProfile();
        alert('Thanks! Confirmation recorded.');
      } else {
        alert('No community report to confirm nearby.');
      }
  };

  // --- Components ---

  const ActionCard = ({ icon, title, subtitle, onPress, gradientColors = ['#1E293B', '#0F172A'] }: any) => (
    <TouchableOpacity style={styles.actionCard} onPress={onPress}>
        <LinearGradient
            colors={gradientColors}
            start={{x:0, y:0}} end={{x:1, y:1}}
            style={styles.actionCardGradient}
        >
            <View style={styles.actionIconContainer}>
                <MaterialCommunityIcons name={icon} size={32} color="#4ECDC4" />
            </View>
            <Text style={styles.actionTitle}>{title}</Text>
            <Text style={styles.actionSubtitle}>{subtitle}</Text>
        </LinearGradient>
    </TouchableOpacity>
  );

  const ProSlideItem = ({ item }: any) => (
      <View style={{ width: width - 40, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[styles.proIconBox, { backgroundColor: item.color + '20' }]}>
                <MaterialCommunityIcons name={item.icon} size={20} color={item.color} />
            </View>
            <View style={{ marginLeft: 12 }}>
                <Text style={{ color: 'white', fontWeight: 'bold' }}>{item.title}</Text>
                <Text style={{ color: '#aaa', fontSize: 11 }}>{item.subtitle}</Text>
            </View>
          </View>
          <TouchableOpacity 
             style={{ backgroundColor: item.color, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 }}
             onPress={() => navigation.navigate('Subscription')}
          >
              <Text style={{ fontSize: 10, fontWeight: 'bold', color: 'black' }}>UPGRADE</Text>
          </TouchableOpacity>
      </View>
  );

  // --- RENDER ---

  if (isDriving) {
      // DRIVING MODE UI
      return (
          <View style={styles.container}>
              <LinearGradient colors={['#000000', '#1A1A1A']} style={StyleSheet.absoluteFill} />
              
              {/* Driving Header */}
              <View style={styles.drivingHeader}>
                  <IconButton icon="chevron-down" iconColor="#fff" size={32} onPress={toggleDrivingMode} />
                  <View style={{alignItems: 'center'}}>
                      <Text style={styles.drivingModeTitle}>DRIVING MODE</Text>
                      <Text style={styles.drivingModeSub}>{activeTab.toUpperCase()}</Text>
                  </View>
                  <IconButton icon="cog" iconColor="#fff" onPress={() => navigation.navigate('RadarSettings')} />
              </View>

              {/* Tabs */}
              <View style={styles.tabBar}>
                  {(['Basic', 'Map', 'Graphic'] as TabType[]).map(t => (
                      <TouchableOpacity 
                        key={t} 
                        style={[styles.tabItem, activeTab === t && styles.activeTabItem]}
                        onPress={() => setActiveTab(t)}
                      >
                          <Text style={[styles.tabText, activeTab === t && { color: '#FF5252' }]}>{t}</Text>
                      </TouchableOpacity>
                  ))}
              </View>

              {activeAlert ? (
                  <View style={styles.liveAlertBanner}>
                      <View style={styles.liveAlertIcon}>
                          <MaterialCommunityIcons name="alert" size={18} color="#FF5252" />
                      </View>
                      <View style={{ flex: 1 }}>
                          <Text style={styles.liveAlertTitle}>
                            {formatRadarLabel(activeAlert.type)}
                          </Text>
                          <Text style={styles.liveAlertSubtitle}>
                            {formatDistance(activeAlert.distance, unitSystem)} • ETA {Math.max(1, Math.round(activeAlert.estimatedTime * 60))} min
                          </Text>
                      </View>
                      <TouchableOpacity onPress={() => acknowledgeAlert(activeAlert.id)} style={styles.liveAlertDismiss}>
                          <MaterialCommunityIcons name="close" size={16} color="#94A3B8" />
                      </TouchableOpacity>
                  </View>
              ) : null}

              <View style={{ flex: 1 }}>
                  {activeTab === 'Basic' && (
                      <View style={styles.basicContainer}>
                          {/* HUD Speedometer */}
                          <View style={styles.hudCircle}>
                              <Text style={styles.speedText}>{formatSpeed(currentSpeed, unitSystem).split(' ')[0]}</Text>
                              <Text style={styles.unitText}>{formatSpeed(currentSpeed, unitSystem).split(' ')[1]}</Text>
                              <View style={[styles.ring, { borderColor: '#4ECDC4' }]} />
                              <View style={[styles.ring, { width: 230, height: 230, borderColor: 'rgba(78,205,196,0.3)', borderWidth: 1 }]} />
                          </View>

                          {/* Live Alerts List */}
                          <View style={styles.alertsList}>
                              <Text style={styles.sectionHeader}>NEARBY RADARS</Text>
                              {nearbyRadars.length > 0 ? (
                                  nearbyRadars.slice(0, 10).map((r, i) => (
                                      <View key={i} style={styles.alertItem}>
                                          <MaterialCommunityIcons 
                                            name={r.type === 'police' ? 'alarm-light' : 'camera'} 
                                            size={24} 
                                            color={r.type === 'police' ? '#FF5252' : '#4ECDC4'} 
                                          />
                                          <Text style={styles.alertText}>
                                              {r.type === 'police' ? 'Police Spotted' : 'Speed Camera'}
                                          </Text>
                                          <Text style={styles.alertDist}>{formatDistance(r.distance, unitSystem)}</Text>
                                      </View>
                                  ))
                              ) : (
                                  <Text style={{color: '#666', marginTop: 10}}>Scanning area...</Text>
                              )}
                          </View>
                      </View>
                  )}

                  {activeTab === 'Map' && (
                      <View style={{flex: 1}}>
                           <RadarMap
                                location={currentLocation || {latitude: 37.7749, longitude: -122.4194}}
                                radars={nearbyRadars}
                                routeCoords={routeCoords}
                                mapRef={mapRef}
                                showsUserLocation={true}
                                onRadarPress={(radar: RadarLocation) => {
                                  if (canConfirmRadar(radar)) {
                                    handleConfirmRadar(radar);
                                  }
                                }}
                            />
                            {/* Map Overlay Controls */}
                           <View style={styles.mapOverlay}>
                                   <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                                       <View style={{flex: 1}}>
                                            <TextInput 
                                                placeholder="Go somewhere..." 
                                                placeholderTextColor="#aaa"
                                                style={styles.mapInput}
                                                value={destination}
                                                onChangeText={handleTextChange}
                                                onSubmitEditing={() => handleNavigate()}
                                            />
                                       </View>
                                       
                                       <TouchableOpacity 
                                            style={[styles.iconBtn, { backgroundColor: '#4ECDC4', padding: 12 }]} 
                                            onPress={() => handleNavigate()}
                                       >
                                           <Text style={{color: 'black', fontWeight: 'bold'}}>GO</Text>
                                       </TouchableOpacity>

                                       {/* Clear/Exit Button */}
                                      {(destination.length > 0 || isDriving) && (
                                            <TouchableOpacity 
                                                style={[styles.iconBtn, { backgroundColor: '#FF5252', padding: 12 }]} 
                                                onPress={() => {
                                                    setDestination('');
                                                    setSuggestions([]);
                                                    setRouteCoords([]);
                                                    setNavSteps([]);
                                                    setCurrentStepIndex(0);
                                                    setIsDriving(false);
                                                    setActiveTab('Basic');
                                                    // Also clear focused radars
                                                    setNearbyRadars([]); 
                                                    // Trigger refetch of nearby
                                                    RadarService.getNearbyRadars(currentLocation.latitude, currentLocation.longitude, 10).then(setNearbyRadars);
                                                }}
                                            >
                                                <MaterialCommunityIcons name="close" size={24} color="white" />
                                            </TouchableOpacity>
                                       )}

                                       <TouchableOpacity 
                                            style={[styles.iconBtn, { backgroundColor: 'rgba(0,0,0,0.8)', padding: 12 }]} 
                                            onPress={centerMap}
                                       >
                                           <MaterialCommunityIcons name="crosshairs-gps" size={24} color="#4ECDC4" />
                                       </TouchableOpacity>
                                   </View>
                                   
                                   {/* Suggestions Dropdown */}
                                   {suggestions.length > 0 && (
                                       <View style={styles.suggestionsContainer}>
                                           {suggestions.map((item) => (
                                               <TouchableOpacity 
                                                   key={item.place_id} 
                                                   style={styles.suggestionItem}
                                                   onPress={() => handleSelectSuggestion(item.description)}
                                               >
                                                   <MaterialCommunityIcons name="map-marker-outline" size={20} color="#94A3B8" />
                                                   <Text style={styles.suggestionText} numberOfLines={1}>{item.description}</Text>
                                               </TouchableOpacity>
                                           ))}
                                       </View>
                                   )}
                                   
                                   {/* Turn by Turn Top Bar overlay */}
                                   {routeCoords.length > 0 && (
                                       <View style={styles.navInstructionBox}>
                                            <MaterialCommunityIcons
                                              name={getManeuverIcon(navSteps[currentStepIndex]?.maneuver)}
                                              size={32}
                                              color="white"
                                            />
                                            <View style={{marginLeft: 15}}>
                                                <Text style={{color:'white', fontSize: 18, fontWeight: 'bold'}}>
                                                  {formatStepDistance(getStepDistanceMeters(navSteps[currentStepIndex])) || '...'}
                                                </Text>
                                                <Text style={{color:'#ccc'}} numberOfLines={2}>
                                                  {navSteps[currentStepIndex]?.instruction || 'Follow the highlighted route'}
                                                </Text>
                                            </View>
                                       </View>
                                   )}
                           </View>
                      </View>
                  )}
                  
                  {activeTab === 'Graphic' && (
                      <View style={{flex: 1, padding: 20}}>
                          <Text style={{color:'white', fontSize: 20, marginBottom: 20}}>Trip Stats</Text>
                          <View style={{flexDirection: 'row', gap: 10}}>
                              <View style={[styles.statBox, {backgroundColor: '#1E293B'}]}>
                                  <Text style={{color:'#4ECDC4', fontSize: 18, fontWeight: 'bold'}}>{formatDistance(totalDistance, unitSystem)}</Text>
                                  <Text style={{color:'#aaa', fontSize: 12}}>Distance</Text>
                              </View>
                              <View style={[styles.statBox, {backgroundColor: '#1E293B'}]}>
                                  <Text style={{color:'#FF9800', fontSize: 18, fontWeight: 'bold'}}>
                                    {drivingStartTime ? Math.round((Date.now() - drivingStartTime.getTime())/60000) : 0} m
                                  </Text>
                                  <Text style={{color:'#aaa', fontSize: 12}}>Duration</Text>
                              </View>
                          </View>
                      </View>
                  )}
              </View>

              {/* Floating Report Button */}
              <TouchableOpacity 
                style={styles.fab}
                onPress={() => setReportModalVisible(true)}
              >
                  <MaterialCommunityIcons name="plus" size={32} color="white" />
              </TouchableOpacity>
              
              <Modal visible={reportModalVisible} transparent animationType="slide">
                   <BlurView intensity={20} style={StyleSheet.absoluteFill}>
                       <TouchableOpacity style={{flex:1}} onPress={() => setReportModalVisible(false)} />
                       <View style={styles.reportSheet}>
                           <Text style={styles.sheetTitle}>Report Hazard</Text>
                           <View style={{flexDirection: 'row', justifyContent: 'space-around', marginVertical: 20}}>
                               <TouchableOpacity onPress={() => handleReportRadar('police')} style={{alignItems: 'center'}}>
                                   <View style={[styles.reportIconBig, {backgroundColor: '#FF5252'}]}>
                                       <MaterialCommunityIcons name="police-badge" size={30} color="white" />
                                   </View>
                                   <Text style={{color:'white', marginTop:8}}>Police</Text>
                               </TouchableOpacity>
                               <TouchableOpacity onPress={() => handleReportRadar('speed_camera')} style={{alignItems: 'center'}}>
                                   <View style={[styles.reportIconBig, {backgroundColor: '#2196F3'}]}>
                                       <MaterialCommunityIcons name="camera" size={30} color="white" />
                                   </View>
                                   <Text style={{color:'white', marginTop:8}}>Camera</Text>
                               </TouchableOpacity>
                           </View>
                       </View>
                   </BlurView>
              </Modal>
          </View>
      );
  }

  // DASHBOARD MODE UI (Home)
  return (
    <View style={styles.container}>
      <LinearGradient
         colors={['#0F172A', '#020617']}
         style={StyleSheet.absoluteFill}
      />
      
      {/* Custom Header with Menu Trigger */}
      <View style={styles.mainHeader}>
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.iconBtn}>
              <MaterialCommunityIcons name="menu" size={28} color="#F8FAFC" />
          </TouchableOpacity>
          
          <Text style={styles.appName}>
            RADAR <Text style={{ color: '#FF5252' }}>TINDER</Text>
          </Text>
          
          <View style={styles.headerRight}>
              <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.iconBtn}>
                  {/* Small Profile Dot Indicator */}
                  <View style={{width: 28, height: 28, borderRadius: 14, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center'}}>
                     <MaterialCommunityIcons name="account" size={18} color="#94A3B8" />
                  </View>
              </TouchableOpacity>
          </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          
          {/* Animated Driving Button */}
          <View style={styles.animContainer}>
              <RadarAnimation />
              <TouchableOpacity style={styles.startButton} onPress={toggleDrivingMode}>
                  <LinearGradient
                    colors={['#FF5252', '#D32F2F']}
                    style={styles.startButtonGradient}
                  >
                      <MaterialCommunityIcons name="steering" size={36} color="white" />
                      <Text style={styles.startText}>START DRIVING</Text>
                  </LinearGradient>
              </TouchableOpacity>
          </View>

          {/* Grid Menu */}
          <View style={styles.gridContainer}>
              <ActionCard 
                icon="navigation-variant" 
                title="Navigate" subtitle="Map & Route" 
                onPress={() => { setIsDriving(true); setActiveTab('Map'); }} 
              />
              <ActionCard 
                icon="car-wrench" 
                title="AI Diagnose" subtitle="Car Issues" 
                onPress={() => navigation.navigate('AIDiagnose')} 
              />
              <ActionCard 
                icon="card-text-outline" 
                title="Permit Test" subtitle="Practice" 
                onPress={() => navigation.navigate('PermitTest')} 
              />
              <ActionCard 
                icon="chart-timeline-variant" 
                title="History" subtitle="Past Trips" 
                onPress={() => navigation.navigate('History')} 
              />
          </View>

          {/* Pro Features Slider (Replaces Banner) */}
          <View style={styles.sliderContainer}>
              <LinearGradient
                colors={['#1E293B', '#0F172A']}
                style={styles.sliderGradient}
              >
                  <FlatList
                    ref={proSliderRef}
                    data={PRO_FEATURES}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    renderItem={({ item }) => <ProSlideItem item={item} />}
                    keyExtractor={(item) => item.title}
                  />
                  {/* Pagination Dots */}
                  <View style={styles.pager}>
                      {PRO_FEATURES.map((_, i) => (
                          <View key={i} style={[styles.dot, i === proSliderIndex ? { backgroundColor: '#4ECDC4', width: 16 } : {}]} />
                      ))}
                  </View>
              </LinearGradient>
          </View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  
  // Header
  mainHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 20 },
  appName: { color: '#F8FAFC', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  headerRight: { flexDirection: 'row', gap: 10 },
  iconBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  // Big Animation & Button
  animContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 30 },
  startButton: { position: 'absolute', bottom: 40, borderRadius: 30, elevation: 10, shadowColor: '#FF5252', shadowRadius: 20, shadowOpacity: 0.5 },
  startButtonGradient: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 30, paddingVertical: 16, borderRadius: 30 },
  startText: { color: 'white', fontWeight: 'bold', fontSize: 18, marginLeft: 10, letterSpacing: 1 },

  // Grid
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 20 },
  actionCard: { width: '48%', height: 140, marginBottom: 16, borderRadius: 24, overflow: 'hidden' },
  actionCardGradient: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 10 },
  actionIconContainer: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(78, 205, 196, 0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  actionTitle: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  actionSubtitle: { color: '#64748B', fontSize: 12, marginTop: 4 },

  // Pro Slider
  sliderContainer: { marginHorizontal: 20, marginTop: 10, marginBottom: 30, borderRadius: 20, overflow: 'hidden' },
  sliderGradient: { paddingVertical: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  proIconBox: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  pager: { flexDirection: 'row', justifyContent: 'center', marginTop: 15, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#334155' },

  // Driving Mode
  drivingHeader: { paddingTop: 50, paddingBottom: 10, paddingHorizontal: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#000' },
  drivingModeTitle: { color: 'white', fontWeight: '900', fontSize: 16 },
  drivingModeSub: { color: '#4ECDC4', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  tabBar: { flexDirection: 'row', justifyContent: 'center', backgroundColor: '#111', marginHorizontal: 20, borderRadius: 12, padding: 4, marginBottom: 10 },
  tabItem: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 8 },
  activeTabItem: { backgroundColor: '#222' },
  tabText: { color: '#888', fontWeight: 'bold', fontSize: 12 },

  liveAlertBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(255,82,82,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveAlertIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(255,82,82,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveAlertTitle: { color: 'white', fontWeight: '700', fontSize: 13 },
  liveAlertSubtitle: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  liveAlertDismiss: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.1)',
  },
  
  basicContainer: { alignItems: 'center', paddingTop: 20 },
  hudCircle: { width: 220, height: 220, borderRadius: 110, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#222', backgroundColor: '#111' },
  ring: { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 4, borderColor: '#333' },
  speedText: { color: 'white', fontSize: 72, fontWeight: '900' },
  unitText: { color: '#666', fontSize: 16, fontWeight: 'bold', marginTop: -5 },
  
  alertsList: { width: '100%', padding: 20, marginTop: 20 },
  sectionHeader: { color: '#64748B', fontSize: 12, fontWeight: 'bold', marginBottom: 15, letterSpacing: 1 },
  alertItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: 15, borderRadius: 16, marginBottom: 10 },
  alertText: { color: 'white', flex: 1, marginLeft: 15, fontWeight: '500' },
  alertDist: { color: '#FFD700', fontWeight: 'bold' },

  // Map
  markerBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white' },
  mapOverlay: { position: 'absolute', top: 20, left: 20, right: 20 },
  mapInput: { backgroundColor: 'rgba(0,0,0,0.8)', padding: 15, borderRadius: 16, color: 'white' },

  statBox: { flex: 1, padding: 20, borderRadius: 20, alignItems: 'center' },

  fab: { position: 'absolute', left: 20, bottom: 85, backgroundColor: '#FF5252', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity:0.3, shadowRadius:4 },
  reportSheet: { backgroundColor: '#1E293B', padding: 30, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  sheetTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  reportIconBig: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center' },

  suggestionsContainer: { backgroundColor: '#1E293B', borderRadius: 12, marginTop: 5, paddingVertical: 5, maxHeight: 200 },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  suggestionText: { color: '#F8FAFC', marginLeft: 10, flex: 1 },
  
  navInstructionBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', padding: 15, borderRadius: 16, marginTop: 15, borderWidth: 1, borderColor: '#4ECDC4' },
});

export default RadarScreen;

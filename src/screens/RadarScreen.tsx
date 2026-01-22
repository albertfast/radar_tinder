import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Dimensions,
  TextInput,
  Keyboard,
  Modal,
  TouchableOpacity,
  FlatList
} from 'react-native';
import { 
  Text, 
  Surface,
  FAB,
  Button,
  IconButton
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRadarStore } from '../store/radarStore';
import { useAuthStore } from '../store/authStore';
import { RadarService } from '../services/RadarService';
import { GoogleMapsService } from '../services/GoogleMapsService';
import { LocationService } from '../services/LocationService';
import { OfflineService } from '../services/OfflineService';
import { SupabaseService } from '../services/SupabaseService';
import { RadarLocation } from '../types';
import { BlurView } from 'expo-blur';
import { useSettingsStore } from '../store/settingsStore';
import { formatDistance, formatSpeed } from '../utils/format';
import AdBanner from '../components/AdBanner';
import { AdService } from '../services/AdService';
import { AnalyticsService } from '../services/AnalyticsService';
import { RadarHeader } from './components/RadarHeader';
import { RadarAnimation } from '../components/RadarAnimation';
import RadarMap from '../components/RadarMap';
import { RadarGraphicView } from './components/RadarGraphicView';
import { ANIMATION_TIMING } from '../utils/animationConstants';

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
  const [routeMeta, setRouteMeta] = useState<{ etaText: string; distanceText: string; destinationLabel: string } | null>(null);
  const [destinationCoord, setDestinationCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [navSteps, setNavSteps] = useState<NavStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [drivingStartTime, setDrivingStartTime] = useState<Date | null>(null);
  const [totalDistance, setTotalDistance] = useState<number>(0);
  const [followHeading, setFollowHeading] = useState(true);

  // Refs for logic
  const currentLocationRef = useRef(currentLocation);
  const nearbyRadarsRef = useRef<any[]>([]);
  const isInteractingRef = useRef(false);
  const lastCameraUpdateRef = useRef(0);
  const autocompleteTimer = useRef<NodeJS.Timeout | null>(null);
  const proSliderRef = useRef<FlatList>(null);
  const [proSliderIndex, setProSliderIndex] = useState(0);
  const hasCenteredMapRef = useRef(false);
  const interactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const tripStartRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  const tripStartLabelRef = useRef<string | null>(null);
  const totalDistanceRef = useRef(totalDistance);
  const drivingStartTimeRef = useRef<Date | null>(drivingStartTime);
  const destinationInputRef = useRef<TextInput>(null);

  // Refs for cleanup
  const lastPositionRef = useRef<any>(null);

  const uiScale = Math.min(width / 375, 1.15);
  const mapOverlayInset = Math.max(12, Math.round(width * 0.04));
  const mapOverlayTop = Math.max(12, Math.round(height * 0.03));
  const mapControlSize = Math.max(38, Math.round(42 * uiScale));
  const mapControlGap = Math.max(8, Math.round(8 * uiScale));
  const mapPadding = {
    top: Math.max(160, Math.round(height * 0.22)),
    right: mapOverlayInset,
    bottom: Math.max(220, Math.round(height * 0.34)),
    left: mapOverlayInset,
  };

  // Force tab when navigation params request it
  useEffect(() => {
    const forceTab = route?.params?.forceTab as TabType | undefined;
    if (forceTab === 'Map' || forceTab === 'Graphic') {
      setActiveTab(forceTab);
      setIsDriving(true);
      navigation.setParams?.({ forceTab: undefined });
    } else if (forceTab === 'Basic') {
      setActiveTab('Basic');
      setIsDriving(false);
      navigation.setParams?.({ forceTab: undefined });
    }
  }, [route?.params?.forceTab]);

  const activeAlert = useMemo(() => {
    const unacknowledged = activeAlerts.filter((alert) => !alert.acknowledged);
    return unacknowledged.sort((a, b) => a.distance - b.distance)[0];
  }, [activeAlerts]);

  const closestRadar = useMemo(() => {
    if (!nearbyRadars || nearbyRadars.length === 0) return null;
    return [...nearbyRadars].sort((a, b) => a.distance - b.distance)[0];
  }, [nearbyRadars]);

  const compassRotation = currentLocation?.heading != null
    ? `${currentLocation.heading}deg`
    : '0deg';

  // --- Effects ---

  // Auto-scroll Pro Slider
  useEffect(() => {
    if (isDriving) return;
    const interval = setInterval(() => {
        let next = proSliderIndex + 1;
        if (next >= PRO_FEATURES.length) next = 0;
        setProSliderIndex(next);
        proSliderRef.current?.scrollToIndex({
          index: next,
          animated: true,
          viewPosition: 0.5,
        });
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
            if (isDriving && activeTab === 'Map' && !isInteractingRef.current && !isTypingRef.current) {
                const now = Date.now();
                if (now - lastCameraUpdateRef.current >= 2000) {
                    mapRef.current?.animateCamera({
                        center: { latitude: location.latitude, longitude: location.longitude },
                        pitch: 50,
                        heading: followHeading ? (location.heading || 0) : 0,
                        altitude: 800,
                        zoom: 17
                    }, { duration: 1500 });
                    lastCameraUpdateRef.current = now;
                }
            }
        }
    });

    return unsubscribe;
  }, [isDriving, activeTab, followHeading]);

  // Center the camera the first time we get a fix so the map doesn't stay on the default city
  useEffect(() => {
    if (currentLocation && mapRef.current && !hasCenteredMapRef.current) {
        mapRef.current.animateCamera({
          center: { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
          zoom: 15,
          pitch: 45,
          heading: followHeading ? (currentLocation.heading || 0) : 0,
        }, { duration: 800 });
        hasCenteredMapRef.current = true;
    }
  }, [currentLocation, followHeading]);

  useEffect(() => {
    totalDistanceRef.current = totalDistance;
  }, [totalDistance]);

  useEffect(() => {
    drivingStartTimeRef.current = drivingStartTime;
  }, [drivingStartTime]);

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

  const toggleDrivingMode = async () => {
    if (!isDriving) {
        setActiveTab('Basic');
        const startTime = new Date();
        setDrivingStartTime(startTime);
        drivingStartTimeRef.current = startTime;
        setTotalDistance(0);
        totalDistanceRef.current = 0;
        setIsMuted(true);
        tripStartRef.current = null;
        tripStartLabelRef.current = null;
        const startLoc = currentLocationRef.current || currentLocation;
        if (startLoc?.latitude && startLoc?.longitude) {
          tripStartRef.current = {
            latitude: startLoc.latitude,
            longitude: startLoc.longitude,
            timestamp: Date.now(),
          };
          tripStartLabelRef.current = null;
          LocationService.reverseGeocode(startLoc.latitude, startLoc.longitude)
            .then((addresses) => {
              tripStartLabelRef.current = formatGeocodeLabel(addresses[0], startLoc);
            })
            .catch(() => {});
        }
        AnalyticsService.trackEvent('drive_start', {
          location: currentLocation ? `${currentLocation.latitude},${currentLocation.longitude}` : 'unknown'
        });
    } else {
        const startTime = drivingStartTimeRef.current;
        AnalyticsService.trackEvent('drive_stop', {
          duration: startTime ? (new Date().getTime() - startTime.getTime()) / 1000 : 0,
          distance: totalDistanceRef.current
        });

        await saveTripIfNeeded();

        // Show interstitial for free users when they finish a trip
        if (AdService.shouldShowAds()) {
            await AdService.showInterstitial();
        }
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
            heading: followHeading ? (currentLocation.heading || 0) : 0,
            pitch: 60,
        }, { duration: 1000 });
        isInteractingRef.current = false;
    }
  };

  const handleTextChange = (text: string) => {
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

  const formatGeocodeLabel = (
    addr?: { name?: string; street?: string; city?: string; region?: string; country?: string },
    coords?: { latitude: number; longitude: number }
  ) => {
    if (addr) {
      const main = [addr.name, addr.street, addr.city].filter(Boolean).join(' ');
      const region = [addr.region, addr.country].filter(Boolean).join(', ');
      return [main, region].filter(Boolean).join(', ');
    }
    if (coords) {
      return `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
    }
    return 'Unknown';
  };

  const saveTripIfNeeded = useCallback(async () => {
    if (!user) return;
    const startTime = drivingStartTimeRef.current;
    if (!startTime || !tripStartRef.current) return;

    const distanceMeters = Math.round(totalDistanceRef.current * 1000);
    if (distanceMeters < 200) {
      tripStartRef.current = null;
      tripStartLabelRef.current = null;
      return;
    }

    const endTime = new Date();
    const durationSeconds = Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000));
    const endLocation = currentLocationRef.current || currentLocation;

    let startLabel = tripStartLabelRef.current;
    if (!startLabel && tripStartRef.current) {
      try {
        const addresses = await LocationService.reverseGeocode(
          tripStartRef.current.latitude,
          tripStartRef.current.longitude
        );
        startLabel = formatGeocodeLabel(addresses[0], tripStartRef.current);
        tripStartLabelRef.current = startLabel;
      } catch (error) {}
    }

    let endLabel = 'End';
    if (endLocation?.latitude && endLocation?.longitude) {
      try {
        const addresses = await LocationService.reverseGeocode(
          endLocation.latitude,
          endLocation.longitude
        );
        endLabel = formatGeocodeLabel(addresses[0], endLocation);
      } catch (error) {
        endLabel = formatGeocodeLabel(undefined, endLocation);
      }
    }

    await SupabaseService.createTrip({
      userId: user.id,
      startLocation: startLabel || 'Start',
      endLocation: endLabel,
      distance: distanceMeters,
      duration: durationSeconds,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      score: 0,
    });

    tripStartRef.current = null;
    tripStartLabelRef.current = null;
  }, [currentLocation, user]);

  const markInteracting = useCallback(() => {
    isInteractingRef.current = true;
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }
    interactionTimeoutRef.current = setTimeout(() => {
      if (!isTypingRef.current) {
        isInteractingRef.current = false;
      }
    }, 2000);
  }, []);

  const handleMapTouchStart = useCallback(() => {
    if (destinationInputRef.current?.isFocused()) {
      destinationInputRef.current.blur();
      isTypingRef.current = false;
    }
    Keyboard.dismiss();
    markInteracting();
  }, [markInteracting]);

  const endInteracting = useCallback(() => {
    if (!isTypingRef.current) {
      isInteractingRef.current = false;
    }
  }, []);

  const zoomMap = useCallback(async (delta: number) => {
    if (!mapRef.current) return;
    try {
      const camera = await mapRef.current.getCamera();
      const currentZoom = typeof camera.zoom === 'number' ? camera.zoom : 17;
      const nextZoom = Math.max(2, Math.min(20, currentZoom + delta));
      mapRef.current.animateCamera({ zoom: nextZoom }, { duration: 200 });
      markInteracting();
    } catch (error) {}
  }, [markInteracting]);

  const toggleHeadingMode = useCallback(() => {
    markInteracting();
    setFollowHeading((prev) => {
      const next = !prev;
      const heading = next ? (currentLocation?.heading || 0) : 0;
      mapRef.current?.animateCamera({ heading }, { duration: 300 });
      return next;
    });
  }, [currentLocation, markInteracting]);

  const handleNavigate = async (targetDest?: string) => {
      const finalDest = targetDest || destination;
      // Simplified navigate logic
      if (!finalDest) {
        console.warn('No destination provided');
        return;
      }
      setRouteMeta(null);
      setDestinationCoord(null);

      try {
        // Unfocus keyboard to reveal more map space
        Keyboard.dismiss();
        isTypingRef.current = false;

        // Get current location from ref or fetch fresh
        let loc = currentLocationRef.current || currentLocation;
        if (!loc) {
          try {
            loc = await LocationService.getCurrentLocation();
            if (loc) {
              setCurrentLocation(loc);
              currentLocationRef.current = loc;
            }
          } catch (error) {
            console.error('Failed to get current location:', error);
            alert('Unable to get your location. Please enable location services and try again.');
            return;
          }
        }

        if (!loc) {
          alert('Location unavailable. Please enable location services.');
          return;
        }

        const res = await GoogleMapsService.getDirections(
            loc.latitude, loc.longitude, finalDest
        );
        
        // Handle error responses
        if (!res || res?.error) {
            alert(res?.message || 'Unable to get directions. Please try again.');
            return;
        }
        
        if(res?.coordinates?.length) {
            setRouteCoords(res.coordinates);
            const primaryLeg = res?.legs?.[0];
            if (primaryLeg) {
              setRouteMeta({
                etaText: primaryLeg.duration?.text || 'ETA —',
                distanceText: primaryLeg.distance?.text || 'Distance —',
                destinationLabel: primaryLeg.end_address || finalDest
              });
              if (primaryLeg.end_location?.lat && primaryLeg.end_location?.lng) {
                setDestinationCoord({
                  latitude: primaryLeg.end_location.lat,
                  longitude: primaryLeg.end_location.lng
                });
              }
            } else {
              setRouteMeta(null);
              setDestinationCoord(null);
            }
            setIsDriving(true);
            setActiveTab('Map');
            const steps = primaryLeg?.steps || [];
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
                    loc.latitude, loc.longitude,
                    r.latitude, r.longitude
                );
                return { ...r, distance: d };
            }));

            setNearbyRadars(routeRadarsWithDist.sort((a,b) => a.distance - b.distance));
            
            // Clear suggestions just in case
            setSuggestions([]);

            mapRef.current?.fitToCoordinates(res.coordinates, {
              edgePadding: { top: 180, right: 80, bottom: 260, left: 80 },
              animated: true,
            });
            hasCenteredMapRef.current = true;
        } else {
            alert('Unable to find route. Please check the destination and try again.');
        }
      } catch (error) {
        console.error('Navigation failed:', error);
        alert('Route could not be created. Check your connection and try again.');
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

  const ActionCard = ({ icon, title, subtitle, onPress, gradientColors = ['#0F172A', '#0B1224'], accent = '#4ECDC4', tag }: any) => (
    <TouchableOpacity style={styles.actionCard} onPress={onPress}>
        <LinearGradient
            colors={gradientColors}
            start={{x:0, y:0}} end={{x:1, y:1}}
            style={styles.actionCardGradient}
        >
            <View style={styles.actionTopRow}>
                <View style={[styles.actionIconContainer, { backgroundColor: accent + '22', borderColor: accent + '33' }]}>
                    <MaterialCommunityIcons name={icon} size={28} color={accent} />
                </View>
                {tag ? (
                  <View style={[styles.actionTag, { backgroundColor: accent + '20' }]}>
                    <Text style={[styles.actionTagText, { color: accent }]}>{tag}</Text>
                  </View>
                ) : null}
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

  const StatPill = ({ icon, label, value, accent = '#4ECDC4' }: { icon: any; label: string; value: string; accent?: string }) => (
    <View style={[styles.statCard, { borderColor: accent + '40', backgroundColor: accent + '12' }]}>
      <View style={[styles.statIcon, { backgroundColor: accent + '26' }]}>
        <MaterialCommunityIcons name={icon} size={18} color={accent} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
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
                      <Text style={styles.drivingModeSub}>MAP</Text>
                  </View>
                  <IconButton icon="cog" iconColor="#fff" onPress={() => navigation.navigate('RadarSettings')} />
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

              <View style={{ flex: 1 }}>
                  {activeTab === 'Basic' && (
                      <View style={styles.basicContainer}>
                          <View style={styles.hudCircle}>
                              <Text style={styles.speedText}>{formatSpeed(currentSpeed, unitSystem).split(' ')[0]}</Text>
                              <Text style={styles.unitText}>{formatSpeed(currentSpeed, unitSystem).split(' ')[1]}</Text>
                              <View style={[styles.ring, { borderColor: '#4ECDC4' }]} />
                              <View style={[styles.ring, { width: 230, height: 230, borderColor: 'rgba(78,205,196,0.3)', borderWidth: 1 }]} />
                          </View>

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
                                  <Text style={{color: '#666', marginTop: 10, textAlign: 'center'}}>Scanning area...</Text>
                              )}
                          </View>

                          <View style={{ marginTop: 'auto', paddingVertical: 15, alignItems: 'center', width: '100%' }}>
                               <AdBanner />
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
                                destinationPoint={destinationCoord}
                                mapPadding={mapPadding}
                                onRadarPress={(radar: RadarLocation) => {
                                  if (canConfirmRadar(radar)) {
                                    handleConfirmRadar(radar);
                                  }
                                }}
                                onMapTouchStart={handleMapTouchStart}
                                onMapTouchEnd={endInteracting}
                            />
                            <View style={[styles.mapOverlay, { top: mapOverlayTop, left: mapOverlayInset, right: mapOverlayInset }]}>
                                   <View style={{flexDirection: 'row', alignItems: 'center', gap: mapControlGap}}>
                                       <View style={{flex: 1}}>
                                            <TextInput 
                                                ref={destinationInputRef}
                                                placeholder="Go somewhere..." 
                                                placeholderTextColor="#aaa"
                                                style={[
                                                  styles.mapInput,
                                                  {
                                                    paddingVertical: Math.round(10 * uiScale),
                                                    paddingHorizontal: Math.round(12 * uiScale),
                                                    fontSize: Math.round(15 * uiScale),
                                                  },
                                                ]}
                                                value={destination}
                                                onChangeText={handleTextChange}
                                                onSubmitEditing={() => handleNavigate()}
                                                returnKeyType="search"
                                                blurOnSubmit={false}
                                                autoCorrect={false}
                                                autoCapitalize="none"
                                                onFocus={() => {
                                                  isTypingRef.current = true;
                                                  isInteractingRef.current = true;
                                                }}
                                                onBlur={() => {
                                                  isTypingRef.current = false;
                                                  endInteracting();
                                                }}
                                            />
                                       </View>
                                       
                                       <TouchableOpacity 
                                            style={[styles.iconBtn, { backgroundColor: '#4ECDC4', padding: 12 }]} 
                                            onPress={() => handleNavigate()}
                                       >
                                           <Text style={{color: 'black', fontWeight: 'bold'}}>GO</Text>
                                       </TouchableOpacity>

                                      {(destination.length > 0 || isDriving) && (
                                            <TouchableOpacity 
                                                style={[styles.iconBtn, { backgroundColor: '#FF5252', padding: 12 }]} 
                                                onPress={async () => {
                                                    try {
                                                      await saveTripIfNeeded();
                                                    } catch (error) {}
                                                    setDestination('');
                                                    setSuggestions([]);
                                                    setRouteCoords([]);
                                                    setRouteMeta(null);
                                                    setDestinationCoord(null);
                                                    setNavSteps([]);
                                                    setCurrentStepIndex(0);
                                                    setIsDriving(false);
                                                    setActiveTab('Basic');
                                                    setNearbyRadars([]); 
                                                    if (currentLocation) {
                                                      RadarService.getNearbyRadars(currentLocation.latitude, currentLocation.longitude, 10).then(setNearbyRadars);
                                                    }
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
                                  
                                  {routeMeta && (
                                      <TouchableOpacity activeOpacity={0.9} onPress={centerMap}>
                                        <LinearGradient
                                          colors={['rgba(14,23,42,0.95)', 'rgba(12,20,33,0.85)']}
                                          start={{ x: 0, y: 0 }}
                                          end={{ x: 1, y: 1 }}
                                          style={[styles.routeSummaryCard, { padding: Math.round(12 * uiScale) }]}
                                        >
                                          <View style={styles.routeSummaryRow}>
                                            <View style={styles.routeIconBubble}>
                                              <MaterialCommunityIcons name="steering" size={18} color="#4ECDC4" />
                                            </View>
                                            <View style={{flex: 1}}>
                                              <Text style={[styles.routeSummaryTitle, { fontSize: Math.round(15 * uiScale) }]} numberOfLines={1}>{routeMeta.destinationLabel}</Text>
                                              <Text style={[styles.routeSummaryMeta, { fontSize: Math.round(12 * uiScale) }]}>{routeMeta.distanceText} • ETA {routeMeta.etaText}</Text>
                                            </View>
                                            <View style={styles.routeBadge}>
                                              <MaterialCommunityIcons name="radar" size={14} color="#0B1424" />
                                              <Text style={[styles.routeBadgeText, { fontSize: Math.round(12 * uiScale) }]}>{nearbyRadars.length}</Text>
                                            </View>
                                          </View>
                                        </LinearGradient>
                                      </TouchableOpacity>
                                  )}
                                    
                                    {routeCoords.length > 0 && (
                                        <View style={[styles.navInstructionBox, { padding: Math.round(12 * uiScale) }]}>
                                             <MaterialCommunityIcons
                                              name={getManeuverIcon(navSteps[currentStepIndex]?.maneuver)}
                                              size={32}
                                              color="white"
                                            />
                                            <View style={{marginLeft: 15}}>
                                                <Text style={{color:'white', fontSize: Math.round(16 * uiScale), fontWeight: 'bold'}}>
                                                  {formatStepDistance(getStepDistanceMeters(navSteps[currentStepIndex])) || '...'}
                                                </Text>
                                                <Text style={{color:'#ccc', fontSize: Math.round(12 * uiScale)}} numberOfLines={2}>
                                                  {navSteps[currentStepIndex]?.instruction || 'Follow the highlighted route'}
                                                </Text>
                                            </View>
                                        </View>
                                    )}
                           </View>
                           <View
                             style={[
                               styles.mapControls,
                               {
                                 right: mapOverlayInset,
                                 bottom: Math.max(110, Math.round(height * 0.22)),
                                 gap: mapControlGap,
                               },
                             ]}
                           >
                             <TouchableOpacity
                               style={[
                                 styles.mapControlButton,
                                 { width: mapControlSize, height: mapControlSize },
                               ]}
                               onPress={() => zoomMap(1)}
                             >
                               <MaterialCommunityIcons name="plus" size={Math.round(20 * uiScale)} color="white" />
                             </TouchableOpacity>
                             <TouchableOpacity
                               style={[
                                 styles.mapControlButton,
                                 { width: mapControlSize, height: mapControlSize },
                               ]}
                               onPress={() => zoomMap(-1)}
                             >
                               <MaterialCommunityIcons name="minus" size={Math.round(20 * uiScale)} color="white" />
                             </TouchableOpacity>
                             <TouchableOpacity
                               style={[
                                 styles.mapControlButton,
                                 followHeading && styles.mapControlButtonActive,
                                 { width: mapControlSize, height: mapControlSize },
                               ]}
                               onPress={toggleHeadingMode}
                             >
                               <View style={{ transform: [{ rotate: compassRotation }] }}>
                                 <MaterialCommunityIcons
                                   name="navigation"
                                   size={Math.round(20 * uiScale)}
                                   color={followHeading ? '#0B1424' : 'white'}
                                 />
                               </View>
                             </TouchableOpacity>
                           </View>
                      </View>
                  )}
                  
                  {activeTab === 'Graphic' && (
                      <RadarGraphicView
                          totalDistance={totalDistance}
                          drivingStartTime={drivingStartTime}
                          currentSpeed={currentSpeed}
                          unitSystem={unitSystem}
                      />
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

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} scrollEnabled={false}>
          {/* Pro perks moved up */}
          <View style={styles.sliderContainer}>
              <LinearGradient
                colors={['#111827', '#0B1224']}
                style={styles.sliderGradient}
              >
                  <FlatList
                    ref={proSliderRef}
                    data={PRO_FEATURES}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    getItemLayout={(_, index) => ({
                      length: width - 40,
                      offset: (width - 40) * index,
                      index,
                    })}
                    onScrollToIndexFailed={({ index }) => {
                      proSliderRef.current?.scrollToOffset({
                        offset: (width - 40) * Math.max(0, Math.min(index, PRO_FEATURES.length - 1)),
                        animated: true,
                      });
                    }}
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

          <View style={[styles.heroCard, { marginTop: 6, paddingVertical: 14 }]}>
              <LinearGradient
                colors={['#0B1224', '#08101f']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.heroGlowPrimary} />
              <View style={styles.heroGlowSecondary} />

              <View style={styles.heroTopRow}>
                  <View>
                      <Text style={styles.heroEyebrow}>Immersive radar</Text>
                      <Text style={styles.heroTitle}>Live 3D Radar</Text>
                  </View>
                  <View style={styles.heroBadge}>
                      <MaterialCommunityIcons name="cube-scan" size={18} color="#0B1424" />
                      <Text style={styles.heroBadgeText}>3D</Text>
                  </View>
              </View>

              <View style={styles.radarShell}>
                  <View style={styles.radarAura} />
                  <RadarAnimation />
                  <View style={[styles.radarChip, styles.radarChipLeft]}>
                      <MaterialCommunityIcons name="radar" size={18} color="#4ECDC4" />
                      <Text style={styles.radarChipText}>Live sweep</Text>
                  </View>
                  <View style={[styles.radarChip, styles.radarChipRight]}>
                      <MaterialCommunityIcons 
                        name={closestRadar ? 'map-marker-distance' : 'map-search'}
                        size={18} 
                        color={closestRadar ? '#FFB347' : '#94A3B8'} 
                      />
                      <Text style={styles.radarChipText}>
                        {closestRadar ? formatDistance(closestRadar.distance, unitSystem) : 'Scanning'}
                      </Text>
                  </View>
              </View>

              <View style={styles.statRow}>
                  <StatPill 
                    icon="map-marker-distance" 
                    label="Nearest radar" 
                    value={closestRadar ? formatDistance(closestRadar.distance, unitSystem) : 'Scanning...'} 
                    accent="#4ECDC4" 
                  />
                  <StatPill 
                    icon="speedometer" 
                    label="Speed" 
                    value={formatSpeed(currentSpeed, unitSystem)} 
                    accent="#FF5252" 
                  />
                  <StatPill 
                    icon={isMuted ? 'bell-off' : 'bell-ring'} 
                    label="Alert mode" 
                    value={isMuted ? 'Muted' : 'Sound on'} 
                    accent="#38BDF8" 
                  />
              </View>

              <TouchableOpacity style={styles.startButton} onPress={toggleDrivingMode}>
                  <LinearGradient
                    colors={['#FF6B6B', '#FF5252']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.startButtonGradient}
                  >
                      <View>
                          <Text style={styles.startText}>START DRIVING</Text>
                          <Text style={styles.startSubtext}>3D radar, live alerts and routing</Text>
                      </View>
                      <View style={styles.startBadge}>
                          <MaterialCommunityIcons name="steering" size={20} color="#0B1424" />
                      </View>
                  </LinearGradient>
              </TouchableOpacity>
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

  // Hero
  heroCard: { marginHorizontal: 16, marginTop: 6, marginBottom: 8, borderRadius: 22, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(12,18,32,0.92)' },
  heroGlowPrimary: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(78,205,196,0.18)', top: -40, right: -24 },
  heroGlowSecondary: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,82,82,0.08)', bottom: -50, left: -24 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  heroEyebrow: { color: '#38BDF8', fontSize: 12, letterSpacing: 1, fontWeight: '700', textTransform: 'uppercase' },
  heroTitle: { color: '#F8FAFC', fontSize: 24, fontWeight: '900', letterSpacing: 0.5, marginTop: 4 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4ECDC4', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, gap: 6, shadowColor: '#4ECDC4', shadowOpacity: 0.4, shadowRadius: 10, elevation: 4 },
  heroBadgeText: { color: '#0B1424', fontWeight: '900', letterSpacing: 0.5 },
  radarShell: { alignItems: 'center', justifyContent: 'center', marginTop: -4, marginBottom: 4 },
  radarAura: { position: 'absolute', width: width * 0.64, height: width * 0.64, borderRadius: width * 0.32, backgroundColor: 'rgba(78,205,196,0.05)' },
  radarChip: { position: 'absolute', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(2,6,23,0.82)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  radarChipLeft: { top: 22, left: 22 },
  radarChipRight: { top: 22, right: 22 },
  radarChipText: { color: '#E2E8F0', marginLeft: 8, fontWeight: '600', fontSize: 12 },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  statCard: { flex: 1, padding: 9, borderRadius: 12, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.03)' },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statLabel: { color: '#94A3B8', fontSize: 11, letterSpacing: 0.4 },
  statValue: { color: '#F8FAFC', fontWeight: '800', fontSize: 16 },
  startButton: { marginTop: 6, borderRadius: 18, overflow: 'hidden', shadowColor: '#FF5252', shadowRadius: 16, shadowOpacity: 0.45, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  startButtonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18 },
  startText: { color: '#FFFFFF', fontWeight: '900', fontSize: 18, letterSpacing: 0.6 },
  startSubtext: { color: '#F8FAFC', opacity: 0.8, fontSize: 12, marginTop: 4 },
  startBadge: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { marginHorizontal: 20, marginTop: 26, marginBottom: 10, color: '#94A3B8', letterSpacing: 1, fontSize: 12, fontWeight: '700' },

  // Grid
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 20 },
  actionCard: { width: '48%', height: 150, marginBottom: 16, borderRadius: 22, overflow: 'hidden' },
  actionCardGradient: { flex: 1, justifyContent: 'space-between', padding: 14, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', alignItems: 'flex-start' },
  actionTopRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionIconContainer: { width: 48, height: 48, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 1 },
  actionTag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  actionTagText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  actionTitle: { color: 'white', fontWeight: '900', fontSize: 16 },
  actionSubtitle: { color: '#94A3B8', fontSize: 12, marginTop: 2 },

  // Pro Slider
  sliderContainer: { marginHorizontal: 16, marginTop: 0, marginBottom: 10, borderRadius: 18, overflow: 'hidden' },
  sliderGradient: { paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  proIconBox: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  pager: { flexDirection: 'row', justifyContent: 'center', marginTop: 15, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#334155' },
  vehicleCard: { marginHorizontal: 16, marginTop: 6, marginBottom: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(12,18,32,0.9)' },
  vehicleIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(78,205,196,0.15)' },
  vehicleTitle: { color: '#E2E8F0', fontWeight: '800', fontSize: 15 },
  vehicleSubtitle: { color: '#94A3B8', fontSize: 12 },

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
  routeSummaryCard: { marginTop: 10, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(78,205,196,0.25)' },
  routeSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routeIconBubble: { width: 38, height: 38, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(78,205,196,0.5)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(78,205,196,0.1)' },
  routeSummaryTitle: { color: '#E2E8F0', fontWeight: '800', fontSize: 15 },
  routeSummaryMeta: { color: '#94A3B8', marginTop: 2, fontSize: 12 },
  routeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: '#4ECDC4' },
  routeBadgeText: { color: '#0B1424', fontWeight: '800' },
  mapControls: { position: 'absolute', alignItems: 'center', zIndex: 10 },
  mapControlButton: { borderRadius: 16, backgroundColor: 'rgba(15,23,42,0.95)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  mapControlButtonActive: { backgroundColor: '#4ECDC4', borderColor: '#4ECDC4' },

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

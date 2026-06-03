import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { useNavigationStore } from '../stores/navigationStore';
import { getUnitSystem } from '../utils/units';
import { reverseGeocode } from '../services/api';

type LocationSample = {
  lat: number;
  lng: number;
  timestamp: number;
  speed: number;
};

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadius = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useLocation() {
  const { setUserLocation, setUnitSystem, userLocation } = useNavigationStore();
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const countryDetected = useRef(false);
  const lastSampleRef = useRef<LocationSample | null>(null);

  const resolveSpeed = (location: Location.LocationObject): number => {
    const lat = location.coords.latitude;
    const lng = location.coords.longitude;
    const timestamp = typeof location.timestamp === 'number' ? location.timestamp : Date.now();
    const rawSpeed = location.coords.speed;
    const previous = lastSampleRef.current;
    let speed = 0;

    if (typeof rawSpeed === 'number' && Number.isFinite(rawSpeed) && rawSpeed >= 0) {
      speed = rawSpeed;
    } else if (previous) {
      const elapsedSeconds = Math.max(0, (timestamp - previous.timestamp) / 1000);
      if (elapsedSeconds >= 0.6 && elapsedSeconds <= 8) {
        const movedMeters = haversineMeters(previous.lat, previous.lng, lat, lng);
        speed = movedMeters < 1.4 ? 0 : Math.min(62, movedMeters / elapsedSeconds);
      } else {
        speed = previous.speed > 0.8 ? previous.speed * 0.82 : 0;
      }
    }

    lastSampleRef.current = { lat, lng, timestamp, speed };
    return Math.max(0, speed);
  };

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Location permission denied');
        return;
      }

      // Get initial position
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      setUserLocation({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? 0,
        speed: resolveSpeed(loc),
        heading: Math.max(0, loc.coords.heading ?? 0),
      });

      // Detect country once
      if (!countryDetected.current) {
        countryDetected.current = true;
        try {
          const nativeGeocode = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          const nativeCountryCode = nativeGeocode[0]?.isoCountryCode ?? null;

          if (nativeCountryCode) {
            setUnitSystem(getUnitSystem(nativeCountryCode), nativeCountryCode);
          } else {
            const geo = await reverseGeocode(loc.coords.latitude, loc.coords.longitude);
            const system = getUnitSystem(geo.countryCode ?? undefined);
            setUnitSystem(system, geo.countryCode);
          }
        } catch {
          try {
            const geo = await reverseGeocode(loc.coords.latitude, loc.coords.longitude);
            setUnitSystem(getUnitSystem(geo.countryCode ?? undefined), geo.countryCode);
          } catch {
            setUnitSystem(getUnitSystem(), null);
          }
        }
      }

      // Watch for real-time updates
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 3,
        },
        (newLoc: Location.LocationObject) => {
          setUserLocation({
            lat: newLoc.coords.latitude,
            lng: newLoc.coords.longitude,
            accuracy: newLoc.coords.accuracy ?? 0,
            speed: resolveSpeed(newLoc),
            heading: Math.max(0, newLoc.coords.heading ?? 0),
          });
        },
      );
    })();

    return () => {
      if (watchRef.current) watchRef.current.remove();
    };
  }, []);

  return { userLocation };
}

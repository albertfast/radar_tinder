import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { useNavigationStore } from '../stores/navigationStore';
import { getUnitSystem } from '../utils/units';
import { reverseGeocode } from '../services/api';

export function useLocation() {
  const { setUserLocation, setUnitSystem, userLocation } = useNavigationStore();
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const countryDetected = useRef(false);

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
        speed: Math.max(0, loc.coords.speed ?? 0),
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
            speed: Math.max(0, newLoc.coords.speed ?? 0),
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

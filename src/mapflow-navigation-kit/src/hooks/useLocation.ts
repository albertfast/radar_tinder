import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { LocationService } from '../../../services/LocationService';
import { useNavigationStore } from '../stores/navigationStore';
import { getUnitSystem } from '../utils/units';
import { reverseGeocode } from '../services/api';

export function useLocation() {
  const { setUserLocation, setUnitSystem, userLocation } = useNavigationStore();
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const countryDetected = useRef(false);

  useEffect(() => {
    (async () => {
      const hasForegroundPermission = await LocationService.hasForegroundPermission();
      if (!hasForegroundPermission) {
        console.warn('Location permission denied');
        return;
      }

      const loc = await LocationService.getCurrentLocation({ requestPermission: false });
      setUserLocation({
        lat: loc.latitude,
        lng: loc.longitude,
        accuracy: loc.accuracy ?? 0,
        speed: Math.max(0, loc.speed ?? 0),
        heading: Math.max(0, loc.heading ?? 0),
      });

      // Detect country once
      if (!countryDetected.current) {
        countryDetected.current = true;
        try {
          const nativeGeocode = await Location.reverseGeocodeAsync({
            latitude: loc.latitude,
            longitude: loc.longitude,
          });
          const nativeCountryCode = nativeGeocode[0]?.isoCountryCode ?? null;

          if (nativeCountryCode) {
            setUnitSystem(getUnitSystem(nativeCountryCode), nativeCountryCode);
          } else {
            const geo = await reverseGeocode(loc.latitude, loc.longitude);
            const system = getUnitSystem(geo.countryCode ?? undefined);
            setUnitSystem(system, geo.countryCode);
          }
        } catch {
          try {
            const geo = await reverseGeocode(loc.latitude, loc.longitude);
            setUnitSystem(getUnitSystem(geo.countryCode ?? undefined), geo.countryCode);
          } catch {
            setUnitSystem(getUnitSystem(), null);
          }
        }
      }

      watchRef.current = await LocationService.watchLocation(
        (newLoc) => {
          setUserLocation({
            lat: newLoc.latitude,
            lng: newLoc.longitude,
            accuracy: newLoc.accuracy ?? 0,
            speed: Math.max(0, newLoc.speed ?? 0),
            heading: Math.max(0, newLoc.heading ?? 0),
          });
        },
        {
          forDriving: true,
          requestPermission: false,
        },
      );
    })().catch((error) => {
      console.warn('MapFlow location bootstrap skipped:', error);
    });

    return () => {
      if (watchRef.current) watchRef.current.remove();
    };
  }, []);

  return { userLocation };
}

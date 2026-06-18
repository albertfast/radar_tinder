import { useEffect, useRef } from 'react';
import { getSpeedLimits } from '../services/api';
import { useNavigationStore } from '../stores/navigationStore';

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
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

export function useSpeedLimits() {
  const {
    userLocation,
    userSpeed,
    isNavigating,
    userHeading,
    routeHeading,
    countryCode,
    unitSystem,
    speedLimit,
    setSpeedLimit,
  } = useNavigationStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLookupRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const lastGoodLimitRef = useRef<{ value: number; lat: number; lng: number; at: number } | null>(null);
  const failureCountRef = useRef(0);

  useEffect(() => {
    if (!isNavigating || !userLocation) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (!isNavigating) {
        lastLookupRef.current = null;
        lastGoodLimitRef.current = null;
        failureCountRef.current = 0;
        setSpeedLimit(null);
      }
      return;
    }

    const fetch = async () => {
      if (!userLocation) return;

      const speedKph = Math.max(0, userSpeed * 3.6);
      const lookupRadius = speedKph >= 90 ? 170 : speedKph >= 55 ? 130 : 85;
      const lastLookup = lastLookupRef.current;
      if (lastLookup) {
        const movedMeters = haversineMeters(lastLookup.lat, lastLookup.lng, userLocation.lat, userLocation.lng);
        const waitMs = failureCountRef.current >= 2 ? 45000 : 15000;

        if (movedMeters < 35 && Date.now() - lastLookup.at < waitMs) {
          return;
        }
      }

      lastLookupRef.current = {
        lat: userLocation.lat,
        lng: userLocation.lng,
        at: Date.now(),
      };

      const keepLastGoodLimit = () => {
        const lastGood = lastGoodLimitRef.current;
        if (!lastGood) {
          return false;
        }

        const ageMs = Date.now() - lastGood.at;
        const movedMeters = haversineMeters(lastGood.lat, lastGood.lng, userLocation.lat, userLocation.lng);
        if (ageMs <= 120000 && movedMeters <= Math.max(1000, lookupRadius * 8)) {
          setSpeedLimit(lastGood.value);
          return true;
        }

        return false;
      };

      try {
        const data = await getSpeedLimits(
          userLocation.lat,
          userLocation.lng,
          lookupRadius,
          userHeading > 0 ? userHeading : null,
          routeHeading,
          countryCode || (unitSystem === 'imperial' ? 'US' : null),
        );
        if (data.speedLimit && data.speedLimit.value > 0) {
          let val = data.speedLimit.value;
          if (data.speedLimit.unit === 'mph') val = Math.round(val * 1.60934);
          setSpeedLimit(val);
          lastGoodLimitRef.current = {
            value: val,
            lat: userLocation.lat,
            lng: userLocation.lng,
            at: Date.now(),
          };
          failureCountRef.current = 0;
        } else {
          failureCountRef.current += 1;
          if (!keepLastGoodLimit() && speedLimit === null) {
            setSpeedLimit(null);
          }
        }
      } catch {
        failureCountRef.current += 1;
        if (!keepLastGoodLimit() && speedLimit === null) {
          setSpeedLimit(null);
        }
      }
    };

    fetch();
    intervalRef.current = setInterval(fetch, 12000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [countryCode, isNavigating, routeHeading, setSpeedLimit, speedLimit, unitSystem, userHeading, userLocation, userSpeed]);

  return { speedLimit };
}

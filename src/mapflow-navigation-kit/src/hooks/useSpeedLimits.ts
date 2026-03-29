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
  const { userLocation, isNavigating, userHeading, routeHeading, speedLimit, setSpeedLimit } = useNavigationStore();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastLookupRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const failureCountRef = useRef(0);

  useEffect(() => {
    if (!isNavigating || !userLocation) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (!isNavigating) setSpeedLimit(null);
      return;
    }

    const fetch = async () => {
      if (!userLocation) return;

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

      try {
        const data = await getSpeedLimits(
          userLocation.lat,
          userLocation.lng,
          40,
          userHeading > 0 ? userHeading : null,
          routeHeading,
        );
        if (data.speedLimit?.value) {
          let val = data.speedLimit.value;
          if (data.speedLimit.unit === 'mph') val = Math.round(val * 1.60934);
          setSpeedLimit(val);
          failureCountRef.current = 0;
        } else {
          failureCountRef.current += 1;
          if (speedLimit === null) {
            setSpeedLimit(null);
          }
        }
      } catch {
        failureCountRef.current += 1;
      }
    };

    fetch();
    intervalRef.current = setInterval(fetch, 12000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isNavigating, userLocation, userHeading, routeHeading, setSpeedLimit, speedLimit]);

  return { speedLimit };
}

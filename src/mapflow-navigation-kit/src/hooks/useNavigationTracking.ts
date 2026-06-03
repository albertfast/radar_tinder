import { useEffect, useRef } from 'react';
import { useNavigationStore } from '../stores/navigationStore';

interface SegmentProjection {
  distanceMeters: number;
  t: number;
}

function toMeters(lat: number, lng: number, originLat: number, originLng: number) {
  const metersPerLat = 111320;
  const metersPerLng = Math.cos((originLat * Math.PI) / 180) * 111320;

  return {
    x: (lng - originLng) * metersPerLng,
    y: (lat - originLat) * metersPerLat,
  };
}

function projectPointToSegmentMeters(
  pointLat: number,
  pointLng: number,
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): SegmentProjection {
  const originLat = pointLat;
  const originLng = pointLng;

  const point = { x: 0, y: 0 };
  const start = toMeters(startLat, startLng, originLat, originLng);
  const end = toMeters(endLat, endLng, originLat, originLng);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return {
      distanceMeters: Math.hypot(point.x - start.x, point.y - start.y),
      t: 0,
    };
  }

  const tRaw = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq;
  const t = Math.max(0, Math.min(1, tRaw));
  const projectionX = start.x + t * dx;
  const projectionY = start.y + t * dy;

  return {
    distanceMeters: Math.hypot(point.x - projectionX, point.y - projectionY),
    t,
  };
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function bearingBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const lambda1 = (lng1 * Math.PI) / 180;
  const lambda2 = (lng2 * Math.PI) / 180;
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);

  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

function resolveRouteBearing(geometry: [number, number][], startIndex: number): number | null {
  for (let index = startIndex; index < geometry.length - 1; index += 1) {
    const [startLng, startLat] = geometry[index];
    const [endLng, endLat] = geometry[index + 1];
    const segmentDistance = haversineDistance(startLat, startLng, endLat, endLng);

    if (segmentDistance >= 10) {
      return bearingBetween(startLat, startLng, endLat, endLng);
    }
  }

  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function headingDelta(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function buildCumulativeDistances(geometry: [number, number][]): number[] {
  const cumulative = [0];
  for (let index = 0; index < geometry.length - 1; index += 1) {
    const [startLng, startLat] = geometry[index];
    const [endLng, endLat] = geometry[index + 1];
    cumulative.push(
      cumulative[index] + haversineDistance(startLat, startLng, endLat, endLng)
    );
  }
  return cumulative;
}

function projectProgressOnRoute(
  lat: number,
  lng: number,
  geometry: [number, number][],
  cumulativeDistances: number[],
): { progressMeters: number; distanceMeters: number; segmentIndex: number; t: number } {
  let closestIndex = 0;
  let closestProjectionT = 0;
  let minimumDistance = Number.MAX_SAFE_INTEGER;

  for (let index = 0; index < geometry.length - 1; index += 1) {
    const [startLng, startLat] = geometry[index];
    const [endLng, endLat] = geometry[index + 1];
    const projection = projectPointToSegmentMeters(lat, lng, startLat, startLng, endLat, endLng);

    if (projection.distanceMeters < minimumDistance) {
      minimumDistance = projection.distanceMeters;
      closestIndex = index;
      closestProjectionT = projection.t;
    }
  }

  const [closestStartLng, closestStartLat] = geometry[closestIndex];
  const [closestEndLng, closestEndLat] = geometry[closestIndex + 1];
  const closestSegmentDistance = haversineDistance(
    closestStartLat,
    closestStartLng,
    closestEndLat,
    closestEndLng,
  );

  return {
    progressMeters: cumulativeDistances[closestIndex] + closestSegmentDistance * closestProjectionT,
    distanceMeters: minimumDistance,
    segmentIndex: closestIndex,
    t: closestProjectionT,
  };
}

export function useNavigationTracking() {
  const offRouteCounterRef = useRef(0);
  const navStartedAtRef = useRef<number | null>(null);
  const activeRouteKeyRef = useRef<string | null>(null);
  const {
    isNavigating,
    route,
    userLocation,
    userSpeed,
    userHeading,
    accuracy,
    setRemainingDistance,
    setRemainingStepDistance,
    setRemainingDuration,
    setEta,
    setCurrentStepIndex,
    setDistanceToRoute,
    setRouteHeading,
    setIsOffRoute,
    setHasArrived,
  } = useNavigationStore();

  useEffect(() => {
    if (!route || !userLocation) {
      offRouteCounterRef.current = 0;
      navStartedAtRef.current = null;
      activeRouteKeyRef.current = null;
      setDistanceToRoute(0);
      setRouteHeading(null);
      setIsOffRoute(false);
      setHasArrived(false);
      setRemainingStepDistance(0);
      return;
    }

    try {
      const geometry = route.geometry;
      if (!Array.isArray(geometry) || geometry.length < 2) {
        return;
      }

      const userLat = userLocation.lat;
      const userLng = userLocation.lng;
      const cumulativeDistances = buildCumulativeDistances(geometry);
      const routeProgress = projectProgressOnRoute(userLat, userLng, geometry, cumulativeDistances);
      const closestIndex = routeProgress.segmentIndex;
      const closestProjectionT = routeProgress.t;
      const minimumDistance = routeProgress.distanceMeters;
      const [closestStartLng, closestStartLat] = geometry[closestIndex];
      const [closestEndLng, closestEndLat] = geometry[closestIndex + 1];
      const closestSegmentDistance = haversineDistance(
        closestStartLat,
        closestStartLng,
        closestEndLat,
        closestEndLng,
      );
      let remainingDistance = closestSegmentDistance * (1 - closestProjectionT);

      for (let index = closestIndex + 1; index < geometry.length - 1; index += 1) {
        const [startLng, startLat] = geometry[index];
        const [endLng, endLat] = geometry[index + 1];
        remainingDistance += haversineDistance(startLat, startLng, endLat, endLng);
      }

      const routeHeading = resolveRouteBearing(geometry, closestIndex);
      setDistanceToRoute(minimumDistance);
      setRouteHeading(routeHeading);

      if (isNavigating) {
        const totalDistance = route.distance;
        const routeKey = `${route.distance}:${route.duration}:${route.geometry.length}`;
        if (activeRouteKeyRef.current !== routeKey) {
          activeRouteKeyRef.current = routeKey;
          navStartedAtRef.current = Date.now();
        } else if (!navStartedAtRef.current) {
          navStartedAtRef.current = Date.now();
        }

        const travelledDistance = Math.max(0, totalDistance - remainingDistance);
        if (route.steps.length > 0) {
          const passedTolerance = clamp(18 + userSpeed * 2.6, 22, 48);
          let selectedStepIndex = Math.max(0, route.steps.length - 1);
          let selectedStepDistance = 0;

          for (let index = 0; index < route.steps.length; index += 1) {
            const location = route.steps[index]?.maneuver?.location;
            if (!Array.isArray(location) || location.length < 2) {
              continue;
            }

            const stepProgress = projectProgressOnRoute(
              Number(location[1]),
              Number(location[0]),
              geometry,
              cumulativeDistances,
            ).progressMeters;

            if (stepProgress >= routeProgress.progressMeters - passedTolerance) {
              selectedStepIndex = index;
              selectedStepDistance = Math.max(0, stepProgress - routeProgress.progressMeters);
              break;
            }
          }

          setCurrentStepIndex(selectedStepIndex);
          setRemainingStepDistance(selectedStepDistance);
        }

        const arrivalThreshold = clamp(totalDistance * 0.0025, 18, 45);
        if (remainingDistance <= arrivalThreshold) {
          offRouteCounterRef.current = 0;
          setHasArrived(true);
          setCurrentStepIndex(Math.max(0, route.steps.length - 1));
          setRemainingStepDistance(0);
          setRemainingDistance(0);
          setRemainingDuration(0);
          setEta(new Date());
          setIsOffRoute(false);
          return;
        }

        setHasArrived(false);
        setRemainingDistance(Math.max(0, remainingDistance));

        const baseSecondsPerMeter = totalDistance > 0 ? route.duration / totalDistance : 0;
        const elapsedSeconds = navStartedAtRef.current
          ? Math.max(0, (Date.now() - navStartedAtRef.current) / 1000)
          : 0;
        const observedSecondsPerMeter =
          travelledDistance > 140 && elapsedSeconds > 25
            ? elapsedSeconds / travelledDistance
            : null;
        const currentSecondsPerMeter = userSpeed > 1.5 ? 1 / userSpeed : null;

        let effectiveSecondsPerMeter = baseSecondsPerMeter;
        if (observedSecondsPerMeter) {
          effectiveSecondsPerMeter = baseSecondsPerMeter * 0.68 + observedSecondsPerMeter * 0.32;
        }
        if (currentSecondsPerMeter) {
          const weight = observedSecondsPerMeter ? 0.16 : 0.1;
          effectiveSecondsPerMeter =
            effectiveSecondsPerMeter * (1 - weight) + currentSecondsPerMeter * weight;
        }

        effectiveSecondsPerMeter = clamp(
          effectiveSecondsPerMeter,
          baseSecondsPerMeter * 0.72,
          baseSecondsPerMeter * 2.4,
        );

        const remainingDuration = remainingDistance * effectiveSecondsPerMeter;
        setRemainingDuration(Math.max(0, remainingDuration));
        setEta(new Date(Date.now() + Math.max(0, remainingDuration) * 1000));

        const accuracyMeters = Number.isFinite(accuracy) ? Math.max(0, accuracy) : 0;
        const offRouteDistanceThreshold = clamp(
          30 + Math.min(20, accuracyMeters * 0.2) + Math.min(14, userSpeed * 1.4),
          32,
          64,
        );
        const routeHeadingDelta =
          routeHeading !== null && userHeading > 0 ? headingDelta(userHeading, routeHeading) : null;
        const headingMismatch =
          userSpeed > 3 &&
          minimumDistance > 24 &&
          routeHeadingDelta !== null &&
          routeHeadingDelta > 82;

        if (minimumDistance > offRouteDistanceThreshold || headingMismatch) {
          offRouteCounterRef.current += 1;
        } else {
          offRouteCounterRef.current = 0;
        }

        setIsOffRoute(offRouteCounterRef.current >= 2);
      } else {
        offRouteCounterRef.current = 0;
        navStartedAtRef.current = null;
        setIsOffRoute(false);
        setHasArrived(false);
        setRemainingStepDistance(0);
      }
    } catch {
      // Ignore geometry calculation failures and keep the last known UI state.
    }
  }, [
    isNavigating,
    route,
    userLocation,
    userSpeed,
    userHeading,
    accuracy,
    setCurrentStepIndex,
    setDistanceToRoute,
    setEta,
    setHasArrived,
    setIsOffRoute,
    setRemainingDistance,
    setRemainingStepDistance,
    setRemainingDuration,
    setRouteHeading,
  ]);
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { AdService } from '../../../services/AdService';
import { AnalyticsService } from '../../../services/AnalyticsService';
import { LocationService } from '../../../services/LocationService';
import { SupabaseService } from '../../../services/SupabaseService';
import { TabType } from '../types';

type UserLike = { id: string } | null | undefined;

type DrivingSessionParams = {
  user: UserLike;
  currentLocation: any;
  currentLocationRef: React.MutableRefObject<any>;
};

const MIN_TRIP_DISTANCE_METERS = 80;
const MIN_MOVING_SPEED_KPH = 3;
const MAX_REASONABLE_SPEED_KPH = 220;

export function useDrivingSession({ user, currentLocation, currentLocationRef }: DrivingSessionParams) {
  const [isDriving, setIsDriving] = useState(false);
  const [drivingStartTime, setDrivingStartTime] = useState<Date | null>(null);
  const [totalDistance, setTotalDistance] = useState(0);

  const tripStartRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  const tripStartLabelRef = useRef<string | null>(null);
  const totalDistanceRef = useRef(totalDistance);
  const drivingStartTimeRef = useRef<Date | null>(drivingStartTime);
  const lastPositionRef = useRef<any>(null);
  const speedTelemetryRef = useRef<{
    speedSumKph: number;
    speedSamplesCount: number;
    topSpeedKph: number;
    movingDurationSeconds: number;
  }>({
    speedSumKph: 0,
    speedSamplesCount: 0,
    topSpeedKph: 0,
    movingDurationSeconds: 0,
  });
  const lastSpeedSampleRef = useRef<{
    latitude: number;
    longitude: number;
    timestamp: number;
  } | null>(null);

  useEffect(() => {
    totalDistanceRef.current = totalDistance;
  }, [totalDistance]);

  useEffect(() => {
    drivingStartTimeRef.current = drivingStartTime;
  }, [drivingStartTime]);

  useEffect(() => {
    if (!isDriving) return;
    if (!currentLocation?.latitude || !currentLocation?.longitude) return;

    const now = Date.now();
    const previousSample = lastSpeedSampleRef.current;
    let deltaSeconds = 0;
    if (previousSample) {
      deltaSeconds = Math.max(0, (now - previousSample.timestamp) / 1000);
    }

    let speedKph: number | null = null;
    if (
      typeof currentLocation.speed === 'number' &&
      Number.isFinite(currentLocation.speed) &&
      currentLocation.speed >= 0
    ) {
      speedKph = currentLocation.speed * 3.6;
    } else if (previousSample && deltaSeconds > 0 && deltaSeconds <= 12) {
      const movedKm = LocationService.calculateDistanceSync(
        previousSample.latitude,
        previousSample.longitude,
        currentLocation.latitude,
        currentLocation.longitude
      );
      speedKph = movedKm > 0 ? movedKm / (deltaSeconds / 3600) : 0;
    }

    if (
      typeof speedKph === 'number' &&
      Number.isFinite(speedKph) &&
      speedKph >= 0 &&
      speedKph <= MAX_REASONABLE_SPEED_KPH
    ) {
      speedTelemetryRef.current.speedSumKph += speedKph;
      speedTelemetryRef.current.speedSamplesCount += 1;
      speedTelemetryRef.current.topSpeedKph = Math.max(
        speedTelemetryRef.current.topSpeedKph,
        speedKph
      );

      if (deltaSeconds > 0 && deltaSeconds <= 12 && speedKph >= MIN_MOVING_SPEED_KPH) {
        speedTelemetryRef.current.movingDurationSeconds += deltaSeconds;
      }
    }

    lastSpeedSampleRef.current = {
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      timestamp: now,
    };
  }, [
    currentLocation?.latitude,
    currentLocation?.longitude,
    currentLocation?.speed,
    isDriving,
  ]);

  const formatGeocodeLabel = (
    addr?: {
      name?: string | null;
      street?: string | null;
      city?: string | null;
      region?: string | null;
      country?: string | null;
    },
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
    if (distanceMeters < MIN_TRIP_DISTANCE_METERS) {
      tripStartRef.current = null;
      tripStartLabelRef.current = null;
      return;
    }

    const endTime = new Date();
    const durationSeconds = Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000));
    const endLocation = currentLocationRef.current || currentLocation;
    const telemetry = speedTelemetryRef.current;
    const avgSpeedKph =
      telemetry.speedSamplesCount >= 3
        ? Number((telemetry.speedSumKph / telemetry.speedSamplesCount).toFixed(1))
        : null;
    const topSpeedKph =
      telemetry.speedSamplesCount >= 1
        ? Number(Math.max(telemetry.topSpeedKph, avgSpeedKph || 0).toFixed(1))
        : null;
    const movingDurationSeconds = Math.round(telemetry.movingDurationSeconds);

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
        const addresses = await LocationService.reverseGeocode(endLocation.latitude, endLocation.longitude);
        endLabel = formatGeocodeLabel(addresses[0], endLocation);
      } catch (error) {
        endLabel = formatGeocodeLabel(undefined, endLocation);
      }
    }

    const savedTrip = await SupabaseService.createTrip({
      userId: user.id,
      startLocation: startLabel || 'Start',
      endLocation: endLabel,
      distance: distanceMeters,
      duration: durationSeconds,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      score: 0,
      avgSpeedKph,
      topSpeedKph,
      movingDuration: movingDurationSeconds,
      speedSamplesCount: telemetry.speedSamplesCount,
      startLatitude: tripStartRef.current.latitude,
      startLongitude: tripStartRef.current.longitude,
      endLatitude:
        typeof endLocation?.latitude === 'number' && Number.isFinite(endLocation.latitude)
          ? endLocation.latitude
          : null,
      endLongitude:
        typeof endLocation?.longitude === 'number' && Number.isFinite(endLocation.longitude)
          ? endLocation.longitude
          : null,
    });
    if (!savedTrip) {
      console.warn('[DrivingSession] Trip queued. Supabase insert will retry when connectivity is restored.');
    }

    tripStartRef.current = null;
    tripStartLabelRef.current = null;
    lastSpeedSampleRef.current = null;
    speedTelemetryRef.current = {
      speedSumKph: 0,
      speedSamplesCount: 0,
      topSpeedKph: 0,
      movingDurationSeconds: 0,
    };
  }, [currentLocation, currentLocationRef, user]);

  const startDrivingSession = useCallback(
    async (params: {
      setActiveTab: (tab: TabType) => void;
      activateMapTab?: boolean;
      source?: 'manual' | 'navigate' | 'force_tab';
      hasActiveRoute?: boolean;
    }) => {
      const activateMapTab = params.activateMapTab ?? true;
      const source = params.source || 'manual';
      const hasActiveRoute = params.hasActiveRoute ?? false;
      if (source === 'manual' && !hasActiveRoute) {
        await AdService.showInterstitial('start_driving_basic');
      }
      if (activateMapTab) {
        params.setActiveTab('Map');
      }
      setIsDriving(true);

      if (drivingStartTimeRef.current && tripStartRef.current) {
        return;
      }

      const startTime = new Date();
      setDrivingStartTime(startTime);
      drivingStartTimeRef.current = startTime;
      setTotalDistance(0);
      totalDistanceRef.current = 0;

      tripStartRef.current = null;
      tripStartLabelRef.current = null;
      lastSpeedSampleRef.current = null;
      speedTelemetryRef.current = {
        speedSumKph: 0,
        speedSamplesCount: 0,
        topSpeedKph: 0,
        movingDurationSeconds: 0,
      };

      const startLoc = currentLocationRef.current || currentLocation;
      if (startLoc?.latitude && startLoc?.longitude) {
        tripStartRef.current = {
          latitude: startLoc.latitude,
          longitude: startLoc.longitude,
          timestamp: Date.now(),
        };
        LocationService.reverseGeocode(startLoc.latitude, startLoc.longitude)
          .then((addresses) => {
            tripStartLabelRef.current = formatGeocodeLabel(addresses[0], startLoc);
          })
          .catch(() => {});
      }

      AnalyticsService.trackEvent('drive_start', {
        source,
        location: startLoc ? `${startLoc.latitude},${startLoc.longitude}` : 'unknown',
      });
    },
    [currentLocation, currentLocationRef]
  );

  const stopDrivingSession = useCallback(
    async (params: { setActiveTab: (tab: TabType) => void }) => {
      const startTime = drivingStartTimeRef.current;
      AnalyticsService.trackEvent('drive_stop', {
        duration: startTime ? (new Date().getTime() - startTime.getTime()) / 1000 : 0,
        distance: totalDistanceRef.current,
      });

      await saveTripIfNeeded();

      setIsDriving(false);
      params.setActiveTab('Basic');
      setDrivingStartTime(null);
      drivingStartTimeRef.current = null;
      tripStartRef.current = null;
      tripStartLabelRef.current = null;
      lastPositionRef.current = null;
      lastSpeedSampleRef.current = null;
      speedTelemetryRef.current = {
        speedSumKph: 0,
        speedSamplesCount: 0,
        topSpeedKph: 0,
        movingDurationSeconds: 0,
      };

      AdService.markDrivingState(false, false);
      await AdService.showInterstitial('end_ride');
    },
    [saveTripIfNeeded]
  );

  const resetDrivingSession = useCallback(() => {
    setIsDriving(false);
    setDrivingStartTime(null);
    setTotalDistance(0);
    drivingStartTimeRef.current = null;
    totalDistanceRef.current = 0;
    tripStartRef.current = null;
    tripStartLabelRef.current = null;
    lastPositionRef.current = null;
    lastSpeedSampleRef.current = null;
    speedTelemetryRef.current = {
      speedSumKph: 0,
      speedSamplesCount: 0,
      topSpeedKph: 0,
      movingDurationSeconds: 0,
    };
  }, []);

  return {
    isDriving,
    setIsDriving,
    drivingStartTime,
    setDrivingStartTime,
    drivingStartTimeRef,
    totalDistance,
    setTotalDistance,
    totalDistanceRef,
    tripStartRef,
    tripStartLabelRef,
    lastPositionRef,
    saveTripIfNeeded,
    startDrivingSession,
    stopDrivingSession,
    resetDrivingSession,
  };
}

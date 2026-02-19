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

export function useDrivingSession({ user, currentLocation, currentLocationRef }: DrivingSessionParams) {
  const [isDriving, setIsDriving] = useState(false);
  const [drivingStartTime, setDrivingStartTime] = useState<Date | null>(null);
  const [totalDistance, setTotalDistance] = useState(0);

  const tripStartRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  const tripStartLabelRef = useRef<string | null>(null);
  const totalDistanceRef = useRef(totalDistance);
  const drivingStartTimeRef = useRef<Date | null>(drivingStartTime);
  const lastPositionRef = useRef<any>(null);

  useEffect(() => {
    totalDistanceRef.current = totalDistance;
  }, [totalDistance]);

  useEffect(() => {
    drivingStartTimeRef.current = drivingStartTime;
  }, [drivingStartTime]);

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
        const addresses = await LocationService.reverseGeocode(endLocation.latitude, endLocation.longitude);
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
  }, [currentLocation, currentLocationRef, user]);

  const startDrivingSession = useCallback(
    async (params: {
      setActiveTab: (tab: TabType) => void;
      activateMapTab?: boolean;
      source?: 'manual' | 'navigate' | 'force_tab';
    }) => {
      const activateMapTab = params.activateMapTab ?? true;
      const source = params.source || 'manual';
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
    async (params: { setActiveTab: (tab: TabType) => void; showInterstitial?: boolean }) => {
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

      if (params.showInterstitial && AdService.shouldShowAds()) {
        await AdService.showInterstitial();
      }
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

import { useCallback, useRef, useState } from 'react';

type LocationLike = {
  latitude: number;
  longitude: number;
  speed?: number | null;
};

type SpeedSample = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

type UseSpeedSmoothingArgs = {
  calculateDistanceSync: (
    latitude1: number,
    longitude1: number,
    latitude2: number,
    longitude2: number
  ) => number;
};

const LOW_SPEED_DEADBAND_KPH = 3.6;

export function useSpeedSmoothing({ calculateDistanceSync }: UseSpeedSmoothingArgs) {
  const [rawSpeedKph, setRawSpeedKph] = useState(0);
  const [uiSpeedKph, setUiSpeedKph] = useState(0);
  const sampleRef = useRef<SpeedSample | null>(null);
  const lowSpeedTicksRef = useRef(0);

  const setUiWithHysteresis = useCallback((nextSpeedKph: number) => {
    const boundedSpeed = Math.max(0, Math.min(nextSpeedKph, 220));
    if (boundedSpeed < LOW_SPEED_DEADBAND_KPH) {
      lowSpeedTicksRef.current += 1;
      if (lowSpeedTicksRef.current >= 2) {
        setUiSpeedKph(0);
      } else {
        setUiSpeedKph((prev) => (prev < LOW_SPEED_DEADBAND_KPH ? 0 : prev * 0.5));
      }
      return;
    }

    lowSpeedTicksRef.current = 0;
    setUiSpeedKph((prev) => (prev <= 0 ? boundedSpeed : prev * 0.35 + boundedSpeed * 0.65));
  }, []);

  const pushLocationSample = useCallback(
    (location: LocationLike) => {
      if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
        return;
      }

      const now = Date.now();
      const previousSample = sampleRef.current;
      let nextSpeedKph: number | null = null;

      if (
        typeof location.speed === 'number' &&
        Number.isFinite(location.speed) &&
        location.speed >= 0
      ) {
        nextSpeedKph = location.speed * 3.6;
      } else if (previousSample) {
        const elapsedSeconds = (now - previousSample.timestamp) / 1000;
        if (elapsedSeconds >= 0.7 && elapsedSeconds <= 8) {
          const movedKm = calculateDistanceSync(
            previousSample.latitude,
            previousSample.longitude,
            location.latitude,
            location.longitude
          );
          nextSpeedKph = Math.min(220, (movedKm / elapsedSeconds) * 3600);
        }
      }

      if (nextSpeedKph !== null && Number.isFinite(nextSpeedKph)) {
        const boundedSpeed = Math.max(0, Math.min(nextSpeedKph, 220));
        setRawSpeedKph(boundedSpeed);
        setUiWithHysteresis(boundedSpeed);
      } else {
        setRawSpeedKph((prev) => (prev < LOW_SPEED_DEADBAND_KPH ? 0 : prev * 0.6));
        setUiSpeedKph((prev) => (prev < LOW_SPEED_DEADBAND_KPH ? 0 : prev * 0.55));
      }

      sampleRef.current = {
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: now,
      };
    },
    [calculateDistanceSync, setUiWithHysteresis]
  );

  const resetSpeed = useCallback(() => {
    lowSpeedTicksRef.current = 0;
    sampleRef.current = null;
    setRawSpeedKph(0);
    setUiSpeedKph(0);
  }, []);

  return {
    rawSpeedKph,
    uiSpeedKph,
    pushLocationSample,
    resetSpeed,
  };
}

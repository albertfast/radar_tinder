import { useMemo } from 'react';

const clamp01 = (value: number) => Math.max(0, Math.min(value, 1));

export function useRadarSignalLevels(nearbyRadars: any[], closestRadar: any) {
  return useMemo(() => {
    const radarCount = Array.isArray(nearbyRadars) ? nearbyRadars.length : 0;
    const signalLevel = clamp01(radarCount / 12);

    const closestDistanceKm = Number(closestRadar?.distance);
    const closestDistanceMiles = Number.isFinite(closestDistanceKm)
      ? Math.max(0, closestDistanceKm * 0.621371)
      : Number.POSITIVE_INFINITY;
    const dangerLevel = Number.isFinite(closestDistanceMiles)
      ? clamp01(Math.exp(-closestDistanceMiles / 0.45))
      : 0;

    return {
      signalLevel,
      dangerLevel,
    };
  }, [closestRadar?.distance, nearbyRadars]);
}

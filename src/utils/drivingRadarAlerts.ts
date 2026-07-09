import { RadarAlert, RadarLocation } from '../types';
import { LocationService } from '../services/LocationService';
import { describeRadarApproachByDistance } from './radarAlerts';
import { getExternalCameraSourceRule } from '../config/externalCameraSources';
import { filterRouteRadarCandidates } from './routeRadarProjection';

export type DrivingRadarCandidate = RadarLocation & { distance: number };

type DrivingAlertParams = {
  radars: DrivingRadarCandidate[];
  currentLocation: {
    latitude: number;
    longitude: number;
    heading?: number | null;
  };
  routeCoords: Array<{ latitude: number; longitude: number }>;
  routeMode: boolean;
  speedKph: number;
  hasReliableSpeed: boolean;
  userId: string;
  now?: Date;
};

export const isAlertableSpeedCameraRadar = (
  radar?: Pick<RadarLocation, 'type' | 'markerKind' | 'source' | 'sourceKey' | 'verified'> | null
): boolean => {
  if (!radar) return false;

  const type = String(radar.type || '').toLowerCase();
  const markerKind = String(radar.markerKind || '').toLowerCase();
  const isSpeedCamera = type === 'speed_camera' || type === 'fixed' || markerKind === 'camera';
  if (!isSpeedCamera) return false;

  const source = String(radar.source || '').toLowerCase();
  if ((source === 'community' || source === 'manual') && !radar.verified) {
    return false;
  }

  const sourceRule = getExternalCameraSourceRule(radar.sourceKey);
  if (sourceRule && (sourceRule.status !== 'active' || sourceRule.alertPolicy !== 'driver_alert')) {
    return false;
  }

  return true;
};

export const withDrivingRadarDistance = <T extends RadarLocation>(
  radar: T,
  currentLocation: { latitude: number; longitude: number }
): T & { distance: number } => ({
  ...radar,
  distance: LocationService.calculateDistanceSync(
    currentLocation.latitude,
    currentLocation.longitude,
    radar.latitude,
    radar.longitude
  ),
});

export const mergeDrivingRadarCandidates = <T extends { id?: string | number; latitude?: number; longitude?: number }>(
  candidates: T[]
): T[] => {
  const seen = new Set<string>();
  const merged: T[] = [];

  candidates.forEach((candidate) => {
    const id =
      candidate?.id != null
        ? String(candidate.id)
        : `${Number(candidate?.latitude).toFixed(6)}:${Number(candidate?.longitude).toFixed(6)}`;
    if (seen.has(id)) return;
    seen.add(id);
    merged.push(candidate);
  });

  return merged;
};

export const getDrivingAlertStageRank = (distanceKm: number | null | undefined): number => {
  if (!Number.isFinite(distanceKm)) return 0;
  const distance = Math.max(0, Number(distanceKm));
  if (distance <= 0.08) return 3;
  if (distance <= 0.35) return 2;
  if (distance <= 1.2) return 1;
  return 0;
};

const getBaseThresholdKm = (params: {
  routeMode: boolean;
  speedKph: number;
  hasReliableSpeed: boolean;
  useEtaWindow: boolean;
}) => {
  const { routeMode, speedKph, hasReliableSpeed, useEtaWindow } = params;

  if (routeMode) {
    if (speedKph > 100) return 2.4;
    if (speedKph > 60) return 1.6;
    if (speedKph > 30) return 1.15;
    return useEtaWindow ? 0.9 : 1.1;
  }

  let baseThreshold = 0.6;
  if (speedKph > 110) baseThreshold = 2.6;
  else if (speedKph > 80) baseThreshold = 1.9;
  else if (speedKph > 50) baseThreshold = 1.35;
  else if (speedKph > 20) baseThreshold = 0.9;

  return hasReliableSpeed ? baseThreshold : Math.max(baseThreshold, 1.05);
};

export const buildDrivingRadarAlerts = ({
  radars,
  currentLocation,
  routeCoords,
  routeMode,
  speedKph,
  hasReliableSpeed,
  userId,
  now = new Date(),
}: DrivingAlertParams): RadarAlert[] => {
  const alertableRadars = radars.filter(isAlertableSpeedCameraRadar);
  const useEtaWindow = hasReliableSpeed && speedKph >= 8;
  const baseThreshold = getBaseThresholdKm({
    routeMode,
    speedKph,
    hasReliableSpeed,
    useEtaWindow,
  });
  const etaConfidence = hasReliableSpeed ? 'high' : 'low';
  const alerts: RadarAlert[] = [];
  let routeMatchedRadars: (DrivingRadarCandidate & {
    corridorDistanceMeters: number;
    etaSeconds?: number;
    routeMatchScore: number;
    headingDeltaDeg: number | null;
  })[] = [];

  if (routeMode && routeCoords.length >= 2) {
    routeMatchedRadars = filterRouteRadarCandidates(alertableRadars, {
      currentLocation,
      routeCoords,
      speedKph: hasReliableSpeed ? speedKph : 5,
      maxCorridorMeters: 55,
      maxAheadMeters: Math.max(baseThreshold * 1000, 250),
      minAheadMeters: -25,
      maxRouteHeadingDeltaDeg: hasReliableSpeed && speedKph >= 8 ? 85 : undefined,
    });
  } else {
    routeMatchedRadars = alertableRadars
      .map((radar) => {
        const distance = Number(radar.distance);
        return {
          ...radar,
          distance,
          corridorDistanceMeters: 0,
          routeMatchScore: 1 - Math.min(distance / Math.max(baseThreshold, 0.1), 1),
          headingDeltaDeg: null,
        };
      })
      .filter((r) => r.distance < baseThreshold);
  }

  for (const radar of routeMatchedRadars) {
    const distance = Number(radar.distance);
    if (!Number.isFinite(distance)) continue;
    if (distance >= baseThreshold) continue;

    const etaSeconds = Number.isFinite(radar.etaSeconds)
      ? radar.etaSeconds
      : speedKph > 5
        ? (distance / speedKph) * 3600
        : Math.max(60, distance * 120);
    const distanceScore = 1 - Math.min(distance / Math.max(baseThreshold, 0.1), 1);
    const routeMatchScore = Number((radar.routeMatchScore * 0.8 + distanceScore * 0.2).toFixed(3));

    alerts.push({
      id: `alert-${radar.id}`,
      radarId: radar.id,
      userId,
      type: radar.type,
      countryCode: radar.countryCode,
      speedLimit: radar.speedLimit,
      distance,
      estimatedTime: Math.max(0, etaSeconds / 60),
      etaConfidence,
      approachLabel: describeRadarApproachByDistance(distance),
      markerKind: radar.markerKind,
      severity: distance < baseThreshold / 2 ? 'high' : distance < baseThreshold * 0.8 ? 'medium' : 'low',
      routeMatched: true,
      corridorDistanceMeters: radar.corridorDistanceMeters,
      etaSeconds,
      routeMatchScore,
      headingDeltaDeg: radar.headingDeltaDeg,
      locationLabel: radar.locationLabel,
      acknowledged: false,
      createdAt: now,
    });
  }

  return alerts.sort((a, b) => a.distance - b.distance);
};

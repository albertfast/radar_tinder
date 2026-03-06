import { RadarAlert, RadarEtaConfidence, RadarLocation } from '../types';
import { formatDistance } from './format';

type RadarTimingInput = Pick<
  RadarAlert,
  'distance' | 'estimatedTime' | 'etaConfidence' | 'approachLabel' | 'locationLabel'
>;

export const formatRadarTypeLabel = (
  type?: RadarAlert['type'] | RadarLocation['type']
): string => {
  switch (type) {
    case 'red_light':
      return 'Red Light Camera';
    case 'fixed':
      return 'Fixed Camera';
    case 'mobile':
      return 'Mobile Radar';
    case 'police':
      return 'Police';
    case 'traffic_enforcement':
      return 'Traffic Enforcement';
    case 'speed_camera':
    default:
      return 'Speed Camera';
  }
};

export const getRadarShortLocation = (label?: string | null): string => {
  if (!label) return '';
  return label
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(', ');
};

export const describeRadarApproachByDistance = (distanceKm?: number | null): string => {
  if (!Number.isFinite(distanceKm)) return 'Ahead';
  const distance = Math.max(0, Number(distanceKm));
  if (distance <= 0.08) return 'Now';
  if (distance <= 0.35) return 'Soon';
  if (distance <= 1.2) return 'Ahead';
  return 'Further ahead';
};

export const hasTrustedRadarEta = (etaConfidence?: RadarEtaConfidence | null): boolean =>
  etaConfidence === 'high' || etaConfidence === 'medium';

export const getTrustedRadarEtaMinutes = (
  alert: Pick<RadarAlert, 'estimatedTime' | 'etaConfidence'>
): number | null => {
  if (!hasTrustedRadarEta(alert.etaConfidence)) return null;
  if (!Number.isFinite(alert.estimatedTime)) return null;
  return Math.max(1, Math.round(alert.estimatedTime * 60));
};

export const formatRadarTimingText = (alert: RadarTimingInput): string => {
  const etaMinutes = getTrustedRadarEtaMinutes(alert);
  if (etaMinutes != null) {
    return `ETA ${etaMinutes} min`;
  }
  return alert.approachLabel || describeRadarApproachByDistance(alert.distance);
};

export const formatRadarAnnouncementTiming = (alert: RadarTimingInput): string => {
  const etaMinutes = getTrustedRadarEtaMinutes(alert);
  if (etaMinutes != null) {
    return `Estimated ${etaMinutes} minute${etaMinutes === 1 ? '' : 's'}`;
  }

  const approach = alert.approachLabel || describeRadarApproachByDistance(alert.distance);
  if (approach === 'Now') return 'Approaching now';
  if (approach === 'Soon') return 'Coming up soon';
  if (approach === 'Ahead') return 'Just ahead';
  return 'Further ahead';
};

export const formatRadarAlertSubtitle = (
  alert: RadarTimingInput,
  unitSystem: 'metric' | 'imperial'
): string => {
  const parts = [formatDistance(alert.distance, unitSystem)];
  const shortLocation = getRadarShortLocation(alert.locationLabel);
  if (shortLocation) {
    parts.push(shortLocation);
  }
  parts.push(formatRadarTimingText(alert));
  return parts.join(' • ');
};

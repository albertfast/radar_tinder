import { RadarAlert, RadarEtaConfidence, RadarLocation } from '../types';
import { formatDistance } from './format';

type RadarTimingInput = Pick<
  RadarAlert,
  | 'distance'
  | 'estimatedTime'
  | 'etaConfidence'
  | 'approachLabel'
  | 'locationLabel'
  | 'etaSeconds'
>;

type RadarSpeedInput = Pick<RadarAlert, 'speedLimit' | 'countryCode'>;

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
  alert: Pick<RadarAlert, 'estimatedTime' | 'etaConfidence' | 'etaSeconds'>
): number | null => {
  if (!hasTrustedRadarEta(alert.etaConfidence)) return null;
  if (Number.isFinite(alert.etaSeconds)) {
    return Math.max(1, Math.round(Number(alert.etaSeconds) / 60));
  }
  if (!Number.isFinite(alert.estimatedTime)) return null;
  return Math.max(1, Math.round(Number(alert.estimatedTime)));
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

const resolveRadarSpeedUnits = (countryCode?: string | null): 'MPH' | 'KM/H' => {
  if (String(countryCode || '').trim().toUpperCase() === 'US') {
    return 'MPH';
  }
  return 'KM/H';
};

const convertRadarSpeedLimit = (
  rawSpeedLimit: number,
  fromUnits: 'MPH' | 'KM/H',
  unitSystem: 'metric' | 'imperial'
) => {
  if (unitSystem === 'imperial') {
    return fromUnits === 'MPH' ? rawSpeedLimit : rawSpeedLimit * 0.621371;
  }
  return fromUnits === 'KM/H' ? rawSpeedLimit : rawSpeedLimit * 1.60934;
};

export const formatRadarSpeedLimitText = (
  alert: RadarSpeedInput,
  unitSystem: 'metric' | 'imperial'
): string => {
  const rawSpeedLimit = Number(alert.speedLimit);
  if (!Number.isFinite(rawSpeedLimit) || rawSpeedLimit <= 0) return '';

  const sourceUnits = resolveRadarSpeedUnits(alert.countryCode);
  const displayValue = Math.round(convertRadarSpeedLimit(rawSpeedLimit, sourceUnits, unitSystem));
  const displayUnit = unitSystem === 'imperial' ? 'MPH' : 'KM/H';
  return `Limit ${displayValue} ${displayUnit}`;
};

export const formatRadarSpeedLimitAnnouncement = (
  alert: RadarSpeedInput,
  unitSystem: 'metric' | 'imperial'
): string => {
  const rawSpeedLimit = Number(alert.speedLimit);
  if (!Number.isFinite(rawSpeedLimit) || rawSpeedLimit <= 0) return '';

  const sourceUnits = resolveRadarSpeedUnits(alert.countryCode);
  const displayValue = Math.round(convertRadarSpeedLimit(rawSpeedLimit, sourceUnits, unitSystem));
  const displayUnit = unitSystem === 'imperial' ? 'miles per hour' : 'kilometers per hour';
  return `Speed limit ${displayValue} ${displayUnit}`;
};

export const formatRadarAlertSubtitle = (
  alert: RadarTimingInput & RadarSpeedInput,
  unitSystem: 'metric' | 'imperial'
): string => {
  const parts = [formatDistance(alert.distance, unitSystem)];
  const shortLocation = getRadarShortLocation(alert.locationLabel);
  if (shortLocation) {
    parts.push(shortLocation);
  }
  const speedLimitText = formatRadarSpeedLimitText(alert, unitSystem);
  if (speedLimitText) {
    parts.push(speedLimitText);
  }
  parts.push(formatRadarTimingText(alert));
  return parts.join(' • ');
};

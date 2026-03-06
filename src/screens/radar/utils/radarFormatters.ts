import { NavStep } from '../types';
import { RadarLocation } from '../../../types';

export const decodeHtmlEntities = (text: string) =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

export const stripHtml = (html: string) =>
  decodeHtmlEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

export const formatStepDistance = (meters: number | null | undefined, unitSystem: 'metric' | 'imperial') => {
  if (meters === null || meters === undefined) return '';
  if (unitSystem === 'imperial') {
    const feet = meters * 3.28084;
    if (feet < 1000) return `${Math.round(feet)} ft`;
    const miles = meters / 1609.344;
    return `${miles.toFixed(1)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
};

export const getManeuverIcon = (maneuver?: string) => {
  switch (maneuver) {
    case 'turn-left':
      return 'arrow-left';
    case 'turn-right':
      return 'arrow-right';
    case 'turn-slight-left':
    case 'keep-left':
    case 'fork-left':
    case 'exit-left':
      return 'arrow-top-left';
    case 'turn-slight-right':
    case 'keep-right':
    case 'fork-right':
    case 'exit-right':
      return 'arrow-top-right';
    case 'turn-sharp-left':
      return 'arrow-bottom-left';
    case 'turn-sharp-right':
      return 'arrow-bottom-right';
    case 'uturn-left':
    case 'uturn-right':
      return 'backup-restore';
    case 'merge':
      return 'call-merge';
    case 'roundabout-left':
    case 'roundabout-right':
      return 'rotate-right';
    case 'ramp-left':
      return 'arrow-top-left';
    case 'ramp-right':
      return 'arrow-top-right';
    case 'straight':
    case 'continue':
    default:
      return 'arrow-up';
  }
};

export const formatRadarLabel = (type?: RadarLocation['type']) => {
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

const STREET_TOKEN =
  /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|hwy|highway|pkwy|parkway|ct|court|pl|place|trl|trail)\b/i;

const cleanAddressPart = (value: string) =>
  value
    .replace(/\b\d{5}(?:-\d{4})?\b/g, '')
    .replace(/\b(usa|united states)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

const stripLeadingHouseNumber = (value: string) => value.replace(/^\d+[A-Za-z-]*\s+/, '').trim();

const extractHouseAndStreet = (value: string) => {
  const match = value.match(/^(\d+[A-Za-z-]*)\s+(.+)$/);
  if (!match) return null;
  const houseNumber = match[1];
  const street = cleanAddressPart(match[2]);
  if (!street || !STREET_TOKEN.test(street)) return null;
  return { houseNumber, street };
};

const extractIntersectionParts = (value: string): [string, string] | null => {
  const normalized = cleanAddressPart(value);
  const directSplit = normalized
    .split(/\s(?:&|and|\/|at)\s/i)
    .map((part) => stripLeadingHouseNumber(part.trim()))
    .filter(Boolean);
  if (directSplit.length >= 2 && STREET_TOKEN.test(directSplit[0]) && STREET_TOKEN.test(directSplit[1])) {
    return [directSplit[0], directSplit[1]];
  }
  return null;
};

export const describeRadarLocation = (label?: string | null) => {
  if (!label) return '';
  const parts = String(label)
    .split(',')
    .map((part) => cleanAddressPart(part))
    .filter(Boolean);
  if (!parts.length) return '';

  const first = parts[0] || '';
  const second = parts[1] || '';

  const explicitIntersection = extractIntersectionParts(first);
  if (explicitIntersection) {
    return `Corner of ${explicitIntersection[0]} & ${explicitIntersection[1]}`;
  }

  const firstStreet = stripLeadingHouseNumber(first);
  const secondStreet = stripLeadingHouseNumber(second);
  if (
    firstStreet &&
    secondStreet &&
    STREET_TOKEN.test(firstStreet) &&
    STREET_TOKEN.test(secondStreet) &&
    firstStreet.toLowerCase() !== secondStreet.toLowerCase()
  ) {
    return `Corner of ${firstStreet} & ${secondStreet}`;
  }

  const houseAndStreet = extractHouseAndStreet(first);
  if (houseAndStreet) {
    if (secondStreet && STREET_TOKEN.test(secondStreet)) {
      return `Near ${houseAndStreet.houseNumber} ${houseAndStreet.street}, by ${secondStreet}`;
    }
    return `Near ${houseAndStreet.houseNumber} ${houseAndStreet.street}`;
  }

  if (firstStreet && STREET_TOKEN.test(firstStreet)) {
    if (secondStreet && STREET_TOKEN.test(secondStreet)) {
      return `${firstStreet}, approaching ${secondStreet}`;
    }
    return `Along ${firstStreet}`;
  }

  return first;
};

export const describeRadarApproach = (
  distanceKm: number,
  unitSystem: 'metric' | 'imperial'
) => {
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km < 0) return 'Position being refined';

  const meters = km * 1000;
  if (unitSystem === 'imperial') {
    const feet = meters * 3.28084;
    if (feet < 250) return 'Immediate alert zone';
    if (feet < 850) return 'Very close ahead';
    if (feet < 2600) return 'Approaching quickly';
    if (feet < 5280) return 'Ahead on route';
    return 'Within scan range';
  }

  if (meters < 80) return 'Immediate alert zone';
  if (meters < 260) return 'Very close ahead';
  if (meters < 800) return 'Approaching quickly';
  if (meters < 1600) return 'Ahead on route';
  return 'Within scan range';
};

export const formatRadarDistanceAdaptive = (
  distanceKm: number,
  unitSystem: 'metric' | 'imperial'
) => {
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km < 0) return '—';
  const meters = km * 1000;

  if (unitSystem === 'imperial') {
    const feet = meters * 3.28084;
    if (feet < 1000) return `${Math.round(feet)} ft`;
    return `${(km * 0.621371).toFixed(1)} mi`;
  }

  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${km.toFixed(1)} km`;
};

export const extractShortStreetLabel = (label?: string | null) => {
  if (!label) return '';
  const parts = label
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return '';

  const streetToken = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way)\b/i;
  const sanitize = (value: string) =>
    value
      .replace(/\b\d{5}(?:-\d{4})?\b/g, '')
      .replace(/^\d+[A-Za-z-]*\s+/, '')
      .trim();

  const first = sanitize(parts[0]);
  const second = parts[1] ? sanitize(parts[1]) : '';
  if (first && second && streetToken.test(first) && streetToken.test(second)) {
    return `${first} & ${second}`;
  }

  return first || sanitize(parts[0]);
};

export const canConfirmRadar = (radar?: RadarLocation) => {
  if (!radar?.id) return false;
  if (radar.source === 'community') return true;
  if (radar.source === 'external_osm' || radar.source === 'external') return false;
  return !radar.id.startsWith('osm-') && !radar.id.startsWith('mock-');
};

export const isHighwayManeuver = (step?: NavStep) => {
  const maneuver = (step?.maneuver || '').toLowerCase();
  const instruction = (step?.instruction || '').toLowerCase();
  return (
    maneuver.includes('ramp') ||
    maneuver.includes('merge') ||
    maneuver.includes('fork') ||
    maneuver.includes('keep') ||
    instruction.includes('highway') ||
    instruction.includes('motorway') ||
    instruction.includes('exit') ||
    instruction.includes('ramp')
  );
};

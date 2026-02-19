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

export const extractShortStreetLabel = (label?: string | null) => {
  if (!label) return '';
  const firstSegment = label
    .split(',')
    .map((part) => part.trim())
    .find(Boolean);
  if (!firstSegment) return '';
  const noZip = firstSegment.replace(/\b\d{5}(?:-\d{4})?\b/g, '').trim();
  const noHouseNumber = noZip.replace(/^\d+[A-Za-z-]*\s+/, '').trim();
  return noHouseNumber || noZip || firstSegment;
};

export const canConfirmRadar = (radar?: RadarLocation) => {
  if (!radar?.id) return false;
  return !radar.id.startsWith('osm-') && !radar.id.startsWith('google-') && !radar.id.startsWith('mock-');
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

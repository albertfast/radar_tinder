const IMPERIAL_COUNTRIES = ['US', 'LR', 'MM'];

export function getUnitSystem(countryCode?: string): 'metric' | 'imperial' {
  if (countryCode && IMPERIAL_COUNTRIES.includes(countryCode)) return 'imperial';
  const locale =
    Intl.DateTimeFormat?.().resolvedOptions?.().locale ||
    '';
  if (locale.includes('en-US')) return 'imperial';
  return 'metric';
}

export function getUnitLabel(unitSystem: 'metric' | 'imperial'): string {
  return unitSystem === 'imperial' ? 'mph' : 'km/h';
}

export function getDistanceUnit(unitSystem: 'metric' | 'imperial'): string {
  return unitSystem === 'imperial' ? 'mi' : 'km';
}

export function convertSpeed(ms: number, unitSystem: 'metric' | 'imperial'): number {
  const safeSpeed = Math.max(0, ms);
  return unitSystem === 'imperial' ? Math.round(safeSpeed * 2.23694) : Math.round(safeSpeed * 3.6);
}

export function convertDistance(meters: number, unitSystem: 'metric' | 'imperial'): number {
  return unitSystem === 'imperial' ? meters * 0.000621371 : meters / 1000;
}

export function formatDistance(meters: number, unitSystem: 'metric' | 'imperial'): string {
  if (unitSystem === 'imperial') {
    const feet = meters * 3.28084;
    // Apple/Google-style: show feet only when close; past ~1000 ft miles read
    // far more naturally (e.g. 4718 ft -> "0.9 mi" instead of "4718 ft").
    if (feet < 1000) return `${Math.round(feet)} ft`;
    return `${(meters * 0.000621371).toFixed(1)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

export function formatETA(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Speed warning colors — green → yellow → orange → red
export interface SpeedWarning {
  color: string;
  bgColor: string;
  percent: number;
  severity: 'safe' | 'caution' | 'warning' | 'danger';
}

export function getSpeedWarning(current: number, limit: number | null): SpeedWarning {
  if (!limit || current <= 0) {
    return { color: '#cbd5e1', bgColor: 'rgba(148,163,184,0.14)', percent: 0, severity: 'safe' };
  }
  const ratio = current / limit;
  const over = (ratio - 1) * 100;
  if (over <= 0) {
    return { color: '#4ECDC4', bgColor: 'rgba(78,205,196,0.14)', percent: 0, severity: 'safe' };
  }
  if (over <= 20) {
    const t = over / 20;
    return {
      color: lerpColor('#4ECDC4', '#f59e0b', t),
      bgColor: `rgba(245,158,11,${0.10 + t * 0.16})`,
      percent: over, severity: over < 5 ? 'caution' : 'warning',
    };
  }
  return { color: '#ef4444', bgColor: 'rgba(239,68,68,0.3)', percent: over, severity: 'danger' };
}

function lerpColor(a: string, b: string, t: number): string {
  const pa = parseColor(a);
  const pb = parseColor(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `rgb(${r},${g},${bl})`;
}

function parseColor(hex: string): { r: number; g: number; b: number } {
  const c = hex.replace('#', '');
  return {
    r: parseInt(c.substring(0, 2), 16),
    g: parseInt(c.substring(2, 4), 16),
    b: parseInt(c.substring(4, 6), 16),
  };
}

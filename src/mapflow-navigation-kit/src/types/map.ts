export interface LatLng {
  lat: number;
  lng: number;
}

export interface SearchResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  type?: string | null;
  distanceMeters?: number;
  provider?: string;
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: {
    type: string;
    modifier?: string;
    location: [number, number];
  };
  name?: string;
  ref?: string;
  bearingBefore?: number | null;
  bearingAfter?: number | null;
  exit?: number | null;
}

export interface RouteData {
  geometry: [number, number][];
  distance: number;
  duration: number;
  baseDuration?: number;
  durationSource?: 'provider' | 'adjusted';
  steps: RouteStep[];
  provider?: string;
}

export interface LocationData {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
}

export type UnitSystem = 'metric' | 'imperial';

export interface MapMessage {
  type: string;
  payload?: any;
}

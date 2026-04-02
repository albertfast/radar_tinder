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
  sourceKind?: SearchResultSourceKind;
  isSaved?: boolean;
}

export type SearchResultSourceKind = 'network' | 'recent' | 'saved';

export interface SearchResultsSection {
  key: SearchResultSourceKind;
  title: string;
  data: SearchResult[];
}

export interface StoredDestination {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  savedAt?: string;
  usedAt?: string;
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

export type MapOverlayMarkerType =
  | 'fixed'
  | 'mobile'
  | 'red_light'
  | 'speed_camera'
  | 'police'
  | 'traffic_enforcement';

export type MapOverlayMarkerKind =
  | 'camera'
  | 'red_light'
  | 'police'
  | 'mobile'
  | 'traffic_enforcement';

export interface MapOverlayMarker {
  id: string;
  latitude: number;
  longitude: number;
  type: MapOverlayMarkerType;
  markerKind?: MapOverlayMarkerKind;
  speedLimit?: number;
  onPress?: (marker: MapOverlayMarker) => void;
}

export interface MapMessage {
  type: string;
  payload?: any;
}

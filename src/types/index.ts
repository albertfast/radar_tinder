export type RadarSource = 'community' | 'external_osm' | 'external' | 'manual';
export type RadarMarkerKind =
  | 'camera'
  | 'red_light'
  | 'police'
  | 'mobile'
  | 'traffic_enforcement';
export type RadarEtaConfidence = 'low' | 'medium' | 'high' | 'unknown';
export type AccessBootstrapState = 'idle' | 'resolving' | 'ready' | 'error';

export interface EntitlementSnapshot {
  userId: string;
  subscriptionType: 'free' | 'premium' | 'pro';
  adsRemoved: boolean;
  subscriptionExpiresAt?: Date;
  accountLinkRequiredUntil?: Date;
  rcCustomerId?: string;
  syncedAt?: Date;
}

export interface User {
  id: string;
  email: string;
  username?: string;
  displayName?: string;
  name: string;
  subscriptionType: 'free' | 'premium' | 'pro';
  subscriptionExpiresAt?: Date;
  accountLinkRequiredUntil?: Date;
  rcCustomerId?: string;
  carDetails?: {
    brand: string;
    model: string;
    year: string;
    km: string;
  };
  profileImage?: string;
  avatarUrl?: string;
  carImage?: string;
  points: number;
  rank: 'Rookie' | 'Scout' | 'Ranger' | 'Commander' | 'Legend';
  xp: number;
  level: number;
  stats: {
    reports: number;
    confirmations: number;
    distanceDriven: number;
  };
  createdAt: Date;
  updatedAt: Date;
  adsRemoved?: boolean;
  isAdminSession?: boolean;
}

export interface RadarLocation {
  id: string;
  latitude: number;
  longitude: number;
  type: 'fixed' | 'mobile' | 'red_light' | 'speed_camera' | 'police' | 'traffic_enforcement';
  source?: RadarSource;
  sourceKey?: string;
  sourceLabel?: string;
  direction?: string;
  speedLimit?: number;
  markerKind?: RadarMarkerKind;
  etaConfidence?: RadarEtaConfidence;
  approachLabel?: string;
  confidence: number;
  lastConfirmed: Date;
  reportedBy: string;
  reports?: number;
  verified?: boolean;
  lastReported?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RadarAlert {
  id: string;
  radarId: string;
  userId: string;
  type?: RadarLocation['type'];
  distance: number;
  estimatedTime: number;
  severity: 'low' | 'medium' | 'high';
  locationLabel?: string;
  routeMatched?: boolean;
  corridorDistanceMeters?: number;
  etaSeconds?: number;
  etaConfidence?: RadarEtaConfidence;
  approachLabel?: string;
  markerKind?: RadarMarkerKind;
  routeMatchScore?: number;
  headingDeltaDeg?: number | null;
  acknowledged: boolean;
  createdAt: Date;
}

export interface AddressSuggestion {
  id: string;
  label: string;
  queryValue: string;
  latitude: number;
  longitude: number;
  source: 'recent' | 'nominatim' | 'google';
  qualityScore: number;
  matchKind?: 'local_prefix' | 'google' | 'nominatim';
  distanceKmFromUser?: number;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  type: 'free' | 'premium' | 'pro';
  price: number;
  currency: string;
  duration: number; // in days
  features: string[];
  isActive: boolean;
}

export interface AppSettings {
  notifications: {
    enabled: boolean;
    sound: boolean;
    vibration: boolean;
    distanceThreshold: number;
  };
  map: {
    showTraffic: boolean;
    showSatellite: boolean;
    autoCenter: boolean;
  };
  radar: {
    autoDetect: boolean;
    reportAccuracy: boolean;
    shareAnonymous: boolean;
  };
}

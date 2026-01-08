export interface User {
  id: string;
  email: string;
  username?: string;
  displayName?: string;
  name: string;
  subscriptionType: 'free' | 'premium' | 'pro';
  subscriptionExpiresAt?: Date;
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
}

export interface RadarLocation {
  id: string;
  latitude: number;
  longitude: number;
  type: 'fixed' | 'mobile' | 'red_light' | 'speed_camera' | 'police' | 'traffic_enforcement';
  direction?: string;
  speedLimit?: number;
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
  acknowledged: boolean;
  createdAt: Date;
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

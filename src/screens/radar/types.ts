export type TabType = 'Basic' | 'Map' | 'Graphic';

export type NavStep = {
  instruction: string;
  distanceMeters: number | null;
  maneuver?: string;
  endLocation?: { latitude: number; longitude: number };
};

export type RouteMeta = {
  etaText: string;
  distanceText: string;
  destinationLabel: string;
};

export type ProFeature = {
  title: string;
  subtitle: string;
  icon: string;
  color: string;
};

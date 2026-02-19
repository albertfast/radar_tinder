import { ProFeature } from './types';

export const PRO_FEATURES: ProFeature[] = [
  { title: 'Unlock All Radars', subtitle: 'See Police & Mobile traps', icon: 'shield-star', color: '#FFD700' },
  { title: 'AI Diagnostics', subtitle: 'Unlimited dashboard scans', icon: 'car-cog', color: '#4ECDC4' },
  { title: 'No Ads', subtitle: 'Distraction free driving', icon: 'block-helper', color: '#FF5252' },
];

export const RECENT_DESTINATIONS_KEY = 'recent_destinations_v1';

export const KEYBOARD_TRACE_ENABLED = /^(1|true|yes)$/i.test(
  process.env.EXPO_PUBLIC_KEYBOARD_TRACE || ''
);

export const MAP_TRACE_ENABLED = /^(1|true|yes)$/i.test(
  process.env.EXPO_PUBLIC_MAP_TRACE || ''
);

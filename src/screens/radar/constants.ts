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

const parseFeatureFlag = (value: string | undefined, defaultValue: boolean = true) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return /^(1|true|yes)$/i.test(value);
};

export const AUTOCOMPLETE_V2_ENABLED = parseFeatureFlag(
  process.env.EXPO_PUBLIC_AUTOCOMPLETE_V2,
  true
);
export const VOICE_GATE_V2_ENABLED = parseFeatureFlag(
  process.env.EXPO_PUBLIC_VOICE_GATE_V2,
  true
);
export const ROUTE_RELEVANCE_V2_ENABLED = parseFeatureFlag(
  process.env.EXPO_PUBLIC_ROUTE_RELEVANCE_V2,
  true
);
export const SPEED_LIMIT_V2_ENABLED = parseFeatureFlag(
  process.env.EXPO_PUBLIC_SPEED_LIMIT_V2,
  true
);
export const ROUTE_STYLE_V2_ENABLED = parseFeatureFlag(
  process.env.EXPO_PUBLIC_ROUTE_STYLE_V2,
  true
);

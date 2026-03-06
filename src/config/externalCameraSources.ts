export type ExternalCameraSourceRule = {
  key: string;
  label: string;
  provider: 'osm' | 'lufop' | 'government_open_data' | 'community';
  region: string;
  countryCodes: string[];
  status: 'active' | 'draft' | 'planned';
  ingestMode: 'api' | 'feed' | 'scrape' | 'manual';
  endpointUrl?: string;
  updateCadence?: string;
  cameraTypes: string[];
  notes: string;
  matchingHints: string[];
};

// Global ingestion scaffold aligned to Trafik_Kameralari_Kilavuzu.pdf.
// Keep source-specific auth, parsers, and legal filters outside this file.
export const EXTERNAL_CAMERA_SOURCE_RULES: ExternalCameraSourceRule[] = [
  {
    key: 'osm',
    label: 'OpenStreetMap Cameras',
    provider: 'osm',
    region: 'Global',
    countryCodes: ['*'],
    status: 'active',
    ingestMode: 'feed',
    endpointUrl: 'https://overpass-api.de/api/interpreter',
    updateCadence: 'community-updated',
    cameraTypes: ['speed_fixed', 'red_light', 'traffic_light'],
    notes: 'Global baseline feed for fixed enforcement points and openly mapped camera nodes.',
    matchingHints: ['highway=speed_camera', 'enforcement=maxspeed', 'camera:type=speed'],
  },
  {
    key: 'lufop',
    label: 'Lufop Europe API',
    provider: 'lufop',
    region: 'Europe',
    countryCodes: [
      'FR', 'GB', 'BE', 'NL', 'DE', 'ES', 'IT', 'PT',
      'CH', 'AT', 'PL', 'CZ', 'SE', 'NO', 'DK', 'FI',
    ],
    status: 'draft',
    ingestMode: 'api',
    endpointUrl: 'https://lufop.net/en/lufop-api',
    updateCadence: 'monthly-validated',
    cameraTypes: ['speed_fixed', 'speed_mobile', 'red_light', 'speed_average', 'construction'],
    notes: 'Primary Europe-specific enrichment source described in the traffic camera guide.',
    matchingHints: ['fixed', 'mobile', 'redlight', 'average', 'construction'],
  },
  {
    key: 'gov_us_data',
    label: 'US Government Open Data',
    provider: 'government_open_data',
    region: 'United States',
    countryCodes: ['US'],
    status: 'draft',
    ingestMode: 'scrape',
    endpointUrl: 'https://catalog.data.gov/dataset',
    updateCadence: 'source-dependent',
    cameraTypes: ['speed_fixed', 'red_light', 'traffic_light'],
    notes: 'Use as a discovery layer for federal, state, county, and city traffic camera datasets.',
    matchingHints: ['data-gov', 'traffic camera', 'speed camera', 'open data'],
  },
  {
    key: 'gov_au_act',
    label: 'ACT Open Data',
    provider: 'government_open_data',
    region: 'Australia',
    countryCodes: ['AU'],
    status: 'draft',
    ingestMode: 'api',
    endpointUrl: 'https://www.data.act.gov.au/',
    updateCadence: 'source-dependent',
    cameraTypes: ['speed_fixed', 'speed_mobile', 'red_light'],
    notes: 'Australian camera/open road safety datasets start here; extend by state feed adapters.',
    matchingHints: ['data.act.gov.au', 'speed camera', 'road safety'],
  },
  {
    key: 'gov_ca_open',
    label: 'Canada Open Government',
    provider: 'government_open_data',
    region: 'Canada',
    countryCodes: ['CA'],
    status: 'planned',
    ingestMode: 'scrape',
    endpointUrl: 'https://open.canada.ca/data/en/dataset',
    updateCadence: 'source-dependent',
    cameraTypes: ['speed_fixed', 'traffic_light'],
    notes: 'National discovery layer; likely requires province/city adapter completion.',
    matchingHints: ['open.canada.ca', 'traffic camera', 'open government'],
  },
  {
    key: 'gov_uk_data',
    label: 'UK Government Open Data',
    provider: 'government_open_data',
    region: 'United Kingdom',
    countryCodes: ['GB'],
    status: 'planned',
    ingestMode: 'scrape',
    endpointUrl: 'https://data.gov.uk/',
    updateCadence: 'source-dependent',
    cameraTypes: ['speed_fixed', 'red_light', 'speed_average'],
    notes: 'Use as the UK official dataset discovery layer; local authority feeds must be normalized.',
    matchingHints: ['data.gov.uk', 'speed camera', 'average speed', 'road safety'],
  },
];

const RULES_BY_KEY = new Map(
  EXTERNAL_CAMERA_SOURCE_RULES.map((rule) => [rule.key.toLowerCase(), rule])
);

export const getExternalCameraSourceRule = (sourceKey?: string | null) => {
  if (!sourceKey) return undefined;
  return RULES_BY_KEY.get(String(sourceKey).trim().toLowerCase());
};

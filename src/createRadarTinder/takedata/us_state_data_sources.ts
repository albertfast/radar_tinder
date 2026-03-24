/**
 * Verified US government camera source manifest.
 *
 * This file is the hand-curated replacement for the earlier "portal list".
 * Each entry explicitly states whether the dataset is suitable for driver
 * alerts, map-only display, or manual review before ingestion.
 */

export type GovSourceStatus = 'verified' | 'candidate' | 'broken';
export type GovDatasetKind =
  | 'speed_enforcement'
  | 'red_light_enforcement'
  | 'traffic_cctv'
  | 'traffic_sensor'
  | 'violations';
export type GovEndpointKind =
  | 'local_geojson'
  | 'arcgis'
  | 'socrata'
  | 'json_api'
  | 'html'
  | 'scrape'
  | 'saved_snapshot';
export type GovImportStrategy = 'external_radars' | 'map_only' | 'manual_review' | 'ignore';
export type GovAlertPolicy = 'driver_alert' | 'map_only' | 'ignore';
export type GovNormalizerKey =
  | 'dc_speed_detector_geojson'
  | 'dc_cctv_geojson'
  | 'legacy_saveddata_json'
  | 'complete_us_snapshot_json'
  | 'sf_speed_socrata_json'
  | 'sf_red_light_socrata_json'
  | 'chicago_speed_socrata_json'
  | 'chicago_red_light_socrata_json'
  | 'la_speed_safety_attachment_pdf'
  | 'manual_review'
  | 'none';

export interface VerifiedGovSourceManifestEntry {
  key: string;
  label: string;
  stateCode: string;
  stateName: string;
  city?: string;
  provider: 'government_open_data';
  datasetKind: GovDatasetKind;
  endpointKind: GovEndpointKind;
  importStrategy: GovImportStrategy;
  alertPolicy: GovAlertPolicy;
  status: GovSourceStatus;
  normalizerKey: GovNormalizerKey;
  portalUrl: string;
  landingPageUrl: string;
  apiUrl?: string;
  localSamplePath?: string;
  savedDataSourceNames?: string[];
  savedDataCameraTypes?: string[];
  defaultConfidence?: number;
  includeInDefaultRun?: boolean;
  updateFrequency?: string;
  lastValidatedAt?: string;
  notes: string;
}

export const VERIFIED_US_GOV_SOURCE_MANIFEST: VerifiedGovSourceManifestEntry[] = [
  {
    key: 'gov_dc_speed_detector',
    label: 'DC Speed Detector Locations',
    stateCode: 'DC',
    stateName: 'District of Columbia',
    city: 'Washington',
    provider: 'government_open_data',
    datasetKind: 'speed_enforcement',
    endpointKind: 'saved_snapshot',
    importStrategy: 'external_radars',
    alertPolicy: 'driver_alert',
    status: 'verified',
    normalizerKey: 'dc_speed_detector_geojson',
    portalUrl: 'https://opendata.dc.gov/',
    landingPageUrl: 'https://opendata.dc.gov/datasets/speed-detector-locations',
    apiUrl:
      'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_WebMercator/MapServer/53/query?where=1%3D1&outFields=*&f=json',
    localSamplePath: 'src/createRadarTinder/Speed_Detector.geojson',
    updateFrequency: 'source-dependent',
    lastValidatedAt: '2026-03-06',
    notes:
      'Local sample exists in repo and contains point features with ROADNAME/ROADDIR fields. Suitable for external_radars ingestion.',
  },
  {
    key: 'gov_dc_cctv',
    label: 'DC Traffic Cameras (CCTV)',
    stateCode: 'DC',
    stateName: 'District of Columbia',
    city: 'Washington',
    provider: 'government_open_data',
    datasetKind: 'traffic_cctv',
    endpointKind: 'local_geojson',
    importStrategy: 'map_only',
    alertPolicy: 'map_only',
    status: 'verified',
    normalizerKey: 'dc_cctv_geojson',
    portalUrl: 'https://opendata.dc.gov/',
    landingPageUrl: 'https://opendata.dc.gov/datasets/traffic-camera',
    localSamplePath: 'src/createRadarTinder/Traffic_Camera.geojson',
    updateFrequency: 'source-dependent',
    lastValidatedAt: '2026-03-06',
    notes:
      'Local sample exists in repo and all observed CAMERATYPE values are CCTV. Keep out of driver alerts.',
  },
  {
    key: 'gov_ca_san_francisco_speed',
    label: 'San Francisco Speed Cameras',
    stateCode: 'CA',
    stateName: 'California',
    city: 'San Francisco',
    provider: 'government_open_data',
    datasetKind: 'speed_enforcement',
    endpointKind: 'socrata',
    importStrategy: 'external_radars',
    alertPolicy: 'driver_alert',
    status: 'verified',
    normalizerKey: 'sf_speed_socrata_json',
    portalUrl: 'https://data.sfgov.org/',
    landingPageUrl: 'https://data.sfgov.org/Transportation/Automated-Speed-Enforcement-System-ASE-Monthly-/2zdj-bwza',
    localSamplePath: 'src/createRadarTinder/takedata/saveddata/ccsfspeedcamera.json',
    defaultConfidence: 0.96,
    updateFrequency: 'snapshot',
    lastValidatedAt: '2026-03-06',
    notes:
      'Direct Socrata export for San Francisco automated speed enforcement. Parse by site_id instead of collapsing to raw lat/lng.',
  },
  {
    key: 'gov_ca_san_francisco_red_light',
    label: 'San Francisco Red Light Cameras',
    stateCode: 'CA',
    stateName: 'California',
    city: 'San Francisco',
    provider: 'government_open_data',
    datasetKind: 'red_light_enforcement',
    endpointKind: 'socrata',
    importStrategy: 'external_radars',
    alertPolicy: 'driver_alert',
    status: 'verified',
    normalizerKey: 'sf_red_light_socrata_json',
    portalUrl: 'https://data.sfgov.org/',
    landingPageUrl: 'https://data.sfgov.org/Transportation/Red-Light-Camera-Citations/uzmr-g2uc',
    localSamplePath: 'src/createRadarTinder/takedata/saveddata/sfredlight.json',
    defaultConfidence: 0.95,
    updateFrequency: 'monthly',
    lastValidatedAt: '2026-03-06',
    notes:
      'Direct Socrata export for San Francisco red-light enforcement. Group by intersection + movement so each enforced approach becomes a stable camera point.',
  },
  {
    key: 'gov_ca_san_francisco_traffic',
    label: 'San Francisco Traffic Cameras',
    stateCode: 'CA',
    stateName: 'California',
    city: 'San Francisco',
    provider: 'government_open_data',
    datasetKind: 'traffic_cctv',
    endpointKind: 'socrata',
    importStrategy: 'map_only',
    alertPolicy: 'map_only',
    status: 'candidate',
    normalizerKey: 'complete_us_snapshot_json',
    portalUrl: 'https://data.sfgov.org/',
    landingPageUrl: 'https://data.sfgov.org/',
    defaultConfidence: 0.72,
    updateFrequency: 'snapshot',
    lastValidatedAt: '2026-03-06',
    notes:
      'Aggregate snapshot shows San Francisco traffic camera points, but they are traffic cameras rather than speed enforcement. Keep map-only.',
  },
  {
    key: 'gov_ca_los_angeles_speed_safety_planned',
    label: 'Los Angeles Speed Safety System Locations (Proposed)',
    stateCode: 'CA',
    stateName: 'California',
    city: 'Los Angeles',
    provider: 'government_open_data',
    datasetKind: 'speed_enforcement',
    endpointKind: 'arcgis',
    importStrategy: 'external_radars',
    alertPolicy: 'ignore',
    status: 'verified',
    normalizerKey: 'la_speed_safety_attachment_pdf',
    portalUrl: 'https://ladot.lacity.gov/speed-safety-system',
    landingPageUrl: 'https://ladot.lacity.gov/sites/default/files/2026-02/speed-safety-program-attachment-a-impact-report.pdf',
    apiUrl:
      'https://services.arcgis.com/G3nmNsarwQblLhip/arcgis/rest/services/EligibleSegments_removehwys/FeatureServer/0/query',
    includeInDefaultRun: false,
    defaultConfidence: 0.88,
    updateFrequency: 'program rollout dependent',
    lastValidatedAt: '2026-03-06',
    notes:
      'Official LADOT Attachment A lists 125 proposed speed safety system segments. As of March 6, 2026 the program is still in public-review / rollout and should not trigger live driver alerts yet.',
  },
  {
    key: 'gov_md_speed_cameras',
    label: 'Maryland Speed Camera Locations',
    stateCode: 'MD',
    stateName: 'Maryland',
    provider: 'government_open_data',
    datasetKind: 'speed_enforcement',
    endpointKind: 'arcgis',
    importStrategy: 'external_radars',
    alertPolicy: 'driver_alert',
    status: 'candidate',
    normalizerKey: 'manual_review',
    portalUrl: 'https://data.imap.maryland.gov/',
    landingPageUrl: 'https://data.imap.maryland.gov/datasets/speed-cameras',
    apiUrl:
      'https://services.arcgis.com/njFNhDsUCentVYJW/ArcGIS/rest/services/SpeedCameras/FeatureServer/0/query?where=1%3D1&outFields=*&f=json',
    updateFrequency: 'source-dependent',
    lastValidatedAt: '2026-03-06',
    notes:
      'ArcGIS endpoint is plausible but downloader check on March 6, 2026 returned 0 features. Re-validate before ingest.',
  },
  {
    key: 'gov_md_montgomery_speed',
    label: 'Montgomery County Speed Cameras',
    stateCode: 'MD',
    stateName: 'Maryland',
    city: 'Montgomery County',
    provider: 'government_open_data',
    datasetKind: 'speed_enforcement',
    endpointKind: 'socrata',
    importStrategy: 'external_radars',
    alertPolicy: 'driver_alert',
    status: 'candidate',
    normalizerKey: 'legacy_saveddata_json',
    portalUrl: 'https://data.montgomerycountymd.gov/',
    landingPageUrl: 'https://data.montgomerycountymd.gov/',
    localSamplePath: 'src/createRadarTinder/takedata/saveddata/MD_cameras.json',
    savedDataSourceNames: ['Montgomery County Speed Cameras'],
    savedDataCameraTypes: ['speed_fixed'],
    defaultConfidence: 0.84,
    updateFrequency: 'snapshot',
    lastValidatedAt: '2026-03-06',
    notes:
      'Saved snapshot dedupes cleanly into Montgomery County fixed speed-camera points. Good candidate for external_radars.',
  },
  {
    key: 'gov_il_chicago_speed',
    label: 'Chicago Speed Camera Violations',
    stateCode: 'IL',
    stateName: 'Illinois',
    city: 'Chicago',
    provider: 'government_open_data',
    datasetKind: 'violations',
    endpointKind: 'socrata',
    importStrategy: 'external_radars',
    alertPolicy: 'driver_alert',
    status: 'verified',
    normalizerKey: 'chicago_speed_socrata_json',
    portalUrl: 'https://data.cityofchicago.org/',
    landingPageUrl: 'https://data.cityofchicago.org/Transportation/Speed-Camera-Violations/hhkd-xvj4',
    apiUrl:
      'https://data.cityofchicago.org/resource/hhkd-xvj4.json?$limit=50000',
    localSamplePath: 'src/createRadarTinder/takedata/saveddata/cityofchicago2.json',
    includeInDefaultRun: false,
    defaultConfidence: 0.93,
    updateFrequency: 'daily',
    lastValidatedAt: '2026-03-06',
    notes:
      'Official City of Chicago Socrata export. Deduplicate by camera_id and keep the latest usable geocoded point per camera.',
  },
  {
    key: 'gov_il_chicago_red_light',
    label: 'Chicago Red Light Camera Violations',
    stateCode: 'IL',
    stateName: 'Illinois',
    city: 'Chicago',
    provider: 'government_open_data',
    datasetKind: 'violations',
    endpointKind: 'socrata',
    importStrategy: 'external_radars',
    alertPolicy: 'driver_alert',
    status: 'verified',
    normalizerKey: 'chicago_red_light_socrata_json',
    portalUrl: 'https://data.cityofchicago.org/',
    landingPageUrl: 'https://data.cityofchicago.org/Transportation/Red-Light-Camera-Violations/spqx-js37',
    localSamplePath: 'src/createRadarTinder/takedata/saveddata/cityofchicago.json',
    includeInDefaultRun: false,
    defaultConfidence: 0.92,
    updateFrequency: 'daily',
    lastValidatedAt: '2026-03-06',
    notes:
      'Official Socrata export. Deduplicate by camera_id and keep the latest usable geocoded point per camera.',
  },
  {
    key: 'gov_wa_wsdot_cctv',
    label: 'WSDOT Traffic Cameras',
    stateCode: 'WA',
    stateName: 'Washington',
    provider: 'government_open_data',
    datasetKind: 'traffic_cctv',
    endpointKind: 'json_api',
    importStrategy: 'map_only',
    alertPolicy: 'map_only',
    status: 'candidate',
    normalizerKey: 'manual_review',
    portalUrl: 'https://data.wa.gov/',
    landingPageUrl: 'https://www.wsdot.wa.gov/Traffic/Api',
    apiUrl: 'https://www.wsdot.wa.gov/Traffic/api/Cameras/Cameras.json',
    updateFrequency: 'real-time',
    lastValidatedAt: '2026-03-06',
    notes:
      'Real-time traffic camera feed is likely CCTV/traffic ops imagery, not enforcement. Keep out of driver alerts.',
  },
  {
    key: 'gov_us_complete_snapshot_20260306',
    label: 'US Complete Snapshot (2026-03-06)',
    stateCode: 'US',
    stateName: 'United States',
    provider: 'government_open_data',
    datasetKind: 'speed_enforcement',
    endpointKind: 'local_geojson',
    importStrategy: 'manual_review',
    alertPolicy: 'ignore',
    status: 'candidate',
    normalizerKey: 'complete_us_snapshot_json',
    portalUrl: 'local_snapshot',
    landingPageUrl: 'local_snapshot',
    localSamplePath: 'src/createRadarTinder/takedata/saveddata/cameras_complete_us.json',
    includeInDefaultRun: false,
    updateFrequency: 'snapshot',
    lastValidatedAt: '2026-03-06',
    notes:
      'Mixed OSM + gov_api export. Use only as a secondary staging artifact because OSM rows would duplicate the live OSM ingest.',
  },
];

export const VERIFIED_US_GOV_SOURCE_MANIFEST_BY_KEY = new Map(
  VERIFIED_US_GOV_SOURCE_MANIFEST.map((entry) => [entry.key.toLowerCase(), entry])
);

export const getVerifiedUsGovSource = (sourceKey?: string | null) => {
  if (!sourceKey) return undefined;
  return VERIFIED_US_GOV_SOURCE_MANIFEST_BY_KEY.get(String(sourceKey).trim().toLowerCase());
};

export const getVerifiedUsGovSourcesForState = (stateCode: string) => {
  const normalized = String(stateCode || '').trim().toUpperCase();
  return VERIFIED_US_GOV_SOURCE_MANIFEST.filter((entry) => entry.stateCode === normalized);
};

export const getAutoIngestUsGovSources = () =>
  VERIFIED_US_GOV_SOURCE_MANIFEST.filter((entry) => entry.importStrategy === 'external_radars');

export const getLocalSampleUsGovSources = () =>
  VERIFIED_US_GOV_SOURCE_MANIFEST.filter(
    (entry) => Boolean(entry.localSamplePath) && entry.includeInDefaultRun !== false
  );

export const US_STATE_DATA_SOURCES = VERIFIED_US_GOV_SOURCE_MANIFEST.reduce<
  Record<
    string,
    {
      name: string;
      portal: string;
      sources: Array<{
        key: string;
        label: string;
        datasetKind: GovDatasetKind;
        endpointKind: GovEndpointKind;
        importStrategy: GovImportStrategy;
        alertPolicy: GovAlertPolicy;
        status: GovSourceStatus;
        landingPageUrl: string;
        apiUrl?: string;
        localSamplePath?: string;
        lastValidatedAt?: string;
      }>;
    }
  >
>((acc, entry) => {
  const existing = acc[entry.stateCode] || {
    name: entry.stateName,
    portal: entry.portalUrl,
    sources: [],
  };
  existing.sources.push({
    key: entry.key,
    label: entry.label,
    datasetKind: entry.datasetKind,
    endpointKind: entry.endpointKind,
    importStrategy: entry.importStrategy,
    alertPolicy: entry.alertPolicy,
    status: entry.status,
    landingPageUrl: entry.landingPageUrl,
    apiUrl: entry.apiUrl,
    localSamplePath: entry.localSamplePath,
    lastValidatedAt: entry.lastValidatedAt,
  });
  acc[entry.stateCode] = existing;
  return acc;
}, {});

export const NATIONAL_DISCOVERY_SOURCES = [
  {
    key: 'osm',
    label: 'OpenStreetMap baseline',
    coverage: 'Global',
    status: 'active',
    notes: 'Primary baseline ingest is already handled by the Supabase OSM edge function.',
    url: 'https://overpass-api.de/api/interpreter',
  },
  {
    key: 'data_gov',
    label: 'Data.gov discovery',
    coverage: 'United States',
    status: 'manual-review',
    notes: 'Use as a discovery layer only. Individual datasets still need verification and normalizers.',
    url: 'https://catalog.data.gov/dataset',
  },
];

/**
 * Normalize verified government GeoJSON datasets into `external_radars`-ready rows.
 *
 * Default behavior:
 * - reads every manifest entry that has a local sample file
 * - writes JSON + SQL outputs under `src/createRadarTinder/takedata/output`
 * - excludes map-only datasets from the SQL export unless `--include-map-only` is passed
 *
 * Usage:
 *   bun run src/createRadarTinder/takedata/process_geojson.ts
 *   bun run src/createRadarTinder/takedata/process_geojson.ts --source gov_dc_speed_detector
 *   bun run src/createRadarTinder/takedata/process_geojson.ts --include-map-only
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  getLocalSampleUsGovSources,
  getVerifiedUsGovSource,
  type GovAlertPolicy,
  type VerifiedGovSourceManifestEntry,
} from './us_state_data_sources';

type AppRadarType = 'speed_camera' | 'red_light' | 'traffic_enforcement';

interface GeoJSONGeometry {
  type?: string;
  coordinates?: unknown;
}

interface GeoJSONFeature {
  type?: string;
  properties?: Record<string, unknown>;
  geometry?: GeoJSONGeometry | null;
}

interface GeoJSONFile {
  type?: string;
  name?: string;
  features?: GeoJSONFeature[];
}

interface NormalizedGovernmentRadar {
  source: string;
  source_id: string;
  type: AppRadarType;
  latitude: number;
  longitude: number;
  confidence: number;
  verified: boolean;
  alertEligible: boolean;
  alertPolicy: GovAlertPolicy;
  metadata: Record<string, unknown>;
}

interface CliOptions {
  sourceKeys: string[];
  includeMapOnly: boolean;
  outputDir: string;
}

const SCRIPT_DIR = path.resolve(path.dirname(process.argv[1] || '.'));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const DEFAULT_OUTPUT_DIR = path.join(SCRIPT_DIR, 'output');

const parseArgs = (): CliOptions => {
  const options: CliOptions = {
    sourceKeys: [],
    includeMapOnly: false,
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--source') {
      const value = args[index + 1] || '';
      index += 1;
      options.sourceKeys.push(
        ...value
          .split(',')
          .map((item: string) => item.trim())
          .filter(Boolean)
      );
      continue;
    }

    if (arg === '--include-map-only') {
      options.includeMapOnly = true;
      continue;
    }

    if (arg === '--output-dir') {
      const value = args[index + 1] || '';
      index += 1;
      options.outputDir = path.resolve(process.cwd(), value);
      continue;
    }
  }

  return options;
};

const resolveInputPath = (entry: VerifiedGovSourceManifestEntry) => {
  if (!entry.localSamplePath) {
    throw new Error(`No local sample path configured for ${entry.key}`);
  }
  return path.resolve(REPO_ROOT, entry.localSamplePath);
};

const ensureOutputDir = (outputDir: string) => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
};

const readGeoJsonFile = (filePath: string): GeoJSONFile => {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as GeoJSONFile;
  if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    throw new Error(`Invalid GeoJSON FeatureCollection: ${filePath}`);
  }
  return parsed;
};

const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asString = (value: unknown) => {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
};

const toPoint = (feature: GeoJSONFeature) => {
  const geometry = feature.geometry;
  if (geometry?.type === 'Point' && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2) {
    const longitude = asNumber(geometry.coordinates[0]);
    const latitude = asNumber(geometry.coordinates[1]);
    if (latitude != null && longitude != null) {
      return { latitude, longitude };
    }
  }

  const props = feature.properties || {};
  const latitude = asNumber(props.LATITUDE ?? props.latitude ?? props.lat);
  const longitude = asNumber(props.LONGITUDE ?? props.longitude ?? props.lng ?? props.lon);
  if (latitude != null && longitude != null) {
    return { latitude, longitude };
  }

  return null;
};

const normalizeRoadName = (value: unknown) => {
  const raw = asString(value);
  return raw ? raw.replace(/-/g, ' ').replace(/\s+/g, ' ').trim() : null;
};

const normalizeDirection = (value: unknown) => {
  const raw = asString(value)?.toUpperCase() || null;
  if (!raw) return null;
  if (['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'].includes(raw)) {
    return raw;
  }
  return raw;
};

const directionToDegrees = (direction: string | null) => {
  if (!direction) return null;
  const mapping: Record<string, number> = {
    N: 0,
    NE: 45,
    E: 90,
    SE: 135,
    S: 180,
    SW: 225,
    W: 270,
    NW: 315,
  };
  return Number.isFinite(mapping[direction]) ? mapping[direction] : null;
};

const parsePositiveSpeedLimit = (value: unknown) => {
  const parsed = asNumber(value);
  if (parsed == null || parsed <= 0) return null;
  return Math.round(parsed);
};

const buildMetadata = (
  entry: VerifiedGovSourceManifestEntry,
  props: Record<string, unknown>,
  extra: Record<string, unknown>
) => ({
  source_key: entry.key,
  country_code: 'US',
  state_code: entry.stateCode,
  state_name: entry.stateName,
  city: entry.city || null,
  jurisdiction: entry.city ? `${entry.city}, ${entry.stateCode}` : entry.stateCode,
  dataset_kind: entry.datasetKind,
  endpoint_kind: entry.endpointKind,
  import_strategy: entry.importStrategy,
  alert_policy: entry.alertPolicy,
  landing_page_url: entry.landingPageUrl,
  api_url: entry.apiUrl || null,
  local_sample_path: entry.localSamplePath || null,
  ...extra,
  raw_properties: props,
});

const getIdentifier = (props: Record<string, unknown>, fields: string[]) => {
  for (const field of fields) {
    const value = asString(props[field]);
    if (value) return value;
    const numeric = asNumber(props[field]);
    if (numeric != null) return String(numeric);
  }
  return null;
};

const normalizeDCSpeedDetector = (
  feature: GeoJSONFeature,
  entry: VerifiedGovSourceManifestEntry
): NormalizedGovernmentRadar | null => {
  const point = toPoint(feature);
  if (!point) return null;

  const props = feature.properties || {};
  const sourceId = getIdentifier(props, ['GIS_ID', 'ID', 'OBJECTID', 'GLOBALID']);
  if (!sourceId) return null;

  const roadName = normalizeRoadName(props.ROADNAME);
  const direction = normalizeDirection(props.ROADDIR);
  const speedLimit = parsePositiveSpeedLimit(props.SPEED);

  return {
    source: entry.key,
    source_id: `dc-speed-detector:${sourceId}`,
    type: 'speed_camera',
    latitude: point.latitude,
    longitude: point.longitude,
    confidence: 0.98,
    verified: true,
    alertEligible: true,
    alertPolicy: entry.alertPolicy,
    metadata: buildMetadata(entry, props, {
      road_name: roadName,
      direction,
      direction_deg: directionToDegrees(direction),
      speed_limit: speedLimit,
      device_kind: 'speed_detector',
    }),
  };
};

const normalizeDCCctv = (
  feature: GeoJSONFeature,
  entry: VerifiedGovSourceManifestEntry
): NormalizedGovernmentRadar | null => {
  const point = toPoint(feature);
  if (!point) return null;

  const props = feature.properties || {};
  const sourceId = getIdentifier(props, ['GIS_ID', 'CAMERAID', 'OBJECTID', 'GLOBALID']);
  if (!sourceId) return null;

  const cameraType = asString(props.CAMERATYPE)?.toUpperCase() || 'CCTV';

  return {
    source: entry.key,
    source_id: `dc-cctv:${sourceId}`,
    type: 'traffic_enforcement',
    latitude: point.latitude,
    longitude: point.longitude,
    confidence: 0.7,
    verified: true,
    alertEligible: false,
    alertPolicy: entry.alertPolicy,
    metadata: buildMetadata(entry, props, {
      device_kind: cameraType,
      map_only_reason: 'CCTV feed is not an enforcement source.',
      alert_eligible: false,
    }),
  };
};

const normalizeFeature = (
  feature: GeoJSONFeature,
  entry: VerifiedGovSourceManifestEntry
): NormalizedGovernmentRadar | null => {
  switch (entry.normalizerKey) {
    case 'dc_speed_detector_geojson':
      return normalizeDCSpeedDetector(feature, entry);
    case 'dc_cctv_geojson':
      return normalizeDCCctv(feature, entry);
    default:
      throw new Error(`No GeoJSON normalizer implemented for ${entry.key}`);
  }
};

const quoteSql = (value: string) => `'${value.replace(/'/g, "''")}'`;

const toJsonbSql = (value: Record<string, unknown>) =>
  `${quoteSql(JSON.stringify(value).replace(/\u0000/g, ''))}::jsonb`;

const writeNormalizedJson = (rows: NormalizedGovernmentRadar[], outputPath: string) => {
  fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2));
};

const writeExternalRadarsSql = (rows: NormalizedGovernmentRadar[], outputPath: string) => {
  const generatedAt = new Date().toISOString();
  if (rows.length === 0) {
    fs.writeFileSync(
      outputPath,
      `-- No driver-alert rows generated at ${generatedAt}\n`
    );
    return;
  }

  const values = rows
    .map((row) => {
      const metadata = {
        ...row.metadata,
        alert_eligible: row.alertEligible,
      };

      return `(
  ${quoteSql(row.source)},
  ${quoteSql(row.source_id)},
  ${quoteSql(row.type)},
  ST_SetSRID(ST_MakePoint(${row.longitude}, ${row.latitude}), 4326)::geography,
  ${row.confidence},
  ${row.verified ? 'true' : 'false'},
  now(),
  now(),
  ${toJsonbSql(metadata)}
)`;
    })
    .join(',\n');

  const sql = `-- external_radars upsert generated at ${generatedAt}
INSERT INTO public.external_radars (
  source,
  source_id,
  type,
  location,
  confidence,
  verified,
  last_seen_at,
  updated_at,
  metadata
) VALUES
${values}
ON CONFLICT (source, source_id) DO UPDATE SET
  type = EXCLUDED.type,
  location = EXCLUDED.location,
  confidence = EXCLUDED.confidence,
  verified = EXCLUDED.verified,
  last_seen_at = EXCLUDED.last_seen_at,
  updated_at = EXCLUDED.updated_at,
  metadata = COALESCE(public.external_radars.metadata, '{}'::jsonb) || EXCLUDED.metadata;
`;

  fs.writeFileSync(outputPath, sql);
};

const processEntry = (entry: VerifiedGovSourceManifestEntry) => {
  const inputPath = resolveInputPath(entry);
  const geoJson = readGeoJsonFile(inputPath);
  const rows = (geoJson.features || [])
    .map((feature) => normalizeFeature(feature, entry))
    .filter((row): row is NormalizedGovernmentRadar => Boolean(row));

  return {
    entry,
    inputPath,
    rows,
  };
};

const main = () => {
  const options = parseArgs();
  const entries = options.sourceKeys.length
    ? options.sourceKeys
        .map((sourceKey) => {
          const entry = getVerifiedUsGovSource(sourceKey);
          if (!entry) {
            throw new Error(`Unknown source key: ${sourceKey}`);
          }
          if (!entry.localSamplePath) {
            throw new Error(`Source ${sourceKey} does not have a local sample file yet.`);
          }
          return entry;
        })
    : getLocalSampleUsGovSources();

  if (entries.length === 0) {
    throw new Error('No local government datasets selected for processing.');
  }

  ensureOutputDir(options.outputDir);

  const processed = entries.map(processEntry);
  const normalizedRows = processed.flatMap((item) => item.rows);
  const sqlRows = normalizedRows.filter((row) =>
    options.includeMapOnly ? true : row.alertEligible
  );
  const mapOnlyRows = normalizedRows.filter((row) => !row.alertEligible);

  const normalizedJsonPath = path.join(options.outputDir, 'government_cameras_normalized.json');
  const sqlJsonPath = path.join(options.outputDir, 'government_cameras_external_radars.json');
  const sqlPath = path.join(options.outputDir, 'government_cameras_external_radars.sql');
  const mapOnlyJsonPath = path.join(options.outputDir, 'government_cameras_map_only.json');

  writeNormalizedJson(normalizedRows, normalizedJsonPath);
  writeNormalizedJson(sqlRows, sqlJsonPath);
  writeNormalizedJson(mapOnlyRows, mapOnlyJsonPath);
  writeExternalRadarsSql(sqlRows, sqlPath);

  console.log('======================================================================');
  console.log('🏛️  GOVERNMENT CAMERA IMPORTER');
  console.log('======================================================================');
  for (const item of processed) {
    const alertable = item.rows.filter((row) => row.alertEligible).length;
    const mapOnly = item.rows.length - alertable;
    console.log(`• ${item.entry.label}`);
    console.log(`  source_key: ${item.entry.key}`);
    console.log(`  input: ${path.relative(REPO_ROOT, item.inputPath)}`);
    console.log(`  rows: ${item.rows.length} | driver_alert: ${alertable} | map_only: ${mapOnly}`);
  }
  console.log('');
  console.log(`Normalized JSON: ${path.relative(REPO_ROOT, normalizedJsonPath)}`);
  console.log(`Alert-ready JSON: ${path.relative(REPO_ROOT, sqlJsonPath)}`);
  console.log(`Map-only JSON: ${path.relative(REPO_ROOT, mapOnlyJsonPath)}`);
  console.log(`SQL upsert: ${path.relative(REPO_ROOT, sqlPath)}`);
}

main();

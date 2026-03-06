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

interface LegacySavedDataRow {
  source?: string;
  source_id?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  camera_type?: string | null;
  speed_limit?: number | string | null;
  road_name?: string | null;
  direction?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  verified?: boolean | null;
}

interface CompleteUsSnapshotRow {
  lat?: number | string | null;
  lon?: number | string | null;
  type?: string | null;
  source?: string | null;
  state?: string | null;
  provider?: string | null;
  osm_id?: number | string | null;
}

interface SocrataExportFile {
  meta?: {
    view?: {
      columns?: Array<{
        fieldName?: string;
        name?: string;
      }>;
    };
  };
  data?: unknown[][];
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
const COMPLETE_US_PROVIDER_MAP: Record<
  string,
  {
    targetSourceKey: string;
    type: AppRadarType;
  }
> = {
  'Chicago Speed Enforcement Cameras': {
    targetSourceKey: 'gov_il_chicago_speed',
    type: 'speed_camera',
  },
  'Chicago Red Light Cameras': {
    targetSourceKey: 'gov_il_chicago_red_light',
    type: 'red_light',
  },
  'Montgomery County Speed Cameras': {
    targetSourceKey: 'gov_md_montgomery_speed',
    type: 'speed_camera',
  },
  'San Francisco Traffic Cameras': {
    targetSourceKey: 'gov_ca_san_francisco_traffic',
    type: 'traffic_enforcement',
  },
};

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

const readLegacySavedDataFile = (filePath: string): LegacySavedDataRow[] => {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array of saved rows: ${filePath}`);
  }
  return parsed as LegacySavedDataRow[];
};

const readCompleteUsSnapshotFile = (filePath: string): CompleteUsSnapshotRow[] => {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array of complete snapshot rows: ${filePath}`);
  }
  return parsed as CompleteUsSnapshotRow[];
};

const readSocrataExportFile = (filePath: string): SocrataExportFile => {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SocrataExportFile;
  if (!parsed?.meta?.view?.columns || !Array.isArray(parsed?.data)) {
    throw new Error(`Expected Socrata export with meta.view.columns + data: ${filePath}`);
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

const normalizeLegacyRadarType = (value: unknown): AppRadarType | null => {
  const raw = asString(value)?.toLowerCase() || '';
  if (raw === 'speed_fixed' || raw === 'speed_camera' || raw === 'fixed') return 'speed_camera';
  if (raw === 'red_light') return 'red_light';
  if (raw === 'traffic_enforcement') return 'traffic_enforcement';
  return null;
};

const roundCoordinateKey = (value: number) => value.toFixed(6);

const normalizeLegacyCity = (value: unknown, fallback?: string) => {
  const city = asString(value);
  if (!city || city.toLowerCase() === 'unknown') return fallback || null;
  return city;
};

const parseStreetDirectionPrefix = (value: string | null) => {
  if (!value) return null;
  const prefix = value.trim().split(/\s+/, 1)[0]?.toUpperCase() || '';
  if (['NB', 'SB', 'EB', 'WB', 'N', 'S', 'E', 'W'].includes(prefix)) {
    return prefix;
  }
  return null;
};

const directionPrefixToDegrees = (value: string | null) => {
  if (!value) return null;
  const mapping: Record<string, number> = {
    N: 0,
    NB: 0,
    E: 90,
    EB: 90,
    S: 180,
    SB: 180,
    W: 270,
    WB: 270,
  };
  return Number.isFinite(mapping[value]) ? mapping[value] : null;
};

const dedupeNormalizedRows = (rows: NormalizedGovernmentRadar[]) => {
  const deduped = new Map<string, NormalizedGovernmentRadar>();
  for (const row of rows) {
    deduped.set(`${row.source}::${row.source_id}`, row);
  }
  return Array.from(deduped.values());
};

const mapSocrataRow = (
  columns: Array<{ fieldName?: string; name?: string }>,
  row: unknown[]
) => {
  const mapped: Record<string, unknown> = {};
  columns.forEach((column, index) => {
    const key = column.fieldName || column.name || `column_${index}`;
    mapped[key] = row[index];
  });
  return mapped;
};

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

const filterLegacyRowsForEntry = (
  rows: LegacySavedDataRow[],
  entry: VerifiedGovSourceManifestEntry
) => rows.filter((row) => {
  const sourceName = asString(row.source);
  const cameraType = asString(row.camera_type)?.toLowerCase() || null;

  const sourceMatches =
    !entry.savedDataSourceNames?.length ||
    entry.savedDataSourceNames.some((allowed) => allowed.toLowerCase() === (sourceName || '').toLowerCase());
  const typeMatches =
    !entry.savedDataCameraTypes?.length ||
    entry.savedDataCameraTypes.some((allowed) => allowed.toLowerCase() === (cameraType || ''));

  return sourceMatches && typeMatches;
});

const normalizeLegacySavedDataRows = (
  rows: LegacySavedDataRow[],
  entry: VerifiedGovSourceManifestEntry
): NormalizedGovernmentRadar[] => {
  const filtered = filterLegacyRowsForEntry(rows, entry);
  const groups = new Map<string, LegacySavedDataRow[]>();

  for (const row of filtered) {
    const latitude = asNumber(row.latitude);
    const longitude = asNumber(row.longitude);
    const type = normalizeLegacyRadarType(row.camera_type);
    if (latitude == null || longitude == null || !type) continue;

    const roadName = normalizeRoadName(row.road_name);
    const direction = normalizeDirection(row.direction);
    const dedupeKey = [
      type,
      roundCoordinateKey(latitude),
      roundCoordinateKey(longitude),
      roadName || '',
      direction || '',
    ].join('|');

    const bucket = groups.get(dedupeKey) || [];
    bucket.push(row);
    groups.set(dedupeKey, bucket);
  }

  return Array.from(groups.entries()).map(([dedupeKey, bucket]) => {
    const first = bucket[0];
    const latitude = Number(first.latitude);
    const longitude = Number(first.longitude);
    const type = normalizeLegacyRadarType(first.camera_type) || 'speed_camera';
    const roadName = normalizeRoadName(first.road_name);
    const direction = normalizeDirection(first.direction);
    const cameraType = asString(first.camera_type)?.toLowerCase() || type;
    const sourceName = asString(first.source) || entry.label;
    const city = normalizeLegacyCity(first.city, entry.city);
    const speedLimit = parsePositiveSpeedLimit(first.speed_limit);
    const dedupeCount = bucket.length;

    return {
      source: entry.key,
      source_id: `${entry.key}:${dedupeKey}`,
      type,
      latitude,
      longitude,
      confidence: entry.defaultConfidence ?? (dedupeCount > 1 ? 0.8 : 0.72),
      verified: true,
      alertEligible: entry.alertPolicy === 'driver_alert',
      alertPolicy: entry.alertPolicy,
      metadata: buildMetadata(entry, {
        source_name: sourceName,
        road_name: roadName,
        direction,
      }, {
        city: city || null,
        road_name: roadName,
        direction,
        direction_deg: directionToDegrees(direction),
        speed_limit: speedLimit,
        derived_from_saveddata: true,
        dedupe_count: dedupeCount,
        source_name: sourceName,
        legacy_camera_type: cameraType,
        legacy_source_ids: bucket
          .map((row) => asString(row.source_id))
          .filter((value): value is string => Boolean(value)),
      }),
    };
  });
};

const normalizeCompleteUsSnapshotRows = (
  rows: CompleteUsSnapshotRow[]
): NormalizedGovernmentRadar[] => {
  const groups = new Map<string, CompleteUsSnapshotRow[]>();

  for (const row of rows) {
    const source = asString(row.source)?.toLowerCase();
    if (source !== 'gov_api') continue;

    const provider = asString(row.provider);
    if (!provider) continue;

    const mapping = COMPLETE_US_PROVIDER_MAP[provider];
    if (!mapping) continue;

    const latitude = asNumber(row.lat);
    const longitude = asNumber(row.lon);
    if (latitude == null || longitude == null) continue;

    const dedupeKey = [
      mapping.targetSourceKey,
      mapping.type,
      roundCoordinateKey(latitude),
      roundCoordinateKey(longitude),
    ].join('|');
    const bucket = groups.get(dedupeKey) || [];
    bucket.push(row);
    groups.set(dedupeKey, bucket);
  }

  return Array.from(groups.entries()).map(([dedupeKey, bucket]) => {
    const first = bucket[0];
    const provider = asString(first.provider) || 'Unknown provider';
    const mapping = COMPLETE_US_PROVIDER_MAP[provider];
    const targetEntry = getVerifiedUsGovSource(mapping.targetSourceKey);
    if (!targetEntry) {
      throw new Error(`Missing manifest entry for complete snapshot target source: ${mapping.targetSourceKey}`);
    }

    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    const dedupeCount = bucket.length;

    return {
      source: targetEntry.key,
      source_id: `${targetEntry.key}:${mapping.type}|${roundCoordinateKey(latitude)}|${roundCoordinateKey(longitude)}`,
      type: mapping.type,
      latitude,
      longitude,
      confidence: targetEntry.defaultConfidence ?? 0.78,
      verified: true,
      alertEligible: targetEntry.alertPolicy === 'driver_alert',
      alertPolicy: targetEntry.alertPolicy,
      metadata: buildMetadata(
        targetEntry,
        {
          provider,
          state: first.state || targetEntry.stateCode,
        },
        {
          city: targetEntry.city || null,
          direction: null,
          direction_deg: null,
          speed_limit: null,
          provider,
          derived_from_complete_us_snapshot: true,
          dedupe_count: dedupeCount,
          original_source: 'gov_api',
          raw_state: asString(first.state) || targetEntry.stateCode,
          original_type: asString(first.type),
          osm_rows_skipped_from_snapshot: true,
        }
      ),
    };
  });
};

const normalizeSanFranciscoSpeedRows = (
  file: SocrataExportFile,
  entry: VerifiedGovSourceManifestEntry
): NormalizedGovernmentRadar[] => {
  const columns = file.meta?.view?.columns || [];
  const grouped = new Map<string, Record<string, unknown>[]>();

  for (const rawRow of file.data || []) {
    if (!Array.isArray(rawRow)) continue;
    const row = mapSocrataRow(columns, rawRow);
    const siteId = asString(row.site_id);
    const latitude = asNumber(row.latitude);
    const longitude = asNumber(row.longitude);
    const enforcementType = asString(row.enforcement_type)?.toUpperCase() || '';
    if (!siteId || latitude == null || longitude == null) continue;
    if (!enforcementType.includes('SPEED')) continue;

    const bucket = grouped.get(siteId) || [];
    bucket.push(row);
    grouped.set(siteId, bucket);
  }

  return Array.from(grouped.entries()).map(([siteId, bucket]) => {
    const latest = bucket[bucket.length - 1];
    const latitude = Number(latest.latitude);
    const longitude = Number(latest.longitude);
    const location = asString(latest.location);
    const direction = parseStreetDirectionPrefix(location);
    const postedSpeed = parsePositiveSpeedLimit(latest.posted_speed);
    const neighborhood = asString(latest.analysis_neighborhood);

    return {
      source: entry.key,
      source_id: `sf-speed-site:${siteId}`,
      type: 'speed_camera',
      latitude,
      longitude,
      confidence: entry.defaultConfidence ?? 0.96,
      verified: true,
      alertEligible: true,
      alertPolicy: entry.alertPolicy,
      metadata: buildMetadata(
        entry,
        latest,
        {
          road_name: location,
          direction,
          direction_deg: directionPrefixToDegrees(direction),
          speed_limit: postedSpeed,
          site_id: siteId,
          neighborhood,
          enforcement_type: asString(latest.enforcement_type),
          records_aggregated: bucket.length,
          latest_record_date: asString(latest.date),
          data_as_of: asString(latest.data_as_of),
        }
      ),
    };
  });
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
  let rows: NormalizedGovernmentRadar[] = [];

  if (entry.normalizerKey === 'legacy_saveddata_json') {
    const savedRows = readLegacySavedDataFile(inputPath);
    rows = normalizeLegacySavedDataRows(savedRows, entry);
  } else if (entry.normalizerKey === 'complete_us_snapshot_json') {
    const snapshotRows = readCompleteUsSnapshotFile(inputPath);
    rows = normalizeCompleteUsSnapshotRows(snapshotRows);
  } else if (entry.normalizerKey === 'sf_speed_socrata_json') {
    const socrataFile = readSocrataExportFile(inputPath);
    rows = normalizeSanFranciscoSpeedRows(socrataFile, entry);
  } else {
    const geoJson = readGeoJsonFile(inputPath);
    rows = (geoJson.features || [])
      .map((feature) => normalizeFeature(feature, entry))
      .filter((row): row is NormalizedGovernmentRadar => Boolean(row));
  }

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
  const normalizedRows = dedupeNormalizedRows(processed.flatMap((item) => item.rows));
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

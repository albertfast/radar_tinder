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
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

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

interface LosAngelesSelectedSegment {
  district: number;
  districtRowIndex: number;
  street: string;
  to: string;
  from: string;
  speedLimit: number;
  equityArea: boolean;
  schoolNearby: boolean;
  speedRelatedCollisions: number;
}

interface ArcGisFeatureGeometry {
  rings?: number[][][];
  paths?: number[][][];
  x?: number;
  y?: number;
}

interface ArcGisFeature {
  attributes?: Record<string, unknown>;
  geometry?: ArcGisFeatureGeometry | null;
}

interface LosAngelesCandidateFeature {
  layerKey: 'district' | 'citywide' | 'eligible';
  objectId: number;
  district: number | null;
  streetName: string | null;
  roadName: string | null;
  crossStreet1: string | null;
  crossStreet2: string | null;
  fromStreet: string | null;
  toStreet: string | null;
  segmentId: string | null;
  speedLimit: number | null;
  headingDeg: number | null;
  point: { latitude: number; longitude: number } | null;
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

const LOS_ANGELES_ATTACHMENT_A_URL =
  'https://ladot.lacity.gov/sites/default/files/2026-02/speed-safety-program-attachment-a-impact-report.pdf';
const LOS_ANGELES_DISTRICT_LAYER_URL =
  'https://services.arcgis.com/G3nmNsarwQblLhip/arcgis/rest/services/DistrictAnalysis_removehwys_top210/FeatureServer/0';
const LOS_ANGELES_CITYWIDE_LAYER_URL =
  'https://services.arcgis.com/G3nmNsarwQblLhip/arcgis/rest/services/CitywideAnalysis_removehwys_top20/FeatureServer/0';
const LOS_ANGELES_ELIGIBLE_LAYER_URL =
  'https://services.arcgis.com/G3nmNsarwQblLhip/arcgis/rest/services/EligibleSegments_removehwys/FeatureServer/0';
const LOS_ANGELES_MATCH_SCORE_THRESHOLD = 70;

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

const parsePointText = (value: unknown) => {
  const raw = asString(value);
  if (!raw) return null;
  const match = raw.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
  if (!match) return null;
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
};

const slugifyIdPart = (value: string | null) => {
  if (!value) return 'unknown';
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'unknown';
};

const normalizeCameraIdString = (value: string | null) => {
  if (!value) return null;
  return value.replace(/\.0+$/, '').trim() || null;
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

const extractMovementDirection = (value: unknown) => {
  const raw = asString(value)?.toLowerCase() || '';
  if (!raw) return null;
  if (raw.startsWith('northbound')) return 'NB';
  if (raw.startsWith('southbound')) return 'SB';
  if (raw.startsWith('eastbound')) return 'EB';
  if (raw.startsWith('westbound')) return 'WB';
  return null;
};

const normalizeMatchText = (value: unknown) => {
  const raw = asString(value);
  if (!raw) return null;

  const replacements: Record<string, string> = {
    STREET: 'ST',
    AVENUE: 'AVE',
    BOULEVARD: 'BLVD',
    DRIVE: 'DR',
    PLACE: 'PL',
    ROAD: 'RD',
    FREEWAY: 'FWY',
    HIGHWAY: 'HWY',
    TERRACE: 'TER',
    PARKWAY: 'PKWY',
    NORTH: 'N',
    SOUTH: 'S',
    EAST: 'E',
    WEST: 'W',
    SAINT: 'ST',
    MOUNT: 'MT',
  };

  const normalized = raw
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[().,/.-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => replacements[part] || part)
    .join(' ')
    .replace(/\bMIDBLOCK\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || null;
};

const buildLosAngelesSourceId = (row: LosAngelesSelectedSegment, segmentId: string | null) => {
  if (segmentId) {
    return `la-speed-safety:${segmentId}:${slugifyIdPart(row.to)}:${slugifyIdPart(row.from)}`;
  }

  return `la-speed-safety:${row.district}:${slugifyIdPart(row.street)}:${slugifyIdPart(row.to)}:${slugifyIdPart(row.from)}`;
};

const classifyLosAngelesTableToken = (start: number) => {
  if (start < 18) return 'street';
  if (start < 35) return 'to';
  return 'from';
};

const applyLosAngelesPdfFixups = (rows: LosAngelesSelectedSegment[]) => {
  const byDistrict = new Map<number, LosAngelesSelectedSegment[]>();
  for (const row of rows) {
    const bucket = byDistrict.get(row.district) || [];
    bucket.push(row);
    byDistrict.set(row.district, bucket);
  }

  const district6 = byDistrict.get(6);
  if (district6?.[6] && district6[7]) {
    district6[6].from = 'High Tech Los Angeles East Driveway';
    district6[7].from = 'Sherman Cir (midblock)';
  }

  const district8 = byDistrict.get(8);
  if (district8?.[4] && district8[5]) {
    district8[4].street = 'W Martin Luther King Jr. Blvd';
    district8[5].street = 'W Florence Ave';
  }

  const district11 = byDistrict.get(11);
  if (district11?.[3] && district11[4]) {
    district11[3].to = 'Webster Middle School (driveway)';
    district11[4].to = 'Culver Blvd';
  }

  return rows.map((row) => ({
    ...row,
    street: asString(row.street) || row.street,
    to: asString(row.to) || row.to,
    from: asString(row.from) || row.from,
  }));
};

const parseLosAngelesAttachmentAText = (text: string): LosAngelesSelectedSegment[] => {
  const rows: LosAngelesSelectedSegment[] = [];
  const sections = text.split(/Council District (\d+)\n/);

  for (let index = 1; index < sections.length; index += 2) {
    const district = Number(sections[index]);
    if (!Number.isFinite(district)) continue;

    const lines = sections[index + 1].split('\n').map((line) => line.replace(/\s+$/, ''));
    let inTable = false;
    let pendingTokens: Array<[number, string]> = [];
    let currentRow: LosAngelesSelectedSegment | null = null;
    let districtRowIndex = 0;

    for (const rawLine of lines) {
      const stripped = rawLine.trim();
      if (!inTable) {
        if (stripped === 'Collisions') {
          inTable = true;
        }
        continue;
      }

      if (!stripped || stripped === 'ATTACHMENT A' || stripped.startsWith('Proposed Speed')) {
        continue;
      }
      if (stripped.startsWith('A-')) {
        break;
      }

      const tokens = Array.from(rawLine.matchAll(/\S(?:.*?\S)?(?=\s{2,}|$)/g)).map((match) => [
        match.index || 0,
        match[0],
      ]) as Array<[number, string]>;

      if (tokens.length === 0) continue;

      const isAnchorLine =
        tokens.length >= 4 &&
        /^\d{2}$/.test(tokens[tokens.length - 4][1]) &&
        ['Yes', 'No'].includes(tokens[tokens.length - 3][1]) &&
        ['Yes', 'No'].includes(tokens[tokens.length - 2][1]) &&
        /^\d+$/.test(tokens[tokens.length - 1][1]);

      if (isAnchorLine) {
        if (currentRow) {
          rows.push(currentRow);
        }

        districtRowIndex += 1;
        currentRow = {
          district,
          districtRowIndex,
          street: '',
          to: '',
          from: '',
          speedLimit: Number(tokens[tokens.length - 4][1]),
          equityArea: tokens[tokens.length - 3][1] === 'Yes',
          schoolNearby: tokens[tokens.length - 2][1] === 'Yes',
          speedRelatedCollisions: Number(tokens[tokens.length - 1][1]),
        };

        for (const [start, token] of [...pendingTokens, ...tokens.slice(0, -4)]) {
          const field = classifyLosAngelesTableToken(start);
          currentRow[field] = `${currentRow[field]} ${token}`.trim();
        }
        pendingTokens = [];
        continue;
      }

      if (!currentRow) {
        pendingTokens.push(...tokens);
        continue;
      }

      for (const [start, token] of tokens) {
        const field = classifyLosAngelesTableToken(start);
        if (currentRow[field]) {
          pendingTokens.push([start, token]);
        } else {
          currentRow[field] = `${currentRow[field]} ${token}`.trim();
        }
      }
    }

    if (currentRow) {
      rows.push(currentRow);
    }
  }

  return applyLosAngelesPdfFixups(rows);
};

const fetchWithTimeout = async (url: string, init?: RequestInit, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const fetchJson = async <T>(url: string, timeoutMs?: number) => {
  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'radar-tinder-gov-importer/1.0',
    },
  }, timeoutMs);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }

  return (await response.json()) as T;
};

const fetchBuffer = async (url: string) => {
  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'radar-tinder-gov-importer/1.0',
    },
  }, 20000);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

const downloadLosAngelesAttachmentAText = async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-tinder-la-'));
  const pdfPath = path.join(tempDir, 'la-speed-safety-attachment-a.pdf');

  try {
    fs.writeFileSync(pdfPath, await fetchBuffer(LOS_ANGELES_ATTACHMENT_A_URL));
    return execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
      encoding: 'utf-8',
    });
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best effort temp cleanup only.
    }
  }
};

const arcGisQueryUrl = (layerUrl: string, queryParams: Record<string, string>) => {
  const searchParams = new URLSearchParams(queryParams);
  return `${layerUrl}/query?${searchParams.toString()}`;
};

const fetchArcGisFeatures = async (
  layerUrl: string,
  outFields: string,
  options?: {
    includeGeometry?: boolean;
    objectId?: number;
  }
) => {
  const features: ArcGisFeature[] = [];
  let offset = 0;
  const batchSize = options?.objectId ? 1 : 2000;

  while (true) {
    const queryParams: Record<string, string> = {
      where: options?.objectId ? `OBJECTID=${options.objectId}` : '1=1',
      outFields,
      returnGeometry: options?.includeGeometry ? 'true' : 'false',
      f: 'json',
      resultOffset: String(offset),
      resultRecordCount: String(batchSize),
    };

    if (options?.includeGeometry) {
      queryParams.outSR = '4326';
    }

    const url = arcGisQueryUrl(layerUrl, queryParams);

    const payload = await fetchJson<{
      features?: ArcGisFeature[];
      exceededTransferLimit?: boolean;
    }>(url);

    const batch = payload.features || [];
    features.push(...batch);

    if (options?.objectId || batch.length < batchSize || !payload.exceededTransferLimit) {
      break;
    }

    offset += batchSize;
  }

  return features;
};

const toLosAngelesCandidate = (
  feature: ArcGisFeature,
  layerKey: LosAngelesCandidateFeature['layerKey']
): LosAngelesCandidateFeature | null => {
  const attributes = feature.attributes || {};
  const objectId = asNumber(attributes.OBJECTID);
  if (objectId == null) return null;

  return {
    layerKey,
    objectId,
    district: asNumber(attributes.DISTRICT),
    streetName: asString(attributes.StreetName ?? attributes.ST_NAME_FULL ?? attributes.str_name),
    roadName: asString(attributes.roadname),
    crossStreet1: asString(attributes.XStreet1),
    crossStreet2: asString(attributes.XStreet2),
    fromStreet: asString(attributes.from_stree ?? attributes.from_street),
    toStreet: asString(attributes.to_street ?? attributes.to_street),
    segmentId: asString(attributes.segment_id ?? attributes.seg_id),
    speedLimit: parsePositiveSpeedLimit(attributes.speed_limi),
    headingDeg: asNumber(attributes.heading_va),
    point: computeGeometryPoint(feature.geometry),
  };
};

const dedupeLosAngelesCandidates = (candidates: LosAngelesCandidateFeature[]) => {
  const deduped = new Map<string, LosAngelesCandidateFeature>();

  for (const candidate of candidates) {
    const key = candidate.segmentId || `${candidate.layerKey}:${candidate.objectId}`;
    const existing = deduped.get(key);
    if (!existing || (existing.layerKey === 'citywide' && candidate.layerKey === 'district')) {
      deduped.set(key, candidate);
    }
  }

  return Array.from(deduped.values());
};

const scoreLosAngelesCandidate = (
  row: LosAngelesSelectedSegment,
  candidate: LosAngelesCandidateFeature
) => {
  const normalizedStreet = normalizeMatchText(row.street);
  const normalizedTo = normalizeMatchText(row.to);
  const normalizedFrom = normalizeMatchText(row.from);
  const pdfCrossStreets = new Set([normalizedTo, normalizedFrom].filter(Boolean));
  const candidateStreet = normalizeMatchText(candidate.streetName || candidate.roadName);
  const candidateCrossStreets = new Set(
    [
      normalizeMatchText(candidate.crossStreet1),
      normalizeMatchText(candidate.crossStreet2),
      normalizeMatchText(candidate.fromStreet),
      normalizeMatchText(candidate.toStreet),
    ].filter(Boolean)
  );

  let score = 0;

  if (candidate.district === row.district) {
    score += 50;
  }

  if (candidateStreet && normalizedStreet) {
    if (candidateStreet === normalizedStreet) {
      score += 60;
    } else if (candidateStreet.includes(normalizedStreet) || normalizedStreet.includes(candidateStreet)) {
      score += 45;
    }
  }

  for (const crossStreet of pdfCrossStreets) {
    if (crossStreet && candidateCrossStreets.has(crossStreet)) {
      score += 20;
    }
  }

  if (candidate.speedLimit != null && candidate.speedLimit === row.speedLimit) {
    score += 5;
  }

  return score;
};

const computeGeometryPoint = (geometry: ArcGisFeatureGeometry | null | undefined) => {
  if (!geometry) return null;
  if (Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) {
    return {
      latitude: Number(geometry.y),
      longitude: Number(geometry.x),
    };
  }

  const coordinates =
    geometry.rings?.flat(2) ||
    geometry.paths?.flat(2) ||
    [];

  if (!coordinates.length) {
    return null;
  }

  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const point of coordinates) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const longitude = asNumber(point[0]);
    const latitude = asNumber(point[1]);
    if (longitude == null || latitude == null) continue;
    minLng = Math.min(minLng, longitude);
    minLat = Math.min(minLat, latitude);
    maxLng = Math.max(maxLng, longitude);
    maxLat = Math.max(maxLat, latitude);
  }

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) {
    return null;
  }

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
  };
};

const geocodeIntersection = async (query: string) => {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const results = await fetchJson<Array<{ lat?: string; lon?: string }>>(url, 5000);
  const first = results[0];
  const latitude = asNumber(first?.lat);
  const longitude = asNumber(first?.lon);

  if (latitude == null || longitude == null) {
    return null;
  }

  return { latitude, longitude };
};

const geocodeLosAngelesSegment = async (row: LosAngelesSelectedSegment) => {
  const queries = [
    `${row.street} and ${row.to}, Los Angeles, California`,
    `${row.street} and ${row.from}, Los Angeles, California`,
  ].filter((query) => !/CITY LIMIT/i.test(query));

  const points = (
    await Promise.all(
      queries.map(async (query) => {
        try {
          return await geocodeIntersection(query);
        } catch {
          return null;
        }
      })
    )
  ).filter((point): point is { latitude: number; longitude: number } => Boolean(point));

  if (points.length === 0) {
    return null;
  }

  const latitude = points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
  const longitude = points.reduce((sum, point) => sum + point.longitude, 0) / points.length;
  return { latitude, longitude };
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

const normalizeSanFranciscoRedLightRows = (
  file: SocrataExportFile,
  entry: VerifiedGovSourceManifestEntry
): NormalizedGovernmentRadar[] => {
  const columns = file.meta?.view?.columns || [];
  const grouped = new Map<
    string,
    {
      latestRow: Record<string, unknown>;
      latestMonth: string | null;
      rowCount: number;
      totalCitations: number;
    }
  >();

  for (const rawRow of file.data || []) {
    if (!Array.isArray(rawRow)) continue;
    const row = mapSocrataRow(columns, rawRow);
    const intersection = asString(row.intersection);
    const movement = asString(row.directions_enforced);
    const violationType = asString(row.violation_type);
    const point = parsePointText(row.point);
    if (!intersection || !movement || !violationType || !point) continue;

    const groupKey = [
      slugifyIdPart(intersection),
      slugifyIdPart(movement),
      slugifyIdPart(violationType),
      roundCoordinateKey(point.latitude),
      roundCoordinateKey(point.longitude),
    ].join('|');

    const month = asString(row.month);
    const count = Math.max(0, Number(asNumber(row.count) || 0));
    const existing = grouped.get(groupKey);

    if (!existing) {
      grouped.set(groupKey, {
        latestRow: row,
        latestMonth: month,
        rowCount: 1,
        totalCitations: count,
      });
      continue;
    }

    existing.rowCount += 1;
    existing.totalCitations += count;
    if ((month || '') >= (existing.latestMonth || '')) {
      existing.latestRow = row;
      existing.latestMonth = month;
    }
  }

  return Array.from(grouped.values()).map((group) => {
    const row = group.latestRow;
    const point = parsePointText(row.point)!;
    const intersection = asString(row.intersection) || 'Unknown intersection';
    const movement = asString(row.directions_enforced);
    const violationType = asString(row.violation_type);
    const neighborhood = asString(row.analysis_neighborhood);
    const movementDirection = extractMovementDirection(movement);

    return {
      source: entry.key,
      source_id: `sf-red-light:${slugifyIdPart(intersection)}:${slugifyIdPart(movement)}:${slugifyIdPart(violationType)}`,
      type: 'red_light',
      latitude: point.latitude,
      longitude: point.longitude,
      confidence: entry.defaultConfidence ?? 0.95,
      verified: true,
      alertEligible: true,
      alertPolicy: entry.alertPolicy,
      metadata: buildMetadata(
        entry,
        row,
        {
          road_name: intersection,
          direction: movement,
          direction_cardinal: movementDirection,
          direction_deg: directionPrefixToDegrees(movementDirection),
          speed_limit: null,
          neighborhood,
          violation_type: violationType,
          records_aggregated: group.rowCount,
          total_citations: group.totalCitations,
          latest_record_date: group.latestMonth,
          data_as_of: asString(row.data_as_of),
        }
      ),
    };
  });
};

const normalizeChicagoRedLightRows = (
  file: SocrataExportFile,
  entry: VerifiedGovSourceManifestEntry
): NormalizedGovernmentRadar[] => {
  const columns = file.meta?.view?.columns || [];
  const grouped = new Map<
    string,
    {
      cameraId: string;
      rowCount: number;
      totalViolations: number;
      latestViolationDate: string | null;
      representativeRow: Record<string, unknown> | null;
      representativePoint: { latitude: number; longitude: number } | null;
    }
  >();

  for (const rawRow of file.data || []) {
    if (!Array.isArray(rawRow)) continue;
    const row = mapSocrataRow(columns, rawRow);
    const cameraId = normalizeCameraIdString(asString(row.camera_id));
    if (!cameraId) continue;

    const latitude = asNumber(row.latitude);
    const longitude = asNumber(row.longitude);
    const point =
      latitude != null && longitude != null
        ? { latitude, longitude }
        : parsePointText(row.location ?? row.point);

    const violationDate = asString(row.violation_date);
    const violations = Math.max(0, Number(asNumber(row.violations) || 0));
    const existing = grouped.get(cameraId) || {
      cameraId,
      rowCount: 0,
      totalViolations: 0,
      latestViolationDate: null,
      representativeRow: null,
      representativePoint: null,
    };

    existing.rowCount += 1;
    existing.totalViolations += violations;

    if (point && ((violationDate || '') >= (existing.latestViolationDate || ''))) {
      existing.latestViolationDate = violationDate;
      existing.representativeRow = row;
      existing.representativePoint = point;
    } else if (!existing.representativeRow && point) {
      existing.latestViolationDate = violationDate;
      existing.representativeRow = row;
      existing.representativePoint = point;
    }

    grouped.set(cameraId, existing);
  }

  return Array.from(grouped.values())
    .filter((group) => Boolean(group.representativeRow && group.representativePoint))
    .map((group) => {
      const row = group.representativeRow!;
      const point = group.representativePoint!;
      const intersection = asString(row.intersection);
      const address = asString(row.address);

      return {
        source: entry.key,
        source_id: `chicago-red-light-camera:${group.cameraId}`,
        type: 'red_light',
        latitude: point.latitude,
        longitude: point.longitude,
        confidence: entry.defaultConfidence ?? 0.92,
        verified: true,
        alertEligible: true,
        alertPolicy: entry.alertPolicy,
        metadata: buildMetadata(
          entry,
          row,
          {
            road_name: intersection || address,
            direction: null,
            direction_deg: null,
            speed_limit: null,
            camera_id: group.cameraId,
            address,
            intersection,
            records_aggregated: group.rowCount,
            total_violations: group.totalViolations,
            latest_record_date: group.latestViolationDate,
          }
        ),
      };
    });
};

const normalizeChicagoSpeedRows = (
  file: SocrataExportFile,
  entry: VerifiedGovSourceManifestEntry
): NormalizedGovernmentRadar[] => {
  const columns = file.meta?.view?.columns || [];
  const grouped = new Map<
    string,
    {
      cameraId: string;
      rowCount: number;
      totalViolations: number;
      latestViolationDate: string | null;
      representativeRow: Record<string, unknown> | null;
      representativePoint: { latitude: number; longitude: number } | null;
    }
  >();

  for (const rawRow of file.data || []) {
    if (!Array.isArray(rawRow)) continue;
    const row = mapSocrataRow(columns, rawRow);
    const cameraId = normalizeCameraIdString(asString(row.camera_id));
    if (!cameraId) continue;

    const latitude = asNumber(row.latitude);
    const longitude = asNumber(row.longitude);
    const point =
      latitude != null && longitude != null
        ? { latitude, longitude }
        : parsePointText(row.location ?? row.point);

    const violationDate = asString(row.violation_date);
    const violations = Math.max(0, Number(asNumber(row.violations) || 0));
    const existing = grouped.get(cameraId) || {
      cameraId,
      rowCount: 0,
      totalViolations: 0,
      latestViolationDate: null,
      representativeRow: null,
      representativePoint: null,
    };

    existing.rowCount += 1;
    existing.totalViolations += violations;

    if (point && ((violationDate || '') >= (existing.latestViolationDate || ''))) {
      existing.latestViolationDate = violationDate;
      existing.representativeRow = row;
      existing.representativePoint = point;
    } else if (!existing.representativeRow && point) {
      existing.latestViolationDate = violationDate;
      existing.representativeRow = row;
      existing.representativePoint = point;
    }

    grouped.set(cameraId, existing);
  }

  return Array.from(grouped.values())
    .filter((group) => Boolean(group.representativeRow && group.representativePoint))
    .map((group) => {
      const row = group.representativeRow!;
      const point = group.representativePoint!;
      const address = asString(row.address);

      return {
        source: entry.key,
        source_id: `chicago-speed-camera:${group.cameraId}`,
        type: 'speed_camera',
        latitude: point.latitude,
        longitude: point.longitude,
        confidence: entry.defaultConfidence ?? 0.93,
        verified: true,
        alertEligible: true,
        alertPolicy: entry.alertPolicy,
        metadata: buildMetadata(
          entry,
          row,
          {
            road_name: address,
            direction: null,
            direction_deg: null,
            speed_limit: null,
            camera_id: group.cameraId,
            address,
            records_aggregated: group.rowCount,
            total_violations: group.totalViolations,
            latest_record_date: group.latestViolationDate,
          }
        ),
      };
    });
};

const normalizeLosAngelesSpeedSafetyRows = async (
  entry: VerifiedGovSourceManifestEntry
): Promise<NormalizedGovernmentRadar[]> => {
  const attachmentText = await downloadLosAngelesAttachmentAText();
  const selectedRows = parseLosAngelesAttachmentAText(attachmentText);

  const [districtFeatures, citywideFeatures, eligibleFeatures] = await Promise.all([
    fetchArcGisFeatures(
      LOS_ANGELES_DISTRICT_LAYER_URL,
      'OBJECTID,DISTRICT,StreetName,XStreet1,XStreet2,from_stree,to_street,seg_id,segment_id,driving_di,speed_limi,roadname,heading_va',
      { includeGeometry: true }
    ),
    fetchArcGisFeatures(
      LOS_ANGELES_CITYWIDE_LAYER_URL,
      'OBJECTID,DISTRICT,StreetName,XStreet1,XStreet2,from_stree,to_street,seg_id,segment_id,driving_di,speed_limi,roadname,heading_va',
      { includeGeometry: true }
    ),
    fetchArcGisFeatures(
      LOS_ANGELES_ELIGIBLE_LAYER_URL,
      'OBJECTID,DISTRICT,ST_NAME_FULL,roadname,from_stree,to_street,seg_id,segment_id,speed_limi,heading_va'
    ),
  ]);

  const candidates = dedupeLosAngelesCandidates([
    ...districtFeatures
      .map((feature) => toLosAngelesCandidate(feature, 'district'))
      .filter((item): item is LosAngelesCandidateFeature => Boolean(item)),
    ...citywideFeatures
      .map((feature) => toLosAngelesCandidate(feature, 'citywide'))
      .filter((item): item is LosAngelesCandidateFeature => Boolean(item)),
    ...eligibleFeatures
      .map((feature) => toLosAngelesCandidate(feature, 'eligible'))
      .filter((item): item is LosAngelesCandidateFeature => Boolean(item)),
  ]);

  const geometryCache = new Map<string, { latitude: number; longitude: number } | null>();
  const normalizedRows: NormalizedGovernmentRadar[] = [];

  for (const row of selectedRows) {
    const rankedCandidates = candidates
      .map((candidate) => ({
        candidate,
        score: scoreLosAngelesCandidate(row, candidate),
      }))
      .sort((left, right) => right.score - left.score);

    const bestMatch = rankedCandidates[0];
    const matchedCandidate =
      bestMatch?.score != null && bestMatch.score >= LOS_ANGELES_MATCH_SCORE_THRESHOLD
        ? bestMatch.candidate
        : null;

    let point: { latitude: number; longitude: number } | null = null;
    let locationSource = 'nominatim_fallback';

    if (matchedCandidate) {
      const cacheKey = `${matchedCandidate.layerKey}:${matchedCandidate.objectId}`;
      point = matchedCandidate.point;

      if (!point) {
        if (geometryCache.has(cacheKey)) {
          point = geometryCache.get(cacheKey) || null;
        } else {
          const layerUrl =
            matchedCandidate.layerKey === 'district'
              ? LOS_ANGELES_DISTRICT_LAYER_URL
              : matchedCandidate.layerKey === 'citywide'
                ? LOS_ANGELES_CITYWIDE_LAYER_URL
                : LOS_ANGELES_ELIGIBLE_LAYER_URL;
          const geometryFeature = (
            await fetchArcGisFeatures(layerUrl, 'OBJECTID', {
              includeGeometry: true,
              objectId: matchedCandidate.objectId,
            })
          )[0];

          point = computeGeometryPoint(geometryFeature?.geometry);
          geometryCache.set(cacheKey, point);
        }
      }

      if (point) {
        locationSource = `${matchedCandidate.layerKey}_arcgis_match`;
      }
    }

    if (!point) {
      point = await geocodeLosAngelesSegment(row);
    }

    if (!point) {
      continue;
    }

    normalizedRows.push({
      source: entry.key,
      source_id: buildLosAngelesSourceId(row, matchedCandidate?.segmentId || null),
      type: 'speed_camera',
      latitude: point.latitude,
      longitude: point.longitude,
      confidence: entry.defaultConfidence ?? 0.88,
      verified: true,
      alertEligible: entry.alertPolicy === 'driver_alert',
      alertPolicy: entry.alertPolicy,
      metadata: buildMetadata(
        entry,
        {
          district: row.district,
          street: row.street,
          to: row.to,
          from: row.from,
        },
        {
          road_name: row.street,
          direction: matchedCandidate?.headingDeg != null ? String(matchedCandidate.headingDeg) : null,
          direction_deg: matchedCandidate?.headingDeg ?? null,
          speed_limit: row.speedLimit,
          city: 'Los Angeles',
          program_status: 'proposed_not_live',
          location_source: locationSource,
          district: row.district,
          district_row_index: row.districtRowIndex,
          cross_street_to: row.to,
          cross_street_from: row.from,
          equity_area: row.equityArea,
          school_nearby: row.schoolNearby,
          speed_related_collisions: row.speedRelatedCollisions,
          segment_id: matchedCandidate?.segmentId || null,
          matched_score: bestMatch?.score ?? null,
          matched_layer: matchedCandidate?.layerKey || null,
          source_document_url: LOS_ANGELES_ATTACHMENT_A_URL,
        }
      ),
    });
  }

  return normalizedRows;
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

const processEntry = async (entry: VerifiedGovSourceManifestEntry) => {
  const inputPath = entry.localSamplePath ? resolveInputPath(entry) : null;
  let rows: NormalizedGovernmentRadar[] = [];

  if (entry.normalizerKey === 'legacy_saveddata_json') {
    const savedRows = readLegacySavedDataFile(inputPath!);
    rows = normalizeLegacySavedDataRows(savedRows, entry);
  } else if (entry.normalizerKey === 'complete_us_snapshot_json') {
    const snapshotRows = readCompleteUsSnapshotFile(inputPath!);
    rows = normalizeCompleteUsSnapshotRows(snapshotRows);
  } else if (entry.normalizerKey === 'sf_speed_socrata_json') {
    const socrataFile = readSocrataExportFile(inputPath!);
    rows = normalizeSanFranciscoSpeedRows(socrataFile, entry);
  } else if (entry.normalizerKey === 'sf_red_light_socrata_json') {
    const socrataFile = readSocrataExportFile(inputPath!);
    rows = normalizeSanFranciscoRedLightRows(socrataFile, entry);
  } else if (entry.normalizerKey === 'chicago_speed_socrata_json') {
    const socrataFile = readSocrataExportFile(inputPath!);
    rows = normalizeChicagoSpeedRows(socrataFile, entry);
  } else if (entry.normalizerKey === 'chicago_red_light_socrata_json') {
    const socrataFile = readSocrataExportFile(inputPath!);
    rows = normalizeChicagoRedLightRows(socrataFile, entry);
  } else if (entry.normalizerKey === 'la_speed_safety_attachment_pdf') {
    rows = await normalizeLosAngelesSpeedSafetyRows(entry);
  } else {
    const geoJson = readGeoJsonFile(inputPath!);
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

const main = async () => {
  const options = parseArgs();
  const entries = options.sourceKeys.length
    ? options.sourceKeys
        .map((sourceKey) => {
          const entry = getVerifiedUsGovSource(sourceKey);
          if (!entry) {
            throw new Error(`Unknown source key: ${sourceKey}`);
          }
          if (!entry.localSamplePath && entry.normalizerKey !== 'la_speed_safety_attachment_pdf') {
            throw new Error(`Source ${sourceKey} does not have a local sample file yet.`);
          }
          return entry;
        })
    : getLocalSampleUsGovSources();

  if (entries.length === 0) {
    throw new Error('No local government datasets selected for processing.');
  }

  ensureOutputDir(options.outputDir);

  const processed = await Promise.all(entries.map(processEntry));
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
    console.log(
      `  input: ${item.inputPath ? path.relative(REPO_ROOT, item.inputPath) : item.entry.landingPageUrl}`
    );
    console.log(`  rows: ${item.rows.length} | driver_alert: ${alertable} | map_only: ${mapOnly}`);
  }
  console.log('');
  console.log(`Normalized JSON: ${path.relative(REPO_ROOT, normalizedJsonPath)}`);
  console.log(`Alert-ready JSON: ${path.relative(REPO_ROOT, sqlJsonPath)}`);
  console.log(`Map-only JSON: ${path.relative(REPO_ROOT, mapOnlyJsonPath)}`);
  console.log(`SQL upsert: ${path.relative(REPO_ROOT, sqlPath)}`);
};

main().catch((error) => {
  console.error(`Government camera import failed: ${(error as Error).message}`);
  process.exitCode = 1;
});

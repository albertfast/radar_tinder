import { RadarLocation } from '../types';
import { LocationService } from './LocationService';
import { SupabaseService } from './SupabaseService';
import { useAuthStore } from '../store/authStore';
import { hasProAccess } from '../utils/access';
import { getExternalCameraSourceRule } from '../config/externalCameraSources';
import { describeRadarApproachByDistance } from '../utils/radarAlerts';
import { readBooleanFlag } from '../utils/flags';

type NearbyRadar = RadarLocation & { distance: number };
type RouteRelevanceParams = {
  radar: { latitude: number; longitude: number; distance?: number };
  currentLocation: { latitude: number; longitude: number; heading?: number | null };
  routeCoords: Array<{ latitude: number; longitude: number }>;
  speedKph: number;
  maxCorridorMeters?: number;
  maxHeadingDeltaDeg?: number;
  etaSecondsWindow?: [number, number];
};
type RouteRelevanceResult = {
  routeMatched: boolean;
  corridorDistanceMeters?: number;
  headingDeltaDeg?: number | null;
  etaSeconds: number;
  isRelevant: boolean;
};
type TimedSourceResult<T> = {
  name: string;
  ok: boolean;
  timedOut: boolean;
  durationMs: number;
  value: T | null;
  error?: unknown;
};

type SourceTelemetryPayload = {
  osmCount: number;
  supabaseCount: number;
  mergedCount: number;
  latitude: number;
  longitude: number;
  radiusKm: number;
  sourceLatencyMs: { osm: number; supabase: number };
  sourceTimedOut: { osm: boolean; supabase: boolean };
  sourceErrors: string[];
};

const DEDUPE_THRESHOLD_DEG = 0.0005;
const TIMEOUT_ERROR = '__SOURCE_TIMEOUT__';
const LIVE_OSM_FALLBACK_ENABLED = readBooleanFlag('EXPO_PUBLIC_LIVE_OSM_FALLBACK', __DEV__);

const mergeAndImproveRadars = (radars: RadarLocation[]): RadarLocation[] => {
  const uniqueRadars: RadarLocation[] = [];

  for (const radar of radars) {
    const existingIndex = uniqueRadars.findIndex(
      (item) =>
        Math.abs(item.latitude - radar.latitude) < DEDUPE_THRESHOLD_DEG &&
        Math.abs(item.longitude - radar.longitude) < DEDUPE_THRESHOLD_DEG
    );

    if (existingIndex !== -1) {
      const existing = uniqueRadars[existingIndex];
      const sourceBoost =
        radar.reportedBy !== existing.reportedBy || radar.source !== existing.source ? 0.2 : 0;
      const speedLimit = existing.speedLimit || radar.speedLimit;

      uniqueRadars[existingIndex] = {
        ...existing,
        confidence: Math.min((Number(existing.confidence) || 0.5) + sourceBoost, 1.0),
        speedLimit,
        reports: (existing.reports || 0) + (radar.reports || 1),
        source: existing.source || radar.source,
        sourceKey: existing.sourceKey || radar.sourceKey,
        sourceLabel: existing.sourceLabel || radar.sourceLabel,
        markerKind: existing.markerKind || radar.markerKind,
        lastConfirmed: new Date(),
      };
      continue;
    }

    uniqueRadars.push(radar);
  }

  return uniqueRadars.filter((item) => Number(item.confidence) >= 0.4);
};

const distancePointToSegmentMeters = (
  pointLat: number,
  pointLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number => {
  const toXY = (lat: number, lon: number) => {
    const x = lon * 111320 * Math.cos((lat * Math.PI) / 180);
    const y = lat * 110540;
    return { x, y };
  };

  const p = toXY(pointLat, pointLon);
  const a = toXY(aLat, aLon);
  const b = toXY(bLat, bLon);

  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const denom = abx * abx + aby * aby;
  const t = denom <= 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const dx = p.x - cx;
  const dy = p.y - cy;

  return Math.sqrt(dx * dx + dy * dy);
};

const minDistanceToRouteMetersInternal = (
  radar: { latitude: number; longitude: number },
  routeCoords: Array<{ latitude: number; longitude: number }>
): number => {
  if (!routeCoords.length) return Number.POSITIVE_INFINITY;
  if (routeCoords.length === 1) {
    return (
      LocationService.calculateDistanceSync(
        radar.latitude,
        radar.longitude,
        routeCoords[0].latitude,
        routeCoords[0].longitude
      ) * 1000
    );
  }

  let minMeters = Number.POSITIVE_INFINITY;
  for (let i = 0; i < routeCoords.length - 1; i += 1) {
    const a = routeCoords[i];
    const b = routeCoords[i + 1];
    const d = distancePointToSegmentMeters(
      radar.latitude,
      radar.longitude,
      a.latitude,
      a.longitude,
      b.latitude,
      b.longitude
    );
    if (d < minMeters) minMeters = d;
    if (minMeters <= 120) break;
  }

  return minMeters;
};

const evaluateRouteRelevanceInternal = (
  params: RouteRelevanceParams
): RouteRelevanceResult => {
  const maxCorridorMeters = params.maxCorridorMeters ?? 120;
  const maxHeadingDeltaDeg = params.maxHeadingDeltaDeg ?? 55;
  const etaWindow = params.etaSecondsWindow || [10, 90];

  const distanceKm =
    typeof params.radar.distance === 'number'
      ? params.radar.distance
      : LocationService.calculateDistanceSync(
          params.currentLocation.latitude,
          params.currentLocation.longitude,
          params.radar.latitude,
          params.radar.longitude
        );

  const corridorDistanceMeters =
    params.routeCoords.length > 0
      ? minDistanceToRouteMetersInternal(params.radar, params.routeCoords)
      : undefined;

  const routeMatched =
    corridorDistanceMeters === undefined || corridorDistanceMeters <= maxCorridorMeters;

  let headingDeltaDeg: number | null = null;
  const currentHeading = params.currentLocation.heading;
  if (typeof currentHeading === 'number' && Number.isFinite(currentHeading)) {
    const bearing = LocationService.calculateBearing(
      params.currentLocation.latitude,
      params.currentLocation.longitude,
      params.radar.latitude,
      params.radar.longitude
    );
    const diff = Math.abs((bearing - currentHeading + 540) % 360 - 180);
    headingDeltaDeg = Number(diff.toFixed(1));
  }

  const headingMatched = headingDeltaDeg === null || headingDeltaDeg <= maxHeadingDeltaDeg;
  const safeSpeedKph = Math.max(5, Number.isFinite(params.speedKph) ? params.speedKph : 5);
  const etaSeconds = (distanceKm / safeSpeedKph) * 3600;
  const etaMatched = etaSeconds >= etaWindow[0] && etaSeconds <= etaWindow[1];

  return {
    routeMatched,
    corridorDistanceMeters,
    headingDeltaDeg,
    etaSeconds,
    isRelevant: routeMatched && headingMatched && etaMatched,
  };
};

const filterRouteRelevantRadarsInternal = <
  T extends { distance: number; latitude: number; longitude: number }
>(
  radars: T[],
  params: {
    currentLocation: { latitude: number; longitude: number; heading?: number | null };
    routeCoords: Array<{ latitude: number; longitude: number }>;
    speedKph: number;
    maxCorridorMeters?: number;
    maxHeadingDeltaDeg?: number;
    etaSecondsWindow?: [number, number];
    requireEtaWindow?: boolean;
  }
): Array<T & RouteRelevanceResult> => {
  const requireEtaWindow = params.requireEtaWindow !== false;

  return radars
    .map((radar) => {
      const relevance = evaluateRouteRelevanceInternal({
        radar,
        currentLocation: params.currentLocation,
        routeCoords: params.routeCoords,
        speedKph: params.speedKph,
        maxCorridorMeters: params.maxCorridorMeters,
        maxHeadingDeltaDeg: params.maxHeadingDeltaDeg,
        etaSecondsWindow: requireEtaWindow ? params.etaSecondsWindow : [0, Number.MAX_SAFE_INTEGER],
      });

      return {
        ...radar,
        ...relevance,
      };
    })
    .filter((item) => item.isRelevant)
    .sort((a, b) => a.distance - b.distance);
};

const runTimedSource = async <T>(
  name: string,
  timeoutMs: number,
  loader: () => Promise<T>
): Promise<TimedSourceResult<T>> => {
  const startedAt = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(TIMEOUT_ERROR)), timeoutMs);
  });

  try {
    const value = (await Promise.race([loader(), timeoutPromise])) as T;
    return {
      name,
      ok: true,
      timedOut: false,
      durationMs: Date.now() - startedAt,
      value,
    };
  } catch (error: any) {
    const timedOut =
      error instanceof Error && (error.message === TIMEOUT_ERROR || error.name === 'AbortError');
    return {
      name,
      ok: false,
      timedOut,
      durationMs: Date.now() - startedAt,
      value: null,
      error,
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const buildRouteQuerySamples = (
  routeCoords: Array<{ latitude: number; longitude: number }>,
  spacingMeters: number,
  maxSamples: number
) => {
  if (routeCoords.length <= 1) return routeCoords.slice(0, 1);

  const samples = [routeCoords[0]];
  let distanceSinceLastSample = 0;

  for (let index = 1; index < routeCoords.length - 1; index += 1) {
    const previous = routeCoords[index - 1];
    const current = routeCoords[index];
    distanceSinceLastSample +=
      LocationService.calculateDistanceSync(
        previous.latitude,
        previous.longitude,
        current.latitude,
        current.longitude
      ) * 1000;

    if (distanceSinceLastSample >= spacingMeters) {
      samples.push(current);
      distanceSinceLastSample = 0;
    }
  }

  const lastCoord = routeCoords[routeCoords.length - 1];
  const finalSample = samples[samples.length - 1];
  if (
    !finalSample ||
    finalSample.latitude !== lastCoord.latitude ||
    finalSample.longitude !== lastCoord.longitude
  ) {
    samples.push(lastCoord);
  }

  if (samples.length <= maxSamples) return samples;

  const stride = Math.max(1, Math.ceil((samples.length - 1) / Math.max(1, maxSamples - 1)));
  const compacted = samples.filter((_, index) => index === 0 || index === samples.length - 1 || index % stride === 0);
  return compacted.slice(0, maxSamples - 1).concat(lastCoord);
};

export class RadarService {
  private static OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter',
  ];

  private static SOURCE_TIMEOUT_MS = 1800;
  private static NEARBY_CACHE_TTL_MS = 30000;
  private static NEARBY_CACHE_DISTANCE_KM = 0.5;
  private static SUPABASE_MIN_CONFIDENCE = 0.35;
  private static SOURCE_TELEMETRY_THROTTLE_MS = 20000;
  private static MARKER_TELEMETRY_THROTTLE_MS = 12000;
  private static lastSourceTelemetryAt = 0;
  private static lastMarkerTelemetryAt = 0;

  private static nearbyCache: {
    timestamp: number;
    latitude: number;
    longitude: number;
    radius: number;
    radars: RadarLocation[];
  } | null = null;

  private static inflightNearby: {
    startedAt: number;
    latitude: number;
    longitude: number;
    radius: number;
    promise: Promise<NearbyRadar[]>;
  } | null = null;

  static minDistanceToRouteMeters(
    radar: { latitude: number; longitude: number },
    routeCoords: Array<{ latitude: number; longitude: number }>
  ): number {
    return minDistanceToRouteMetersInternal(radar, routeCoords);
  }

  static evaluateRouteRelevance(params: RouteRelevanceParams): RouteRelevanceResult {
    return evaluateRouteRelevanceInternal(params);
  }

  static filterRouteRelevantRadars(
    radars: NearbyRadar[],
    params: {
      currentLocation: { latitude: number; longitude: number; heading?: number | null };
      routeCoords: Array<{ latitude: number; longitude: number }>;
      speedKph: number;
      maxCorridorMeters?: number;
      maxHeadingDeltaDeg?: number;
      etaSecondsWindow?: [number, number];
      requireEtaWindow?: boolean;
    }
  ): Array<NearbyRadar & RouteRelevanceResult> {
    return filterRouteRelevantRadarsInternal(radars, params);
  }

  static trackMarkerRenderStats(payload: {
    inputCount: number;
    visibleCount: number;
    renderedCount: number;
    droppedByCap: number;
    routePrioritizedCount: number;
  }) {
    const now = Date.now();
    if (now - this.lastMarkerTelemetryAt < this.MARKER_TELEMETRY_THROTTLE_MS) return;
    this.lastMarkerTelemetryAt = now;
    console.info('[RadarService] marker_render_stats', payload);
  }

  private static logSourceTelemetry(payload: SourceTelemetryPayload) {
    const now = Date.now();
    if (now - this.lastSourceTelemetryAt < this.SOURCE_TELEMETRY_THROTTLE_MS) return;
    this.lastSourceTelemetryAt = now;
    console.info('[RadarService] source_stats', payload);
  }

  private static shouldSuppressTrafficSignalNoise(tags: any): boolean {
    if (!tags) return false;
    const enforcement = String(tags.enforcement || '').toLowerCase();
    const cameraType = String(tags['camera:type'] || '').toLowerCase();
    const highway = String(tags.highway || '').toLowerCase();
    const hasSpeedSignal =
      enforcement === 'maxspeed' ||
      enforcement === 'speed' ||
      cameraType.includes('speed') ||
      highway === 'speed_camera';

    return enforcement === 'traffic_signals' && !hasSpeedSignal;
  }

  private static isTrapRestrictedForFree(type: RadarLocation['type']): boolean {
    return type === 'police' || type === 'mobile' || type === 'traffic_enforcement';
  }

  private static parseMaxspeed(tags: any): number | undefined {
    const raw = String(tags?.maxspeed || '').trim().toLowerCase();
    if (!raw) return undefined;
    const m = raw.match(/(\d{2,3})/);
    if (!m) return undefined;
    const value = Number(m[1]);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  private static normalizeRadarType(input: any): RadarLocation['type'] {
    const value = String(input || '').toLowerCase();
    if (value === 'fixed') return 'fixed';
    if (value === 'mobile') return 'mobile';
    if (value === 'red_light') return 'red_light';
    if (value === 'speed_camera') return 'speed_camera';
    if (value === 'police') return 'police';
    if (value === 'traffic_enforcement') return 'traffic_enforcement';
    return 'speed_camera';
  }

  private static getMarkerKind(type: RadarLocation['type']): RadarLocation['markerKind'] {
    if (type === 'red_light') return 'red_light';
    if (type === 'police') return 'police';
    if (type === 'mobile') return 'mobile';
    if (type === 'traffic_enforcement') return 'traffic_enforcement';
    return 'camera';
  }

  private static normalizeSourceMetadata(row: any): {
    source: RadarLocation['source'];
    sourceKey?: string;
    sourceLabel?: string;
    reportedBy: string;
  } {
    const rawSource = String(row?.source || '').trim().toLowerCase();
    const rawId = String(row?.id || '').trim();

    let source: RadarLocation['source'] = 'community';
    let sourceKey: string | undefined;

    if (rawId.startsWith('external:')) {
      const [, inferredSourceKey] = rawId.split(':');
      sourceKey = inferredSourceKey || undefined;
      source = sourceKey === 'osm' ? 'external_osm' : 'external';
    } else if (rawSource === 'external_osm' || rawSource === 'osm') {
      source = 'external_osm';
      sourceKey = 'osm';
    } else if (rawSource && rawSource !== 'community') {
      source = 'external';
      sourceKey = rawSource;
    }

    const rule = getExternalCameraSourceRule(sourceKey);
    const sourceLabel =
      source === 'community'
        ? 'Community reports'
        : rule?.label || (source === 'external_osm' ? 'External OSM Dataset' : 'External camera feed');

    return {
      source,
      sourceKey,
      sourceLabel,
      reportedBy: source === 'community' ? 'user' : sourceLabel,
    };
  }

  private static withRadarMetadata(radar: RadarLocation): RadarLocation {
    return {
      ...radar,
      markerKind: radar.markerKind || this.getMarkerKind(radar.type),
      sourceLabel: radar.sourceLabel || radar.reportedBy,
      etaConfidence: radar.etaConfidence || 'unknown',
    };
  }

  private static mapOsmElementToRadar(element: any): RadarLocation | null {
    const lat = element?.lat ?? element?.center?.lat;
    const lon = element?.lon ?? element?.center?.lon ?? element?.center?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const tags = element?.tags || {};
    if (this.shouldSuppressTrafficSignalNoise(tags)) {
      return null;
    }

    let type: RadarLocation['type'] = 'speed_camera';
    if (tags?.enforcement === 'traffic_signals') {
      type = 'red_light';
    }

    return this.withRadarMetadata({
      id: `osm-${element.id}`,
      latitude: Number(lat),
      longitude: Number(lon),
      type,
      speedLimit: this.parseMaxspeed(tags),
      confidence: 1.0,
      source: 'external_osm',
      sourceKey: 'osm',
      sourceLabel: 'OpenStreetMap Cameras',
      lastConfirmed: new Date(),
      reportedBy: 'OpenStreetMap',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  private static mapSupabaseRadar(row: any): RadarLocation | null {
    const latitude = Number(row?.latitude);
    const longitude = Number(row?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    const sourceMeta = this.normalizeSourceMetadata(row);
    const sourceRule = getExternalCameraSourceRule(sourceMeta.sourceKey);
    if (sourceRule?.alertPolicy === 'map_only' || sourceRule?.alertPolicy === 'ignore') {
      return null;
    }
    const confidence = Number(row?.confidence);
    return this.withRadarMetadata({
      id: String(
        row?.id || `${sourceMeta.source}:${latitude.toFixed(5)}:${longitude.toFixed(5)}`
      ),
      latitude,
      longitude,
      type: this.normalizeRadarType(row?.type),
      confidence:
        Number.isFinite(confidence)
          ? confidence
          : sourceMeta.source === 'community'
            ? 0.55
            : 0.85,
      verified: Boolean(row?.verified),
      source: sourceMeta.source,
      sourceKey: sourceMeta.sourceKey,
      sourceLabel: sourceMeta.sourceLabel,
      lastConfirmed: new Date(),
      reportedBy: sourceMeta.reportedBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  private static async fetchSupabaseRadarsAlongRoute(
    routeCoords: { latitude: number; longitude: number }[]
  ): Promise<RadarLocation[]> {
    const samples = buildRouteQuerySamples(routeCoords, 9000, 10);
    const sampleRadiusMeters = 7000;
    const sampleResults = await Promise.all(
      samples.map((coord) =>
        SupabaseService.getNearbyRadars(coord.latitude, coord.longitude, sampleRadiusMeters, {
          minConfidence: this.SUPABASE_MIN_CONFIDENCE,
          verifiedOnly: true,
          throwOnError: true,
        })
      )
    );

    const radars = sampleResults
      .flat()
      .map((row: any) => this.mapSupabaseRadar(row))
      .filter((item: RadarLocation | null): item is RadarLocation => Boolean(item));

    return radars.filter(
      (radar) => minDistanceToRouteMetersInternal(radar, routeCoords) <= 220
    );
  }

  private static withNearbyDistance(
    radar: RadarLocation,
    latitude: number,
    longitude: number
  ): NearbyRadar {
    const distance = LocationService.calculateDistanceSync(
      latitude,
      longitude,
      radar.latitude,
      radar.longitude
    );
    return {
      ...radar,
      distance,
      approachLabel: describeRadarApproachByDistance(distance),
      etaConfidence: radar.etaConfidence || 'unknown',
    };
  }

  static async fetchRealRadarsFromOSM(
    latitude: number,
    longitude: number,
    radiusKm: number = 10
  ): Promise<RadarLocation[]> {
    const radiusMeters = Math.min(radiusKm * 1000, 10000);
    const query = `
      [out:json][timeout:30];
      (
        node["highway"="speed_camera"](around:${radiusMeters},${latitude},${longitude});
        node["enforcement"="maxspeed"](around:${radiusMeters},${latitude},${longitude});
        node["enforcement"="speed"](around:${radiusMeters},${latitude},${longitude});
        node["enforcement"="traffic_signals"](around:${radiusMeters},${latitude},${longitude});
        node["highway"="traffic_signals"]["camera:type"](around:${radiusMeters},${latitude},${longitude});
        way["highway"="speed_camera"](around:${radiusMeters},${latitude},${longitude});
        way["enforcement"="maxspeed"](around:${radiusMeters},${latitude},${longitude});
        way["enforcement"="speed"](around:${radiusMeters},${latitude},${longitude});
        way["enforcement"="traffic_signals"](around:${radiusMeters},${latitude},${longitude});
        relation["enforcement"="maxspeed"](around:${radiusMeters},${latitude},${longitude});
        relation["enforcement"="speed"](around:${radiusMeters},${latitude},${longitude});
      );
      out center;
    `;

    for (const baseUrl of this.OVERPASS_MIRRORS) {
      try {
        const url = `${baseUrl}?data=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'RadarDetectorApp/1.0',
          },
        });

        if (!response.ok) {
          if (response.status !== 429 && response.status !== 504) {
            console.warn(`OSM Mirror ${baseUrl} failed with status: ${response.status}`);
          }
          continue;
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          continue;
        }

        const data = await response.json();
        const elements = Array.isArray(data?.elements) ? data.elements : [];
        const mapped = elements
          .map((el: any) => this.mapOsmElementToRadar(el))
          .filter((item: RadarLocation | null): item is RadarLocation => Boolean(item));
        if (mapped.length > 0) {
          return mapped;
        }
      } catch (error: any) {
        console.warn(`Error with OSM mirror ${baseUrl}:`, error?.message || error);
      }
    }

    return [];
  }

  private static async fetchRouteRadarsFromOSM(
    routeCoords: { latitude: number; longitude: number }[]
  ): Promise<RadarLocation[]> {
    if (routeCoords.length === 0) return [];

    let minLat = routeCoords[0].latitude;
    let maxLat = routeCoords[0].latitude;
    let minLon = routeCoords[0].longitude;
    let maxLon = routeCoords[0].longitude;

    for (const coord of routeCoords) {
      if (coord.latitude < minLat) minLat = coord.latitude;
      if (coord.latitude > maxLat) maxLat = coord.latitude;
      if (coord.longitude < minLon) minLon = coord.longitude;
      if (coord.longitude > maxLon) maxLon = coord.longitude;
    }

    const buffer = 0.05;
    const bbox = `${minLat - buffer},${minLon - buffer},${maxLat + buffer},${maxLon + buffer}`;

    const query = `
      [out:json][timeout:30];
      (
        node["highway"="speed_camera"](${bbox});
        node["enforcement"="maxspeed"](${bbox});
        node["enforcement"="speed"](${bbox});
        node["enforcement"="traffic_signals"](${bbox});
        node["highway"="traffic_signals"]["camera:type"](${bbox});
        way["highway"="speed_camera"](${bbox});
        way["enforcement"="maxspeed"](${bbox});
        way["enforcement"="speed"](${bbox});
        way["enforcement"="traffic_signals"](${bbox});
        relation["enforcement"="maxspeed"](${bbox});
      );
      out center;
    `;

    for (const baseUrl of this.OVERPASS_MIRRORS) {
      try {
        const url = `${baseUrl}?data=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        if (!response.ok) continue;

        const data = await response.json();
        const elements = Array.isArray(data?.elements) ? data.elements : [];

        const radars = elements
          .map((el: any) => this.mapOsmElementToRadar(el))
          .filter((item: RadarLocation | null): item is RadarLocation => Boolean(item));

        return radars.filter(
          (radar: RadarLocation) => minDistanceToRouteMetersInternal(radar, routeCoords) <= 120
        );
      } catch (error) {
        console.warn(`Error fetching route radars from ${baseUrl}:`, error);
      }
    }

    return [];
  }

  static async getRadarsAlongRoute(
    routeCoords: { latitude: number; longitude: number }[]
  ): Promise<RadarLocation[]> {
    if (routeCoords.length === 0) return [];

    const supabaseSource = await runTimedSource('supabase', this.SOURCE_TIMEOUT_MS, () =>
      this.fetchSupabaseRadarsAlongRoute(routeCoords)
    );
    const shouldQueryLiveOsm = LIVE_OSM_FALLBACK_ENABLED || !supabaseSource.ok;
    const osmSource = shouldQueryLiveOsm
      ? await runTimedSource('osm', this.SOURCE_TIMEOUT_MS, () =>
          this.fetchRouteRadarsFromOSM(routeCoords)
        )
      : ({
          name: 'osm',
          ok: true,
          timedOut: false,
          durationMs: 0,
          value: [],
        } as TimedSourceResult<RadarLocation[]>);

    const supabaseRadars =
      supabaseSource.ok && Array.isArray(supabaseSource.value) ? supabaseSource.value : [];
    const osmRadars = osmSource.ok && Array.isArray(osmSource.value) ? osmSource.value : [];

    const sourceErrors: string[] = [];
    if (!supabaseSource.ok) {
      sourceErrors.push(supabaseSource.timedOut ? 'supabase_timeout' : 'supabase_error');
    }
    if (shouldQueryLiveOsm && !osmSource.ok) {
      sourceErrors.push(osmSource.timedOut ? 'osm_timeout' : 'osm_error');
    }

    this.logSourceTelemetry({
      osmCount: osmRadars.length,
      supabaseCount: supabaseRadars.length,
      mergedCount: mergeAndImproveRadars([...supabaseRadars, ...osmRadars]).length,
      latitude: routeCoords[0]?.latitude ?? 0,
      longitude: routeCoords[0]?.longitude ?? 0,
      radiusKm: 0,
      sourceLatencyMs: {
        osm: osmSource.durationMs,
        supabase: supabaseSource.durationMs,
      },
      sourceTimedOut: {
        osm: shouldQueryLiveOsm ? osmSource.timedOut : false,
        supabase: supabaseSource.timedOut,
      },
      sourceErrors,
    });

    return mergeAndImproveRadars([...supabaseRadars, ...osmRadars]).map((radar) =>
      this.withRadarMetadata(radar)
    );
  }

  private static getCachedNearbyRadars(
    latitude: number,
    longitude: number,
    radius: number
  ): NearbyRadar[] | null {
    if (!this.nearbyCache) return null;

    const ageMs = Date.now() - this.nearbyCache.timestamp;
    if (ageMs > this.NEARBY_CACHE_TTL_MS) return null;
    if (radius > this.nearbyCache.radius) return null;

    const distanceKm = LocationService.calculateDistanceSync(
      latitude,
      longitude,
      this.nearbyCache.latitude,
      this.nearbyCache.longitude
    );
    if (distanceKm > this.NEARBY_CACHE_DISTANCE_KM) return null;

    const nearbyRadars: NearbyRadar[] = [];
    for (const radar of this.nearbyCache.radars) {
      const nearbyRadar = this.withNearbyDistance(radar, latitude, longitude);
      if (nearbyRadar.distance <= radius) {
        nearbyRadars.push(nearbyRadar);
      }
    }

    return nearbyRadars.sort((a, b) => a.distance - b.distance);
  }

  static async getNearbyRadars(
    latitude: number,
    longitude: number,
    radius: number = 10
  ): Promise<NearbyRadar[]> {
    try {
      const cached = this.getCachedNearbyRadars(latitude, longitude, radius);
      if (cached) return cached;

      if (this.inflightNearby) {
        const inflightAgeMs = Date.now() - this.inflightNearby.startedAt;
        const inflightDistanceKm = LocationService.calculateDistanceSync(
          latitude,
          longitude,
          this.inflightNearby.latitude,
          this.inflightNearby.longitude
        );

        if (
          inflightAgeMs <= this.NEARBY_CACHE_TTL_MS &&
          inflightDistanceKm <= this.NEARBY_CACHE_DISTANCE_KM &&
          radius <= this.inflightNearby.radius
        ) {
          const inflightResult = await this.inflightNearby.promise.catch(() => null);
          const cachedAfter = this.getCachedNearbyRadars(latitude, longitude, radius);
          if (cachedAfter) return cachedAfter;

          if (inflightResult) {
            return inflightResult
              .map((item) => this.withNearbyDistance(item, latitude, longitude))
              .filter((item) => item.distance <= radius)
              .sort((a, b) => a.distance - b.distance);
          }
        }
      }

      const request = (async () => {
        const supabaseSource = await runTimedSource('supabase', this.SOURCE_TIMEOUT_MS, () =>
          SupabaseService.getNearbyRadars(latitude, longitude, radius * 1000, {
            minConfidence: this.SUPABASE_MIN_CONFIDENCE,
            verifiedOnly: true,
            throwOnError: true,
          })
        );
        const shouldQueryLiveOsm = LIVE_OSM_FALLBACK_ENABLED || !supabaseSource.ok;
        const osmSource = shouldQueryLiveOsm
          ? await runTimedSource('osm', this.SOURCE_TIMEOUT_MS, () =>
              this.fetchRealRadarsFromOSM(latitude, longitude, radius)
            )
          : ({
              name: 'osm',
              ok: true,
              timedOut: false,
              durationMs: 0,
              value: [],
            } as TimedSourceResult<RadarLocation[]>);

        const osmRadars = osmSource.ok && Array.isArray(osmSource.value) ? osmSource.value : [];
        const supabaseRows =
          supabaseSource.ok && Array.isArray(supabaseSource.value) ? supabaseSource.value : [];
        const mappedSupabaseRadars: RadarLocation[] = supabaseRows
          .map((row: any) => this.mapSupabaseRadar(row))
          .filter((item: RadarLocation | null): item is RadarLocation => Boolean(item));

        const user = useAuthStore.getState().user;
        const isPro = hasProAccess(user);
        const allowRestrictedTrapTypes = isPro || __DEV__;

        const allRadars: RadarLocation[] = [...osmRadars, ...mappedSupabaseRadars];
        const processedRadars = mergeAndImproveRadars(allRadars).map((radar) =>
          this.withRadarMetadata(radar)
        );

        const sourceErrors: string[] = [];
        if (shouldQueryLiveOsm && !osmSource.ok) {
          sourceErrors.push(osmSource.timedOut ? 'osm_timeout' : 'osm_error');
        }
        if (!supabaseSource.ok) {
          sourceErrors.push(supabaseSource.timedOut ? 'supabase_timeout' : 'supabase_error');
        }

        this.logSourceTelemetry({
          osmCount: osmRadars.length,
          supabaseCount: mappedSupabaseRadars.length,
          mergedCount: processedRadars.length,
          latitude,
          longitude,
          radiusKm: radius,
          sourceLatencyMs: {
            osm: osmSource.durationMs,
            supabase: supabaseSource.durationMs,
          },
          sourceTimedOut: {
            osm: osmSource.timedOut,
            supabase: supabaseSource.timedOut,
          },
          sourceErrors,
        });

        this.nearbyCache = {
          timestamp: Date.now(),
          latitude,
          longitude,
          radius,
          radars: processedRadars.filter((item) => {
            if (allowRestrictedTrapTypes) return true;
            return !this.isTrapRestrictedForFree(item.type);
          }),
        };

        const nearbyRadars: NearbyRadar[] = [];
        for (const radar of this.nearbyCache.radars) {
          const nearbyRadar = this.withNearbyDistance(radar, latitude, longitude);
          if (nearbyRadar.distance <= radius) {
            nearbyRadars.push(nearbyRadar);
          }
        }

        return nearbyRadars.sort((a, b) => a.distance - b.distance);
      })();

      this.inflightNearby = {
        startedAt: Date.now(),
        latitude,
        longitude,
        radius,
        promise: request,
      };

      try {
        return await request;
      } finally {
        if (this.inflightNearby?.promise === request) {
          this.inflightNearby = null;
        }
      }
    } catch (error) {
      console.error('Error getting nearby radars:', error);
      return [];
    }
  }

  static async reportRadarLocation(
    radarData: Omit<RadarLocation, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<RadarLocation> {
    const result = (await SupabaseService.reportRadar({
      latitude: radarData.latitude,
      longitude: radarData.longitude,
      type: radarData.type,
      confidence: radarData.confidence,
      reportedBy: radarData.reportedBy,
    })) as any;

    if (!result) {
      throw new Error('Failed to submit radar report');
    }

    this.nearbyCache = null;

    return this.withRadarMetadata({
      id: result?.radarId || `user-${Date.now()}`,
      latitude: radarData.latitude,
      longitude: radarData.longitude,
      type: radarData.type,
      confidence: radarData.confidence,
      source: 'community',
      sourceLabel: 'Community reports',
      lastConfirmed: radarData.lastConfirmed,
      reportedBy: radarData.reportedBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  static async confirmRadarLocation(
    radarId: string,
    _userId: string
  ): Promise<RadarLocation> {
    const radar = (await this.getNearbyRadars(0, 0, 100)).find((item) => item.id === radarId);
    if (!radar) throw new Error('Radar not found');
    return radar;
  }

  static async getRadarStatistics(): Promise<{
    totalRadars: number;
    byType: Record<string, number>;
    averageConfidence: number;
  }> {
    return {
      totalRadars: 0,
      byType: {},
      averageConfidence: 0,
    };
  }
}

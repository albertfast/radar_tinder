import { RadarLocation } from '../types';
import { LocationService } from './LocationService';
import { GoogleMapsService } from './GoogleMapsService';
import { SupabaseService } from './SupabaseService';
import { useAuthStore } from '../store/authStore';
import { hasProAccess } from '../utils/access';

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

export class RadarService {
  private static OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter',
  ];

  private static NEARBY_CACHE_TTL_MS = 30000;
  private static NEARBY_CACHE_DISTANCE_KM = 0.5;
  private static SUPABASE_MIN_CONFIDENCE = 0.55;
  private static SOURCE_TELEMETRY_THROTTLE_MS = 20000;
  private static lastSourceTelemetryAt = 0;

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

  private static distancePointToSegmentMeters(
    pointLat: number,
    pointLon: number,
    aLat: number,
    aLon: number,
    bLat: number,
    bLon: number
  ): number {
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
  }

  static minDistanceToRouteMeters(
    radar: { latitude: number; longitude: number },
    routeCoords: Array<{ latitude: number; longitude: number }>
  ): number {
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
      const d = this.distancePointToSegmentMeters(
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
  }

  private static logSourceTelemetry(payload: {
    osmCount: number;
    supabaseCount: number;
    googleCount: number;
    mergedCount: number;
    latitude: number;
    longitude: number;
    radiusKm: number;
  }) {
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

  private static parseMaxspeed(tags: any): number | undefined {
    const raw = String(tags?.maxspeed || '').trim().toLowerCase();
    if (!raw) return undefined;
    const m = raw.match(/(\d{2,3})/);
    if (!m) return undefined;
    const value = Number(m[1]);
    return Number.isFinite(value) && value > 0 ? value : undefined;
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
    } else if (tags?.enforcement === 'maxspeed') {
      type = 'fixed';
    }

    return {
      id: `osm-${element.id}`,
      latitude: Number(lat),
      longitude: Number(lon),
      type,
      speedLimit: this.parseMaxspeed(tags),
      confidence: 1.0,
      lastConfirmed: new Date(),
      reportedBy: 'OpenStreetMap',
      createdAt: new Date(),
      updatedAt: new Date(),
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

  static async getRadarsAlongRoute(
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

        const filteredRadars: RadarLocation[] = [];
        for (const radar of radars) {
          const corridorMeters = this.minDistanceToRouteMeters(radar, routeCoords);
          if (corridorMeters <= 120) {
            filteredRadars.push(radar);
          }
        }

        return filteredRadars;
      } catch (error) {
        console.warn(`Error fetching route radars from ${baseUrl}:`, error);
      }
    }

    return [];
  }

  static evaluateRouteRelevance(params: RouteRelevanceParams): RouteRelevanceResult {
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
        ? this.minDistanceToRouteMeters(params.radar, params.routeCoords)
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

    const headingMatched =
      headingDeltaDeg === null || headingDeltaDeg <= maxHeadingDeltaDeg;

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
    const requireEtaWindow = params.requireEtaWindow !== false;

    return radars
      .map((radar) => {
        const relevance = this.evaluateRouteRelevance({
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
      const distance = LocationService.calculateDistanceSync(
        latitude,
        longitude,
        radar.latitude,
        radar.longitude
      );
      if (distance <= radius) {
        nearbyRadars.push({ ...radar, distance });
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
              .map((r) => ({
                ...r,
                distance: LocationService.calculateDistanceSync(
                  latitude,
                  longitude,
                  r.latitude,
                  r.longitude
                ),
              }))
              .filter((r) => r.distance <= radius)
              .sort((a, b) => a.distance - b.distance);
          }
        }
      }

      const request = (async () => {
        const [osmResult, supabaseResult, googlePlacesResult] = await Promise.allSettled([
          this.fetchRealRadarsFromOSM(latitude, longitude, radius),
          SupabaseService.getNearbyRadars(latitude, longitude, radius * 1000, {
            minConfidence: this.SUPABASE_MIN_CONFIDENCE,
            verifiedOnly: true,
          }),
          GoogleMapsService.searchNearbyPlaces(latitude, longitude, radius * 1000),
        ]);

        const osmRadars = osmResult.status === 'fulfilled' ? osmResult.value : [];
        const supabaseRadars = supabaseResult.status === 'fulfilled' ? supabaseResult.value : [];
        const googlePlaces = googlePlacesResult.status === 'fulfilled' ? googlePlacesResult.value : [];

        const mappedSupabaseRadars: RadarLocation[] = (supabaseRadars || [])
          .map((r: any) => ({
            id: r.id,
            latitude: r.latitude,
            longitude: r.longitude,
            type: r.type as any,
            confidence: Number(r.confidence) || 0.5,
            verified: Boolean(r.verified),
            lastConfirmed: new Date(),
            reportedBy: 'user',
            createdAt: new Date(),
            updatedAt: new Date(),
          }))
          .filter((r: RadarLocation) => r.type !== 'police');

        const allRadars: RadarLocation[] = [...osmRadars, ...mappedSupabaseRadars];

        for (const place of googlePlaces) {
          const exists = allRadars.some(
            (r) =>
              Math.abs(r.latitude - place.geometry.location.lat) < 0.001 &&
              Math.abs(r.longitude - place.geometry.location.lng) < 0.001
          );
          if (exists) continue;

          if (place.types.includes('police')) continue;

          const hasSpeedSignal =
            place.types.includes('speed_camera') ||
            /speed|radar|camera/i.test(`${place.name || ''} ${place.vicinity || ''}`);
          const isTrafficSignalOnly =
            place.types.includes('traffic_signals') && !hasSpeedSignal;
          if (isTrafficSignalOnly) continue;

          let type: RadarLocation['type'] = 'speed_camera';
          if (place.types.includes('traffic_signals')) {
            type = 'red_light';
          }

          allRadars.push({
            id: `google-${place.place_id}`,
            latitude: place.geometry.location.lat,
            longitude: place.geometry.location.lng,
            type,
            confidence: 0.8,
            lastConfirmed: new Date(),
            reportedBy: 'Google Maps',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        const user = useAuthStore.getState().user;
        const isPro = hasProAccess(user);

        const processedRadars = this.improveAccuracy(allRadars);

        this.logSourceTelemetry({
          osmCount: osmRadars.length,
          supabaseCount: mappedSupabaseRadars.length,
          googleCount: googlePlaces.length,
          mergedCount: processedRadars.length,
          latitude,
          longitude,
          radiusKm: radius,
        });

        this.nearbyCache = {
          timestamp: Date.now(),
          latitude,
          longitude,
          radius,
          radars: processedRadars.filter((r) => {
            if (isPro) return true;
            if (r.type === 'police') return false;
            return true;
          }),
        };

        const nearbyRadars: NearbyRadar[] = [];
        for (const radar of this.nearbyCache.radars) {
          const straightDistance = LocationService.calculateDistanceSync(
            latitude,
            longitude,
            radar.latitude,
            radar.longitude
          );

          if (straightDistance <= radius) {
            nearbyRadars.push({
              ...radar,
              distance: straightDistance,
            });
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

  private static improveAccuracy(radars: RadarLocation[]): RadarLocation[] {
    const uniqueRadars: RadarLocation[] = [];
    const threshold = 0.0005;

    for (const radar of radars) {
      const existingIndex = uniqueRadars.findIndex(
        (r) =>
          Math.abs(r.latitude - radar.latitude) < threshold &&
          Math.abs(r.longitude - radar.longitude) < threshold
      );

      if (existingIndex !== -1) {
        const existing = uniqueRadars[existingIndex];
        const newConfidence =
          radar.reportedBy !== existing.reportedBy
            ? Math.min(existing.confidence + 0.2, 1.0)
            : existing.confidence;
        const speedLimit = existing.speedLimit || radar.speedLimit;

        uniqueRadars[existingIndex] = {
          ...existing,
          confidence: newConfidence,
          speedLimit,
          reports: (existing.reports || 0) + (radar.reports || 1),
          lastConfirmed: new Date(),
        };
      } else {
        uniqueRadars.push(radar);
      }
    }

    return uniqueRadars.filter((r) => r.confidence >= 0.4 && r.type !== 'police');
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

    return {
      id: result?.radarId || `user-${Date.now()}`,
      latitude: radarData.latitude,
      longitude: radarData.longitude,
      type: radarData.type,
      confidence: radarData.confidence,
      lastConfirmed: radarData.lastConfirmed,
      reportedBy: radarData.reportedBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  static async confirmRadarLocation(
    radarId: string,
    _userId: string
  ): Promise<RadarLocation> {
    const radar = (await this.getNearbyRadars(0, 0, 100)).find((r) => r.id === radarId);
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

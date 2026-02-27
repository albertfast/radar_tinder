import { RadarLocation } from '../types';
import { LocationService } from './LocationService';
import { GoogleMapsService } from './GoogleMapsService';
import { SupabaseService } from './SupabaseService';
import { useAuthStore } from '../store/authStore';
import { hasProAccess } from '../utils/access';

// Real-time radar data service

export class RadarService {
  // Use a more reliable mirror list
  private static OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter'
  ];
  private static NEARBY_CACHE_TTL_MS = 30000;
  private static NEARBY_CACHE_DISTANCE_KM = 0.5;
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
    promise: Promise<(RadarLocation & { distance: number })[]>;
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

  private static minDistanceToRouteMeters(
    radar: { latitude: number; longitude: number },
    routeCoords: { latitude: number; longitude: number }[]
  ): number {
    if (routeCoords.length < 2) {
      return (
        LocationService.calculateDistanceSync(
          radar.latitude,
          radar.longitude,
          routeCoords[0]?.latitude || radar.latitude,
          routeCoords[0]?.longitude || radar.longitude
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

  /**
   * Fetches real radar data from OpenStreetMap using Overpass API
   */
  static async fetchRealRadarsFromOSM(latitude: number, longitude: number, radiusKm: number = 10): Promise<RadarLocation[]> {
    const radiusMeters = Math.min(radiusKm * 1000, 10000); // Cap at 10km for coverage/perf
    
    // Expanded query to include more enforcement types
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
            'Accept': 'application/json',
            'User-Agent': 'RadarDetectorApp/1.0'
          }
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
        if (!data || !data.elements) continue;

        return data.elements.map((el: any) => {
          const lat = el.lat ?? el.center?.lat;
          const lon = el.lon ?? el.center?.lon ?? el.center?.lng;
          if (lat === undefined || lon === undefined) return null;
          let type: RadarLocation['type'] = 'speed_camera';
          
          if (el.tags?.enforcement === 'traffic_signals') {
            type = 'red_light';
          } else if (el.tags?.enforcement === 'maxspeed') {
            type = 'fixed';
          }

          return {
            id: `osm-${el.id}`,
            latitude: lat,
            longitude: lon,
            type,
            speedLimit: el.tags?.maxspeed ? parseInt(el.tags.maxspeed) : undefined,
            confidence: 1.0,
            lastConfirmed: new Date(),
            reportedBy: 'OpenStreetMap',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }).filter(Boolean) as RadarLocation[];
      } catch (error) {
        console.warn(`Error with OSM mirror ${baseUrl}:`, (error as any).message);
      }
    }

    return [];
  }

  /**
   * Fetches radars along a route by querying a bounding box and filtering
   */
  static async getRadarsAlongRoute(routeCoords: {latitude: number, longitude: number}[]): Promise<RadarLocation[]> {
    if (routeCoords.length === 0) return [];

    // 1. Calculate bounding box
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

    // Add a larger buffer (approx 5km)
    const buffer = 0.05;
    const bbox = `${minLat - buffer},${minLon - buffer},${maxLat + buffer},${maxLon + buffer}`;

    // 2. Query OSM for the entire bounding box
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
        if (!data || !data.elements) continue;

        const radars = data.elements.map((el: any) => {
          let type: RadarLocation['type'] = 'speed_camera';
          if (el.tags?.enforcement === 'traffic_signals') type = 'red_light';
          else if (el.tags?.enforcement === 'maxspeed') type = 'fixed';

          return {
            id: `osm-${el.id}`,
            latitude: el.lat || (el.center ? el.center.lat : 0),
            longitude: el.lon || (el.center ? el.center.lng : 0),
            type,
            speedLimit: el.tags?.maxspeed ? parseInt(el.tags.maxspeed) : undefined,
            confidence: 1.0,
            lastConfirmed: new Date(),
            reportedBy: 'OpenStreetMap',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }).filter((radar: RadarLocation) => radar.type !== 'police');

        // 3. Filter radars that are actually near the route corridor (within 120m)
        const filteredRadars: RadarLocation[] = [];
        for (const radar of radars) {
          const corridorMeters = this.minDistanceToRouteMeters(radar, routeCoords);
          if (corridorMeters <= 120) filteredRadars.push(radar);
        }

        return filteredRadars;
      } catch (error) {
        console.warn(`Error fetching route radars from ${baseUrl}:`, error);
      }
    }

    return [];
  }

  private static getCachedNearbyRadars(
    latitude: number,
    longitude: number,
    radius: number
  ): (RadarLocation & { distance: number })[] | null {
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

    const nearbyRadars: (RadarLocation & { distance: number })[] = [];
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
  ): Promise<(RadarLocation & { distance: number })[]> {
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
                distance: LocationService.calculateDistanceSync(latitude, longitude, r.latitude, r.longitude),
              }))
              .filter((r) => r.distance <= radius)
              .sort((a, b) => a.distance - b.distance);
          }
        }
      }

      const request = (async () => {
        const [osmResult, supabaseResult, googlePlacesResult] = await Promise.allSettled([
          this.fetchRealRadarsFromOSM(latitude, longitude, radius),
          SupabaseService.getNearbyRadars(latitude, longitude, radius * 1000),
          GoogleMapsService.searchNearbyPlaces(latitude, longitude, radius * 1000),
        ]);

        const osmRadars = osmResult.status === 'fulfilled' ? osmResult.value : [];
        const supabaseRadars = supabaseResult.status === 'fulfilled' ? supabaseResult.value : [];
        const googlePlaces = googlePlacesResult.status === 'fulfilled' ? googlePlacesResult.value : [];

        // Map Supabase radars to RadarLocation type
        const mappedSupabaseRadars: RadarLocation[] = (supabaseRadars || [])
          .map((r: any) => ({
            id: r.id,
            latitude: r.latitude,
            longitude: r.longitude,
            type: r.type as any,
            confidence: r.confidence,
            lastConfirmed: new Date(), // Ideally from DB
            reportedBy: 'user', // Ideally from DB
            createdAt: new Date(), // Ideally from DB
            updatedAt: new Date(),
          }))
          .filter((r: RadarLocation) => r.type !== 'police');

        let allRadars: RadarLocation[] = [...osmRadars, ...mappedSupabaseRadars];

        // 2. Process Google Places results
        for (const place of googlePlaces) {
          const exists = allRadars.some(r => 
            Math.abs(r.latitude - place.geometry.location.lat) < 0.001 &&
            Math.abs(r.longitude - place.geometry.location.lng) < 0.001
          );

          if (!exists) {
            if (place.types.includes('police')) {
              continue;
            }
            let type: RadarLocation['type'] = 'speed_camera';
            
            if (place.types.includes('traffic_signals')) {
              type = 'red_light';
            }

            const newRadar: RadarLocation = {
              id: `google-${place.place_id}`,
              latitude: place.geometry.location.lat,
              longitude: place.geometry.location.lng,
              type,
              confidence: 0.8,
              lastConfirmed: new Date(),
              reportedBy: 'Google Maps',
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            allRadars.push(newRadar);
          }
        }

        // 3. Apply Accuracy Scoring & Deduplication & FEATURE GATING
        const user = useAuthStore.getState().user;
        const isPro = hasProAccess(user);

        let processedRadars = this.improveAccuracy(allRadars);

        this.nearbyCache = {
          timestamp: Date.now(),
          latitude,
          longitude,
          radius,
          radars: processedRadars.filter(r => {
               // SHOW ALL FOR PRO/ADMIN
               if (isPro) return true;
               
               // STRICTLY HIDE POLICE per user feedback
               if (r.type === 'police') return false;
               
               return true;
          }),
        };

        // 4. Calculate precise distances and sort
        const nearbyRadars: (RadarLocation & { distance: number })[] = [];
        
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

        // Sort by distance (closest first)
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

  /**
   * Merges duplicate radars and calculates a confidence score
   */
  private static improveAccuracy(radars: RadarLocation[]): RadarLocation[] {
    const uniqueRadars: RadarLocation[] = [];
    const threshold = 0.0005; // ~50 meters

    for (const radar of radars) {
      const existingIndex = uniqueRadars.findIndex(r => 
        Math.abs(r.latitude - radar.latitude) < threshold &&
        Math.abs(r.longitude - radar.longitude) < threshold
      );

      if (existingIndex !== -1) {
        // Merge logic: Boost confidence if multiple sources report same location
        const existing = uniqueRadars[existingIndex];
        
        // Boost confidence
        let newConfidence = existing.confidence;
        if (radar.reportedBy !== existing.reportedBy) {
           newConfidence = Math.min(existing.confidence + 0.2, 1.0);
        }

        // Prefer data with speed limit
        const speedLimit = existing.speedLimit || radar.speedLimit;

        uniqueRadars[existingIndex] = {
          ...existing,
          confidence: newConfidence,
          speedLimit,
          reports: (existing.reports || 0) + (radar.reports || 1),
          lastConfirmed: new Date() // Refresh confirmation
        };
      } else {
        uniqueRadars.push(radar);
      }
    }

    // Filter out low confidence user reports and noisy police entries
    return uniqueRadars.filter(r => r.confidence >= 0.4 && r.type !== 'police');
  }

  static async reportRadarLocation(
    radarData: Omit<RadarLocation, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<RadarLocation> {
    const result = await SupabaseService.reportRadar({
      latitude: radarData.latitude,
      longitude: radarData.longitude,
      type: radarData.type,
      confidence: radarData.confidence,
      reportedBy: radarData.reportedBy,
    }) as any;
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
    userId: string
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
    // This would ideally come from a backend
    return {
        totalRadars: 0,
        byType: {},
        averageConfidence: 0
    };
  }
}

import * as Location from 'expo-location';
import { AddressSuggestion } from '../types';
import { NominatimService } from './NominatimService';
import { OSRMService } from './OSRMService';

const GOOGLE_MAPS_RUNTIME_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_SECRET ||
  process.env.GOOGLE_MAPS_API_KEY ||
  '';

const GOOGLE_MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api';
const GOOGLE_ROADS_BASE_URL = 'https://roads.googleapis.com/v1';
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
const SPEED_LIMIT_CACHE_TTL_MS = 120000;
const SPEED_LIMIT_NEGATIVE_CACHE_TTL_MS = 15000;
const SPEED_LIMIT_ROADS_UNAVAILABLE_CACHE_TTL_MS = 30000;
const SUGGESTION_CACHE_TTL_MS = 90000;
const OSM_SPEED_LIMIT_RADIUS_METERS = 80;

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface PlaceResult {
  place_id: string;
  name: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  types: string[];
  vicinity: string;
}

interface GeocodeSuggestionOptions {
  countryCode?: string;
  focusLocation?: {
    latitude: number;
    longitude: number;
  };
}

interface CoordinateSpeedLimitResult {
  speedLimit: number;
  units: 'KPH' | 'MPH';
  placeId?: string;
  source: 'roads_api' | 'osm' | 'unknown' | 'roads_unavailable';
}

type RouteOptions = {
  alternatives?: boolean;
  prefer?: 'duration' | 'distance';
};

type SpeedLimitCacheEntry = {
  value: CoordinateSpeedLimitResult;
  expiresAt: number;
};

type SuggestionCacheEntry = {
  value: AddressSuggestion[];
  expiresAt: number;
};

export class GoogleMapsService {
  private static speedLimitCache = new Map<string, SpeedLimitCacheEntry>();
  private static geocodeSuggestionCache = new Map<string, SuggestionCacheEntry>();
  private static inflightGeocodeSuggestions = new Map<string, Promise<AddressSuggestion[]>>();

  static async getCoordinatesFromAddress(address: string): Promise<Coordinates | null> {
    const parsed = this.parseCoordinateInput(address);
    if (parsed) {
      return { latitude: parsed.lat, longitude: parsed.lng };
    }

    const query = address.trim();
    if (query.length < 3) return null;

    try {
      const result = await Location.geocodeAsync(query);
      if (result?.length) {
        return {
          latitude: result[0].latitude,
          longitude: result[0].longitude,
        };
      }
    } catch (error) {
      console.warn('[GoogleMapsService] Native geocoding failed:', error);
    }

    try {
      const fallback = await NominatimService.geocode(query);
      if (!fallback) return null;
      return { latitude: fallback.lat, longitude: fallback.lon };
    } catch (error) {
      console.warn('[GoogleMapsService] Nominatim geocoding failed:', error);
      return null;
    }
  }

  static async getReverseGeocoding(latitude: number, longitude: number): Promise<string | null> {
    try {
      const result = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (result?.length) {
        const first = result[0];
        const street = [first.streetNumber, first.street].filter(Boolean).join(' ').trim();
        const parts = [
          street,
          first.city || first.subregion || first.district,
          first.region,
          first.isoCountryCode,
        ].filter(Boolean);
        if (parts.length > 0) {
          return parts.join(', ');
        }
      }
    } catch (error) {
      console.warn('[GoogleMapsService] Native reverse geocoding failed:', error);
    }

    try {
      const fallback = await NominatimService.reverse(latitude, longitude);
      return fallback?.display_name || null;
    } catch (error) {
      console.warn('[GoogleMapsService] Nominatim reverse geocoding failed:', error);
      return null;
    }
  }

  static async getPlaceAutocomplete(input: string): Promise<any[]> {
    const results = await this.getGeocodeSuggestions(input);
    return results.map((item) => ({
      description: item.label,
      place_id: item.id,
      geometry: {
        location: {
          lat: item.latitude,
          lng: item.longitude,
        },
      },
    }));
  }

  static async getGeocodeSuggestions(
    input: string,
    options?: GeocodeSuggestionOptions
  ): Promise<AddressSuggestion[]> {
    const query = input.trim();
    if (query.length < 2) return [];

    const cacheKey = this.buildSuggestionCacheKey(query, options);
    const cached = this.getCachedSuggestions(cacheKey);
    if (cached) return cached;

    const inflight = this.inflightGeocodeSuggestions.get(cacheKey);
    if (inflight) return inflight;

    const request = this.fetchGeocodeSuggestions(query, options)
      .then((results) => {
        this.setCachedSuggestions(cacheKey, results);
        return results;
      })
      .finally(() => {
        this.inflightGeocodeSuggestions.delete(cacheKey);
      });

    this.inflightGeocodeSuggestions.set(cacheKey, request);
    return request;
  }

  static async searchNearbyPlaces(
    latitude: number,
    longitude: number,
    radius: number = 5000,
    keyword: string = 'traffic_camera|speed_trap|speed_camera|safety_camera|red_light_camera|traffic_enforcement'
  ): Promise<PlaceResult[]> {
    if (!GOOGLE_MAPS_RUNTIME_KEY) return [];

    try {
      const url = `${GOOGLE_MAPS_BASE_URL}/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&key=${GOOGLE_MAPS_RUNTIME_KEY}`;
      const response = await fetch(url);
      const data: any = await response.json();

      if (data?.status !== 'OK' || !Array.isArray(data?.results)) {
        if (data?.status && data.status !== 'ZERO_RESULTS') {
          console.warn('[GoogleMapsService] Nearby search failed:', data.status, data.error_message);
        }
        return [];
      }

      return data.results
        .map((item: any) => ({
          place_id: String(item?.place_id || ''),
          name: String(item?.name || ''),
          geometry: {
            location: {
              lat: Number(item?.geometry?.location?.lat),
              lng: Number(item?.geometry?.location?.lng),
            },
          },
          types: Array.isArray(item?.types) ? item.types : [],
          vicinity: String(item?.vicinity || ''),
        }))
        .filter(
          (item: PlaceResult) =>
            Boolean(item.place_id) &&
            Number.isFinite(item.geometry.location.lat) &&
            Number.isFinite(item.geometry.location.lng)
        );
    } catch (error) {
      console.warn('[GoogleMapsService] Nearby search error:', error);
      return [];
    }
  }

  static async getSpeedLimitForCoordinate(
    latitude: number,
    longitude: number
  ): Promise<CoordinateSpeedLimitResult | null> {
    const coordinateKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
    const cached = this.getCachedSpeedLimit(coordinateKey);
    if (cached) return cached;

    let lastGoogleSource: 'unknown' | 'roads_unavailable' = 'unknown';
    if (GOOGLE_MAPS_RUNTIME_KEY) {
      const googleResult = await this.getGoogleRoadSpeedLimit(latitude, longitude);
      if (googleResult.speedLimit > 0) {
        this.setCachedSpeedLimit(coordinateKey, googleResult);
        return googleResult;
      }
      lastGoogleSource = googleResult.source === 'roads_unavailable' ? 'roads_unavailable' : 'unknown';
    }

    const osmResult = await this.getOsmSpeedLimitForCoordinate(latitude, longitude);
    if (osmResult) {
      this.setCachedSpeedLimit(coordinateKey, osmResult);
      return osmResult;
    }

    const result = this.unknownSpeed(GOOGLE_MAPS_RUNTIME_KEY ? lastGoogleSource : 'unknown');
    this.setCachedSpeedLimit(coordinateKey, result);
    return result;
  }

  static async getDirections(
    originLat: number,
    originLng: number,
    destination: string,
    options?: RouteOptions
  ): Promise<any> {
    let googleStatus: string | null = null;
    let googleMessage = '';

    try {
      if (GOOGLE_MAPS_RUNTIME_KEY) {
        const params = new URLSearchParams({
          origin: `${originLat},${originLng}`,
          destination,
          mode: 'driving',
          departure_time: 'now',
          traffic_model: 'best_guess',
          language: 'en',
          key: GOOGLE_MAPS_RUNTIME_KEY,
        });
        if (options?.alternatives) {
          params.append('alternatives', 'true');
        }

        const url = `${GOOGLE_MAPS_BASE_URL}/directions/json?${params.toString()}`;
        const response = await fetch(url);
        const data: any = await response.json();
        googleStatus = data?.status || null;
        googleMessage = data?.error_message || '';

        if (googleStatus === 'OK' && Array.isArray(data?.routes) && data.routes.length > 0) {
          const route = this.selectGoogleRoute(data.routes, options?.prefer);
          const leg = route?.legs?.[0];
          if (route?.overview_polyline?.points && leg) {
            return {
              coordinates: this.decodePolyline(route.overview_polyline.points),
              legs: [
                {
                  distance: leg.distance,
                  duration: leg.duration,
                  duration_in_traffic: leg.duration_in_traffic,
                  start_address: leg.start_address,
                  end_address: leg.end_address,
                  steps: Array.isArray(leg.steps) ? leg.steps : [],
                  end_location: leg.end_location,
                  start_location: leg.start_location,
                },
              ],
              overview_polyline: route.overview_polyline,
            };
          }
        }
      }
    } catch (error) {
      console.warn('[GoogleMapsService] Google directions failed:', error);
    }

    const fallback = await this.getFallbackDirections(originLat, originLng, destination);
    if (fallback) return fallback;

    if (googleStatus === 'NOT_FOUND') {
      return {
        error: 'NOT_FOUND',
        message: 'Location not found. Please check the destination and try again.',
      };
    }
    if (googleStatus === 'ZERO_RESULTS') {
      return {
        error: 'ZERO_RESULTS',
        message: 'No route found to this destination. Please try a different destination.',
      };
    }
    if (googleStatus === 'REQUEST_DENIED') {
      return {
        error: 'REQUEST_DENIED',
        message: 'Directions request denied. Please check API configuration.',
      };
    }

    return {
      error: googleStatus || 'NETWORK_ERROR',
      message: googleMessage || 'Unable to get directions. Please try again.',
    };
  }

  static async recalculateRoute(
    currentLat: number,
    currentLng: number,
    destination: string,
    originalRoute?: any
  ): Promise<any> {
    try {
      const endLocation = originalRoute?.legs?.[0]?.end_location;
      const endLat = Number(endLocation?.lat ?? endLocation?.latitude);
      const endLng = Number(endLocation?.lng ?? endLocation?.longitude);
      const destinationTarget =
        Number.isFinite(endLat) && Number.isFinite(endLng)
          ? `${endLat},${endLng}`
          : destination;

      const updated = await this.getDirections(currentLat, currentLng, destinationTarget, {
        alternatives: true,
        prefer: 'duration',
      });

      if (updated && !updated.error && Array.isArray(updated.coordinates) && updated.coordinates.length > 0) {
        return updated;
      }
      if (originalRoute?.coordinates?.length) {
        return originalRoute;
      }
      return updated;
    } catch (error) {
      console.warn('[GoogleMapsService] Route recalculation failed:', error);
      return {
        error: 'RECALCULATION_ERROR',
        message: 'Could not recalculate route. Please try again.',
      };
    }
  }

  private static async getFallbackDirections(
    originLat: number,
    originLng: number,
    destination: string
  ): Promise<any> {
    const target = await this.resolveDestination(destination);
    if (!target) return null;

    const osrm = await OSRMService.getDirections(originLat, originLng, target.lat, target.lng);
    if (!osrm || !osrm.coordinates?.length) return null;

    const leg = osrm.legs?.[0];
    const resolvedEnd =
      (await this.getReverseGeocoding(target.lat, target.lng).catch(() => null)) || destination;

    return {
      coordinates: osrm.coordinates,
      legs: [
        {
          distance: leg?.distance,
          duration: leg?.duration,
          start_address: leg?.start_address || `${originLat.toFixed(5)}, ${originLng.toFixed(5)}`,
          end_address: leg?.end_address || resolvedEnd,
          steps: Array.isArray(leg?.steps) ? leg.steps : [],
          end_location: leg?.end_location || { lat: target.lat, lng: target.lng },
        },
      ],
    };
  }

  private static async resolveDestination(destination: string): Promise<{ lat: number; lng: number } | null> {
    const parsed = this.parseCoordinateInput(destination);
    if (parsed) return parsed;

    const geocoded = await this.getCoordinatesFromAddress(destination);
    if (!geocoded) return null;
    return {
      lat: geocoded.latitude,
      lng: geocoded.longitude,
    };
  }

  private static selectGoogleRoute(routes: any[], prefer: 'duration' | 'distance' = 'duration'): any {
    if (routes.length <= 1) return routes[0];
    const ranked = routes.map((route: any) => {
      const leg = route?.legs?.[0];
      const duration = Number(leg?.duration_in_traffic?.value ?? leg?.duration?.value);
      const distance = Number(leg?.distance?.value);
      return {
        route,
        duration: Number.isFinite(duration) ? duration : Number.MAX_SAFE_INTEGER,
        distance: Number.isFinite(distance) ? distance : Number.MAX_SAFE_INTEGER,
      };
    });
    ranked.sort((a, b) =>
      prefer === 'distance' ? a.distance - b.distance : a.duration - b.duration
    );
    return ranked[0]?.route || routes[0];
  }

  private static async fetchGeocodeSuggestions(
    query: string,
    options?: GeocodeSuggestionOptions
  ): Promise<AddressSuggestion[]> {
    let googleSuggestions: AddressSuggestion[] = [];
    if (GOOGLE_MAPS_RUNTIME_KEY && query.length >= 3) {
      googleSuggestions = await this.getGoogleGeocodeSuggestions(query, options);
      if (googleSuggestions.length >= 4) {
        return googleSuggestions.slice(0, 6);
      }
    }

    try {
      const nominatimSuggestions = await NominatimService.getSuggestionObjects(query, {
        limit: 8,
        countryCode: options?.countryCode?.trim().toLowerCase(),
        focusLocation: options?.focusLocation,
        focusRadiusKm: query.length <= 4 ? 120 : 240,
        bounded: query.length <= 3 && /\d/.test(query),
      });

      if (!googleSuggestions.length) {
        return nominatimSuggestions.slice(0, 6);
      }

      return this.mergeGeocodeSuggestions(googleSuggestions, nominatimSuggestions, 6);
    } catch (error) {
      console.warn('[GoogleMapsService] Nominatim geocode suggestions failed:', error);
      return googleSuggestions.slice(0, 6);
    }
  }

  private static async getGoogleGeocodeSuggestions(
    query: string,
    options?: GeocodeSuggestionOptions
  ): Promise<AddressSuggestion[]> {
    try {
      const params = new URLSearchParams({
        address: query,
        language: 'en',
        key: GOOGLE_MAPS_RUNTIME_KEY,
      });

      const countryCode = options?.countryCode?.trim().toLowerCase();
      if (countryCode) {
        params.append('components', `country:${countryCode}`);
      }

      const focusLocation = options?.focusLocation;
      if (
        focusLocation &&
        Number.isFinite(focusLocation.latitude) &&
        Number.isFinite(focusLocation.longitude)
      ) {
        const bounds = this.buildGoogleBounds(
          focusLocation.latitude,
          focusLocation.longitude,
          query.length <= 4 ? 140 : 260
        );
        if (bounds) {
          params.append('bounds', bounds);
        }
      }

      const url = `${GOOGLE_MAPS_BASE_URL}/geocode/json?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        return [];
      }

      const data: any = await response.json();
      if (data?.status !== 'OK' || !Array.isArray(data?.results)) {
        if (data?.status && data.status !== 'ZERO_RESULTS' && data.status !== 'REQUEST_DENIED') {
          console.warn('[GoogleMapsService] Google geocode suggestions failed:', data.status, data.error_message);
        }
        return [];
      }

      const suggestions: Array<AddressSuggestion | null> = data.results
        .map((result: any, index: number) => {
          const latitude = Number(result?.geometry?.location?.lat);
          const longitude = Number(result?.geometry?.location?.lng);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

          const label = this.buildGoogleSuggestionLabel(result);
          if (!label) return null;

          return {
            id: `google:${String(result?.place_id || index)}`,
            label,
            queryValue: `${latitude},${longitude}`,
            latitude,
            longitude,
            source: 'google' as const,
            qualityScore: this.computeGoogleSuggestionScore(
              label,
              query,
              focusLocation,
              latitude,
              longitude,
              result,
              index
            ),
            matchKind: 'google' as const,
            distanceKmFromUser: focusLocation
              ? this.distanceKm(
                  focusLocation.latitude,
                  focusLocation.longitude,
                  latitude,
                  longitude
                )
              : undefined,
          };
        });

      return suggestions
        .filter((item): item is AddressSuggestion => item !== null)
        .sort((a: AddressSuggestion, b: AddressSuggestion) => b.qualityScore - a.qualityScore)
        .slice(0, 6);
    } catch (error) {
      console.warn('[GoogleMapsService] Google geocode suggestion request failed:', error);
      return [];
    }
  }

  private static mergeGeocodeSuggestions(
    primary: AddressSuggestion[],
    secondary: AddressSuggestion[],
    limit: number
  ): AddressSuggestion[] {
    const merged = new Map<string, AddressSuggestion>();
    for (const item of [...primary, ...secondary]) {
      const key = `${item.queryValue}|${this.normalizeSuggestionText(item.label)}`;
      const existing = merged.get(key);
      if (!existing || item.qualityScore > existing.qualityScore) {
        merged.set(key, item);
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, limit);
  }

  private static async getGoogleRoadSpeedLimit(
    latitude: number,
    longitude: number
  ): Promise<CoordinateSpeedLimitResult> {
    try {
      const snapUrl = `${GOOGLE_ROADS_BASE_URL}/snapToRoads?path=${latitude},${longitude}&interpolate=false&key=${GOOGLE_MAPS_RUNTIME_KEY}`;
      const snapResponse = await fetch(snapUrl);

      if (!snapResponse.ok) {
        return this.unknownSpeed(snapResponse.status === 403 ? 'roads_unavailable' : 'unknown');
      }

      const snapData: any = await snapResponse.json();
      const placeId = String(snapData?.snappedPoints?.[0]?.placeId || '');
      if (!placeId) {
        return this.unknownSpeed('unknown');
      }

      const placeKey = `place:${placeId}`;
      const placeCached = this.getCachedSpeedLimit(placeKey);
      if (placeCached && placeCached.speedLimit > 0) {
        return placeCached;
      }

      const speedUrl = `${GOOGLE_ROADS_BASE_URL}/speedLimits?placeId=${encodeURIComponent(placeId)}&key=${GOOGLE_MAPS_RUNTIME_KEY}`;
      const speedResponse = await fetch(speedUrl);
      if (!speedResponse.ok) {
        return this.unknownSpeed(speedResponse.status === 403 ? 'roads_unavailable' : 'unknown');
      }

      const speedData: any = await speedResponse.json();
      const first = Array.isArray(speedData?.speedLimits)
        ? speedData.speedLimits.find((item: any) => Number(item?.speedLimit) > 0)
        : null;
      const speedLimit = Number(first?.speedLimit);
      if (!Number.isFinite(speedLimit) || speedLimit <= 0) {
        return this.unknownSpeed('unknown');
      }

      const result: CoordinateSpeedLimitResult = {
        speedLimit,
        units: first?.units === 'KPH' ? 'KPH' : 'MPH',
        placeId: String(first?.placeId || placeId),
        source: 'roads_api',
      };

      this.setCachedSpeedLimit(placeKey, result);
      return result;
    } catch (error) {
      console.warn('[GoogleMapsService] Google Roads speed limit lookup failed:', error);
      return this.unknownSpeed('unknown');
    }
  }

  private static async getOsmSpeedLimitForCoordinate(
    latitude: number,
    longitude: number
  ): Promise<CoordinateSpeedLimitResult | null> {
    try {
      const query = `[out:json][timeout:7];(way(around:${OSM_SPEED_LIMIT_RADIUS_METERS},${latitude},${longitude})["maxspeed"];way(around:${OSM_SPEED_LIMIT_RADIUS_METERS},${latitude},${longitude})["maxspeed:forward"];way(around:${OSM_SPEED_LIMIT_RADIUS_METERS},${latitude},${longitude})["maxspeed:backward"];way(around:${OSM_SPEED_LIMIT_RADIUS_METERS},${latitude},${longitude})["maxspeed:type"];way(around:${OSM_SPEED_LIMIT_RADIUS_METERS},${latitude},${longitude})["source:maxspeed"];);out tags geom center;`;
      const response = await fetch(OVERPASS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          Accept: 'application/json',
        },
        body: query,
      });

      if (!response.ok) {
        return null;
      }

      const data: any = await response.json();
      const elements = Array.isArray(data?.elements) ? data.elements : [];
      const candidates: Array<{
        speedLimit: number;
        units: 'KPH' | 'MPH';
        distanceMeters: number;
        highwayRank: number;
      } | null> = elements
        .map((element: any) => {
          const parsed = this.parseOsmSpeedLimit(element?.tags);
          if (!parsed) return null;

          return {
            speedLimit: parsed.speedLimit,
            units: parsed.units,
            distanceMeters: this.getOsmElementDistanceMeters(element, latitude, longitude),
            highwayRank: this.getHighwayRank(element?.tags?.highway),
          };
        })
        .filter(
          (
            item: {
              speedLimit: number;
              units: 'KPH' | 'MPH';
              distanceMeters: number;
              highwayRank: number;
            } | null
          ): item is {
            speedLimit: number;
            units: 'KPH' | 'MPH';
            distanceMeters: number;
            highwayRank: number;
          } => item !== null && Number.isFinite(item.distanceMeters)
        )
        .sort(
          (
            a: {
              speedLimit: number;
              units: 'KPH' | 'MPH';
              distanceMeters: number;
              highwayRank: number;
            },
            b: {
              speedLimit: number;
              units: 'KPH' | 'MPH';
              distanceMeters: number;
              highwayRank: number;
            }
          ) => a.distanceMeters - b.distanceMeters || a.highwayRank - b.highwayRank
        );

      const best = candidates[0];
      if (!best || best.speedLimit <= 0) {
        return null;
      }

      return {
        speedLimit: best.speedLimit,
        units: best.units,
        source: 'osm',
      };
    } catch (error) {
      console.warn('[GoogleMapsService] OSM speed limit lookup failed:', error);
      return null;
    }
  }

  private static getCachedSpeedLimit(key: string): CoordinateSpeedLimitResult | null {
    const cached = this.speedLimitCache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.speedLimitCache.delete(key);
      return null;
    }
    return cached.value;
  }

  private static setCachedSpeedLimit(key: string, value: CoordinateSpeedLimitResult): void {
    this.speedLimitCache.set(key, {
      value,
      expiresAt: Date.now() + this.getSpeedLimitCacheTtl(value),
    });
  }

  private static unknownSpeed(
    source: 'unknown' | 'roads_unavailable'
  ): CoordinateSpeedLimitResult {
    return {
      speedLimit: 0,
      units: this.getDefaultSpeedUnits(),
      source,
    };
  }

  private static getSpeedLimitCacheTtl(value: CoordinateSpeedLimitResult): number {
    if (value.speedLimit > 0) return SPEED_LIMIT_CACHE_TTL_MS;
    if (value.source === 'roads_unavailable') return SPEED_LIMIT_ROADS_UNAVAILABLE_CACHE_TTL_MS;
    return SPEED_LIMIT_NEGATIVE_CACHE_TTL_MS;
  }

  private static getCachedSuggestions(key: string): AddressSuggestion[] | null {
    const cached = this.geocodeSuggestionCache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.geocodeSuggestionCache.delete(key);
      return null;
    }
    return cached.value;
  }

  private static setCachedSuggestions(key: string, value: AddressSuggestion[]): void {
    this.geocodeSuggestionCache.set(key, {
      value,
      expiresAt: Date.now() + SUGGESTION_CACHE_TTL_MS,
    });
  }

  private static buildSuggestionCacheKey(
    query: string,
    options?: GeocodeSuggestionOptions
  ): string {
    const countryCode = options?.countryCode?.trim().toLowerCase() || 'any';
    const focusLocation = options?.focusLocation;
    const focusBucket =
      focusLocation &&
      Number.isFinite(focusLocation.latitude) &&
      Number.isFinite(focusLocation.longitude)
        ? `${focusLocation.latitude.toFixed(2)},${focusLocation.longitude.toFixed(2)}`
        : 'none';
    return [this.normalizeSuggestionText(query), countryCode, focusBucket].join('|');
  }

  private static buildGoogleBounds(
    latitude: number,
    longitude: number,
    radiusKm: number
  ): string | null {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    const latDelta = radiusKm / 111;
    const safeCos = Math.max(0.2, Math.cos((latitude * Math.PI) / 180));
    const lonDelta = radiusKm / (111 * safeCos);
    const southWestLat = latitude - latDelta;
    const southWestLng = longitude - lonDelta;
    const northEastLat = latitude + latDelta;
    const northEastLng = longitude + lonDelta;
    return `${southWestLat},${southWestLng}|${northEastLat},${northEastLng}`;
  }

  private static buildGoogleSuggestionLabel(result: any): string {
    const formatted = String(result?.formatted_address || '').trim();
    if (!formatted) return '';

    const parts = formatted
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const compact = parts.length > 4 ? parts.slice(0, 4).join(', ') : formatted;
    return compact.replace(/\s+/g, ' ').trim();
  }

  private static computeGoogleSuggestionScore(
    label: string,
    query: string,
    focusLocation: GeocodeSuggestionOptions['focusLocation'],
    latitude: number,
    longitude: number,
    result: any,
    index: number
  ): number {
    const normalizedQuery = this.normalizeSuggestionText(query);
    const normalizedLabel = this.normalizeSuggestionText(label);
    const labelTokens = normalizedLabel
      .split(/[\s,/-]+/)
      .map((token) => token.trim())
      .filter(Boolean);
    const queryTokens = normalizedQuery
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);

    let score = 95 - index * 5;
    if (normalizedLabel.startsWith(normalizedQuery)) score += 70;
    else if (normalizedLabel.includes(normalizedQuery)) score += 35;

    const prefixMatches = queryTokens.filter((token) =>
      labelTokens.some((labelToken) => labelToken.startsWith(token))
    ).length;
    score += prefixMatches * 18;

    const types = Array.isArray(result?.types) ? result.types.map((item: any) => String(item)) : [];
    if (types.some((type: string) => type === 'street_address' || type === 'premise' || type === 'route')) {
      score += 20;
    }
    if (result?.partial_match) {
      score -= 20;
    }

    if (focusLocation) {
      const distanceKm = this.distanceKm(
        focusLocation.latitude,
        focusLocation.longitude,
        latitude,
        longitude
      );
      if (distanceKm < 5) score += 30;
      else if (distanceKm < 25) score += 20;
      else if (distanceKm < 80) score += 10;
      else score -= 10;
    }

    return score;
  }

  private static parseOsmSpeedLimit(
    tags: Record<string, unknown> | null | undefined
  ): { speedLimit: number; units: 'KPH' | 'MPH' } | null {
    if (!tags) return null;

    const values = [
      tags.maxspeed,
      tags['maxspeed:forward'],
      tags['maxspeed:backward'],
    ];
    for (const value of values) {
      const parsed = this.parseOsmSpeedValue(value);
      if (parsed) return parsed;
    }

    return this.parseImplicitOsmSpeedType(
      String(tags['maxspeed:type'] || tags['source:maxspeed'] || '')
    );
  }

  private static parseOsmSpeedValue(
    rawValue: unknown
  ): { speedLimit: number; units: 'KPH' | 'MPH' } | null {
    const value = String(rawValue || '').trim().toLowerCase();
    if (!value) return null;
    if (
      value === 'signals' ||
      value === 'none' ||
      value === 'variable' ||
      value === 'walk'
    ) {
      return null;
    }

    const match = value.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const speedLimit = Number(match[1]);
    if (!Number.isFinite(speedLimit) || speedLimit <= 0) return null;

    const units =
      value.includes('mph') || value.includes('mp/h')
        ? 'MPH'
        : value.includes('km') || value.includes('kph')
          ? 'KPH'
          : this.getDefaultSpeedUnits();

    return { speedLimit, units };
  }

  private static parseImplicitOsmSpeedType(
    rawValue: string
  ): { speedLimit: number; units: 'KPH' | 'MPH' } | null {
    const value = rawValue.trim().toLowerCase();
    if (!value) return null;

    const defaults: Record<string, { speedLimit: number; units: 'KPH' | 'MPH' }> = {
      'us:urban': { speedLimit: 30, units: 'MPH' },
      'us:residential': { speedLimit: 25, units: 'MPH' },
      'us:rural': { speedLimit: 55, units: 'MPH' },
      'us:motorway': { speedLimit: 65, units: 'MPH' },
      'us:school': { speedLimit: 15, units: 'MPH' },
      'gb:urban': { speedLimit: 30, units: 'MPH' },
      'gb:nsl_single': { speedLimit: 60, units: 'MPH' },
      'gb:nsl_dual': { speedLimit: 70, units: 'MPH' },
      'de:urban': { speedLimit: 50, units: 'KPH' },
    };

    return defaults[value] || null;
  }

  private static getOsmElementDistanceMeters(
    element: any,
    latitude: number,
    longitude: number
  ): number {
    const geometry = Array.isArray(element?.geometry) ? element.geometry : [];
    if (geometry.length > 0) {
      let minDistance = Number.POSITIVE_INFINITY;
      for (const point of geometry) {
        const pointLat = Number(point?.lat);
        const pointLon = Number(point?.lon);
        if (!Number.isFinite(pointLat) || !Number.isFinite(pointLon)) continue;
        const distanceMeters = this.distanceKm(latitude, longitude, pointLat, pointLon) * 1000;
        if (distanceMeters < minDistance) {
          minDistance = distanceMeters;
        }
      }
      if (Number.isFinite(minDistance)) {
        return minDistance;
      }
    }

    const centerLat = Number(element?.center?.lat);
    const centerLon = Number(element?.center?.lon);
    if (Number.isFinite(centerLat) && Number.isFinite(centerLon)) {
      return this.distanceKm(latitude, longitude, centerLat, centerLon) * 1000;
    }

    return Number.POSITIVE_INFINITY;
  }

  private static getHighwayRank(rawHighway: unknown): number {
    const highway = String(rawHighway || '').trim().toLowerCase();
    const ranks: Record<string, number> = {
      motorway: 0,
      trunk: 1,
      primary: 2,
      secondary: 3,
      tertiary: 4,
      residential: 5,
      service: 6,
      living_street: 7,
    };
    return ranks[highway] ?? 8;
  }

  private static getDefaultSpeedUnits(): 'KPH' | 'MPH' {
    const envCountry = process.env.EXPO_PUBLIC_DEFAULT_COUNTRY_CODE?.trim().toLowerCase();
    const localeCountry =
      Intl.DateTimeFormat().resolvedOptions().locale.split('-')[1]?.toLowerCase() || '';
    const country = envCountry || localeCountry;
    return ['us', 'gb', 'lr', 'mm'].includes(country) ? 'MPH' : 'KPH';
  }

  private static normalizeSuggestionText(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private static distanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  private static parseCoordinateInput(value: string): { lat: number; lng: number } | null {
    const match = value
      .trim()
      .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;

    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }

  private static decodePolyline(encoded: string): Array<{ latitude: number; longitude: number }> {
    const points: Array<{ latitude: number; longitude: number }> = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let b: number;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dLat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dLng;

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return points;
  }
}

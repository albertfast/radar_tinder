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
const SPEED_LIMIT_CACHE_TTL_MS = 120000;

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

type CacheEntry = {
  value: CoordinateSpeedLimitResult;
  timestamp: number;
};

export class GoogleMapsService {
  private static speedLimitCache = new Map<string, CacheEntry>();

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

    try {
      return await NominatimService.getSuggestionObjects(query, {
        limit: 6,
        countryCode: options?.countryCode?.trim().toLowerCase(),
        focusLocation: options?.focusLocation,
        focusRadiusKm: query.length <= 4 ? 90 : 180,
        bounded: query.length <= 4,
      });
    } catch (error) {
      console.warn('[GoogleMapsService] Nominatim geocode suggestions failed:', error);
      return [];
    }
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

    if (!GOOGLE_MAPS_RUNTIME_KEY) {
      const result = this.unknownSpeed('unknown');
      this.setCachedSpeedLimit(coordinateKey, result);
      return result;
    }

    try {
      const snapUrl = `${GOOGLE_ROADS_BASE_URL}/snapToRoads?path=${latitude},${longitude}&interpolate=false&key=${GOOGLE_MAPS_RUNTIME_KEY}`;
      const snapResponse = await fetch(snapUrl);

      if (!snapResponse.ok) {
        const source = snapResponse.status === 403 ? 'roads_unavailable' : 'unknown';
        const result = this.unknownSpeed(source);
        this.setCachedSpeedLimit(coordinateKey, result);
        return result;
      }

      const snapData: any = await snapResponse.json();
      const placeId = String(snapData?.snappedPoints?.[0]?.placeId || '');
      if (!placeId) {
        const result = this.unknownSpeed('unknown');
        this.setCachedSpeedLimit(coordinateKey, result);
        return result;
      }

      const placeKey = `place:${placeId}`;
      const placeCached = this.getCachedSpeedLimit(placeKey);
      if (placeCached) {
        this.setCachedSpeedLimit(coordinateKey, placeCached);
        return placeCached;
      }

      const speedUrl = `${GOOGLE_ROADS_BASE_URL}/speedLimits?placeId=${encodeURIComponent(placeId)}&key=${GOOGLE_MAPS_RUNTIME_KEY}`;
      const speedResponse = await fetch(speedUrl);
      if (!speedResponse.ok) {
        const source = speedResponse.status === 403 ? 'roads_unavailable' : 'unknown';
        const result = this.unknownSpeed(source);
        this.setCachedSpeedLimit(coordinateKey, result);
        return result;
      }

      const speedData: any = await speedResponse.json();
      const first = speedData?.speedLimits?.[0];
      const speedLimit = Number(first?.speedLimit);
      if (!Number.isFinite(speedLimit) || speedLimit <= 0) {
        const result = this.unknownSpeed('unknown');
        this.setCachedSpeedLimit(coordinateKey, result);
        return result;
      }

      const result: CoordinateSpeedLimitResult = {
        speedLimit,
        units: first?.units === 'KPH' ? 'KPH' : 'MPH',
        placeId: String(first?.placeId || placeId),
        source: 'roads_api',
      };

      this.setCachedSpeedLimit(coordinateKey, result);
      this.setCachedSpeedLimit(placeKey, result);
      return result;
    } catch (error) {
      console.warn('[GoogleMapsService] Speed limit lookup failed:', error);
      return null;
    }
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

  private static getCachedSpeedLimit(key: string): CoordinateSpeedLimitResult | null {
    const cached = this.speedLimitCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > SPEED_LIMIT_CACHE_TTL_MS) {
      this.speedLimitCache.delete(key);
      return null;
    }
    return cached.value;
  }

  private static setCachedSpeedLimit(key: string, value: CoordinateSpeedLimitResult): void {
    this.speedLimitCache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  private static unknownSpeed(
    source: 'unknown' | 'roads_unavailable'
  ): CoordinateSpeedLimitResult {
    return {
      speedLimit: 0,
      units: 'MPH',
      source,
    };
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

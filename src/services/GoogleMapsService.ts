import { Platform } from 'react-native';
import { OSRMService } from './OSRMService';
import { NominatimService } from './NominatimService';
import { AddressSuggestion } from '../types';

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

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

interface SpeedLimitResult {
  placeId: string;
  speedLimit: number;
  units: 'KPH' | 'MPH';
}

interface DistanceResult {
  distance: {
    text: string;
    value: number; // in meters
  };
  duration: {
    text: string;
    value: number; // in seconds
  };
}

interface GeocodeSuggestionOptions {
  countryCode?: string;
  focusLocation?: {
    latitude: number;
    longitude: number;
  };
}

export class GoogleMapsService {
  private static BASE_URL = 'https://maps.googleapis.com/maps/api';

  private static parseDestinationCoordinates(
    destination: string
  ): { lat: number; lon: number } | null {
    const match = destination
      .trim()
      .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  }

  private static buildGoogleBounds(
    focusLocation?: { latitude: number; longitude: number },
    radiusKm: number = 60
  ): string | null {
    if (
      !focusLocation ||
      !Number.isFinite(focusLocation.latitude) ||
      !Number.isFinite(focusLocation.longitude)
    ) {
      return null;
    }

    const latDelta = radiusKm / 111;
    const safeCos = Math.max(0.2, Math.cos((focusLocation.latitude * Math.PI) / 180));
    const lonDelta = radiusKm / (111 * safeCos);

    const south = focusLocation.latitude - latDelta;
    const west = focusLocation.longitude - lonDelta;
    const north = focusLocation.latitude + latDelta;
    const east = focusLocation.longitude + lonDelta;
    return `${south},${west}|${north},${east}`;
  }

  private static async getFallbackDirections(
    originLat: number,
    originLng: number,
    destination: string
  ): Promise<any> {
    const parsedCoords = this.parseDestinationCoordinates(destination);
    const target = parsedCoords || (await NominatimService.geocode(destination));

    if (!target) {
      return {
        error: 'NOT_FOUND',
        message: 'Location not found. Please check the destination and try again.',
      };
    }

    const osrmRoute = await OSRMService.getDirections(
      originLat,
      originLng,
      target.lat,
      target.lon
    );

    if (!osrmRoute || !osrmRoute.coordinates?.length) {
      return {
        error: 'ZERO_RESULTS',
        message: 'No route found to this destination. Please try a different destination.',
      };
    }

    const reverse = await NominatimService.reverse(target.lat, target.lon).catch(() => null);
    const endAddress = reverse?.display_name || destination;
    const startAddress = `${originLat.toFixed(5)}, ${originLng.toFixed(5)}`;

    const leg = osrmRoute.legs?.[0];
    return {
      ...osrmRoute,
      legs: [
        {
          ...leg,
          start_address: leg?.start_address || startAddress,
          end_address: leg?.end_address || endAddress,
          end_location: leg?.end_location || { lat: target.lat, lng: target.lon },
        },
      ],
    };
  }

  /**
   * Search for nearby places (radars, police, etc.) using Places API
   * Expanded keywords for better detection
   */
  static async searchNearbyPlaces(
    latitude: number,
    longitude: number,
    radius: number = 5000,
    keyword: string = 'traffic_camera|speed_trap|speed_camera|safety_camera|red_light_camera|traffic_enforcement'
  ): Promise<PlaceResult[]> {
    try {
      if (!GOOGLE_MAPS_API_KEY) {
        return [];
      }
      const url = `${this.BASE_URL}/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&key=${GOOGLE_MAPS_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK') {
        return data.results;
      } else {
        // Don't warn for expected errors - reduces log spam
        // REQUEST_DENIED is expected when Places API is disabled
        // ZERO_RESULTS is normal when no places found
        if (data.status !== 'ZERO_RESULTS' && data.status !== 'REQUEST_DENIED') {
          console.warn('Google Places API Error:', data.status, data.error_message);
        }
        return [];
      }
    } catch (error) {
      console.error('Error searching nearby places:', error);
      return [];
    }
  }

  /**
   * Get speed limit for a specific place (road segment) using Roads API
   * Note: This requires the "Roads API" to be enabled and is a premium feature.
   * Endpoint: https://roads.googleapis.com/v1/speedLimits
   */
  static async getSpeedLimit(placeId: string): Promise<SpeedLimitResult | null> {
    try {
      // Roads API uses a different base URL than Maps API
      const url = `https://roads.googleapis.com/v1/speedLimits?placeId=${placeId}&key=${GOOGLE_MAPS_API_KEY}`;
      
      const response = await fetch(url);

      if (!response.ok) {
        // Handle 403 Permission Denied gracefully (common if Roads API is not enabled/paid)
        if (response.status === 403) {
          // Silent fail for permission denied to avoid log spam
          return null;
        }
        const text = await response.text();
        console.warn(`Roads API Error (${response.status}):`, text);
        return null;
      }

      const data = await response.json();

      if (data.speedLimits && data.speedLimits.length > 0) {
        return {
          placeId: data.speedLimits[0].placeId,
          speedLimit: data.speedLimits[0].speedLimit,
          units: data.speedLimits[0].units,
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting speed limit:', error);
      return null;
    }
  }

  /**
   * Get accurate distance and duration
   * Uses OSRM (free) first, falls back to Google Distance Matrix API
   */
  static async getDistance(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
  ): Promise<DistanceResult | null> {
    // Try free OSRM first
    try {
      const osrmResult = await OSRMService.getDistance(originLat, originLng, destLat, destLng);
      if (osrmResult) {
        return {
          distance: {
            text: osrmResult.distance < 1000 
              ? `${Math.round(osrmResult.distance)} m` 
              : `${(osrmResult.distance / 1000).toFixed(1)} km`,
            value: osrmResult.distance,
          },
          duration: {
            text: osrmResult.duration < 60 
              ? `${Math.round(osrmResult.duration)} sec` 
              : `${Math.round(osrmResult.duration / 60)} min`,
            value: osrmResult.duration,
          },
        };
      }
    } catch (osrmError) {
      console.warn('[GoogleMapsService] OSRM failed, trying Google:', osrmError);
    }

    // Fallback to Google Distance Matrix
    try {
      const origins = `${originLat},${originLng}`;
      const destinations = `${destLat},${destLng}`;
      const url = `${this.BASE_URL}/distancematrix/json?origins=${origins}&destinations=${destinations}&key=${GOOGLE_MAPS_API_KEY}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
        return data.rows[0].elements[0];
      }
      return null;
    } catch (error) {
      console.error('Error calculating distance:', error);
      return null;
    }
  }

  /**
   * Get directions between two points and return decoded coordinates for Polyline
   */
  static async getDirections(
    originLat: number,
    originLng: number,
    destination: string,
    options?: { alternatives?: boolean; prefer?: 'duration' | 'distance' }
  ): Promise<any> {
    try {
      if (!GOOGLE_MAPS_API_KEY) {
        console.warn('Google Maps API key is not configured. Falling back to OSRM + Nominatim.');
        return await this.getFallbackDirections(originLat, originLng, destination);
      }

      const origin = `${originLat},${originLng}`;
      const alternatives = options?.alternatives ? '&alternatives=true' : '';
      const url = `${this.BASE_URL}/directions/json?origin=${origin}&destination=${encodeURIComponent(destination)}&mode=driving${alternatives}&language=en&key=${GOOGLE_MAPS_API_KEY}`;

      console.log('[GoogleMapsService] Fetching directions to:', destination);
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK') {
        const routes = Array.isArray(data.routes) ? data.routes : [];
        
        // Enhanced route scoring with traffic awareness and road quality
        const scoredRoutes = routes.map((route: any) => {
          const leg = route?.legs?.[0];
          const duration = leg?.duration?.value ?? Number.MAX_SAFE_INTEGER;
          const distance = leg?.distance?.value ?? Number.MAX_SAFE_INTEGER;
          const trafficDuration = leg?.duration_in_traffic?.value ?? duration;
          const hasHighways = route?.overview_polyline?.points?.includes('highway') || false;
          
          // Prefer routes with less traffic and better road quality
          const trafficScore = duration / trafficDuration; // Lower is better
          const roadQualityScore = hasHighways ? 0.9 : 1.0; // Slight preference for highways
          
          return {
            route,
            duration,
            distance,
            trafficScore,
            roadQualityScore,
            score: trafficScore * roadQualityScore
          };
        });

        // Sort by best score (lower is better)
        scoredRoutes.sort((a: any, b: any) => a.score - b.score);

        const selectedRoute = scoredRoutes[0]?.route ?? routes[0];
        const points = this.decodePolyline(selectedRoute.overview_polyline.points);
        
        // Extract detailed route information
        const leg = selectedRoute.legs[0];
        const routeInfo = {
          coordinates: points,
          legs: [{
            distance: leg.distance,
            duration: leg.duration,
            duration_in_traffic: leg.duration_in_traffic,
            end_address: leg.end_address,
            start_address: leg.start_address,
            steps: leg.steps,
            end_location: leg.end_location,
            start_location: leg.start_location
          }],
          overview_polyline: selectedRoute.overview_polyline,
          copyrights: selectedRoute.copyrights,
          waypoint_order: selectedRoute.waypoint_order
        };
        
        console.log('[GoogleMapsService] Best route selected with', points.length, 'points, traffic score:', scoredRoutes[0]?.trafficScore);
        return routeInfo;
      }
      
      console.warn('Directions API Error:', data.status, data.error_message);

      const fallback = await this.getFallbackDirections(originLat, originLng, destination);
      if (fallback && !fallback.error) {
        console.log('[GoogleMapsService] Fallback route selected via OSRM');
        return fallback;
      }
      
      // Return error information for better user feedback
      if (data.status === 'ZERO_RESULTS') {
        return { error: 'ZERO_RESULTS', message: 'No route found to this destination. Please try a different destination.' };
      } else if (data.status === 'NOT_FOUND') {
        return { error: 'NOT_FOUND', message: 'Location not found. Please check the address and try again.' };
      } else if (data.status === 'REQUEST_DENIED') {
        return { error: 'REQUEST_DENIED', message: 'API request denied. Please check your API key and internet connection.' };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting directions:', error);
      const fallback = await this.getFallbackDirections(originLat, originLng, destination);
      if (fallback && !fallback.error) {
        console.log('[GoogleMapsService] Network fallback route selected via OSRM');
        return fallback;
      }
      return { error: 'NETWORK_ERROR', message: 'Network error. Please check your internet connection and try again.' };
    }
  }

  /**
   * Recalculate route from current location to destination when user deviates from planned route
   */
  static async recalculateRoute(
    currentLat: number,
    currentLng: number,
    destination: string,
    originalRoute?: any
  ): Promise<any> {
    try {
      console.log('[GoogleMapsService] Recalculating route from current position');
      
      // Get new directions from current location
      const newRoute = await this.getDirections(currentLat, currentLng, destination, {
        alternatives: true,
        prefer: 'duration'
      });

      if (newRoute && !newRoute.error) {
        // Compare with original route to determine if significant deviation
        if (originalRoute && originalRoute.legs) {
          const originalDistance = originalRoute.legs[0].distance.value;
          const newDistance = newRoute.legs[0].distance.value;
          const deviationPercentage = Math.abs((newDistance - originalDistance) / originalDistance) * 100;
          
          console.log(`[GoogleMapsService] Route deviation: ${deviationPercentage.toFixed(1)}%`);
          
          // Only return new route if deviation is significant (> 15%)
          if (deviationPercentage < 15) {
            console.log('[GoogleMapsService] Deviation minor, keeping original route');
            return originalRoute;
          }
        }
        
        console.log('[GoogleMapsService] New route calculated due to significant deviation');
        return newRoute;
      }
      
      return newRoute;
    } catch (error) {
      console.error('Error recalculating route:', error);
      return { error: 'RECALCULATION_ERROR', message: 'Could not recalculate route. Please try again.' };
    }
  }

  private static decodePolyline(t: string) {
    let points = [];
    let index = 0, len = t.length;
    let lat = 0, lng = 0;
    while (index < len) {
      let b, shift = 0, result = 0;
      do {
        b = t.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;
      shift = 0;
      result = 0;
      do {
        b = t.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;
      points.push({ latitude: (lat / 1E5), longitude: (lng / 1E5) });
    }
    return points;
  }

  /**
   * Get autocomplete suggestions for a place query
   * NOTE: Google Places API disabled to reduce costs - using direct geocoding instead
   */
  static async getPlaceAutocomplete(input: string): Promise<any[]> {
    // Places API disabled - return empty array
    // User can still search by typing full address and pressing GO
    return [];
  }
  /**
   * Get address from coordinates using Geocoding API
   */
  static async getReverseGeocoding(latitude: number, longitude: number): Promise<string | null> {
    try {
      const url = `${this.BASE_URL}/geocode/json?latlng=${latitude},${longitude}&language=en&key=${GOOGLE_MAPS_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.results.length > 0) {
        // Return the first formatted address, or a specific component like route/street
        return data.results[0].formatted_address;
      }
      return null;
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      return null;
    }
  }

  /**
   * Get address suggestions
   * Uses Nominatim (free) first, falls back to Google Geocoding API
   */
  static async getGeocodeSuggestions(
    input: string,
    options?: GeocodeSuggestionOptions
  ): Promise<AddressSuggestion[]> {
    const query = input.trim();
    if (!query) return [];

    const normalizedCountry = options?.countryCode?.trim().toLowerCase();
    const isShortOrMostlyNumericQuery =
      query.length <= 4 || /^[\d\s-]+$/.test(query);

    // Try free Nominatim first
    try {
      let nominatimResults = await NominatimService.getSuggestionObjects(query, {
        limit: 6,
        countryCode: normalizedCountry,
        focusLocation: options?.focusLocation,
        focusRadiusKm: isShortOrMostlyNumericQuery ? 90 : 180,
        bounded: isShortOrMostlyNumericQuery,
      });

      // For longer free-text queries, relax country filter if needed.
      if (
        nominatimResults.length === 0 &&
        normalizedCountry &&
        !isShortOrMostlyNumericQuery
      ) {
        nominatimResults = await NominatimService.getSuggestionObjects(query, {
          limit: 6,
          focusLocation: options?.focusLocation,
          focusRadiusKm: 180,
        });
      }

      if (nominatimResults.length > 0) {
        return nominatimResults.slice(0, 6);
      }
    } catch (nominatimError) {
      console.warn('[GoogleMapsService] Nominatim failed, trying Google:', nominatimError);
    }

    // Fallback to Google Geocoding
    try {
      if (!GOOGLE_MAPS_API_KEY) return [];
      const params = new URLSearchParams({
        address: query,
        language: 'en',
        key: GOOGLE_MAPS_API_KEY,
      });
      const bounds = this.buildGoogleBounds(
        options?.focusLocation,
        isShortOrMostlyNumericQuery ? 70 : 150
      );
      if (bounds) {
        params.append('bounds', bounds);
      }
      if (normalizedCountry) {
        params.append('region', normalizedCountry);
        if (isShortOrMostlyNumericQuery) {
          params.append('components', `country:${normalizedCountry}`);
        }
      }

      const url = `${this.BASE_URL}/geocode/json?${params.toString()}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && Array.isArray(data.results)) {
        const normalizedQuery = query.toLowerCase();
        const queryTokens = normalizedQuery
          .split(/\s+/)
          .map((token: string) => token.trim())
          .filter((token: string) => token.length >= 2);
        const deduped = new Map<string, AddressSuggestion>();
        for (const result of data.results) {
          const label =
            typeof result?.formatted_address === 'string'
              ? result.formatted_address.trim()
              : '';
          const lat = Number(result?.geometry?.location?.lat);
          const lon = Number(result?.geometry?.location?.lng);
          if (!label || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          if (this.isMalformedSuggestionLabel(label)) continue;

          const normalizedLabel = this.normalizeSuggestionLabel(label);
          if (/^\d+$/.test(normalizedQuery) && !normalizedLabel.includes(normalizedQuery)) {
            continue;
          }
          if (
            queryTokens.length > 0 &&
            !queryTokens.slice(0, 2).every((token: string) => normalizedLabel.includes(token))
          ) {
            continue;
          }

          const qualityScore = this.computeSuggestionScore(
            normalizedLabel,
            queryTokens,
            options?.focusLocation,
            lat,
            lon
          );
          const latBucket = Math.round(lat * 10000);
          const lonBucket = Math.round(lon * 10000);
          const dedupeKey = `${normalizedLabel}|${latBucket}|${lonBucket}`;
          const item: AddressSuggestion = {
            id: `google:${result.place_id || label}:${latBucket}:${lonBucket}`,
            label,
            queryValue: `${lat},${lon}`,
            latitude: lat,
            longitude: lon,
            source: 'google',
            qualityScore,
          };
          const existing = deduped.get(dedupeKey);
          if (!existing || qualityScore > existing.qualityScore) {
            deduped.set(dedupeKey, item);
          }
        }
        return Array.from(deduped.values())
          .sort((a, b) => b.qualityScore - a.qualityScore)
          .slice(0, 6);
      }
      return [];
    } catch (error) {
      console.error('Error fetching geocode suggestions:', error);
      return [];
    }
  }

  private static normalizeSuggestionLabel(label: string): string {
    return label.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private static isMalformedSuggestionLabel(label: string): boolean {
    if (!label) return true;
    if (label.length > 140 && /;/.test(label)) return true;
    if (/\d{2,}\s*;\s*\d{2,}\s*;\s*\d{2,}/.test(label)) return true;
    return false;
  }

  private static computeSuggestionScore(
    normalizedLabel: string,
    queryTokens: string[],
    focusLocation: { latitude: number; longitude: number } | undefined,
    lat: number,
    lon: number
  ): number {
    let score = 0;
    if (/\d+/.test(normalizedLabel)) score += 25;
    if (
      /\b(st|street|ave|avenue|rd|road|blvd|drive|dr|way|ln|lane|hwy|highway)\b/i.test(
        normalizedLabel
      )
    ) {
      score += 10;
    }
    const tokenMatches = queryTokens.filter((token) => normalizedLabel.includes(token)).length;
    score += tokenMatches * 20;

    if (focusLocation) {
      const distanceKm = this.distanceKm(
        focusLocation.latitude,
        focusLocation.longitude,
        lat,
        lon
      );
      if (distanceKm < 5) score += 35;
      else if (distanceKm < 25) score += 25;
      else if (distanceKm < 80) score += 10;
      else score -= 10;
    }
    return score;
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
}

import { Platform } from 'react-native';
import { OSRMService } from './OSRMService';
import { NominatimService } from './NominatimService';

// Fallback to hardcoded key if environment variable is not set
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyAtZoFF2DvstwmZuLxh0JR2CsK3clsYtbQ';

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

export class GoogleMapsService {
  private static BASE_URL = 'https://maps.googleapis.com/maps/api';

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
        console.error('Google Maps API key is not configured');
        return { error: 'API_KEY_MISSING', message: 'Google Maps API key is not configured' };
      }

      const origin = `${originLat},${originLng}`;
      const alternatives = options?.alternatives ? '&alternatives=true' : '';
      const url = `${this.BASE_URL}/directions/json?origin=${origin}&destination=${encodeURIComponent(destination)}&mode=driving${alternatives}&language=en&key=${GOOGLE_MAPS_API_KEY}`;

      console.log('[GoogleMapsService] Fetching directions to:', destination);
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK') {
        const routes = Array.isArray(data.routes) ? data.routes : [];
        const scoredRoutes = routes.map((route: any) => {
          const leg = route?.legs?.[0];
          const duration = leg?.duration?.value ?? Number.MAX_SAFE_INTEGER;
          const distance = leg?.distance?.value ?? Number.MAX_SAFE_INTEGER;
          return { route, duration, distance };
        });

        const prefer = options?.prefer === 'distance' ? 'distance' : 'duration';
        scoredRoutes.sort((a: { route: any; duration: number; distance: number }, b: { route: any; duration: number; distance: number }) => {
          if (prefer === 'distance') {
            return a.distance - b.distance || a.duration - b.duration;
          }
          return a.duration - b.duration || a.distance - b.distance;
        });

        const selectedRoute = scoredRoutes[0]?.route ?? routes[0];
        const points = this.decodePolyline(selectedRoute.overview_polyline.points);
        console.log('[GoogleMapsService] Route found with', points.length, 'points');
        return {
          ...selectedRoute,
          coordinates: points,
          routes
        };
      }
      
      console.warn('Directions API Error:', data.status, data.error_message);
      
      // Return error information for better user feedback
      if (data.status === 'ZERO_RESULTS') {
        return { error: 'ZERO_RESULTS', message: 'No route found to this destination' };
      } else if (data.status === 'NOT_FOUND') {
        return { error: 'NOT_FOUND', message: 'Location not found' };
      } else if (data.status === 'REQUEST_DENIED') {
        return { error: 'REQUEST_DENIED', message: 'API request denied. Please check your API key.' };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting directions:', error);
      return { error: 'NETWORK_ERROR', message: 'Network error. Please check your internet connection.' };
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
  static async getGeocodeSuggestions(input: string): Promise<string[]> {
    const query = input.trim();
    if (!query) return [];

    // Try free Nominatim first
    try {
      const nominatimResults = await NominatimService.getSuggestions(query, { limit: 6 });
      if (nominatimResults.length > 0) {
        return nominatimResults;
      }
    } catch (nominatimError) {
      console.warn('[GoogleMapsService] Nominatim failed, trying Google:', nominatimError);
    }

    // Fallback to Google Geocoding
    try {
      if (!GOOGLE_MAPS_API_KEY) return [];
      const url = `${this.BASE_URL}/geocode/json?address=${encodeURIComponent(query)}&language=en&key=${GOOGLE_MAPS_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && Array.isArray(data.results)) {
        return data.results
          .map((result: any) => result.formatted_address)
          .filter(Boolean)
          .slice(0, 6);
      }
      return [];
    } catch (error) {
      console.error('Error fetching geocode suggestions:', error);
      return [];
    }
  }
}

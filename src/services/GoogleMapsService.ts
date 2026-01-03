import { Platform } from 'react-native';

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
        // Don't warn for ZERO_RESULTS, it's normal
        if (data.status !== 'ZERO_RESULTS') {
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
   * Get accurate distance and duration using Distance Matrix API
   */
  static async getDistance(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
  ): Promise<DistanceResult | null> {
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
    destination: string
  ): Promise<any> {
    try {
      const origin = `${originLat},${originLng}`;
      const url = `${this.BASE_URL}/directions/json?origin=${origin}&destination=${encodeURIComponent(destination)}&key=${GOOGLE_MAPS_API_KEY}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK') {
        const points = this.decodePolyline(data.routes[0].overview_polyline.points);
        return {
          ...data.routes[0],
          coordinates: points
        };
      }
      console.warn('Directions API Error:', data.status);
      return null;
    } catch (error) {
      console.error('Error getting directions:', error);
      return null;
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
   */
  static async getPlaceAutocomplete(input: string): Promise<any[]> {
    try {
      if (!input || input.length < 3) return [];
      
      const url = `${this.BASE_URL}/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${GOOGLE_MAPS_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK') {
        return data.predictions;
      }
      return [];
    } catch (error) {
      console.error('Error getting autocomplete:', error);
      return [];
    }
  }
  /**
   * Get address from coordinates using Geocoding API
   */
  static async getReverseGeocoding(latitude: number, longitude: number): Promise<string | null> {
    try {
      const url = `${this.BASE_URL}/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;
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
}

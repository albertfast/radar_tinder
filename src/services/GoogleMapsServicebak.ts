import * as Location from 'expo-location';

// Removed legacy Google Maps API dependencies to prevent crashes and costs.
// Using native device geocoding which is free and efficient.

interface Coordinates {
  latitude: number;
  longitude: number;
}

export type DirectionEtaSource = 'google_traffic' | 'google_base' | 'osrm_estimate';

type DirectionStep = {
  html_instructions: string;
  distance: { value: number };
  maneuver: string;
  end_location: { lat: number; lng: number };
};

export interface DirectionsResult {
  coordinates: Coordinates[];
  legs: Array<{ steps: DirectionStep[] }>;
  distance: number;
  duration: number; // Selected ETA duration (traffic-aware when available)
  durationInTraffic: number | null;
  durationNoTraffic: number | null;
  etaSource: DirectionEtaSource;
}

const GOOGLE_MAPS_RUNTIME_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_SECRET ||
  process.env.GOOGLE_MAPS_API_KEY ||
  '';

export class GoogleMapsService {
  
  /**
   * Get coordinates from an address string using native geocoding
   * This replaces the legacy Google Places Autocomplete API
   */
  static async getCoordinatesFromAddress(address: string): Promise<Coordinates | null> {
    try {
      if (!address || address.length < 3) return null;
      
      const result = await Location.geocodeAsync(address);
      
      if (result && result.length > 0) {
        return {
          latitude: result[0].latitude,
          longitude: result[0].longitude
        };
      }
      return null;
    } catch (error) {
      console.warn('Error geocoding address:', error);
      return null;
    }
  }

  /**
   * Get address from coordinates using Geocoding API
   * Uses native platform reverse geocoding
   */
  static async getReverseGeocoding(latitude: number, longitude: number): Promise<string | null> {
    try {
      const result = await Location.reverseGeocodeAsync({ latitude, longitude });

      if (result && result.length > 0) {
        const addr = result[0];
        // Construct a readable address string
        const parts = [
          addr.street,
          addr.streetNumber,
          addr.city,
          addr.region,
          addr.isoCountryCode
        ].filter(Boolean);
        
        return parts.join(', ');
      }
      return null;
    } catch (error) {
      console.warn('Error reverse geocoding:', error);
      return null;
    }
  }

  /**
   * Get autocomplete suggestions using OpenStreetMap (Nominatim)
   * Free and does not require an API key.
   */
  static async getPlaceAutocomplete(input: string): Promise<any[]> {
    try {
      if (!input || input.length < 3) return [];
      
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input)}&format=json&addressdetails=1&limit=5&countrycodes=us`;
      
      const response = await fetch(url, {
        headers: {
          // Nominatim requires a descriptive user-agent.
          'User-Agent': 'RadarBot/1.0 (mobile navigation app)',
          'Accept': 'application/json',
        }
      });
      if (!response.ok) {
        console.warn(`OSM autocomplete failed: HTTP ${response.status}`);
        return [];
      }

      const rawText = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(rawText);
      } catch (parseError) {
        // Nominatim can return HTML/rate-limit pages; avoid crashing UI on parse failures.
        const preview = rawText.slice(0, 80).replace(/\s+/g, ' ');
        console.warn(`OSM autocomplete returned non-JSON payload: ${preview}`);
        return [];
      }

      if (Array.isArray(data)) {
        return data.map((item: any) => ({
           description: item.display_name,
           place_id: item.place_id,
           geometry: {
               location: {
                   lat: parseFloat(item.lat),
                   lng: parseFloat(item.lon)
               }
           }
        }));
      }
      return [];
    } catch (error) {
      console.warn('Error getting OSM autocomplete:', error);
      return [];
    }
  }
  
  /**
   * Get directions with Google traffic-aware ETA when available,
   * then fallback to OSRM (Open Source Routing Machine).
   */
  static async getDirections(
      originLat: number,
      originLng: number,
      destination: string 
  ): Promise<DirectionsResult | null> {
       try {
           const apiKey = GOOGLE_MAPS_RUNTIME_KEY;
           
           // Use Google Directions API if key exists (Much more reliable)
           if (apiKey) {
               const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${encodeURIComponent(destination)}&key=${apiKey}&mode=driving&departure_time=now&traffic_model=best_guess`;
               const response = await fetch(url);
               const data = await response.json();

               if (data.status === 'OK' && data.routes.length > 0) {
                   const route = data.routes[0];
                   const leg = route.legs?.[0];
                   if (leg) {
                     const points = this.decodePolyline(route.overview_polyline.points);
                     const durationNoTraffic = Number(leg.duration?.value) || 0;
                     const durationInTrafficValue = leg.duration_in_traffic?.value;
                     const durationInTraffic =
                       Number.isFinite(durationInTrafficValue) ? Number(durationInTrafficValue) : null;
                     const selectedDuration = durationInTraffic ?? durationNoTraffic;
                     const etaSource: DirectionEtaSource =
                       durationInTraffic !== null ? 'google_traffic' : 'google_base';
                     
                     // Map Google Steps
                     const steps = leg.steps.map((step: any) => ({
                         html_instructions: step.html_instructions,
                         distance: { value: Number(step.distance?.value) || 0 },
                         maneuver: step.maneuver || 'straight', // Google sometimes omits this for straight
                         end_location: {
                           lat: Number(step.end_location?.lat) || 0,
                           lng: Number(step.end_location?.lng) || 0,
                         },
                     }));

                     return {
                         coordinates: points,
                         legs: [{ steps }],
                         distance: Number(leg.distance?.value) || 0,
                         duration: selectedDuration,
                         durationInTraffic,
                         durationNoTraffic,
                         etaSource,
                     };
                   }
                   console.log('Google Directions response missing legs, falling back.');
               } else {
                   console.log('Google Directions failed:', data.status, data.error_message);
                   // Fallback to OSRM if Google fails (e.g. billing issue)
               }
           }

           // OSRM Fallback (Legacy)
           let destLat = 0, destLng = 0;
           if (destination.includes(',')) {
               const parts = destination.split(',');
               if (!isNaN(parseFloat(parts[0]))) {
                   destLat = parseFloat(parts[0]);
                   destLng = parseFloat(parts[1]);
               }
           }
           if (destLat === 0) {
               const coords = await this.getCoordinatesFromAddress(destination);
               if (coords) {
                   destLat = coords.latitude;
                   destLng = coords.longitude;
               } else {
                   return null;
               }
           }

           const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=polyline&steps=true&annotations=true`;
           const response = await fetch(url);
           const data = await response.json();
           
           if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
               const route = data.routes[0];
               const points = this.decodePolyline(route.geometry);
               const steps = route.legs[0].steps.map((step: any) => {
                   const endLng = step.maneuver?.location?.[0] ?? step.intersections?.[0]?.location?.[0];
                   const endLat = step.maneuver?.location?.[1] ?? step.intersections?.[0]?.location?.[1];
                   return {
                     html_instructions: this.buildOsrmInstruction(
                       step.maneuver?.type,
                       step.maneuver?.modifier,
                       step.name
                     ),
                     distance: { value: step.distance },
                     maneuver: this.normalizeOsrmManeuver(step.maneuver?.type, step.maneuver?.modifier),
                     end_location: { lat: endLat, lng: endLng }
                   };
               });

               return {
                   coordinates: points,
                   legs: [{ steps }],
                   distance: route.distance,
                   duration: route.duration,
                   durationInTraffic: null,
                   durationNoTraffic: route.duration,
                   etaSource: 'osrm_estimate',
               };
           }
           return null;

       } catch (error) {
           console.warn('Error getting directions:', error);
           return null;
       }
  }

  private static normalizeOsrmManeuver(stepType?: string, modifier?: string): string {
    if (!stepType) return 'continue';

    if (stepType === 'turn' && modifier) return `turn-${modifier}`;
    if (stepType === 'uturn') return modifier === 'right' ? 'uturn-right' : 'uturn-left';
    if ((stepType === 'fork' || stepType === 'new name') && modifier) return `keep-${modifier}`;
    if ((stepType === 'on ramp' || stepType === 'off ramp') && modifier) return `ramp-${modifier}`;
    if (stepType === 'roundabout' || stepType === 'rotary') return modifier ? `roundabout-${modifier}` : 'roundabout-right';
    if (stepType === 'merge') return 'merge';
    if (stepType === 'end of road' && modifier) return `turn-${modifier}`;
    if (stepType === 'arrive') return 'continue';
    if (stepType === 'continue') return 'continue';

    return modifier ? `${stepType}-${modifier}` : stepType;
  }

  private static buildOsrmInstruction(stepType?: string, modifier?: string, streetName?: string): string {
    const maneuver = this.normalizeOsrmManeuver(stepType, modifier);
    const road = streetName && streetName.trim().length > 0 ? streetName : 'the road';

    switch (maneuver) {
      case 'turn-left':
        return `Turn left onto ${road}`;
      case 'turn-right':
        return `Turn right onto ${road}`;
      case 'turn-slight-left':
      case 'keep-left':
        return `Keep left onto ${road}`;
      case 'turn-slight-right':
      case 'keep-right':
        return `Keep right onto ${road}`;
      case 'turn-sharp-left':
        return `Take a sharp left onto ${road}`;
      case 'turn-sharp-right':
        return `Take a sharp right onto ${road}`;
      case 'uturn-left':
      case 'uturn-right':
        return 'Make a U-turn';
      case 'merge':
        return `Merge onto ${road}`;
      case 'ramp-left':
      case 'ramp-right':
        return `Take the ramp onto ${road}`;
      case 'roundabout-left':
      case 'roundabout-right':
        return 'Enter the roundabout and continue';
      case 'continue':
      default:
        return `Continue on ${road}`;
    }
  }

  // Polyline decoder compatible with OSRM (same algorithm as Google)
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
}

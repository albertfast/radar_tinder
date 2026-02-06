/**
 * OSRM Service - Free Open Source Routing
 * Uses OSRM (Open Source Routing Machine) for directions
 * Public demo server or self-hosted
 */

export interface RouteResult {
  coordinates: Array<{ latitude: number; longitude: number }>;
  distance: number; // meters
  duration: number; // seconds
  legs: Array<{
    distance: { text: string; value: number };
    duration: { text: string; value: number };
    steps: Array<{
      html_instructions: string;
      distance: { value: number };
      maneuver?: string;
      end_location: { lat: number; lng: number };
    }>;
    start_address?: string;
    end_address?: string;
    end_location?: { lat: number; lng: number };
  }>;
}

// Public OSRM demo server (free, rate-limited for production use)
const OSRM_BASE_URL = 'https://router.project-osrm.org';

export class OSRMService {
  /**
   * Get driving directions between two points
   * Returns polyline coordinates for map display
   */
  static async getDirections(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
  ): Promise<RouteResult | null> {
    try {
      // OSRM uses lng,lat order (opposite of Google)
      const url = `${OSRM_BASE_URL}/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=polyline&steps=true&annotations=true`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.code !== 'Ok' || !data.routes?.length) {
        console.warn('[OSRM] No route found:', data.code, data.message);
        return null;
      }

      const route = data.routes[0];
      const coordinates = this.decodePolyline(route.geometry);

      // Transform OSRM response to match Google format
      const legs = route.legs.map((leg: any, legIndex: number) => ({
        distance: {
          text: this.formatDistance(leg.distance),
          value: Math.round(leg.distance),
        },
        duration: {
          text: this.formatDuration(leg.duration),
          value: Math.round(leg.duration),
        },
        steps: leg.steps?.map((step: any) => ({
          html_instructions: this.buildInstruction(step),
          distance: { value: step.distance },
          maneuver: this.mapManeuver(step.maneuver?.type, step.maneuver?.modifier),
          end_location: {
            lat: step.maneuver?.location?.[1] ?? destLat,
            lng: step.maneuver?.location?.[0] ?? destLng,
          },
        })) || [],
        end_location: {
          lat: destLat,
          lng: destLng,
        },
      }));

      return {
        coordinates,
        distance: Math.round(route.distance),
        duration: Math.round(route.duration),
        legs,
      };
    } catch (error) {
      console.error('[OSRM] Error getting directions:', error);
      return null;
    }
  }

  /**
   * Get distance and duration between two points (no full route needed)
   * More efficient than full directions when only distance is needed
   */
  static async getDistance(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
  ): Promise<{ distance: number; duration: number } | null> {
    try {
      const url = `${OSRM_BASE_URL}/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=false`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.code !== 'Ok' || !data.routes?.length) {
        return null;
      }

      return {
        distance: Math.round(data.routes[0].distance),
        duration: Math.round(data.routes[0].duration),
      };
    } catch (error) {
      console.error('[OSRM] Error getting distance:', error);
      return null;
    }
  }

  /**
   * Decode Google-style polyline (OSRM uses same format)
   */
  private static decodePolyline(encoded: string): Array<{ latitude: number; longitude: number }> {
    const points: Array<{ latitude: number; longitude: number }> = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b: number;
      let shift = 0;
      let result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += dlat;

      shift = 0;
      result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += dlng;

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return points;
  }

  /**
   * Build human-readable instruction from OSRM step
   */
  private static buildInstruction(step: any): string {
    const type = step.maneuver?.type || 'continue';
    const modifier = step.maneuver?.modifier || '';
    const name = step.name || step.ref || 'the road';

    const typeInstructions: Record<string, string> = {
      turn: `Turn ${modifier}`,
      'new name': `Continue onto ${name}`,
      depart: `Head ${modifier || 'north'}`,
      arrive: 'You have arrived',
      merge: `Merge ${modifier}`,
      'on ramp': `Take the ramp ${modifier}`,
      'off ramp': `Take the exit ${modifier}`,
      fork: `Keep ${modifier}`,
      'end of road': `Turn ${modifier}`,
      continue: `Continue on ${name}`,
      roundabout: `Enter the roundabout`,
      rotary: `Enter the rotary`,
      'roundabout turn': `At the roundabout, take the exit`,
      notification: '',
      'exit roundabout': 'Exit the roundabout',
      'exit rotary': 'Exit the rotary',
    };

    let instruction = typeInstructions[type] || `Continue on ${name}`;

    if (name && !instruction.includes(name) && type !== 'arrive') {
      instruction += ` onto ${name}`;
    }

    return instruction;
  }

  /**
   * Map OSRM maneuver to Google-style maneuver string
   */
  private static mapManeuver(type?: string, modifier?: string): string {
    if (!type) return 'straight';

    const maneuverMap: Record<string, string> = {
      'turn-left': 'turn-left',
      'turn-right': 'turn-right',
      'slight left': 'turn-slight-left',
      'slight right': 'turn-slight-right',
      'sharp left': 'turn-sharp-left',
      'sharp right': 'turn-sharp-right',
      'uturn': 'uturn-left',
      'straight': 'straight',
      'merge': 'merge',
      'ramp': modifier?.includes('left') ? 'ramp-left' : 'ramp-right',
      'fork': modifier?.includes('left') ? 'keep-left' : 'keep-right',
    };

    const key = modifier ? `${type}-${modifier}`.toLowerCase() : type.toLowerCase();
    return maneuverMap[modifier || ''] || maneuverMap[type] || 'straight';
  }

  /**
   * Format distance for display
   */
  private static formatDistance(meters: number): string {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  }

  /**
   * Format duration for display
   */
  private static formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)} sec`;
    }
    if (seconds < 3600) {
      return `${Math.round(seconds / 60)} min`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `${hours} hr ${mins} min`;
  }
}

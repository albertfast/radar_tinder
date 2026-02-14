/**
 * Nominatim Service - Free OpenStreetMap Geocoding
 * Uses Nominatim for address search and reverse geocoding
 * Rate limit: 1 request/second for public endpoint
 */

export interface GeocodingResult {
  display_name: string;
  lat: string;
  lon: string;
  place_id: number;
  address?: {
    road?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

// Debounce/throttle tracking
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1 seconds to be safe

type SearchOptions = {
  limit?: number;
  countryCode?: string;
  focusLocation?: { latitude: number; longitude: number };
  focusRadiusKm?: number;
  bounded?: boolean;
};

export class NominatimService {
  /**
   * Search for address suggestions
   * Returns list of matching places with coordinates
   */
  static async search(
    query: string,
    options?: SearchOptions
  ): Promise<GeocodingResult[]> {
    try {
      if (!query || query.trim().length < 2) return [];

      // Respect rate limit
      await this.throttle();

      const limit = options?.limit || 5;
      const params = new URLSearchParams({
        q: query.trim(),
        format: 'json',
        limit: String(limit),
        addressdetails: '1',
        dedupe: '1',
      });

      const countryCode = options?.countryCode?.trim().toLowerCase();
      if (countryCode) {
        params.append('countrycodes', countryCode);
      }

      const focusLocation = options?.focusLocation;
      if (
        focusLocation &&
        Number.isFinite(focusLocation.latitude) &&
        Number.isFinite(focusLocation.longitude)
      ) {
        const viewBox = this.buildViewbox(
          focusLocation.latitude,
          focusLocation.longitude,
          options?.focusRadiusKm
        );
        if (viewBox) {
          params.append('viewbox', viewBox);
          if (options?.bounded) {
            params.append('bounded', '1');
          }
        }
      }

      const url = `${NOMINATIM_BASE_URL}/search?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'RadarTinder/1.0', // Required by Nominatim ToS
          'Accept-Language': 'en',
        },
      });

      if (!response.ok) {
        console.warn('[Nominatim] Search failed:', response.status);
        return [];
      }

      const data = await response.json();
      return data as GeocodingResult[];
    } catch (error) {
      console.error('[Nominatim] Search error:', error);
      return [];
    }
  }

  /**
   * Get address from coordinates (reverse geocoding)
   */
  static async reverse(
    lat: number,
    lon: number
  ): Promise<GeocodingResult | null> {
    try {
      await this.throttle();

      const url = `${NOMINATIM_BASE_URL}/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'RadarTinder/1.0',
          'Accept-Language': 'en',
        },
      });

      if (!response.ok) {
        console.warn('[Nominatim] Reverse geocoding failed:', response.status);
        return null;
      }

      return (await response.json()) as GeocodingResult;
    } catch (error) {
      console.error('[Nominatim] Reverse geocoding error:', error);
      return null;
    }
  }

  /**
   * Get formatted address suggestions for autocomplete
   * Returns array of display names only (for UI)
   */
  static async getSuggestions(
    query: string,
    options?: SearchOptions
  ): Promise<string[]> {
    const results = await this.search(query, options);
    return results.map((r) => r.display_name);
  }

  /**
   * Get coordinates from address
   * Returns first match coordinates or null
   */
  static async geocode(
    address: string
  ): Promise<{ lat: number; lon: number } | null> {
    const results = await this.search(address, { limit: 1 });
    
    if (results.length === 0) return null;

    return {
      lat: parseFloat(results[0].lat),
      lon: parseFloat(results[0].lon),
    };
  }

  /**
   * Enforce rate limiting (1 req/sec)
   */
  private static async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - lastRequestTime;

    if (elapsed < MIN_REQUEST_INTERVAL) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_REQUEST_INTERVAL - elapsed)
      );
    }

    lastRequestTime = Date.now();
  }

  private static buildViewbox(
    latitude: number,
    longitude: number,
    radiusKm: number = 60
  ): string | null {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    const latDelta = radiusKm / 111;
    const safeCos = Math.max(0.2, Math.cos((latitude * Math.PI) / 180));
    const lonDelta = radiusKm / (111 * safeCos);

    const left = longitude - lonDelta;
    const right = longitude + lonDelta;
    const top = latitude + latDelta;
    const bottom = latitude - latDelta;
    return `${left},${top},${right},${bottom}`;
  }

  /**
   * Format address for display (shorter version)
   */
  static formatShortAddress(result: GeocodingResult): string {
    const parts: string[] = [];
    const addr = result.address;

    if (addr?.road) parts.push(addr.road);
    if (addr?.city) parts.push(addr.city);
    if (addr?.state) parts.push(addr.state);

    if (parts.length === 0) {
      // Fallback to first part of display_name
      return result.display_name.split(',').slice(0, 2).join(',').trim();
    }

    return parts.join(', ');
  }
}

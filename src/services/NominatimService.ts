/**
 * Nominatim Service - Free OpenStreetMap Geocoding
 * Uses Nominatim for address search and reverse geocoding
 * Rate limit: 1 request/second for public endpoint
 */

import { AddressSuggestion } from '../types';

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

  static async getSuggestionObjects(
    query: string,
    options?: SearchOptions
  ): Promise<AddressSuggestion[]> {
    const results = await this.search(query, options);
    if (!results.length) return [];

    const normalizedQuery = query.trim().toLowerCase();
    const queryTokens = normalizedQuery
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);
    const focusLocation = options?.focusLocation;
    const dedupe = new Map<string, AddressSuggestion>();

    for (const result of results) {
      const lat = Number.parseFloat(result.lat);
      const lon = Number.parseFloat(result.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const label = this.buildSuggestionLabel(result);
      if (!label || this.isMalformedInterpolationLabel(label)) continue;
      if (!this.matchesQueryTokens(label, queryTokens, normalizedQuery)) continue;

      const street = this.normalizeText(
        [result.address?.road, result.address?.postcode].filter(Boolean).join(' ')
      );
      const city = this.normalizeText(
        [result.address?.city, result.address?.state, result.address?.country]
          .filter(Boolean)
          .join(' ')
      );
      const latBucket = Math.round(lat * 10000);
      const lonBucket = Math.round(lon * 10000);
      const dedupeKey = `${street}|${city}|${latBucket}|${lonBucket}`;
      const qualityScore = this.computeSuggestionScore(
        label,
        queryTokens,
        focusLocation,
        lat,
        lon
      );

      const suggestion: AddressSuggestion = {
        id: `nominatim:${result.place_id}:${latBucket}:${lonBucket}`,
        label,
        queryValue: `${lat},${lon}`,
        latitude: lat,
        longitude: lon,
        source: 'nominatim',
        qualityScore,
      };

      const existing = dedupe.get(dedupeKey);
      if (!existing || suggestion.qualityScore > existing.qualityScore) {
        dedupe.set(dedupeKey, suggestion);
      }
    }

    return Array.from(dedupe.values())
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, options?.limit || 6);
  }

  /**
   * Backward compatible string-only suggestions.
   */
  static async getSuggestions(
    query: string,
    options?: SearchOptions
  ): Promise<string[]> {
    const results = await this.getSuggestionObjects(query, options);
    return results.map((item) => item.label);
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

  private static normalizeText(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private static buildSuggestionLabel(result: GeocodingResult): string {
    const road = result.address?.road?.trim();
    const city = (result.address?.city || result.address?.state || '').trim();
    const country = (result.address?.country || '').trim();

    const leading = result.display_name.split(',')[0]?.trim() || '';
    const hasStreetToken =
      /\d/.test(leading) || /\b(st|street|ave|avenue|rd|road|blvd|drive|dr|way|ln|lane|hwy|highway)\b/i.test(leading);

    const candidate = hasStreetToken
      ? leading
      : [road, city].filter(Boolean).join(', ');
    const fallback = result.display_name
      .split(',')
      .slice(0, 4)
      .map((part) => part.trim())
      .filter(Boolean)
      .join(', ');
    const compact = candidate || fallback;
    if (!compact) return '';

    const suffix = [city, country]
      .filter(Boolean)
      .join(', ')
      .trim();
    const label = suffix && !compact.toLowerCase().includes(suffix.toLowerCase())
      ? `${compact}, ${suffix}`
      : compact;
    return label.replace(/\s+/g, ' ').trim();
  }

  private static isMalformedInterpolationLabel(label: string): boolean {
    if (!label) return true;
    if (label.length > 140 && /;/.test(label)) return true;
    if (/\d{2,}\s*;\s*\d{2,}\s*;\s*\d{2,}/.test(label)) return true;
    const semicolonCount = (label.match(/;/g) || []).length;
    if (semicolonCount >= 2) return true;
    return false;
  }

  private static matchesQueryTokens(
    label: string,
    queryTokens: string[],
    normalizedQuery: string
  ): boolean {
    const normalizedLabel = this.normalizeText(label);
    if (!normalizedLabel) return false;

    if (/^\d+$/.test(normalizedQuery)) {
      return normalizedLabel.includes(normalizedQuery);
    }

    if (!queryTokens.length) {
      return normalizedLabel.includes(normalizedQuery);
    }

    const required = queryTokens.slice(0, 2);
    return required.every((token) => normalizedLabel.includes(token));
  }

  private static computeSuggestionScore(
    label: string,
    queryTokens: string[],
    focusLocation: { latitude: number; longitude: number } | undefined,
    lat: number,
    lon: number
  ): number {
    const normalizedLabel = this.normalizeText(label);
    let score = 0;
    if (/\d+/.test(normalizedLabel)) score += 25;
    if (/\b(st|street|ave|avenue|rd|road|blvd|drive|dr|way|ln|lane|hwy|highway)\b/i.test(normalizedLabel)) {
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

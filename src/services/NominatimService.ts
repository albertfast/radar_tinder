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
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
    postcode?: string;
  };
}

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const SEARCH_CACHE_TTL_MS = 120000;

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

type SearchCacheEntry = {
  value: GeocodingResult[];
  expiresAt: number;
};

export class NominatimService {
  private static searchCache = new Map<string, SearchCacheEntry>();
  private static inflightSearches = new Map<string, Promise<GeocodingResult[]>>();

  /**
   * Search for address suggestions
   * Returns list of matching places with coordinates
   */
  static async search(
    query: string,
    options?: SearchOptions
  ): Promise<GeocodingResult[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || trimmedQuery.length < 2) return [];

    const cacheKey = this.buildSearchCacheKey(trimmedQuery, options);
    const cached = this.getCachedSearch(cacheKey);
    if (cached) return cached;

    const inflight = this.inflightSearches.get(cacheKey);
    if (inflight) return inflight;

    const request = this.fetchSearchResults(trimmedQuery, options)
      .then((results) => {
        this.setCachedSearch(cacheKey, results);
        return results;
      })
      .finally(() => {
        this.inflightSearches.delete(cacheKey);
      });

    this.inflightSearches.set(cacheKey, request);
    return request;
  }

  private static async fetchSearchResults(
    query: string,
    options?: SearchOptions
  ): Promise<GeocodingResult[]> {
    try {
      // Respect rate limit
      await this.throttle();

      const limit = Math.max(options?.limit || 6, query.length >= 4 ? 8 : 6);
      const params = new URLSearchParams({
        q: query,
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
          if (options?.bounded && /\d/.test(query)) {
            params.append('bounded', '1');
          }
        }
      }

      const url = `${NOMINATIM_BASE_URL}/search?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'RadarTinder/1.0', // Required by Nominatim ToS
          'Accept-Language': 'en-US,en',
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
      const searchableText = `${label} ${result.display_name}`.trim();
      if (!label || this.isMalformedInterpolationLabel(label)) continue;
      if (!this.matchesQueryTokens(searchableText, queryTokens, normalizedQuery)) continue;

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
        searchableText,
        queryTokens,
        focusLocation,
        lat,
        lon,
        normalizedQuery
      );

      const suggestion: AddressSuggestion = {
        id: `nominatim:${result.place_id}:${latBucket}:${lonBucket}`,
        label,
        queryValue: `${lat},${lon}`,
        latitude: lat,
        longitude: lon,
        source: 'nominatim',
        qualityScore,
        matchKind: 'nominatim',
        distanceKmFromUser: focusLocation
          ? this.distanceKm(focusLocation.latitude, focusLocation.longitude, lat, lon)
          : undefined,
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
    const houseNumber = (result.address?.house_number || '')
      .replace(/;.*$/, '')
      .trim();
    const road = (result.address?.road || '').trim();
    const city = (
      result.address?.city ||
      result.address?.town ||
      result.address?.village ||
      result.address?.suburb ||
      result.address?.county ||
      result.address?.state ||
      ''
    ).trim();
    const state = (result.address?.state || '').trim();
    const country = (result.address?.country || '').trim();

    const leading = result.display_name.split(',')[0]?.trim() || '';
    const safeLeading = leading.includes(';') ? '' : leading;
    const hasStreetToken =
      /\d/.test(safeLeading) || /\b(st|street|ave|avenue|rd|road|blvd|drive|dr|way|ln|lane|hwy|highway)\b/i.test(safeLeading);
    const streetLine = [houseNumber, road].filter(Boolean).join(' ').trim();

    const candidate = hasStreetToken
      ? safeLeading
      : [streetLine || road, city].filter(Boolean).join(', ');
    const fallback = result.display_name
      .split(',')
      .slice(0, 4)
      .map((part) => part.trim())
      .filter(Boolean)
      .join(', ');
    const compact = candidate || fallback;
    if (!compact) return '';

    const suffix = [city, state && state !== city ? state : '', country]
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
    text: string,
    queryTokens: string[],
    normalizedQuery: string
  ): boolean {
    const normalizedText = this.normalizeText(text);
    if (!normalizedText) return false;
    const textTokens = normalizedText
      .split(/[\s,/-]+/)
      .map((token) => token.trim())
      .filter(Boolean);

    if (/^\d+$/.test(normalizedQuery)) {
      return textTokens.some((token) => token.startsWith(normalizedQuery));
    }

    if (!queryTokens.length) {
      return normalizedText.includes(normalizedQuery);
    }

    const required = queryTokens.slice(0, Math.min(3, queryTokens.length));
    const matches = required.filter((token) => {
      if (normalizedText.includes(token)) return true;
      return textTokens.some((textToken) => textToken.startsWith(token));
    }).length;

    if (required.length <= 1) return matches === 1;
    return matches >= Math.min(2, required.length);
  }

  private static computeSuggestionScore(
    label: string,
    searchableText: string,
    queryTokens: string[],
    focusLocation: { latitude: number; longitude: number } | undefined,
    lat: number,
    lon: number,
    normalizedQuery: string
  ): number {
    const normalizedLabel = this.normalizeText(label);
    const normalizedText = this.normalizeText(searchableText);
    const textTokens = normalizedText
      .split(/[\s,/-]+/)
      .map((token) => token.trim())
      .filter(Boolean);
    let score = 0;
    if (/\d+/.test(normalizedLabel)) score += 25;
    if (/\b(st|street|ave|avenue|rd|road|blvd|drive|dr|way|ln|lane|hwy|highway)\b/i.test(normalizedLabel)) {
      score += 10;
    }

    if (normalizedLabel.startsWith(normalizedQuery)) score += 65;
    else if (normalizedText.startsWith(normalizedQuery)) score += 40;
    else if (normalizedText.includes(normalizedQuery)) score += 18;

    const tokenMatches = queryTokens.filter((token) => normalizedText.includes(token)).length;
    const tokenPrefixMatches = queryTokens.filter((token) =>
      textTokens.some((textToken) => textToken.startsWith(token))
    ).length;
    score += tokenMatches * 16;
    score += tokenPrefixMatches * 20;

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

  private static buildSearchCacheKey(
    query: string,
    options?: SearchOptions
  ): string {
    const countryCode = options?.countryCode?.trim().toLowerCase() || 'any';
    const focusLocation = options?.focusLocation;
    const focusBucket =
      focusLocation &&
      Number.isFinite(focusLocation.latitude) &&
      Number.isFinite(focusLocation.longitude)
        ? `${focusLocation.latitude.toFixed(2)},${focusLocation.longitude.toFixed(2)}`
        : 'none';

    return [
      this.normalizeText(query),
      countryCode,
      options?.bounded ? 'bounded' : 'open',
      String(options?.limit || 0),
      focusBucket,
    ].join('|');
  }

  private static getCachedSearch(key: string): GeocodingResult[] | null {
    const cached = this.searchCache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.searchCache.delete(key);
      return null;
    }
    return cached.value;
  }

  private static setCachedSearch(key: string, value: GeocodingResult[]): void {
    this.searchCache.set(key, {
      value,
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    });
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

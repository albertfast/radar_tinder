import { OSRMService } from './OSRMService';
import { NominatimService } from './NominatimService';
import { AddressSuggestion } from '../types';
import { readBooleanFlag } from '../utils/flags';

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

interface CoordinateSpeedLimitResult {
  speedLimit: number;
  units: 'KPH' | 'MPH';
  placeId?: string;
  source: 'roads_api' | 'osm' | 'unknown' | 'roads_unavailable';
}

interface DistanceResult {
  distance: {
    text: string;
    value: number;
  };
  duration: {
    text: string;
    value: number;
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
  private static TRAFFIC_ETA_V2_ENABLED = readBooleanFlag('EXPO_PUBLIC_TRAFFIC_ETA_V2', true);
  private static OVERPASS_SPEED_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
  ];

  private static speedLimitCache = new Map<
    string,
    { value: CoordinateSpeedLimitResult; timestamp: number }
  >();

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
      }
      if (data.status !== 'ZERO_RESULTS' && data.status !== 'REQUEST_DENIED') {
        console.warn('Google Places API Error:', data.status, data.error_message);
      }
      return [];
    } catch (error) {
      console.error('Error searching nearby places:', error);
      return [];
    }
  }

  static async getSpeedLimit(
    placeId: string
  ): Promise<SpeedLimitResult | 'roads_unavailable' | null> {
    try {
      if (!GOOGLE_MAPS_API_KEY) return null;
      const url = `https://roads.googleapis.com/v1/speedLimits?placeId=${placeId}&key=${GOOGLE_MAPS_API_KEY}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 403) {
          return 'roads_unavailable';
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

  static async getSpeedLimitForCoordinate(
    latitude: number,
    longitude: number
  ): Promise<CoordinateSpeedLimitResult | null> {
    try {
      const now = Date.now();
      const coordinateCacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
      const coordinateCached = this.speedLimitCache.get(coordinateCacheKey);
      if (coordinateCached && now - coordinateCached.timestamp < 120000) {
        return coordinateCached.value;
      }

      let placeId: string | null = null;
      if (GOOGLE_MAPS_API_KEY) {
        const snapUrl = `https://roads.googleapis.com/v1/snapToRoads?path=${latitude},${longitude}&interpolate=false&key=${GOOGLE_MAPS_API_KEY}`;
        const snapResponse = await fetch(snapUrl);
        if (snapResponse.ok) {
          const snapData = await snapResponse.json();
          placeId = snapData?.snappedPoints?.[0]?.placeId || null;
        }
      }

      let roadsUnavailable = false;
      if (placeId) {
        const placeCacheKey = `place:${placeId}`;
        const placeCached = this.speedLimitCache.get(placeCacheKey);
        if (placeCached && now - placeCached.timestamp < 120000) {
          this.speedLimitCache.set(coordinateCacheKey, placeCached);
          return placeCached.value;
        }

        const speed = await this.getSpeedLimit(placeId);
        if (speed === 'roads_unavailable') {
          roadsUnavailable = true;
        }
        if (speed && speed !== 'roads_unavailable' && speed.speedLimit) {
          const result: CoordinateSpeedLimitResult = {
            speedLimit: speed.speedLimit,
            units: speed.units,
            placeId: speed.placeId,
            source: 'roads_api',
          };
          this.speedLimitCache.set(coordinateCacheKey, { value: result, timestamp: now });
          this.speedLimitCache.set(placeCacheKey, { value: result, timestamp: now });
          return result;
        }
      }

      const osmSpeed = await this.getOsmSpeedLimitForCoordinate(latitude, longitude);
      if (osmSpeed) {
        const result: CoordinateSpeedLimitResult = {
          speedLimit: osmSpeed.speedLimit,
          units: osmSpeed.units,
          source: 'osm',
        };
        this.speedLimitCache.set(coordinateCacheKey, { value: result, timestamp: now });
        return result;
      }

      const unknown: CoordinateSpeedLimitResult = {
        speedLimit: 0,
        units: 'MPH',
        source: roadsUnavailable ? 'roads_unavailable' : 'unknown',
      };
      this.speedLimitCache.set(coordinateCacheKey, { value: unknown, timestamp: now });
      return unknown;
    } catch (error) {
      console.warn('Error getting speed limit for coordinate:', error);
      return null;
    }
  }

  static async getDistance(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
  ): Promise<DistanceResult | null> {
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
      const trafficParams = this.TRAFFIC_ETA_V2_ENABLED
        ? '&departure_time=now&traffic_model=best_guess'
        : '';
      const url = `${this.BASE_URL}/directions/json?origin=${origin}&destination=${encodeURIComponent(destination)}&mode=driving${alternatives}${trafficParams}&language=en&key=${GOOGLE_MAPS_API_KEY}`;

      console.log('[GoogleMapsService] Fetching directions to:', destination);

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK') {
        const routes = Array.isArray(data.routes) ? data.routes : [];

        const scoredRoutes = routes.map((route: any) => {
          const leg = route?.legs?.[0];
          const durationValue =
            leg?.duration_in_traffic?.value ?? leg?.duration?.value ?? Number.MAX_SAFE_INTEGER;
          const distance = leg?.distance?.value ?? Number.MAX_SAFE_INTEGER;
          const trafficDuration = leg?.duration_in_traffic?.value ?? durationValue;
          const trafficScore = trafficDuration;
          const distancePenalty = distance * 0.08;
          return {
            route,
            duration: durationValue,
            distance,
            trafficDuration,
            score: trafficScore + distancePenalty,
          };
        });

        scoredRoutes.sort((a: any, b: any) => a.score - b.score);

        const selectedRoute = scoredRoutes[0]?.route ?? routes[0];
        const points = this.decodePolyline(selectedRoute.overview_polyline.points);

        const leg = selectedRoute.legs[0];
        const effectiveDuration =
          this.TRAFFIC_ETA_V2_ENABLED && leg?.duration_in_traffic
            ? leg.duration_in_traffic
            : leg.duration;
        const routeInfo = {
          coordinates: points,
          legs: [{
            distance: leg.distance,
            duration: effectiveDuration || leg.duration,
            duration_in_traffic: leg.duration_in_traffic,
            end_address: leg.end_address,
            start_address: leg.start_address,
            steps: leg.steps,
            end_location: leg.end_location,
            start_location: leg.start_location,
          }],
          overview_polyline: selectedRoute.overview_polyline,
          copyrights: selectedRoute.copyrights,
          waypoint_order: selectedRoute.waypoint_order,
        };

        console.log('[GoogleMapsService] Best route selected with', points.length, 'points, traffic ETA(s):', scoredRoutes[0]?.trafficDuration);
        return routeInfo;
      }

      console.warn('Directions API Error:', data.status, data.error_message);

      const fallback = await this.getFallbackDirections(originLat, originLng, destination);
      if (fallback && !fallback.error) {
        console.log('[GoogleMapsService] Fallback route selected via OSRM');
        return fallback;
      }

      if (data.status === 'ZERO_RESULTS') {
        return { error: 'ZERO_RESULTS', message: 'No route found to this destination. Please try a different destination.' };
      }
      if (data.status === 'NOT_FOUND') {
        return { error: 'NOT_FOUND', message: 'Location not found. Please check the address and try again.' };
      }
      if (data.status === 'REQUEST_DENIED') {
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

  static async recalculateRoute(
    currentLat: number,
    currentLng: number,
    destination: string,
    originalRoute?: any
  ): Promise<any> {
    try {
      console.log('[GoogleMapsService] Recalculating route from current position');

      const legEnd = originalRoute?.legs?.[0]?.end_location;
      const endLat = Number(legEnd?.lat ?? legEnd?.latitude);
      const endLng = Number(legEnd?.lng ?? legEnd?.longitude);
      const destinationTarget =
        Number.isFinite(endLat) && Number.isFinite(endLng)
          ? `${endLat},${endLng}`
          : destination;

      const newRoute = await this.getDirections(currentLat, currentLng, destinationTarget, {
        alternatives: true,
        prefer: 'duration',
      });

      if (newRoute && !newRoute.error && Array.isArray(newRoute.coordinates) && newRoute.coordinates.length > 0) {
        console.log('[GoogleMapsService] Route recalculated and applied');
        return newRoute;
      }

      if (originalRoute && Array.isArray(originalRoute.coordinates) && originalRoute.coordinates.length > 0) {
        console.warn('[GoogleMapsService] Recalculation failed, keeping previous route snapshot');
        return originalRoute;
      }

      return newRoute;
    } catch (error) {
      console.error('Error recalculating route:', error);
      return { error: 'RECALCULATION_ERROR', message: 'Could not recalculate route. Please try again.' };
    }
  }

  private static decodePolyline(t: string) {
    const points: Array<{ latitude: number; longitude: number }> = [];
    let index = 0;
    const len = t.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b;
      let shift = 0;
      let result = 0;
      do {
        b = t.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = t.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += dlng;
      points.push({ latitude: (lat / 1e5), longitude: (lng / 1e5) });
    }

    return points;
  }

  static async getPlaceAutocomplete(_input: string): Promise<any[]> {
    return [];
  }

  static async getReverseGeocoding(latitude: number, longitude: number): Promise<string | null> {
    try {
      const url = `${this.BASE_URL}/geocode/json?latlng=${latitude},${longitude}&language=en&key=${GOOGLE_MAPS_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.results.length > 0) {
        return data.results[0].formatted_address;
      }
      return null;
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      return null;
    }
  }

  static async getGeocodeSuggestions(
    input: string,
    options?: GeocodeSuggestionOptions
  ): Promise<AddressSuggestion[]> {
    const query = input.trim();
    if (!query) return [];

    const normalizedCountry = options?.countryCode?.trim().toLowerCase();
    const isShortOrMostlyNumericQuery =
      query.length <= 4 || /^[\d\s-]+$/.test(query);
    const normalizedQuery = query.toLowerCase();
    const queryTokens = normalizedQuery
      .split(/\s+/)
      .map((token: string) => token.trim())
      .filter((token: string) => token.length >= 2);

    // Primary source: Google geocoding
    try {
      if (GOOGLE_MAPS_API_KEY) {
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
              matchKind: 'google',
              distanceKmFromUser: options?.focusLocation
                ? this.distanceKm(
                    options.focusLocation.latitude,
                    options.focusLocation.longitude,
                    lat,
                    lon
                  )
                : undefined,
            };

            const existing = deduped.get(dedupeKey);
            if (!existing || qualityScore > existing.qualityScore) {
              deduped.set(dedupeKey, item);
            }
          }

          const googleResults = Array.from(deduped.values())
            .sort((a, b) => b.qualityScore - a.qualityScore)
            .slice(0, 6);
          if (googleResults.length > 0) {
            return googleResults;
          }
        }
      }
    } catch (googleError) {
      console.warn('[GoogleMapsService] Google geocoding failed, trying Nominatim:', googleError);
    }

    // Fallback source: Nominatim
    try {
      let nominatimResults = await NominatimService.getSuggestionObjects(query, {
        limit: 6,
        countryCode: normalizedCountry,
        focusLocation: options?.focusLocation,
        focusRadiusKm: isShortOrMostlyNumericQuery ? 90 : 180,
        bounded: isShortOrMostlyNumericQuery,
      });

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

      return nominatimResults
        .map((item) => ({
          ...item,
          matchKind: 'nominatim' as const,
          distanceKmFromUser:
            options?.focusLocation &&
            Number.isFinite(item.latitude) &&
            Number.isFinite(item.longitude)
              ? this.distanceKm(
                  options.focusLocation.latitude,
                  options.focusLocation.longitude,
                  item.latitude,
                  item.longitude
                )
              : item.distanceKmFromUser,
        }))
        .slice(0, 6);
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

    const queryLeadingNumber = queryTokens.length
      ? this.extractLeadingNumber(queryTokens[0])
      : null;
    const labelLeadingNumber = this.extractLeadingNumber(normalizedLabel);
    if (queryLeadingNumber && labelLeadingNumber === queryLeadingNumber) {
      score += 65;
    }
    if (queryTokens.length > 0 && normalizedLabel.startsWith(queryTokens.join(' '))) {
      score += 40;
    }

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

  private static extractLeadingNumber(value: string): string | null {
    const match = value.match(/^(\d{1,6})\b/);
    return match?.[1] || null;
  }

  private static parseMaxspeedValue(rawValue: string | null | undefined): SpeedLimitResult | null {
    if (!rawValue) return null;
    const text = String(rawValue).trim().toLowerCase();
    if (!text) return null;

    const numericMatch = text.match(/(\d{2,3})/);
    if (!numericMatch) return null;
    const speedLimit = Number(numericMatch[1]);
    if (!Number.isFinite(speedLimit) || speedLimit <= 0) return null;

    if (/\bmph\b/.test(text)) {
      return { placeId: 'osm', speedLimit, units: 'MPH' };
    }
    if (/\b(km\/h|kph)\b/.test(text)) {
      return { placeId: 'osm', speedLimit, units: 'KPH' };
    }

    return { placeId: 'osm', speedLimit, units: 'MPH' };
  }

  private static async getOsmSpeedLimitForCoordinate(
    latitude: number,
    longitude: number
  ): Promise<SpeedLimitResult | null> {
    const query = `
      [out:json][timeout:10];
      (
        way(around:220,${latitude},${longitude})["maxspeed"];
        relation(around:220,${latitude},${longitude})["maxspeed"];
      );
      out center tags 24;
    `;

    for (const endpoint of this.OVERPASS_SPEED_ENDPOINTS) {
      try {
        const url = `${endpoint}?data=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'RadarTinder/1.0',
          },
        });
        if (!response.ok) continue;

        const data = await response.json();
        const elements = Array.isArray(data?.elements) ? data.elements : [];
        let best: { speed: SpeedLimitResult; distanceKm: number } | null = null;
        for (const element of elements) {
          const parsed = this.parseMaxspeedValue(element?.tags?.maxspeed);
          if (!parsed) continue;

          const centerLat = Number(element?.center?.lat);
          const centerLon = Number(element?.center?.lon);
          const distanceKm =
            Number.isFinite(centerLat) && Number.isFinite(centerLon)
              ? this.distanceKm(latitude, longitude, centerLat, centerLon)
              : 0;

          if (!best || distanceKm < best.distanceKm) {
            best = { speed: parsed, distanceKm };
          }
        }

        if (best?.speed) {
          return best.speed;
        }
      } catch {}
    }

    return null;
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

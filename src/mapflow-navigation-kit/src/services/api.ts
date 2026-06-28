import Constants from 'expo-constants';
import { POI_CATEGORY_CONFIG } from '../../../native/mapMarkerSvgAssets';
import { MapPoiMarker, RouteChoice, RouteData, RouteSnapInfo, RouteStep, SearchResult } from '../types/map';

const GEOAPIFY_API_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY?.trim();
const OPENROUTESERVICE_API_KEY = process.env.EXPO_PUBLIC_OPENROUTESERVICE_API_KEY?.trim();
const GOOGLE_MAPS_API_KEY = (
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  (Constants.expoConfig?.ios?.config as any)?.googleMapsApiKey ||
  (Constants.expoConfig?.android?.config as any)?.googleMaps?.apiKey ||
  ''
).trim();
const PAID_GOOGLE_MAPS_ENABLED = String(process.env.EXPO_PUBLIC_ENABLE_PAID_GOOGLE_MAPS || '')
  .trim()
  .toLowerCase() === 'true';
const GOOGLE_DIRECTIONS_ENABLED =
  Boolean(GOOGLE_MAPS_API_KEY) &&
  String(
    process.env.EXPO_PUBLIC_ENABLE_GOOGLE_DIRECTIONS ??
      process.env.EXPO_PUBLIC_ENABLE_PAID_GOOGLE_MAPS ??
      'false'
  )
    .trim()
    .toLowerCase() === 'true';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

interface SearchOptions {
  query: string;
  lat?: number;
  lng?: number;
  limit: number;
  countryCode?: string | null;
}

interface NearbyStreetHint {
  name: string;
  distanceMeters: number;
}

interface SearchContext {
  city: string | null;
  state: string | null;
  countryCode: string | null;
  streets: NearbyStreetHint[];
}

interface ReverseGeocodeResult {
  countryCode: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  road: string | null;
  displayName: string | null;
  provider: string;
}

interface SpeedLimitResponse {
  speedLimit: {
    value: number;
    unit: string;
    roadName?: string | null;
    bearing?: number | null;
  } | null;
}

interface RouteOptions {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}

interface RouteRequestOptions extends RouteOptions {
  originalOriginLat?: number;
  originalOriginLng?: number;
  originalDestLat?: number;
  originalDestLng?: number;
  snapInfo?: {
    origin?: RouteSnapInfo | null;
    destination?: RouteSnapInfo | null;
  };
}

interface MapPoiViewport {
  zoom: number;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  center?: {
    lat: number;
    lng: number;
  };
}

interface NodePoint {
  lat: number;
  lng: number;
}

interface SpeedLimitCandidate {
  value: number;
  unit: string;
  lat: number;
  lng: number;
  bearing: number | null;
  roadName: string | null;
  highway: string | null;
  ref: string | null;
  distanceMeters: number;
}

const SEARCH_CONTEXT_TTL_MS = 10 * 60 * 1000;
const SEARCH_CONTEXT_REUSE_RADIUS_METERS = 2500;
let searchContextCache:
  | {
      lat: number;
      lng: number;
      fetchedAt: number;
      context: SearchContext;
    }
  | null = null;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }
  return response.json() as Promise<T>;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadius = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildAddress(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(', ');
}

function normalizeRoadName(value?: string | null): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSearchText(value?: string | null): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildStreetNameVariants(name: string): string[] {
  const variants = new Set<string>();
  const trimmed = normalizeRoadName(name);
  if (!trimmed) {
    return [];
  }

  variants.add(trimmed);

  const abbreviated = trimmed
    .replace(/\bStreet\b/gi, 'St')
    .replace(/\bAvenue\b/gi, 'Ave')
    .replace(/\bBoulevard\b/gi, 'Blvd')
    .replace(/\bRoad\b/gi, 'Rd')
    .replace(/\bDrive\b/gi, 'Dr')
    .replace(/\bLane\b/gi, 'Ln')
    .replace(/\bPlace\b/gi, 'Pl')
    .replace(/\bCourt\b/gi, 'Ct')
    .replace(/\bTerrace\b/gi, 'Ter')
    .replace(/\bParkway\b/gi, 'Pkwy');

  variants.add(abbreviated);

  return Array.from(variants);
}

function parseAddressIntent(query: string): { houseNumber: string; streetTokens: string[] } | null {
  const match = query.trim().match(/^(\d+[a-zA-Z]?)\s+(.+)$/);
  if (!match) {
    return null;
  }

  const streetTokens = normalizeSearchText(match[2]).split(' ').filter(Boolean);
  if (!streetTokens.length) {
    return null;
  }

  return {
    houseNumber: match[1],
    streetTokens,
  };
}

function streetTokensMatch(streetName: string, fragments: string[]): boolean {
  const streetTokens = normalizeSearchText(streetName).split(' ').filter(Boolean);
  if (!streetTokens.length || !fragments.length) {
    return false;
  }

  let cursor = 0;

  for (const fragment of fragments) {
    let matched = false;

    while (cursor < streetTokens.length) {
      if (streetTokens[cursor].startsWith(fragment)) {
        matched = true;
        cursor += 1;
        break;
      }

      cursor += 1;
    }

    if (!matched) {
      return false;
    }
  }

  return true;
}

function buildLocationSuffixes(context: SearchContext | null): string[] {
  if (!context) {
    return [];
  }

  const suffixes = new Set<string>();

  if (context.city) {
    suffixes.add(context.city);
  }

  if (context.city && context.state) {
    suffixes.add(`${context.city}, ${context.state}`);
  }

  return Array.from(suffixes);
}

function buildSearchQueries(query: string, context: SearchContext | null): string[] {
  const trimmed = query.trim();
  const variants = new Set<string>();
  const suffixes = buildLocationSuffixes(context);

  if (!trimmed) {
    return [];
  }

  variants.add(trimmed);
  suffixes.forEach((suffix) => variants.add(`${trimmed}, ${suffix}`));

  const intent = parseAddressIntent(trimmed);
  if (intent && context?.streets?.length) {
    const matchingStreetHints = context.streets
      .filter((street) => streetTokensMatch(street.name, intent.streetTokens))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 4);

    matchingStreetHints.forEach((street) => {
      buildStreetNameVariants(street.name).forEach((streetName) => {
        const base = `${intent.houseNumber} ${streetName}`;
        variants.add(base);
        suffixes.forEach((suffix) => variants.add(`${base}, ${suffix}`));
      });
    });
  }

  return Array.from(variants).slice(0, 5);
}

async function fetchNearbyStreetHints(lat: number, lng: number): Promise<NearbyStreetHint[]> {
  const overpassQuery = `
    [out:json][timeout:8];
    way["highway"~"primary|secondary|tertiary|residential|living_street|service|unclassified"]["name"](around:1800,${lat},${lng});
    out center tags qt;
  `;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(overpassQuery)}`,
      });

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const bestByStreet = new Map<string, NearbyStreetHint>();

      for (const element of data.elements ?? []) {
        if (element.type !== 'way' || !element.center || !element.tags?.name) {
          continue;
        }

        const name = normalizeRoadName(element.tags.name);
        const normalized = normalizeSearchText(name);
        if (!name || normalized.length < 3 || normalized.includes('unnamed road')) {
          continue;
        }

        const distanceMeters = haversineMeters(lat, lng, element.center.lat, element.center.lon);
        const current = bestByStreet.get(normalized);

        if (!current || distanceMeters < current.distanceMeters) {
          bestByStreet.set(normalized, { name, distanceMeters });
        }
      }

      return Array.from(bestByStreet.values())
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, 24);
    } catch {
      // Try the next Overpass mirror.
    }
  }

  return [];
}

async function getSearchContext(lat?: number, lng?: number): Promise<SearchContext | null> {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }

  if (
    searchContextCache &&
    Date.now() - searchContextCache.fetchedAt < SEARCH_CONTEXT_TTL_MS &&
    haversineMeters(lat, lng, searchContextCache.lat, searchContextCache.lng) < SEARCH_CONTEXT_REUSE_RADIUS_METERS
  ) {
    return searchContextCache.context;
  }

  const [streetsResult, reverseResult] = await Promise.allSettled([
    fetchNearbyStreetHints(lat, lng),
    reverseGeocode(lat, lng),
  ]);

  const context: SearchContext = {
    city: reverseResult.status === 'fulfilled' ? reverseResult.value.city : null,
    state: reverseResult.status === 'fulfilled' ? reverseResult.value.state : null,
    countryCode: reverseResult.status === 'fulfilled' ? reverseResult.value.countryCode : null,
    streets: streetsResult.status === 'fulfilled' ? streetsResult.value : [],
  };

  searchContextCache = {
    lat,
    lng,
    fetchedAt: Date.now(),
    context,
  };

  return context;
}

export function primeSearchContext(lat?: number, lng?: number) {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return;
  }

  void getSearchContext(lat, lng);
}

function computeDistanceMeters(result: SearchResult, lat?: number, lng?: number): number | undefined {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return result.distanceMeters;
  }

  return haversineMeters(lat, lng, result.lat, result.lng);
}

function computeSearchScore(result: SearchResult, query: string): number {
  const normalizedQuery = normalizeSearchText(query);
  const name = normalizeSearchText(result.name);
  const address = normalizeSearchText(result.address);
  const combined = `${name} ${address}`.trim();
  const intent = parseAddressIntent(query);
  let score = 0;

  if (name.startsWith(normalizedQuery)) {
    score -= 90;
  } else if (address.startsWith(normalizedQuery)) {
    score -= 75;
  } else if (address.includes(normalizedQuery)) {
    score -= 40;
  } else if (combined.includes(normalizedQuery)) {
    score -= 20;
  } else {
    score += 30;
  }

  if (intent) {
    const houseNumberPattern = new RegExp(`\\b${escapeRegExp(normalizeSearchText(intent.houseNumber))}\\b`);
    const hasHouseNumber = houseNumberPattern.test(combined);
    const matchesStreet = streetTokensMatch(result.name, intent.streetTokens) || streetTokensMatch(result.address, intent.streetTokens);

    score += hasHouseNumber ? -60 : 90;
    score += matchesStreet ? -70 : 70;
  }

  const distanceMeters = result.distanceMeters ?? Number.MAX_SAFE_INTEGER;
  if (distanceMeters < 400) {
    score -= 30;
  } else if (distanceMeters < 1600) {
    score -= 22;
  } else if (distanceMeters < 8000) {
    score -= 10;
  } else if (distanceMeters > 120000) {
    score += 120;
  } else if (distanceMeters > 40000) {
    score += 70;
  } else if (distanceMeters > 15000) {
    score += 35;
  }

  return score;
}

function dedupeAndRank(results: SearchResult[], query: string, lat?: number, lng?: number, limit = 8): SearchResult[] {
  const seen = new Set<string>();

  const deduped = results
    .map((result) => ({
      ...result,
      distanceMeters: computeDistanceMeters(result, lat, lng),
    }))
    .filter((result) => {
      const key = [
        result.name.trim().toLowerCase(),
        result.lat.toFixed(5),
        result.lng.toFixed(5),
      ].join('|');

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

  deduped.sort((a, b) => {
    const aScore = computeSearchScore(a, query);
    const bScore = computeSearchScore(b, query);
    if (aScore !== bScore) {
      return aScore - bScore;
    }

    const aDistance = a.distanceMeters ?? Number.MAX_SAFE_INTEGER;
    const bDistance = b.distanceMeters ?? Number.MAX_SAFE_INTEGER;
    if (aDistance !== bDistance) {
      return aDistance - bDistance;
    }

    return a.name.localeCompare(b.name);
  });

  return deduped.slice(0, limit);
}

async function searchGeoapify({ query, lat, lng, limit }: SearchOptions): Promise<SearchResult[]> {
  if (!GEOAPIFY_API_KEY) {
    return [];
  }

  const params = new URLSearchParams({
    text: query,
    format: 'json',
    limit: String(limit),
    apiKey: GEOAPIFY_API_KEY,
  });

  if (typeof lat === 'number' && typeof lng === 'number') {
    params.set('bias', `proximity:${lng},${lat}`);
  }

  const data = await fetchJson<{ results?: any[] }>(
    `https://api.geoapify.com/v1/geocode/autocomplete?${params.toString()}`,
    {
      headers: {
        Accept: 'application/json',
      },
    },
  );

  return (data.results ?? [])
    .map((item) => {
      const name = item.name || item.address_line1 || item.formatted;
      if (!name || typeof item.lat !== 'number' || typeof item.lon !== 'number') {
        return null;
      }

      const result: SearchResult = {
        name,
        address:
          item.formatted ||
          buildAddress([
            item.address_line1,
            item.address_line2,
            item.city,
            item.state,
            item.postcode,
            item.country,
          ]),
        lat: item.lat,
        lng: item.lon,
        type: item.result_type || item.datasource?.raw?.type || null,
        distanceMeters: typeof item.distance === 'number' ? item.distance : undefined,
        provider: 'geoapify',
      };

      return result.address ? result : null;
    })
    .filter(Boolean) as SearchResult[];
}

async function searchPhoton({ query, lat, lng, limit }: SearchOptions): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });

  if (typeof lat === 'number' && typeof lng === 'number') {
    params.set('lat', String(lat));
    params.set('lon', String(lng));
  }

  const data = await fetchJson<{ features?: any[] }>(`https://photon.komoot.io/api/?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  return (data.features ?? [])
    .map((feature) => {
      const [lngValue, latValue] = feature.geometry?.coordinates ?? [];
      const properties = feature.properties ?? {};
      const name = properties.name || properties.street || properties.city;
      if (!name || typeof latValue !== 'number' || typeof lngValue !== 'number') {
        return null;
      }

      return {
        name,
        address: buildAddress([
          buildAddress([properties.street, properties.housenumber]),
          properties.city,
          properties.state,
          properties.postcode,
          properties.country,
        ]),
        lat: latValue,
        lng: lngValue,
        type: properties.osm_value || properties.type || null,
        provider: 'photon',
      } satisfies SearchResult;
    })
    .filter(Boolean) as SearchResult[];
}

async function searchNominatim({ query, lat, lng, limit, countryCode }: SearchOptions): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: String(limit),
  });

  if (countryCode) {
    params.set('countrycodes', countryCode.toLowerCase());
  }

  if (typeof lat === 'number' && typeof lng === 'number') {
    const lngSpan = 0.18;
    const latSpan = 0.12;
    params.set('viewbox', `${lng - lngSpan},${lat + latSpan},${lng + lngSpan},${lat - latSpan}`);
  }

  const data = await fetchJson<any[]>(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    },
  );

  return data
    .map((item) => {
      const latitude = Number(item.lat);
      const longitude = Number(item.lon);
      const address = item.address ?? {};
      const streetLine = buildAddress([address.house_number, address.road]);
      const name =
        address.amenity ||
        address.building ||
        address.shop ||
        streetLine ||
        item.display_name?.split(',')[0];

      if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }

      return {
        name,
        address:
          item.display_name ||
          buildAddress([
            streetLine,
            address.city || address.town || address.village,
            address.state,
            address.country,
          ]),
        lat: latitude,
        lng: longitude,
        type: item.type || address.road || null,
        provider: 'nominatim',
      } satisfies SearchResult;
    })
    .filter(Boolean) as SearchResult[];
}

async function reversePhoton(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    limit: '1',
  });

  const data = await fetchJson<{ features?: any[] }>(
    `https://photon.komoot.io/reverse?${params.toString()}`,
    {
      headers: {
        Accept: 'application/json',
      },
    },
  );

  const feature = data.features?.[0];
  const properties = feature?.properties ?? {};
  if (!feature || !properties) {
    return null;
  }

  const streetLine = buildAddress([properties.street, properties.housenumber]);
  const displayName = buildAddress([
    properties.name || streetLine,
    properties.city,
    properties.state,
    properties.postcode,
    properties.country,
  ]);

  return {
    countryCode: properties.countrycode?.toUpperCase() || null,
    country: properties.country || null,
    city: properties.city || properties.county || null,
    state: properties.state || null,
    road: properties.street || null,
    displayName: displayName || null,
    provider: 'photon',
  };
}

async function searchGoogle({ query, lat, lng, limit }: SearchOptions): Promise<SearchResult[]> {
  if (!PAID_GOOGLE_MAPS_ENABLED || !GOOGLE_MAPS_API_KEY) {
    return [];
  }

  const requestBody: Record<string, unknown> = {
    input: query,
    languageCode: 'en',
  };

  if (typeof lat === 'number' && typeof lng === 'number') {
    requestBody.locationBias = {
      circle: {
        center: {
          latitude: lat,
          longitude: lng,
        },
        radius: 50000,
      },
    };
  }

  const suggestions = await fetchJson<{ suggestions?: any[] }>(
    'https://places.googleapis.com/v1/places:autocomplete',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask':
          'suggestions.placePrediction.place,suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.types',
      },
      body: JSON.stringify(requestBody),
    },
  );

  const predictions = (suggestions.suggestions ?? [])
    .map((item) => item.placePrediction)
    .filter(Boolean)
    .slice(0, Math.min(limit, 4));

  if (!predictions.length) {
    return [];
  }

  const details = await Promise.allSettled(
    predictions.map(async (prediction) => {
      const placePath =
        typeof prediction.place === 'string' && prediction.place.length > 0
          ? prediction.place
          : prediction.placeId
            ? `places/${prediction.placeId}`
            : null;

      if (!placePath) {
        return null;
      }

      const place = await fetchJson<any>(`https://places.googleapis.com/v1/${placePath}`, {
        headers: {
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'displayName,formattedAddress,location,types',
        },
      });

      const latitude = place.location?.latitude;
      const longitude = place.location?.longitude;

      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return null;
      }

      return {
        name: place.displayName?.text || prediction.text?.text || 'Google Place',
        address: place.formattedAddress || prediction.text?.text || '',
        lat: latitude,
        lng: longitude,
        type: Array.isArray(place.types) ? place.types[0] : null,
        provider: 'google',
      } satisfies SearchResult;
    }),
  );

  const resolved: SearchResult[] = [];

  details.forEach((result) => {
    if (result.status === 'fulfilled' && result.value) {
      resolved.push(result.value);
    }
  });

  return resolved;
}

function inferModifier(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (lower.includes('slight right')) return 'slight right';
  if (lower.includes('slight left')) return 'slight left';
  if (lower.includes('sharp right')) return 'sharp right';
  if (lower.includes('sharp left')) return 'sharp left';
  if (lower.includes('u-turn') || lower.includes('uturn')) return 'uturn';
  if (lower.includes(' right')) return 'right';
  if (lower.includes(' left')) return 'left';
  if (lower.includes('straight')) return 'straight';
  return undefined;
}

function inferManeuver(instruction: string): Pick<RouteStep['maneuver'], 'type' | 'modifier'> {
  const lower = instruction.toLowerCase();

  if (lower.includes('roundabout')) {
    return { type: 'roundabout', modifier: inferModifier(lower) };
  }
  if (lower.includes('merge')) {
    return { type: 'merge', modifier: inferModifier(lower) };
  }
  if (lower.includes('ramp')) {
    return { type: lower.includes('exit') ? 'off ramp' : 'on ramp', modifier: inferModifier(lower) };
  }
  if (lower.startsWith('head ')) {
    return { type: 'depart', modifier: inferModifier(lower) };
  }
  if (lower.includes('continue')) {
    return { type: 'continue', modifier: inferModifier(lower) };
  }
  if (lower.includes('arrive') || lower.includes('destination')) {
    return { type: 'arrive' };
  }
  if (lower.includes('fork')) {
    return { type: 'fork', modifier: inferModifier(lower) };
  }

  return { type: 'turn', modifier: inferModifier(lower) };
}

function cleanInstruction(instruction: string): string {
  return instruction
    .replace(/\s+/g, ' ')
    .replace(/\bN\b/g, 'north')
    .replace(/\bS\b/g, 'south')
    .replace(/\bE\b/g, 'east')
    .replace(/\bW\b/g, 'west')
    .trim();
}

function isGenericDeparture(step: Pick<RouteStep, 'maneuver' | 'instruction' | 'name' | 'ref'>): boolean {
  const roadName = normalizeRoadName(step.name || step.ref);
  return step.maneuver.type === 'depart' && !roadName && /^(Head|Start)/i.test(step.instruction);
}

function buildInstruction(step: any): string {
  const maneuver = step.maneuver ?? {};
  const name = normalizeRoadName(step.name || step.ref);
  const modifier = maneuver.modifier || 'straight';
  let instruction = '';

  switch (maneuver.type) {
    case 'new name':
      return name ? `Continue on ${name}` : 'Continue straight';
    case 'depart':
      return name ? `Head ${modifier} on ${name}` : 'Start on route';
    case 'arrive':
      return 'You have arrived';
    case 'merge':
      instruction = `Merge ${modifier}`;
      break;
    case 'on ramp':
      instruction = name ? `Take the ramp to ${name}` : 'Take the ramp';
      break;
    case 'off ramp':
      instruction = name ? `Take the exit to ${name}` : 'Take the exit';
      break;
    case 'fork':
      instruction = `Take the fork ${modifier}`;
      break;
    case 'end of road':
      instruction = `Turn ${modifier}`;
      break;
    case 'continue':
      instruction = name ? `Continue on ${name}` : `Continue ${modifier}`;
      break;
    case 'roundabout':
    case 'rotary':
      instruction = 'At the roundabout, take the exit';
      break;
    case 'turn':
    default:
      instruction = `Turn ${modifier}`;
      break;
  }

  if (name && !instruction.toLowerCase().includes(name.toLowerCase())) {
    instruction += ` onto ${name}`;
  }

  return cleanInstruction(instruction.trim());
}

function cleanupRouteSteps(steps: RouteStep[]): RouteStep[] {
  const normalized = steps.map((step) => ({
    ...step,
    instruction: cleanInstruction(step.instruction),
    name: normalizeRoadName(step.name),
    ref: normalizeRoadName(step.ref),
  }));

  return normalized.filter((step, index) => !(index === 0 && isGenericDeparture(step) && normalized.length > 1));
}

function adjustDurationForRoadReality(distance: number, duration: number, steps: RouteStep[]): number {
  if (distance <= 0 || duration <= 0) {
    return duration;
  }

  const distanceKm = distance / 1000;
  const avgKph = distanceKm / (duration / 3600);
  const stepDensity = steps.length / Math.max(distanceKm, 0.5);

  let multiplier = 1;

  if (distanceKm <= 15) {
    multiplier += Math.min(0.08, stepDensity * 0.03);
  }

  if (avgKph > 24) {
    const speedPenaltyCap = distanceKm < 3 ? 0.04 : 0.06;
    multiplier += Math.min(speedPenaltyCap, ((avgKph - 24) / 18) * speedPenaltyCap);
  }

  if (distanceKm <= 12 && stepDensity > 0.7) {
    multiplier += 0.04;
  }

  if (distanceKm <= 3) {
    multiplier = Math.min(multiplier, 1.15);
  } else if (distanceKm <= 12) {
    multiplier = Math.min(multiplier, 1.18);
  } else {
    multiplier = Math.min(multiplier, 1.10);
  }

  const stopPenaltySeconds = Math.min(
    distanceKm < 3 ? steps.length * 4 : steps.length * 5,
    distanceKm < 3 ? 24 : 45,
  );

  return Math.max(duration, duration * multiplier + stopPenaltySeconds);
}

function finalizeRoute(route: RouteData): RouteData {
  if (route.provider === 'google') {
    return {
      ...route,
      baseDuration: route.baseDuration ?? route.duration,
      durationSource: 'provider',
    };
  }

  const adjustedDuration = adjustDurationForRoadReality(route.distance, route.duration, route.steps);

  return {
    ...route,
    baseDuration: route.duration,
    duration: adjustedDuration,
    durationSource: adjustedDuration > route.duration + 30 ? 'adjusted' : 'provider',
  };
}

function decodeGooglePolyline(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lng / 1e5, lat / 1e5]);
  }

  return coordinates;
}

function stripGoogleInstruction(value?: string | null): string {
  return cleanInstruction(
    String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
  );
}

function normalizeGoogleManeuver(value?: string | null): Pick<RouteStep['maneuver'], 'type' | 'modifier'> {
  const maneuver = String(value || '').toLowerCase();
  if (!maneuver) return { type: 'continue' };
  if (maneuver.includes('merge')) return { type: 'merge', modifier: inferModifier(maneuver) };
  if (maneuver.includes('ramp')) {
    return { type: maneuver.includes('left') || maneuver.includes('right') ? 'on ramp' : 'off ramp', modifier: inferModifier(maneuver) };
  }
  if (maneuver.includes('fork')) return { type: 'fork', modifier: inferModifier(maneuver) };
  if (maneuver.includes('roundabout')) return { type: 'roundabout', modifier: inferModifier(maneuver) };
  if (maneuver.includes('uturn') || maneuver.includes('u-turn')) return { type: 'turn', modifier: 'uturn' };
  if (maneuver.includes('turn')) return { type: 'turn', modifier: inferModifier(maneuver) };
  if (maneuver.includes('straight')) return { type: 'continue', modifier: 'straight' };
  return { type: 'continue', modifier: inferModifier(maneuver) };
}

function normalizeGoogleStep(step: any): RouteStep | null {
  const instruction = stripGoogleInstruction(step?.html_instructions);
  const location = step?.start_location;
  if (!instruction || !location) return null;

  const maneuver = normalizeGoogleManeuver(step?.maneuver);
  return {
    instruction,
    distance: Number(step?.distance?.value) || 0,
    duration: Number(step?.duration?.value) || 0,
    maneuver: {
      type: maneuver.type,
      modifier: maneuver.modifier,
      location: [Number(location.lng), Number(location.lat)],
    },
    name: undefined,
    ref: undefined,
    bearingBefore: null,
    bearingAfter: null,
    exit: null,
  };
}

function normalizeGoogleRoute(route: any, options: RouteRequestOptions): RouteData | null {
  const leg = route?.legs?.[0];
  const encodedPolyline = route?.overview_polyline?.points;
  if (!leg || typeof encodedPolyline !== 'string') return null;

  const geometry = decodeGooglePolyline(encodedPolyline);
  if (geometry.length < 2) return null;

  const steps = cleanupRouteSteps(
    (leg.steps ?? [])
      .map((step: any) => normalizeGoogleStep(step))
      .filter(Boolean) as RouteStep[]
  );
  const baseDuration = Number(leg.duration?.value) || 0;
  const trafficDuration = Number(leg.duration_in_traffic?.value) || 0;

  return {
    geometry,
    distance: Number(leg.distance?.value) || 0,
    duration: trafficDuration || baseDuration,
    baseDuration,
    durationSource: 'provider',
    steps,
    provider: 'google',
    snapInfo: options.snapInfo,
  };
}

async function routeWithGoogleDirectionsAlternatives(options: RouteRequestOptions): Promise<RouteData[]> {
  if (!GOOGLE_DIRECTIONS_ENABLED || !GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Directions routing is disabled');
  }

  const params = new URLSearchParams({
    origin: `${options.originLat},${options.originLng}`,
    destination: `${options.destLat},${options.destLng}`,
    mode: 'driving',
    alternatives: 'true',
    departure_time: 'now',
    units: 'metric',
    key: GOOGLE_MAPS_API_KEY,
  });

  const data = await fetchJson<any>(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
  if (data.status !== 'OK' || !Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error(`Google Directions routing failed: ${data.status || 'UNKNOWN'}`);
  }

  const routes = data.routes
    .map((route: any) => normalizeGoogleRoute(route, options))
    .filter(Boolean) as RouteData[];
  if (!routes.length) {
    throw new Error('Invalid Google Directions response');
  }

  return routes;
}

function normalizeOrsStep(step: any, geometry: [number, number][]): RouteStep | null {
  if (!step?.instruction) {
    return null;
  }

  const maneuver = inferManeuver(step.instruction);
  if (maneuver.type === 'arrive') {
    return null;
  }

  const startIndex = step.way_points?.[0] ?? 0;
  const location = geometry[startIndex] ?? geometry[0] ?? [0, 0];

  return {
    instruction: cleanInstruction(step.instruction),
    distance: step.distance ?? 0,
    duration: step.duration ?? 0,
    maneuver: {
      type: maneuver.type,
      modifier: maneuver.modifier,
      location,
    },
    name: step.name || null,
    ref: step.ref || null,
    bearingBefore: typeof step.bearing_before === 'number' ? step.bearing_before : null,
    bearingAfter: typeof step.bearing_after === 'number' ? step.bearing_after : null,
    exit: typeof step.exit_number === 'number' ? step.exit_number : null,
  };
}

function normalizeOrsFeature(feature: any, options: RouteRequestOptions): RouteData | null {
  const geometry = feature?.geometry?.coordinates;
  const segment = feature?.properties?.segments?.[0];
  const summary = feature?.properties?.summary;

  if (!Array.isArray(geometry) || !summary) {
    return null;
  }

  const steps = cleanupRouteSteps((segment?.steps ?? [])
    .map((step: any) => normalizeOrsStep(step, geometry))
    .filter(Boolean) as RouteStep[]);

  return {
    geometry,
    distance: summary.distance ?? 0,
    duration: summary.duration ?? 0,
    steps,
    provider: 'openrouteservice',
    snapInfo: options.snapInfo,
  };
}

async function routeWithOpenRouteServiceAlternatives(options: RouteRequestOptions): Promise<RouteData[]> {
  if (!OPENROUTESERVICE_API_KEY) {
    throw new Error('Missing OPENROUTESERVICE_API_KEY');
  }

  const data = await fetchJson<any>('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
    method: 'POST',
    headers: {
      Authorization: OPENROUTESERVICE_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      coordinates: [
        [options.originLng, options.originLat],
        [options.destLng, options.destLat],
      ],
      instructions: true,
      preference: 'recommended',
      units: 'm',
      language: 'en',
      geometry_simplify: false,
      alternative_routes: {
        target_count: 3,
        share_factor: 0.6,
        weight_factor: 1.4,
      },
    }),
  });

  const routes = (data.features ?? [])
    .map((feature: any) => normalizeOrsFeature(feature, options))
    .filter(Boolean) as RouteData[];

  if (!routes.length) {
    throw new Error('Invalid OpenRouteService response');
  }

  return routes;
}

async function routeWithOpenRouteService(options: RouteRequestOptions): Promise<RouteData> {
  return (await routeWithOpenRouteServiceAlternatives(options))[0];
}

function normalizeOsrmRoute(route: any, options: RouteRequestOptions): RouteData | null {
  const leg = route.legs?.[0];
  const geometry = route.geometry?.coordinates;
  if (!Array.isArray(geometry)) {
    return null;
  }

  const steps = cleanupRouteSteps((leg?.steps ?? [])
    .filter((step: any) => step.maneuver?.type !== 'arrive')
    .map((step: any) => ({
      instruction: buildInstruction(step),
      distance: step.distance ?? 0,
      duration: step.duration ?? 0,
      maneuver: {
        type: step.maneuver?.type || 'continue',
        modifier: step.maneuver?.modifier,
        location: step.maneuver?.location || geometry[0],
      },
      name: step.name || null,
      ref: step.ref || null,
      bearingBefore: typeof step.maneuver?.bearing_before === 'number' ? step.maneuver.bearing_before : null,
      bearingAfter: typeof step.maneuver?.bearing_after === 'number' ? step.maneuver.bearing_after : null,
      exit: typeof step.maneuver?.exit === 'number' ? step.maneuver.exit : null,
    })) as RouteStep[]);

  return {
    geometry,
    distance: route.distance,
    duration: route.duration,
    steps,
    provider: 'osrm',
    snapInfo: options.snapInfo,
  };
}

async function routeWithOsrmAlternatives(options: RouteRequestOptions): Promise<RouteData[]> {
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: 'true',
    annotations: 'true',
    alternatives: 'true',
    continue_straight: 'false',
  });

  const data = await fetchJson<any>(
    `https://router.project-osrm.org/route/v1/driving/${options.originLng},${options.originLat};${options.destLng},${options.destLat}?${params.toString()}`,
    {
      headers: { Accept: 'application/json' },
    },
  );

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('No OSRM route found');
  }

  const routes = data.routes
    .map((route: any) => normalizeOsrmRoute(route, options))
    .filter(Boolean) as RouteData[];

  if (!routes.length) {
    throw new Error('Invalid OSRM route response');
  }

  return routes;
}

async function routeWithOsrm(options: RouteRequestOptions): Promise<RouteData> {
  return (await routeWithOsrmAlternatives(options))[0];
}

function bearingBetweenPoints(start: [number, number], end: [number, number]): number {
  const [lng1, lat1] = start;
  const [lng2, lat2] = end;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const lambda1 = (lng1 * Math.PI) / 180;
  const lambda2 = (lng2 * Math.PI) / 180;
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

function headingDelta(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function bidirectionalHeadingDelta(a: number, b: number): number {
  return Math.min(headingDelta(a, b), headingDelta(a, (b + 180) % 360));
}

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineMeters(a.lat, a.lng, b.lat, b.lng);
}

function parseNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scoreCandidate(candidate: SpeedLimitCandidate, lat: number, lng: number, desiredHeading: number | null): number {
  const distanceScore =
    Number.isFinite(candidate.distanceMeters) && candidate.distanceMeters >= 0
      ? candidate.distanceMeters
      : metersBetween({ lat, lng }, { lat: candidate.lat, lng: candidate.lng });
  const headingPenalty =
    desiredHeading !== null && candidate.bearing !== null
      ? bidirectionalHeadingDelta(desiredHeading, candidate.bearing) * 3.5
      : 0;
  const highwayBonus =
    desiredHeading !== null && /^(motorway|trunk|primary|secondary)$/i.test(candidate.highway || '')
      ? -12
      : 0;

  return distanceScore + headingPenalty + highwayBonus;
}

function projectPointToSegment(
  lat: number,
  lng: number,
  start: NodePoint,
  end: NodePoint,
): { lat: number; lng: number; distanceMeters: number } {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = Math.max(1, 111320 * Math.cos((lat * Math.PI) / 180));
  const ax = (start.lng - lng) * metersPerDegreeLng;
  const ay = (start.lat - lat) * metersPerDegreeLat;
  const bx = (end.lng - lng) * metersPerDegreeLng;
  const by = (end.lat - lat) * metersPerDegreeLat;
  const vx = bx - ax;
  const vy = by - ay;
  const lengthSq = vx * vx + vy * vy;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / lengthSq)) : 0;
  const x = ax + vx * t;
  const y = ay + vy * t;

  return {
    lat: lat + y / metersPerDegreeLat,
    lng: lng + x / metersPerDegreeLng,
    distanceMeters: Math.sqrt(x * x + y * y),
  };
}

function sampleWay(nodeIds: number[], nodes: Record<string, NodePoint>, lat: number, lng: number) {
  let best: { lat: number; lng: number; bearing: number | null; distanceMeters: number; score: number } | null = null;

  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    const start = nodes[nodeIds[index]];
    const end = nodes[nodeIds[index + 1]];

    if (!start || !end) {
      continue;
    }

    const closest = projectPointToSegment(lat, lng, start, end);
    const score = closest.distanceMeters;
    if (!best || score < best.score) {
      best = {
        lat: closest.lat,
        lng: closest.lng,
        bearing: bearingBetweenPoints([start.lng, start.lat], [end.lng, end.lat]),
        distanceMeters: closest.distanceMeters,
        score,
      };
    }
  }

  return best;
}

function parseMaxspeed(maxspeed: string, countryCode?: string | null): { value: number; unit: string } | null {
  if (!maxspeed) return null;

  if (maxspeed === 'walk' || maxspeed === 'living_street') {
    return { value: 10, unit: 'km/h' };
  }
  if (maxspeed === 'urban' || maxspeed === 'none') {
    return null;
  }

  const match = maxspeed.match(/^(\d+)\s*(km\/h|kmh|km|mph)?$/i);
  if (match) {
    const parsedUnit = match[2]?.toLowerCase();
    const inferredUnit =
      parsedUnit || (String(countryCode || '').trim().toUpperCase() === 'US' ? 'mph' : 'km/h');
    return {
      value: parseInt(match[1], 10),
      unit: inferredUnit,
    };
  }

  const numMatch = maxspeed.match(/^(\d+)$/);
  if (numMatch) {
    return {
      value: parseInt(numMatch[1], 10),
      unit: String(countryCode || '').trim().toUpperCase() === 'US' ? 'mph' : 'km/h',
    };
  }

  return null;
}

export async function searchPlaces(query: string, lat?: number, lng?: number) {
  const context = await getSearchContext(lat, lng);
  const options = {
    query,
    lat,
    lng,
    limit: 8,
    countryCode: context?.countryCode ?? null,
  };
  const collected: SearchResult[] = [];
  const providers: string[] = [];

  // Parallel raw search for optimal address results from Photon and Nominatim first (free and robust)
  try {
    const [photonRes, nominatimRes] = await Promise.allSettled([
      searchPhoton(options),
      searchNominatim(options),
    ]);
    
    if (photonRes.status === 'fulfilled' && photonRes.value.length > 0) {
      collected.push(...photonRes.value);
      providers.push('photon');
    }
    if (nominatimRes.status === 'fulfilled' && nominatimRes.value.length > 0) {
      collected.push(...nominatimRes.value);
      providers.push('nominatim');
    }
  } catch (rawSearchError) {
    console.warn('Raw search query failed, using context variants fallback:', rawSearchError);
  }

  if (collected.length >= options.limit) {
    return {
      results: dedupeAndRank(collected, query, lat, lng, options.limit),
      providers,
    };
  }

  const queryVariants = buildSearchQueries(query, context);

  for (const variant of queryVariants) {
    const variantOptions = {
      ...options,
      query: variant,
    };

    const variantRuns = [
      { name: 'google', run: () => searchGoogle(variantOptions) },
      { name: 'photon', run: () => searchPhoton(variantOptions) },
      { name: 'nominatim', run: () => searchNominatim(variantOptions) },
      { name: 'geoapify', run: () => searchGeoapify(variantOptions) },
    ];

    const variantResults = await Promise.allSettled(
      variantRuns.map(async (provider) => ({
        provider: provider.name,
        results: await provider.run(),
      })),
    );

    variantResults.forEach((providerResult) => {
      if (providerResult.status === 'fulfilled') {
        if (providerResult.value.results.length) {
          collected.push(...providerResult.value.results);
          if (!providers.includes(providerResult.value.provider)) {
            providers.push(providerResult.value.provider);
          }
        }
      }
    });

    if (collected.length >= options.limit * 4) {
      break;
    }
  }

  return {
    results: dedupeAndRank(collected, query, lat, lng, options.limit),
    providers,
  };
}

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  try {
    const photon = await reversePhoton(lat, lng);
    if (photon?.displayName || photon?.road || photon?.city) {
      return photon;
    }
  } catch {}

  try {
    const nominatim = await fetchJson<any>(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'RadarFlow/1.0',
        },
      },
    );

    return {
      countryCode: nominatim.address?.country_code?.toUpperCase() || null,
      country: nominatim.address?.country || null,
      city: nominatim.address?.city || nominatim.address?.town || nominatim.address?.village || null,
      state: nominatim.address?.state || null,
      road: nominatim.address?.road || null,
      displayName: nominatim.display_name || null,
      provider: 'nominatim',
    };
  } catch (nominatimError) {
    if (GEOAPIFY_API_KEY) {
      try {
        const params = new URLSearchParams({
          lat: String(lat),
          lon: String(lng),
          format: 'json',
          apiKey: GEOAPIFY_API_KEY,
        });

        const data = await fetchJson<{ results?: any[] }>(
          `https://api.geoapify.com/v1/geocode/reverse?${params.toString()}`,
          {
            headers: {
              Accept: 'application/json',
            },
          },
        );

        const result = data.results?.[0];
        if (result) {
          return {
            countryCode: result.country_code?.toUpperCase() || null,
            country: result.country || null,
            city: result.city || result.town || result.village || null,
            state: result.state || null,
            road: result.street || result.address_line1 || null,
            displayName: result.formatted || null,
            provider: 'geoapify',
          };
        }
      } catch (geoapifyError) {
        console.warn('Reverse geocoding failed for Nominatim and Geoapify', {
          nominatimError,
          geoapifyError,
        });
      }
    } else {
      console.warn('Nominatim reverse geocoding failed', nominatimError);
    }

    throw nominatimError;
  }
}

function normalizePoiHaystack(tags: Record<string, unknown> = {}): string {
  return [
    tags.amenity,
    tags.shop,
    tags.tourism,
    tags.leisure,
    tags.natural,
    tags.sport,
    tags.aeroway,
    tags.railway,
    tags.highway,
    tags.public_transport,
    tags.internet_access,
    tags.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/-/g, '_');
}

function resolvePoiCategory(tags: Record<string, unknown> = {}): keyof typeof POI_CATEGORY_CONFIG | null {
  const haystack = normalizePoiHaystack(tags);
  const entries = Object.entries(POI_CATEGORY_CONFIG).sort(
    ([, left], [, right]) => Number(right.priority) - Number(left.priority),
  );

  for (const [category, config] of entries) {
    const matched = config.matchTerms.some((term) => {
      const normalizedTerm = String(term).toLowerCase().replace(/-/g, '_');
      return haystack.includes(normalizedTerm);
    });
    if (matched) {
      return category as keyof typeof POI_CATEGORY_CONFIG;
    }
  }

  return null;
}

function buildPoiQuery(bounds: MapPoiViewport['bounds']): string {
  const south = Math.max(-90, Math.min(bounds.south, bounds.north));
  const north = Math.min(90, Math.max(bounds.south, bounds.north));
  const west = Math.max(-180, Math.min(bounds.west, bounds.east));
  const east = Math.min(180, Math.max(bounds.west, bounds.east));
  const bbox = `${south},${west},${north},${east}`;

  return `
    [out:json][timeout:10];
    (
      nwr["amenity"](${bbox});
      nwr["shop"](${bbox});
      nwr["tourism"](${bbox});
      nwr["leisure"](${bbox});
      nwr["natural"](${bbox});
      nwr["sport"](${bbox});
      nwr["aeroway"](${bbox});
      nwr["railway"](${bbox});
      nwr["highway"="bus_stop"](${bbox});
      nwr["public_transport"](${bbox});
      nwr["internet_access"](${bbox});
    );
    out center tags qt 160;
  `;
}

let poiViewportCache:
  | {
      key: string;
      fetchedAt: number;
      markers: MapPoiMarker[];
    }
  | null = null;

export async function getMapPoiMarkers(viewport: MapPoiViewport): Promise<MapPoiMarker[]> {
  if (!viewport || viewport.zoom < 14.2) {
    return [];
  }

  const roundedZoom = Math.floor(viewport.zoom * 2) / 2;
  const key = [
    roundedZoom.toFixed(1),
    viewport.bounds.north.toFixed(3),
    viewport.bounds.south.toFixed(3),
    viewport.bounds.east.toFixed(3),
    viewport.bounds.west.toFixed(3),
  ].join(':');

  if (poiViewportCache && poiViewportCache.key === key && Date.now() - poiViewportCache.fetchedAt < 45_000) {
    return poiViewportCache.markers;
  }

  const query = buildPoiQuery(viewport.bounds);
  let data: any = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        continue;
      }

      data = await response.json();
      break;
    } catch {
      // Try the next mirror.
    }
  }

  if (!data) {
    return [];
  }

  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const markers: MapPoiMarker[] = [];

  for (const element of data.elements ?? []) {
    const tags = element.tags ?? {};
    const category = resolvePoiCategory(tags);
    if (!category) {
      continue;
    }

    const config = POI_CATEGORY_CONFIG[category];
    if (!config || viewport.zoom < Number(config.minZoom)) {
      continue;
    }

    const currentCount = counts.get(category) ?? 0;
    if (currentCount >= Number(config.maxCount)) {
      continue;
    }

    const lat = Number(element.lat ?? element.center?.lat);
    const lng = Number(element.lon ?? element.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }

    const name = typeof tags.name === 'string' ? tags.name : undefined;
    const id = `${category}:${Number(element.id || 0)}:${lat.toFixed(5)}:${lng.toFixed(5)}`;
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    counts.set(category, currentCount + 1);
    markers.push({
      id,
      category,
      iconKey: config.iconKey,
      latitude: lat,
      longitude: lng,
      name,
      priority: Number(config.priority),
    });
  }

  markers.sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }
    const center = viewport.center;
    if (!center) {
      return left.id.localeCompare(right.id);
    }
    return (
      haversineMeters(center.lat, center.lng, left.latitude, left.longitude) -
      haversineMeters(center.lat, center.lng, right.latitude, right.longitude)
    );
  });

  const cappedMarkers = markers.slice(0, viewport.zoom >= 17.2 ? 52 : 34);
  poiViewportCache = { key, fetchedAt: Date.now(), markers: cappedMarkers };
  return cappedMarkers;
}

async function snapPointToOsrm(
  lat: number,
  lng: number,
  maxDistanceMeters: number,
): Promise<RouteSnapInfo | null> {
  try {
    const params = new URLSearchParams({
      number: '1',
    });
    const data = await fetchJson<any>(
      `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}?${params.toString()}`,
      { headers: { Accept: 'application/json' } },
    );
    const waypoint = data.waypoints?.[0];
    const location = waypoint?.location;
    const distanceMeters = Number(waypoint?.distance);

    if (!Array.isArray(location) || !Number.isFinite(distanceMeters)) {
      return null;
    }

    const snapped = { lat: Number(location[1]), lng: Number(location[0]) };
    if (!Number.isFinite(snapped.lat) || !Number.isFinite(snapped.lng)) {
      return null;
    }

    return {
      original: { lat, lng },
      snapped,
      distanceMeters,
      accepted: distanceMeters <= maxDistanceMeters,
    };
  } catch {
    return null;
  }
}

async function buildRoutableOptions(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<RouteRequestOptions> {
  const [originSnap, destinationSnap] = await Promise.all([
    snapPointToOsrm(originLat, originLng, 140),
    snapPointToOsrm(destLat, destLng, 500),
  ]);

  const acceptedOrigin = originSnap?.accepted ? originSnap.snapped : { lat: originLat, lng: originLng };
  const acceptedDestination = destinationSnap?.accepted ? destinationSnap.snapped : { lat: destLat, lng: destLng };

  return {
    originLat: acceptedOrigin.lat,
    originLng: acceptedOrigin.lng,
    destLat: acceptedDestination.lat,
    destLng: acceptedDestination.lng,
    originalOriginLat: originLat,
    originalOriginLng: originLng,
    originalDestLat: destLat,
    originalDestLng: destLng,
    snapInfo: {
      origin: originSnap,
      destination: destinationSnap,
    },
  };
}

function routeSignature(route: RouteData): string {
  const coordinates = route.geometry;
  const first = coordinates[0];
  const middle = coordinates[Math.floor(coordinates.length / 2)];
  const last = coordinates[coordinates.length - 1];
  return [first, middle, last]
    .filter(Boolean)
    .map((point) => `${point[0].toFixed(3)},${point[1].toFixed(3)}`)
    .join('|');
}

function dedupeRoutes(routes: RouteData[]): RouteData[] {
  const seen = new Set<string>();
  const deduped: RouteData[] = [];

  for (const route of routes) {
    if (!route.geometry?.length || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
      continue;
    }

    const signature = routeSignature(route);
    const bucket = `${route.provider}:${Math.round(route.distance / 40)}:${signature}`;
    if (seen.has(bucket)) {
      continue;
    }

    seen.add(bucket);
    deduped.push(route);
  }

  return deduped;
}

function scoreRoute(route: RouteData, straightLineMeters: number): number {
  const distance = Math.max(1, route.distance);
  const duration = Math.max(1, route.duration);
  const detourRatio = straightLineMeters > 50 ? distance / straightLineMeters : 1;
  const isShortUrban = straightLineMeters < 9000;
  const durationWeight = isShortUrban ? 1.4 : 4.2;
  const distanceWeight = isShortUrban ? 1.0 : 0.62;
  const providerPenalty = route.provider === 'openrouteservice' ? 80 : 120;

  return distance * distanceWeight + duration * durationWeight + Math.max(0, detourRatio - 1.7) * 700 + providerPenalty;
}

function rankRouteCandidates(routes: RouteData[], options: RouteRequestOptions): RouteChoice[] {
  const finalized = dedupeRoutes(routes.map(finalizeRoute));
  if (!finalized.length) {
    return [];
  }

  const straightLineMeters = haversineMeters(
    options.originalOriginLat ?? options.originLat,
    options.originalOriginLng ?? options.originLng,
    options.originalDestLat ?? options.destLat,
    options.originalDestLng ?? options.destLng,
  );
  const bestDistance = Math.min(...finalized.map((route) => route.distance));
  const bestDuration = Math.min(...finalized.map((route) => route.duration));
  const saneRoutes = finalized.filter((route) => {
    const distance = route.distance;
    const duration = route.duration;
    const detourRatio = straightLineMeters > 50 ? distance / straightLineMeters : 1;
    const bigDetour = distance > bestDistance * 1.35 || detourRatio > 3.4;
    const materiallyFaster = duration < bestDuration * 0.88;
    return !bigDetour || materiallyFaster;
  });

  const ranked = (saneRoutes.length ? saneRoutes : finalized)
    .map((route) => ({
      ...route,
      score: scoreRoute(route, straightLineMeters),
    }))
    .sort((left, right) => {
      if ((left.score ?? 0) !== (right.score ?? 0)) {
        return (left.score ?? 0) - (right.score ?? 0);
      }
      return left.distance - right.distance;
    })
    .slice(0, 3);

  const minDistance = Math.min(...ranked.map((route) => route.distance));
  const minDuration = Math.min(...ranked.map((route) => route.duration));

  return ranked.map((route, index) => {
    const id = `${route.provider || 'route'}:${index}:${Math.round(route.distance)}:${Math.round(route.duration)}`;
    const isShortest = route.distance <= minDistance + 35;
    const isFastest = route.duration <= minDuration + 20;
    const label =
      index === 0
        ? 'Best'
        : isShortest
          ? 'Shortest'
          : isFastest
            ? 'Fastest'
            : `Alt ${index + 1}`;

    return {
      ...route,
      id,
      label,
      score: route.score ?? scoreRoute(route, straightLineMeters),
    };
  });
}

function routeChoicesFromProviderOrder(routes: RouteData[], options: RouteRequestOptions): RouteChoice[] {
  const finalized = dedupeRoutes(routes.map(finalizeRoute));
  if (!finalized.length) {
    return [];
  }

  const straightLineMeters = haversineMeters(
    options.originalOriginLat ?? options.originLat,
    options.originalOriginLng ?? options.originLng,
    options.originalDestLat ?? options.destLat,
    options.originalDestLng ?? options.destLng,
  );
  const minDistance = Math.min(...finalized.map((route) => route.distance));
  const minDuration = Math.min(...finalized.map((route) => route.duration));

  return finalized.slice(0, 3).map((route, index) => {
    const id = `${route.provider || 'route'}:${index}:${Math.round(route.distance)}:${Math.round(route.duration)}`;
    const isShortest = route.distance <= minDistance + 35;
    const isFastest = route.duration <= minDuration + 20;
    const label =
      index === 0
        ? 'Best'
        : isShortest
          ? 'Shortest'
          : isFastest
            ? 'Fastest'
            : `Alt ${index + 1}`;

    return {
      ...route,
      id,
      label,
      score: index + Math.max(0, route.distance / Math.max(straightLineMeters, 1) - 1),
    };
  });
}

export async function getRoutes(originLat: number, originLng: number, destLat: number, destLng: number): Promise<RouteChoice[]> {
  const rawOptions: RouteRequestOptions = {
    originLat,
    originLng,
    destLat,
    destLng,
    originalOriginLat: originLat,
    originalOriginLng: originLng,
    originalDestLat: destLat,
    originalDestLng: destLng,
  };

  if (GOOGLE_DIRECTIONS_ENABLED) {
    try {
      const googleRoutes = await routeWithGoogleDirectionsAlternatives(rawOptions);
      const googleChoices = routeChoicesFromProviderOrder(googleRoutes, rawOptions);
      if (googleChoices.length) {
        return googleChoices;
      }
    } catch (error) {
      console.warn('Google Directions routing failed, falling back to ORS/OSRM', error);
    }
  }

  const options = await buildRoutableOptions(originLat, originLng, destLat, destLng);

  const routeJobs: Array<Promise<RouteData[]>> = [routeWithOsrmAlternatives(options)];
  if (OPENROUTESERVICE_API_KEY) {
    routeJobs.unshift(routeWithOpenRouteServiceAlternatives(options));
  }

  const settled = await Promise.allSettled(routeJobs);
  const candidates = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  const ranked = rankRouteCandidates(candidates, options);

  if (!ranked.length) {
    if (OPENROUTESERVICE_API_KEY) {
      try {
        return rankRouteCandidates([await routeWithOpenRouteService(options)], options);
      } catch (error) {
        console.warn('OpenRouteService routing failed, falling back to OSRM', error);
      }
    }
    return rankRouteCandidates([await routeWithOsrm(options)], options);
  }

  return ranked;
}

export async function getRoute(originLat: number, originLng: number, destLat: number, destLng: number) {
  const options = {
    originLat,
    originLng,
    destLat,
    destLng,
  };

  const routes = await getRoutes(options.originLat, options.originLng, options.destLat, options.destLng);
  if (routes[0]) {
    return routes[0];
  }

  return finalizeRoute(await routeWithOsrm(options));
}

export async function getSpeedLimits(
  lat: number,
  lng: number,
  radius = 40,
  heading?: number | null,
  routeHeading?: number | null,
  countryCode?: string | null,
): Promise<SpeedLimitResponse> {
  const desiredHeading = routeHeading ?? heading ?? null;
  const normalizedCountryCode = countryCode?.trim().toUpperCase() || null;
  const lookupRadius = Math.max(60, Math.min(Math.round(radius), 220));

  try {
    const overpassQuery = `
      [out:json][timeout:10];
      (
        way["highway"]["maxspeed"](around:${lookupRadius},${lat},${lng});
      );
      out body;
      >;
      out skel qt;
    `;
    let data: any = null;
    let lastError: Error | null = null;

    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'RadarFlow/1.0',
          },
          body: `data=${encodeURIComponent(overpassQuery)}`,
        });

        if (!response.ok) {
          throw new Error(`Overpass API error: ${response.status}`);
        }

        data = await response.json();
        lastError = null;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Overpass request failed');
      }
    }

    if (!data) {
      throw lastError ?? new Error('No Overpass response');
    }

    const speedLimits: SpeedLimitCandidate[] = [];
    const nodes: Record<string, NodePoint> = {};

    for (const element of data.elements ?? []) {
      if (element.type === 'node') {
        nodes[element.id] = { lat: element.lat, lng: element.lon };
      }
    }

    for (const element of data.elements ?? []) {
      if (element.type === 'way' && element.tags?.maxspeed) {
        const maxspeed = parseMaxspeed(element.tags.maxspeed, normalizedCountryCode);
        if (!maxspeed || maxspeed.value <= 0) {
          continue;
        }

        const sampledWay = sampleWay(element.nodes || [], nodes, lat, lng);
        if (!sampledWay) {
          continue;
        }

        speedLimits.push({
          ...maxspeed,
          lat: sampledWay.lat,
          lng: sampledWay.lng,
          bearing: sampledWay.bearing,
          roadName: element.tags?.name || element.tags?.ref || null,
          highway: element.tags?.highway || null,
          ref: element.tags?.ref || null,
          distanceMeters: sampledWay.distanceMeters,
        });
      }
    }

    speedLimits.sort((a, b) => scoreCandidate(a, lat, lng, desiredHeading) - scoreCandidate(b, lat, lng, desiredHeading));
    const nearest = speedLimits[0] || null;

    return {
      speedLimit: nearest
        ? {
            value: nearest.value,
            unit: nearest.unit,
            roadName: nearest.roadName,
            bearing: nearest.bearing,
          }
        : null,
    };
  } catch {
    return { speedLimit: null };
  }
}

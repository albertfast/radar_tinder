import { OSRMService } from './OSRMService';
import { NominatimService } from './NominatimService';
import { AddressSuggestion } from '../types';

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const BASE_URL = 'https://maps.googleapis.com/maps/api';

// --- Helpers ---

const distKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const decodePolyline = (t: string) => {
  let pts = [], idx = 0, lat = 0, lng = 0;
  while (idx < t.length) {
    let b, shift = 0, res = 0;
    do { b = t.charCodeAt(idx++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (res & 1) ? ~(res >> 1) : (res >> 1);
    res = shift = 0;
    do { b = t.charCodeAt(idx++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (res & 1) ? ~(res >> 1) : (res >> 1);
    pts.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return pts;
};

const parseCoords = (s: string) => {
  const m = s.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  return (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) ? { lat, lon } : null;
};

// --- Service ---

export class GoogleMapsService {
  
  // 1. Fallback Logic (OSRM + Nominatim)
  private static async getFallback(oLat: number, oLng: number, dest: string) {
    const target = parseCoords(dest) || await NominatimService.geocode(dest);
    if (!target) return { error: 'NOT_FOUND', message: 'Location not found' };

    const route = await OSRMService.getDirections(oLat, oLng, target.lat, target.lon);
    if (!route?.coordinates?.length) return { error: 'ZERO_RESULTS', message: 'No route found' };

    const addr = (await NominatimService.reverse(target.lat, target.lon).catch(() => null))?.display_name || dest;
    return { ...route, legs: [{ ...route.legs?.[0], end_address: addr, end_location: { lat: target.lat, lng: target.lon } }] };
  }

  // 2. Nearby Search
  static async searchNearby(lat: number, lng: number, radius = 5000, keyword = 'speed_camera|traffic_enforcement') {
    if (!KEY) return [];
    const res = await fetch(`${BASE_URL}/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&key=${KEY}`).then(r => r.json());
    return res.status === 'OK' ? res.results : [];
  }

  // 3. Speed Limit
  static async getSpeedLimit(placeId: string) {
    if (!KEY) return null;
    const res = await fetch(`https://roads.googleapis.com/v1/speedLimits?placeId=${placeId}&key=${KEY}`).then(r => r.json());
    return res.speedLimits?.[0] || null;
  }

  // 4. Distance
  static async getDistance(oLat: number, oLng: number, dLat: number, dLng: number) {
    try {
      const osrm = await OSRMService.getDistance(oLat, oLng, dLat, dLng);
      if (osrm) return { distance: { text: `${(osrm.distance / 1000).toFixed(1)} km`, value: osrm.distance }, duration: { text: `${Math.round(osrm.duration / 60)} min`, value: osrm.duration } };
    } catch {}

    if (!KEY) return null;
    const res = await fetch(`${BASE_URL}/distancematrix/json?origins=${oLat},${oLng}&destinations=${dLat},${dLng}&key=${KEY}`).then(r => r.json());
    return (res.status === 'OK' && res.rows[0].elements[0].status === 'OK') ? res.rows[0].elements[0] : null;
  }

  // 5. Directions
  static async getDirections(oLat: number, oLng: number, dest: string, opts?: { alternatives?: boolean }) {
    if (!KEY) return this.getFallback(oLat, oLng, dest);

    const url = `${BASE_URL}/directions/json?origin=${oLat},${oLng}&destination=${encodeURIComponent(dest)}&mode=driving${opts?.alternatives ? '&alternatives=true' : ''}&key=${KEY}`;
    const data = await fetch(url).then(r => r.json());

    if (data.status !== 'OK') return data.status === 'ZERO_RESULTS' ? { error: 'ZERO_RESULTS', message: 'No route' } : this.getFallback(oLat, oLng, dest);

    // Sort by best duration (traffic aware)
    const best = data.routes.sort((a: any, b: any) => 
      (a.legs[0].duration_in_traffic?.value || a.legs[0].duration.value) - (b.legs[0].duration_in_traffic?.value || b.legs[0].duration.value)
    )[0];
    const leg = best.legs[0];

    return {
      coordinates: decodePolyline(best.overview_polyline.points),
      legs: [{ distance: leg.distance, duration: leg.duration, duration_in_traffic: leg.duration_in_traffic, end_address: leg.end_address, steps: leg.steps, end_location: leg.end_location }]
    };
  }

  // 6. Recalculate
  static async recalculateRoute(lat: number, lng: number, dest: string, oldRoute?: any) {
    const newRoute = await this.getDirections(lat, lng, dest, { alternatives: true });
    if (newRoute?.error || !oldRoute?.legs) return newRoute;
    // Keep old route if deviation is small (<15%)
    const dev = Math.abs((newRoute.legs[0].distance.value - oldRoute.legs[0].distance.value) / oldRoute.legs[0].distance.value);
    return dev < 0.15 ? oldRoute : newRoute;
  }

  // 7. Reverse Geocoding
  static async getReverseGeocoding(lat: number, lng: number) {
    if (!KEY) return null;
    const res = await fetch(`${BASE_URL}/geocode/json?latlng=${lat},${lng}&key=${KEY}`).then(r => r.json());
    return res.results?.[0]?.formatted_address || null;
  }

  // 8. Suggestions
  static async getGeocodeSuggestions(q: string, opts?: { countryCode?: string; focusLocation?: any }): Promise<AddressSuggestion[]> {
    if (!q.trim()) return [];
    
    // Try Nominatim
    const nom = await NominatimService.getSuggestionObjects(q, { limit: 6, countryCode: opts?.countryCode, focusLocation: opts?.focusLocation }).catch(() => []);
    if (nom.length) return nom;

    // Fallback Google
    if (!KEY) return [];
    const params = new URLSearchParams({ address: q, key: KEY });
    if (opts?.countryCode) params.append('region', opts.countryCode);
    
    const res = await fetch(`${BASE_URL}/geocode/json?${params}`).then(r => r.json());
    if (res.status !== 'OK') return [];

    return res.results.map((r: any) => {
      const lat = r.geometry.location.lat, lon = r.geometry.location.lng;
      return { id: `google:${r.place_id}`, label: r.formatted_address, queryValue: `${lat},${lon}`, latitude: lat, longitude: lon, source: 'google', qualityScore: 50 };
    }).slice(0, 6);
  }
}
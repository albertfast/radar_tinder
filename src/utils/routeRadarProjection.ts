export type RouteCoordinate = { latitude: number; longitude: number };

export type RouteProjectionIndex = {
  coords: RouteCoordinate[];
  cumulativeMeters: number[];
  totalMeters: number;
};

export type RoutePointProjection = {
  latitude: number;
  longitude: number;
  progressMeters: number;
  corridorDistanceMeters: number;
  segmentIndex: number;
  segmentHeadingDeg: number | null;
};

export type RouteRadarMatch<T> = T & {
  routeMatched: true;
  corridorDistanceMeters: number;
  routeProgressMeters: number;
  userProgressMeters: number;
  aheadMeters: number;
  etaSeconds: number;
  headingDeltaDeg: number | null;
  routeMatchScore: number;
  distance: number;
};

type MatchOptions = {
  currentLocation: { latitude: number; longitude: number; heading?: number | null };
  routeCoords: RouteCoordinate[];
  speedKph: number;
  maxCorridorMeters?: number;
  maxAheadMeters?: number;
  minAheadMeters?: number;
  maxRouteHeadingDeltaDeg?: number;
};

const metersPerLat = 111320;

const isFiniteCoord = (point?: RouteCoordinate | null): point is RouteCoordinate =>
  typeof point?.latitude === 'number' &&
  typeof point?.longitude === 'number' &&
  Number.isFinite(point.latitude) &&
  Number.isFinite(point.longitude) &&
  point.latitude >= -90 &&
  point.latitude <= 90 &&
  point.longitude >= -180 &&
  point.longitude <= 180;

export const normalizeHeading = (heading?: number | null): number | null => {
  if (typeof heading !== 'number' || !Number.isFinite(heading) || heading < 0) return null;
  const normalized = heading % 360;
  return normalized >= 0 ? normalized : normalized + 360;
};

export const headingDeltaDeg = (a: number, b: number): number =>
  Math.abs(((a - b + 540) % 360) - 180);

export const haversineMeters = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const earthRadius = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const bearingBetween = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const lambda1 = (lng1 * Math.PI) / 180;
  const lambda2 = (lng2 * Math.PI) / 180;
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
};

const toLocalMeters = (lat: number, lng: number, originLat: number, originLng: number) => {
  const metersPerLng = Math.max(1, Math.abs(Math.cos((originLat * Math.PI) / 180) * metersPerLat));
  return {
    x: (lng - originLng) * metersPerLng,
    y: (lat - originLat) * metersPerLat,
    metersPerLng,
  };
};

export const buildRouteProjectionIndex = (
  routeCoords: RouteCoordinate[]
): RouteProjectionIndex | null => {
  const coords = routeCoords.filter(isFiniteCoord);
  if (coords.length < 2) return null;

  const cumulativeMeters = [0];
  for (let index = 0; index < coords.length - 1; index += 1) {
    const start = coords[index];
    const end = coords[index + 1];
    cumulativeMeters.push(
      cumulativeMeters[index] +
        haversineMeters(start.latitude, start.longitude, end.latitude, end.longitude)
    );
  }

  return {
    coords,
    cumulativeMeters,
    totalMeters: cumulativeMeters[cumulativeMeters.length - 1] || 0,
  };
};

export const projectPointOnRoute = (
  latitude: number,
  longitude: number,
  routeIndex: RouteProjectionIndex
): RoutePointProjection | null => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  let best:
    | {
        latitude: number;
        longitude: number;
        progressMeters: number;
        corridorDistanceMeters: number;
        segmentIndex: number;
        segmentHeadingDeg: number | null;
      }
    | null = null;

  for (let index = 0; index < routeIndex.coords.length - 1; index += 1) {
    const start = routeIndex.coords[index];
    const end = routeIndex.coords[index + 1];
    const startMeters = toLocalMeters(start.latitude, start.longitude, latitude, longitude);
    const endMeters = toLocalMeters(end.latitude, end.longitude, latitude, longitude);
    const dx = endMeters.x - startMeters.x;
    const dy = endMeters.y - startMeters.y;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq > 0
        ? Math.max(0, Math.min(1, ((0 - startMeters.x) * dx + (0 - startMeters.y) * dy) / lengthSq))
        : 0;
    const projectedX = startMeters.x + dx * t;
    const projectedY = startMeters.y + dy * t;
    const projectedLat = latitude + projectedY / metersPerLat;
    const projectedLng = longitude + projectedX / startMeters.metersPerLng;
    const corridorDistanceMeters = Math.hypot(projectedX, projectedY);
    const segmentMeters = haversineMeters(start.latitude, start.longitude, end.latitude, end.longitude);
    const segmentHeadingDeg =
      segmentMeters >= 6
        ? bearingBetween(start.latitude, start.longitude, end.latitude, end.longitude)
        : null;

    if (!best || corridorDistanceMeters < best.corridorDistanceMeters) {
      best = {
        latitude: projectedLat,
        longitude: projectedLng,
        progressMeters: routeIndex.cumulativeMeters[index] + segmentMeters * t,
        corridorDistanceMeters,
        segmentIndex: index,
        segmentHeadingDeg,
      };
    }
  }

  return best;
};

export const matchRadarToRoute = <T extends { latitude: number; longitude: number }>(
  radar: T,
  options: MatchOptions,
  routeIndex = buildRouteProjectionIndex(options.routeCoords)
): RouteRadarMatch<T> | null => {
  if (!routeIndex) return null;

  const userProjection = projectPointOnRoute(
    options.currentLocation.latitude,
    options.currentLocation.longitude,
    routeIndex
  );
  const radarProjection = projectPointOnRoute(radar.latitude, radar.longitude, routeIndex);
  if (!userProjection || !radarProjection) return null;

  const maxCorridorMeters = options.maxCorridorMeters ?? 65;
  if (radarProjection.corridorDistanceMeters > maxCorridorMeters) {
    return null;
  }

  const aheadMeters = radarProjection.progressMeters - userProjection.progressMeters;
  const minAheadMeters = options.minAheadMeters ?? -30;
  const maxAheadMeters = options.maxAheadMeters ?? 60000;
  if (aheadMeters < minAheadMeters || aheadMeters > maxAheadMeters) {
    return null;
  }

  const currentHeading = normalizeHeading(options.currentLocation.heading);
  let routeHeadingDelta: number | null = null;
  if (currentHeading !== null && radarProjection.segmentHeadingDeg !== null) {
    routeHeadingDelta = Number(headingDeltaDeg(currentHeading, radarProjection.segmentHeadingDeg).toFixed(1));
  }

  if (
    typeof options.maxRouteHeadingDeltaDeg === 'number' &&
    routeHeadingDelta !== null &&
    routeHeadingDelta > options.maxRouteHeadingDeltaDeg
  ) {
    return null;
  }

  const aheadDistanceKm = Math.max(0, aheadMeters) / 1000;
  const safeSpeedKph = Math.max(5, Number.isFinite(options.speedKph) ? options.speedKph : 5);
  const etaSeconds = (aheadDistanceKm / safeSpeedKph) * 3600;
  const corridorScore = 1 - Math.min(radarProjection.corridorDistanceMeters / maxCorridorMeters, 1);
  const aheadScore = 1 - Math.min(Math.max(0, aheadMeters) / Math.max(maxAheadMeters, 1), 1);

  return {
    ...radar,
    routeMatched: true,
    corridorDistanceMeters: Number(radarProjection.corridorDistanceMeters.toFixed(1)),
    routeProgressMeters: Number(radarProjection.progressMeters.toFixed(1)),
    userProgressMeters: Number(userProjection.progressMeters.toFixed(1)),
    aheadMeters: Number(aheadMeters.toFixed(1)),
    etaSeconds: Number(etaSeconds.toFixed(1)),
    headingDeltaDeg: routeHeadingDelta,
    routeMatchScore: Number((corridorScore * 0.7 + aheadScore * 0.3).toFixed(3)),
    distance: aheadDistanceKm,
  };
};

export const filterRouteRadarCandidates = <T extends { latitude: number; longitude: number }>(
  radars: T[],
  options: MatchOptions
): RouteRadarMatch<T>[] => {
  const routeIndex = buildRouteProjectionIndex(options.routeCoords);
  if (!routeIndex) return [];

  return radars
    .map((radar) => matchRadarToRoute(radar, options, routeIndex))
    .filter((radar): radar is RouteRadarMatch<T> => Boolean(radar))
    .sort((left, right) => {
      if (left.aheadMeters !== right.aheadMeters) {
        return left.aheadMeters - right.aheadMeters;
      }
      return left.corridorDistanceMeters - right.corridorDistanceMeters;
    });
};

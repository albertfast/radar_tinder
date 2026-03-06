import * as Location from 'expo-location';

export class LocationService {
  static async requestLocationPermission(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission denied');
      }
      return true;
    } catch (error) {
      console.error('Error requesting location permission:', error);
      throw error;
    }
  }

  static async getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
    try {
      await this.requestLocationPermission();
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error) {
      console.error('Error getting current location:', error);
      throw error;
    }
  }

  static async watchLocation(
    callback: (location: {
      latitude: number;
      longitude: number;
      heading: number | null;
      speed: number | null;
      accuracy: number | null;
    }) => void,
    options?: { forDriving?: boolean }
  ): Promise<Location.LocationSubscription> {
    try {
      await this.requestLocationPermission();
      
      return await Location.watchPositionAsync(
        {
          accuracy: options?.forDriving ? Location.Accuracy.BestForNavigation : Location.Accuracy.High,
          distanceInterval: options?.forDriving ? 2 : 5, // tighter updates in driving mode for smoother follow camera
          timeInterval: options?.forDriving ? 500 : 1000, // 2Hz while driving, 1Hz otherwise
        },
        (location) => {
          callback({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            heading: location.coords.heading,
            speed: location.coords.speed,
            accuracy:
              typeof location.coords.accuracy === 'number' && Number.isFinite(location.coords.accuracy)
                ? location.coords.accuracy
                : null,
          });
        }
      );
    } catch (error) {
      console.error('Error watching location:', error);
      throw error;
    }
  }

  /**
   * Calculate distance from current location to a polyline route
   * This helps determine if user is off-route
   */
  static calculateDistanceToPolyline(
    currentLat: number,
    currentLng: number,
    polyline: Array<{ latitude: number; longitude: number }>
  ): number {
    if (!polyline || polyline.length < 2) {
      return Number.MAX_SAFE_INTEGER;
    }

    let minDistance = Number.MAX_SAFE_INTEGER;
    
    // Check distance to each segment of the polyline
    for (let i = 0; i < polyline.length - 1; i++) {
      const point1 = polyline[i];
      const point2 = polyline[i + 1];
      
      // Calculate distance from current point to line segment
      const distance = this.distanceToLineSegment(
        currentLat, currentLng,
        point1.latitude, point1.longitude,
        point2.latitude, point2.longitude
      );
      
      if (distance < minDistance) {
        minDistance = distance;
      }
      
      // Early exit if we find very close point
      if (minDistance < 10) {
        break;
      }
    }
    
    return minDistance;
  }

  /**
   * Calculate distance from point to line segment
   * Using perpendicular distance formula
   */
  private static distanceToLineSegment(
    x: number, y: number,
    x1: number, y1: number,
    x2: number, y2: number
  ): number {
    // Calculate the length of the line segment
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;
    
    // Convert to meters (approximate)
    return Math.sqrt(dx * dx + dy * dy) * 111000;
  }

  /**
   * Check if user is deviating from route
   */
  static isOffRoute(
    currentLat: number,
    currentLng: number,
    routeCoords: Array<{ latitude: number; longitude: number }>,
    thresholdMeters: number = 50
  ): boolean {
    const distanceToRoute = this.calculateDistanceToPolyline(currentLat, currentLng, routeCoords);
    return distanceToRoute > thresholdMeters;
  }

  /**
   * Calculate route progress percentage
   */
  static calculateRouteProgress(
    currentLat: number,
    currentLng: number,
    routeCoords: Array<{ latitude: number; longitude: number }>
  ): number {
    if (!routeCoords || routeCoords.length < 2) {
      return 0;
    }

    // Find the closest point on the route
    let minDistance = Number.MAX_SAFE_INTEGER;
    let closestIndex = 0;

    for (let i = 0; i < routeCoords.length; i++) {
      const point = routeCoords[i];
      const distance = this.calculateDistanceSync(currentLat, currentLng, point.latitude, point.longitude);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }

    // Calculate progress as percentage of total route length
    const totalDistance = this.calculatePolylineLength(routeCoords);
    const traveledDistance = this.calculatePolylineLength(routeCoords.slice(0, closestIndex + 1));

    return Math.min(100, Math.max(0, (traveledDistance / totalDistance) * 100));
  }

  static findClosestRouteIndex(
    currentLat: number,
    currentLng: number,
    routeCoords: Array<{ latitude: number; longitude: number }>
  ): number {
    if (!routeCoords || routeCoords.length === 0) {
      return 0;
    }

    let minDistance = Number.MAX_SAFE_INTEGER;
    let closestIndex = 0;

    for (let i = 0; i < routeCoords.length; i++) {
      const point = routeCoords[i];
      const distance = this.calculateDistanceSync(
        currentLat,
        currentLng,
        point.latitude,
        point.longitude
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }

    return closestIndex;
  }

  static calculateRouteBearing(
    currentLat: number,
    currentLng: number,
    routeCoords: Array<{ latitude: number; longitude: number }>
  ): number | null {
    if (!routeCoords || routeCoords.length < 2) {
      return null;
    }

    const closestIndex = this.findClosestRouteIndex(currentLat, currentLng, routeCoords);
    const nextIndex = Math.min(routeCoords.length - 1, closestIndex + 1);

    if (nextIndex !== closestIndex) {
      const nextPoint = routeCoords[nextIndex];
      return this.calculateBearing(currentLat, currentLng, nextPoint.latitude, nextPoint.longitude);
    }

    if (closestIndex > 0) {
      const previousPoint = routeCoords[closestIndex - 1];
      const currentPoint = routeCoords[closestIndex];
      return this.calculateBearing(
        previousPoint.latitude,
        previousPoint.longitude,
        currentPoint.latitude,
        currentPoint.longitude
      );
    }

    return null;
  }

  static projectForwardCoordinate(
    latitude: number,
    longitude: number,
    bearingDeg: number,
    distanceMeters: number
  ): { latitude: number; longitude: number } {
    const earthRadiusMeters = 6378137;
    const angularDistance = distanceMeters / earthRadiusMeters;
    const bearingRad = (bearingDeg * Math.PI) / 180;
    const latitudeRad = (latitude * Math.PI) / 180;
    const longitudeRad = (longitude * Math.PI) / 180;

    const projectedLatitude = Math.asin(
      Math.sin(latitudeRad) * Math.cos(angularDistance) +
        Math.cos(latitudeRad) * Math.sin(angularDistance) * Math.cos(bearingRad)
    );
    const projectedLongitude =
      longitudeRad +
      Math.atan2(
        Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latitudeRad),
        Math.cos(angularDistance) - Math.sin(latitudeRad) * Math.sin(projectedLatitude)
      );

    return {
      latitude: (projectedLatitude * 180) / Math.PI,
      longitude: (projectedLongitude * 180) / Math.PI,
    };
  }

  /**
   * Calculate total length of a polyline
   */
  private static calculatePolylineLength(polyline: Array<{ latitude: number; longitude: number }>): number {
    let totalDistance = 0;
    
    for (let i = 0; i < polyline.length - 1; i++) {
      const point1 = polyline[i];
      const point2 = polyline[i + 1];
      totalDistance += this.calculateDistanceSync(
        point1.latitude, point1.longitude,
        point2.latitude, point2.longitude
      );
    }
    
    return totalDistance;
  }

  static async calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): Promise<number> {
    return this.calculateDistanceSync(lat1, lon1, lat2, lon2);
  }

  static calculateDistanceSync(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  static calculateBearing(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return (θ * 180 / Math.PI + 360) % 360; // in degrees
  }

  static async reverseGeocode(
    latitude: number,
    longitude: number
  ): Promise<Location.LocationGeocodedAddress[]> {
    try {
      const addresses = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });
      return addresses;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTimeout =
        message.includes('TimeoutException') ||
        message.includes('Waited 5 seconds');
      if (isTimeout) {
        console.warn('Reverse geocoding timed out; continuing without address label');
        return [];
      }
      console.error('Error reverse geocoding:', error);
      throw error;
    }
  }
}

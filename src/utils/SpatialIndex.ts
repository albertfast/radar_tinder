/**
 * Spatial Index - Geohash-based Grid for O(log n) Nearby Lookups
 * Uses geohash to partition space into cells for efficient spatial queries
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface IndexedItem<T> extends GeoPoint {
  data: T;
}

// Geohash precision levels (characters) and approximate cell sizes
// 4 chars ≈ 40km, 5 chars ≈ 5km, 6 chars ≈ 1km, 7 chars ≈ 150m
const DEFAULT_PRECISION = 5; // ~5km cells

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export class SpatialIndex<T> {
  private grid: Map<string, IndexedItem<T>[]> = new Map();
  private precision: number;
  private allItems: IndexedItem<T>[] = [];

  constructor(precision: number = DEFAULT_PRECISION) {
    this.precision = precision;
  }

  /**
   * Encode lat/lon to geohash string
   * O(1) operation
   */
  private encode(lat: number, lon: number): string {
    let latMin = -90, latMax = 90;
    let lonMin = -180, lonMax = 180;
    let hash = '';
    let bit = 0;
    let ch = 0;
    let isLon = true;

    while (hash.length < this.precision) {
      if (isLon) {
        const mid = (lonMin + lonMax) / 2;
        if (lon >= mid) {
          ch |= (1 << (4 - bit));
          lonMin = mid;
        } else {
          lonMax = mid;
        }
      } else {
        const mid = (latMin + latMax) / 2;
        if (lat >= mid) {
          ch |= (1 << (4 - bit));
          latMin = mid;
        } else {
          latMax = mid;
        }
      }

      isLon = !isLon;
      bit++;

      if (bit === 5) {
        hash += BASE32[ch];
        bit = 0;
        ch = 0;
      }
    }

    return hash;
  }

  /**
   * Get neighboring geohash cells (including self)
   * Returns 9 cells: center + 8 neighbors
   */
  private getNeighbors(hash: string): string[] {
    const neighbors: string[] = [hash];
    
    // Decode center of cell to get coordinates
    const center = this.decode(hash);
    
    // Cell size approximation based on precision
    const cellSizes: Record<number, number> = {
      4: 0.4,   // ~40km in degrees
      5: 0.05,  // ~5km
      6: 0.01,  // ~1km
      7: 0.002, // ~150m
    };
    const step = cellSizes[this.precision] || 0.05;

    // Generate 8 neighbors
    const offsets = [
      [-step, 0], [step, 0], [0, -step], [0, step],
      [-step, -step], [-step, step], [step, -step], [step, step],
    ];

    for (const [dLat, dLon] of offsets) {
      const neighborHash = this.encode(
        center.latitude + dLat,
        center.longitude + dLon
      );
      if (!neighbors.includes(neighborHash)) {
        neighbors.push(neighborHash);
      }
    }

    return neighbors;
  }

  /**
   * Decode geohash to approximate center coordinates
   */
  private decode(hash: string): GeoPoint {
    let latMin = -90, latMax = 90;
    let lonMin = -180, lonMax = 180;
    let isLon = true;

    for (const c of hash) {
      const idx = BASE32.indexOf(c);
      if (idx === -1) continue;

      for (let bit = 4; bit >= 0; bit--) {
        const mask = 1 << bit;
        if (isLon) {
          const mid = (lonMin + lonMax) / 2;
          if (idx & mask) {
            lonMin = mid;
          } else {
            lonMax = mid;
          }
        } else {
          const mid = (latMin + latMax) / 2;
          if (idx & mask) {
            latMin = mid;
          } else {
            latMax = mid;
          }
        }
        isLon = !isLon;
      }
    }

    return {
      latitude: (latMin + latMax) / 2,
      longitude: (lonMin + lonMax) / 2,
    };
  }

  /**
   * Insert item into spatial index
   * O(1) operation
   */
  insert(lat: number, lon: number, data: T): void {
    const hash = this.encode(lat, lon);
    const item: IndexedItem<T> = { latitude: lat, longitude: lon, data };

    if (!this.grid.has(hash)) {
      this.grid.set(hash, []);
    }
    this.grid.get(hash)!.push(item);
    this.allItems.push(item);
  }

  /**
   * Bulk insert items
   * O(n) operation
   */
  insertMany(items: Array<{ lat: number; lon: number; data: T }>): void {
    for (const item of items) {
      this.insert(item.lat, item.lon, item.data);
    }
  }

  /**
   * Query items within radius of point
   * O(k) where k = items in neighboring cells
   * Much faster than O(n) brute force for large datasets
   */
  queryRadius(
    lat: number,
    lon: number,
    radiusKm: number
  ): Array<IndexedItem<T> & { distance: number }> {
    const hash = this.encode(lat, lon);
    const neighbors = this.getNeighbors(hash);
    const candidates: IndexedItem<T>[] = [];

    // Collect items from neighboring cells
    for (const neighborHash of neighbors) {
      const items = this.grid.get(neighborHash);
      if (items) {
        candidates.push(...items);
      }
    }

    // Filter by exact distance using Haversine
    const results: Array<IndexedItem<T> & { distance: number }> = [];

    for (const item of candidates) {
      const distance = this.haversine(lat, lon, item.latitude, item.longitude);
      if (distance <= radiusKm) {
        results.push({ ...item, distance });
      }
    }

    // Sort by distance
    results.sort((a, b) => a.distance - b.distance);

    return results;
  }

  /**
   * Get K nearest neighbors
   * O(k log k) where k = items in neighboring cells
   */
  queryKNearest(lat: number, lon: number, k: number): Array<IndexedItem<T> & { distance: number }> {
    // Start with neighboring cells, expand if needed
    const hash = this.encode(lat, lon);
    const neighbors = this.getNeighbors(hash);
    let candidates: IndexedItem<T>[] = [];

    for (const neighborHash of neighbors) {
      const items = this.grid.get(neighborHash);
      if (items) {
        candidates.push(...items);
      }
    }

    // If not enough candidates, fall back to all items
    if (candidates.length < k) {
      candidates = this.allItems;
    }

    // Calculate distances and sort
    const withDistance = candidates.map((item) => ({
      ...item,
      distance: this.haversine(lat, lon, item.latitude, item.longitude),
    }));

    withDistance.sort((a, b) => a.distance - b.distance);

    return withDistance.slice(0, k);
  }

  /**
   * Haversine distance formula
   * O(1) operation
   */
  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.grid.clear();
    this.allItems = [];
  }

  /**
   * Get total number of indexed items
   */
  get size(): number {
    return this.allItems.length;
  }

  /**
   * Get number of cells in grid
   */
  get cellCount(): number {
    return this.grid.size;
  }
}

import { RadarLocation } from '../types';
import { DatabaseService } from './DatabaseService';

export class OfflineService {
  private static isOnline: boolean = true;
  private static syncQueue: Array<{ type: string; data: any }> = [];
  private static isCachingRadarLocations = false;

  static async init(): Promise<void> {
    try {
      await DatabaseService.init();
      this.setupNetworkListener();
      await this.processSyncQueue();
    } catch (error) {
      console.error('Error initializing offline service:', error);
    }
  }

  private static setupNetworkListener(): void {
    // In a real app, you would use NetInfo from @react-native-community/netinfo
    // For now, we'll assume online status
    setInterval(() => {
      this.checkNetworkStatus();
    }, 30000); // Check every 30 seconds
  }

  private static async checkNetworkStatus(): Promise<void> {
    try {
      // Mock network check - in real app, use NetInfo
      const wasOnline = this.isOnline;
      this.isOnline = Math.random() > 0.1; // 90% chance of being online

      if (!wasOnline && this.isOnline) {
        // Just came back online
        await this.processSyncQueue();
      }
    } catch (error) {
      console.error('Error checking network status:', error);
    }
  }

  static async saveRadarLocationOffline(location: RadarLocation): Promise<void> {
    try {
      // Save to local database
      await DatabaseService.saveRadarLocation(location, false);
      
      // Add to sync queue
      this.syncQueue.push({
        type: 'radar_location',
        data: location,
      });

      // Try to sync if online
      if (this.isOnline) {
        await this.processSyncQueue();
      }
    } catch (error) {
      console.error('Error saving radar location offline:', error);
      throw error;
    }
  }

  static async getCachedRadarLocations(): Promise<RadarLocation[]> {
    try {
      return await DatabaseService.getRadarLocations();
    } catch (error) {
      console.error('Error getting cached radar locations:', error);
      return [];
    }
  }

  static async getUnsyncedRadarLocations(): Promise<RadarLocation[]> {
    try {
      return await DatabaseService.getUnsyncedRadarLocations();
    } catch (error) {
      console.error('Error getting unsynced radar locations:', error);
      return [];
    }
  }

  static async cacheData(key: string, data: any, expiresAt?: Date): Promise<void> {
    try {
      await DatabaseService.saveCache(key, data, 'general', expiresAt);
    } catch (error) {
      console.error('Error caching data:', error);
    }
  }

  static async getCachedData(key: string): Promise<any | null> {
    try {
      return await DatabaseService.getCache(key);
    } catch (error) {
      console.error('Error getting cached data:', error);
      return null;
    }
  }

  static async cacheRadarLocations(locations: RadarLocation[]): Promise<void> {
    try {
      if (this.isCachingRadarLocations) return;
      this.isCachingRadarLocations = true;
      const cacheKey = 'radar_locations';
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      await this.cacheData(cacheKey, locations, expiresAt);
    } catch (error) {
      console.error('Error caching radar locations:', error);
    } finally {
      this.isCachingRadarLocations = false;
    }
  }

  static async getCachedRadarLocationsWithExpiry(): Promise<RadarLocation[]> {
    try {
      const cached = await this.getCachedData('radar_locations');
      return cached || [];
    } catch (error) {
      console.error('Error getting cached radar locations with expiry:', error);
      return [];
    }
  }

  private static async processSyncQueue(): Promise<void> {
    if (!this.isOnline || this.syncQueue.length === 0) {
      return;
    }

    const itemsToSync = [...this.syncQueue];
    this.syncQueue = [];

    for (const item of itemsToSync) {
      try {
        switch (item.type) {
          case 'radar_location':
            await this.syncRadarLocation(item.data);
            break;
          default:
            console.warn('Unknown sync item type:', item.type);
        }
      } catch (error) {
        console.error('Error syncing item:', error);
        // Re-add to queue for later retry
        this.syncQueue.push(item);
      }
    }
  }

  private static async syncRadarLocation(location: RadarLocation): Promise<void> {
    try {
      // TODO: Implement actual API call to sync with backend
      console.log('Syncing radar location:', location);
      
      // Mark as synced in local database
      await DatabaseService.markRadarLocationAsSynced(location.id);
    } catch (error) {
      console.error('Error syncing radar location:', error);
      throw error;
    }
  }

  static async forceSync(): Promise<void> {
    try {
      this.isOnline = true;
      await this.processSyncQueue();
    } catch (error) {
      console.error('Error forcing sync:', error);
    }
  }

  static getSyncStatus(): {
    isOnline: boolean;
    pendingSyncs: number;
  } {
    return {
      isOnline: this.isOnline,
      pendingSyncs: this.syncQueue.length,
    };
  }

  static async clearSyncQueue(): Promise<void> {
    this.syncQueue = [];
  }

  static async cleanup(): Promise<void> {
    try {
      await DatabaseService.clearOldData();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

import * as SQLite from 'expo-sqlite';
import { RadarLocation, User, RadarAlert, SubscriptionPlan } from '../types';

export class DatabaseService {
  private static db: SQLite.SQLiteDatabase;

  static async init(): Promise<void> {
    if (this.db) return;
    try {
      this.db = await SQLite.openDatabaseAsync('radar_detector.db');
      await this.createTables();
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }

  private static async ensureDb(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }

  private static async createTables(): Promise<void> {
    const queries = [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        subscription_type TEXT NOT NULL DEFAULT 'free',
        subscription_expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      
      `CREATE TABLE IF NOT EXISTS radar_locations (
        id TEXT PRIMARY KEY,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        type TEXT NOT NULL,
        direction TEXT,
        speed_limit INTEGER,
        confidence REAL NOT NULL,
        last_confirmed TEXT NOT NULL,
        reported_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_synced INTEGER DEFAULT 0
      )`,
      
      `CREATE TABLE IF NOT EXISTS radar_alerts (
        id TEXT PRIMARY KEY,
        radar_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        distance REAL NOT NULL,
        estimated_time REAL NOT NULL,
        severity TEXT NOT NULL,
        acknowledged INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      )`,
      
      `CREATE TABLE IF NOT EXISTS subscription_plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        price REAL NOT NULL,
        currency TEXT NOT NULL,
        duration INTEGER NOT NULL,
        is_active INTEGER DEFAULT 1
      )`,
      
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      
      `CREATE TABLE IF NOT EXISTS offline_cache (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT
      )`,
      
      `CREATE INDEX IF NOT EXISTS idx_radar_locations_coords ON radar_locations(latitude, longitude)`,
      `CREATE INDEX IF NOT EXISTS idx_radar_locations_type ON radar_locations(type)`,
      `CREATE INDEX IF NOT EXISTS idx_radar_alerts_user ON radar_alerts(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_offline_cache_type ON offline_cache(type)`,
    ];

    for (const query of queries) {
      try {
        await this.db.execAsync(query);
      } catch (error) {
        console.error('Error creating table:', error);
      }
    }
  }

  // User operations
  static async saveUser(user: User): Promise<void> {
    await this.ensureDb();
    try {
      const query = `
        INSERT OR REPLACE INTO users 
        (id, email, name, subscription_type, subscription_expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      await this.db.runAsync(query, [
        user.id,
        user.email,
        user.name,
        user.subscriptionType,
        user.subscriptionExpiresAt?.toISOString() || null,
        user.createdAt.toISOString(),
        user.updatedAt.toISOString(),
      ]);
    } catch (error) {
      console.error('Error saving user:', error);
      throw error;
    }
  }

  static async getUser(id: string): Promise<User | null> {
    await this.ensureDb();
    try {
      const query = 'SELECT * FROM users WHERE id = ?';
      const result = await this.db.getFirstAsync(query, [id]) as any;
      
      if (!result) return null;

      return {
        id: result.id,
        email: result.email,
        name: result.name,
        subscriptionType: result.subscription_type,
        subscriptionExpiresAt: result.subscription_expires_at ? new Date(result.subscription_expires_at) : undefined,
        points: result.points || 0,
        rank: result.rank || 'Rookie',
        xp: result.xp || 0,
        level: result.level || 1,
        stats: result.stats ? JSON.parse(result.stats) : { reports: 0, confirmations: 0, distanceDriven: 0 },
        createdAt: new Date(result.created_at),
        updatedAt: new Date(result.updated_at),
      };
    } catch (error) {
      console.error('Error getting user:', error);
      throw error;
    }
  }

  // Radar location operations
  static async saveRadarLocation(location: RadarLocation, isSynced: boolean = false): Promise<void> {
    await this.ensureDb();
    try {
      const query = `
        INSERT OR REPLACE INTO radar_locations 
        (id, latitude, longitude, type, direction, speed_limit, confidence, last_confirmed, reported_by, created_at, updated_at, is_synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      await this.db.runAsync(query, [
        location.id,
        location.latitude,
        location.longitude,
        location.type,
        location.direction || null,
        location.speedLimit || null,
        location.confidence,
        location.lastConfirmed.toISOString(),
        location.reportedBy,
        location.createdAt.toISOString(),
        location.updatedAt.toISOString(),
        isSynced ? 1 : 0,
      ]);
    } catch (error) {
      console.error('Error saving radar location:', error);
      throw error;
    }
  }

  static async getRadarLocations(): Promise<RadarLocation[]> {
    await this.ensureDb();
    try {
      const query = 'SELECT * FROM radar_locations ORDER BY created_at DESC';
      const result = await this.db.getAllAsync(query) as any[];
      
      return result.map(row => ({
        id: row.id,
        latitude: row.latitude,
        longitude: row.longitude,
        type: row.type,
        direction: row.direction,
        speedLimit: row.speed_limit,
        confidence: row.confidence,
        lastConfirmed: new Date(row.last_confirmed),
        reportedBy: row.reported_by,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      console.error('Error getting radar locations:', error);
      throw error;
    }
  }

  static async getUnsyncedRadarLocations(): Promise<RadarLocation[]> {
    await this.ensureDb();
    try {
      const query = 'SELECT * FROM radar_locations WHERE is_synced = 0';
      const result = await this.db.getAllAsync(query) as any[];
      
      return result.map(row => ({
        id: row.id,
        latitude: row.latitude,
        longitude: row.longitude,
        type: row.type,
        direction: row.direction,
        speedLimit: row.speed_limit,
        confidence: row.confidence,
        lastConfirmed: new Date(row.last_confirmed),
        reportedBy: row.reported_by,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      console.error('Error getting unsynced radar locations:', error);
      throw error;
    }
  }

  static async markRadarLocationAsSynced(id: string): Promise<void> {
    await this.ensureDb();
    try {
      const query = 'UPDATE radar_locations SET is_synced = 1 WHERE id = ?';
      await this.db.runAsync(query, [id]);
    } catch (error) {
      console.error('Error marking radar location as synced:', error);
      throw error;
    }
  }

  // Alert operations
  static async saveAlert(alert: RadarAlert): Promise<void> {
    await this.ensureDb();
    try {
      const query = `
        INSERT INTO radar_alerts 
        (id, radar_id, user_id, distance, estimated_time, severity, acknowledged, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      await this.db.runAsync(query, [
        alert.id,
        alert.radarId,
        alert.userId,
        alert.distance,
        alert.estimatedTime,
        alert.severity,
        alert.acknowledged ? 1 : 0,
        alert.createdAt.toISOString(),
      ]);
    } catch (error) {
      console.error('Error saving alert:', error);
      throw error;
    }
  }

  static async getAlerts(userId: string): Promise<RadarAlert[]> {
    await this.ensureDb();
    try {
      const query = 'SELECT * FROM radar_alerts WHERE user_id = ? ORDER BY created_at DESC';
      const result = await this.db.getAllAsync(query, [userId]) as any[];
      
      return result.map(row => ({
        id: row.id,
        radarId: row.radar_id,
        userId: row.user_id,
        distance: row.distance,
        estimatedTime: row.estimated_time,
        severity: row.severity,
        acknowledged: row.acknowledged === 1,
        createdAt: new Date(row.created_at),
      }));
    } catch (error) {
      console.error('Error getting alerts:', error);
      throw error;
    }
  }

  static async acknowledgeAlert(id: string): Promise<void> {
    await this.ensureDb();
    try {
      const query = 'UPDATE radar_alerts SET acknowledged = 1 WHERE id = ?';
      await this.db.runAsync(query, [id]);
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      throw error;
    }
  }

  // Cache operations
  static async saveCache(key: string, data: any, type: string, expiresAt?: Date): Promise<void> {
    await this.ensureDb();
    try {
      const query = `
        INSERT OR REPLACE INTO offline_cache 
        (id, data, type, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      await this.db.runAsync(query, [
        key,
        JSON.stringify(data),
        type,
        new Date().toISOString(),
        expiresAt?.toISOString() || null,
      ]);
    } catch (error) {
      console.error('Error saving cache:', error);
      throw error;
    }
  }

  static async getCache(key: string): Promise<any | null> {
    await this.ensureDb();
    try {
      const query = 'SELECT * FROM offline_cache WHERE id = ? AND (expires_at IS NULL OR expires_at > datetime("now"))';
      const result = await this.db.getFirstAsync(query, [key]) as any;
      
      if (!result) return null;

      return JSON.parse(result.data);
    } catch (error) {
      console.error('Error getting cache:', error);
      throw error;
    }
  }

  static async clearExpiredCache(): Promise<void> {
    await this.ensureDb();
    try {
      const query = 'DELETE FROM offline_cache WHERE expires_at IS NOT NULL AND expires_at < datetime("now")';
      await this.db.runAsync(query);
    } catch (error) {
      console.error('Error clearing expired cache:', error);
      throw error;
    }
  }

  // Settings operations
  static async saveSetting(key: string, value: string): Promise<void> {
    await this.ensureDb();
    try {
      const query = `
        INSERT OR REPLACE INTO app_settings 
        (key, value, updated_at)
        VALUES (?, ?, ?)
      `;
      
      await this.db.runAsync(query, [
        key,
        value,
        new Date().toISOString(),
      ]);
    } catch (error) {
      console.error('Error saving setting:', error);
      throw error;
    }
  }

  static async getSetting(key: string): Promise<string | null> {
    await this.ensureDb();
    try {
      const query = 'SELECT value FROM app_settings WHERE key = ?';
      const result = await this.db.getFirstAsync(query, [key]) as any;
      
      return result ? result.value : null;
    } catch (error) {
      console.error('Error getting setting:', error);
      throw error;
    }
  }

  // Cleanup operations
  static async clearOldData(): Promise<void> {
    await this.ensureDb();
    try {
      // Clear alerts older than 30 days
      const alertsQuery = 'DELETE FROM radar_alerts WHERE created_at < datetime("now", "-30 days")';
      await this.db.runAsync(alertsQuery);

      // Clear expired cache
      await this.clearExpiredCache();
    } catch (error) {
      console.error('Error clearing old data:', error);
      throw error;
    }
  }
}
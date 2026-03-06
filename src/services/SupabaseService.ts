import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';

import { isSupabaseConfigured, isSupabaseEnvMissingError, supabase } from '../../utils/supabase';

type TripPayload = {
  userId: string;
  startLocation?: string | null;
  endLocation?: string | null;
  distance: number;
  duration: number;
  score?: number;
  startTime?: string | null;
  endTime?: string | null;
};

type QueuedTripPayload = TripPayload & {
  queuedAt: string;
  retryCount: number;
};

export class SupabaseService {
  private static TRIP_QUEUE_KEY = 'pending_trip_queue_v1';
  private static isTripQueueProcessing = false;
  private static lastNearbyRadarsErrorAt = 0;
  private static NEARBY_RADAR_ERROR_THROTTLE_MS = 60000;
  private static missingEnvWarned = false;
  private static unsupportedProfileColumns = new Set<string>();
  private static warnedUnsupportedProfileColumns = new Set<string>();

  private static ensureSupabaseAvailable(context: string): boolean {
    if (isSupabaseConfigured) return true;
    if (!this.missingEnvWarned) {
      this.missingEnvWarned = true;
      console.warn(`[SupabaseService] ${context} skipped: Supabase env is not configured.`);
    }
    return false;
  }

  private static shouldLogError(error: unknown): boolean {
    return !isSupabaseEnvMissingError(error);
  }

  private static extractMissingProfileColumn(error: any): string | null {
    if (!error) return null;
    const code = String(error.code ?? '');
    const message = String(error.message ?? '');
    const details = String(error.details ?? '');
    const combined = `${message} ${details}`;

    if (code === 'PGRST204') {
      const match = combined.match(/Could not find the '([^']+)' column/i);
      if (match?.[1]) return match[1];
      const profileScopedMatch = combined.match(/'([^']+)'\s+column of 'profiles'/i);
      if (profileScopedMatch?.[1]) return profileScopedMatch[1];
      return match?.[1] || null;
    }

    if (code === '42703') {
      const prefixedMatch = combined.match(/profiles\.([a-zA-Z0-9_]+)/i);
      if (prefixedMatch?.[1]) return prefixedMatch[1];
      const genericMatch = combined.match(
        /column\s+["']?(?:public\.)?(?:profiles\.)?([a-zA-Z0-9_]+)["']?\s+does not exist/i
      );
      return genericMatch?.[1] || null;
    }

    return null;
  }

  private static markUnsupportedProfileColumn(column: string): void {
    if (!column) return;
    this.unsupportedProfileColumns.add(column);
    if (this.warnedUnsupportedProfileColumns.has(column)) return;
    this.warnedUnsupportedProfileColumns.add(column);
    console.warn(
      `[SupabaseService] profiles.${column} missing in DB schema, using compatibility fallback.`
    );
  }

  private static sanitizeProfilePayload(payload: Record<string, any>): Record<string, any> {
    const next = { ...(payload || {}) };
    for (const unsupportedColumn of this.unsupportedProfileColumns) {
      if (unsupportedColumn in next) {
        delete next[unsupportedColumn];
      }
    }
    return next;
  }

  private static buildSubscriptionSnapshotSelect(): string {
    const fields = ['subscription_type'];
    if (!this.unsupportedProfileColumns.has('ads_removed')) fields.push('ads_removed');
    if (!this.unsupportedProfileColumns.has('subscription_expires_at')) {
      fields.push('subscription_expires_at');
    }
    if (!this.unsupportedProfileColumns.has('rc_customer_id')) fields.push('rc_customer_id');
    if (!this.unsupportedProfileColumns.has('account_link_required_until')) {
      fields.push('account_link_required_until');
    }
    return fields.join(', ');
  }

  private static isUsernameConstraintError(error: any): boolean {
    if (!error || String(error.code ?? '') !== '23505') return false;
    const combined = `${String(error.message ?? '')} ${String(error.details ?? '')}`.toLowerCase();
    return combined.includes('profiles_username_key') || combined.includes('username');
  }

  private static isNearbyRadarsLegacySignatureError(error: any): boolean {
    if (!error || error.code !== 'PGRST202') return false;
    const message = String(error.message ?? '');
    const details = String(error.details ?? '');
    const combined = `${message} ${details}`.toLowerCase();
    return (
      combined.includes('get_nearby_radars') &&
      (combined.includes('min_confidence') || combined.includes('verified_only'))
    );
  }

  private static isNearbyRadarsV2Missing(error: any): boolean {
    if (!error || error.code !== 'PGRST202') return false;
    const message = String(error.message ?? '');
    const details = String(error.details ?? '');
    const combined = `${message} ${details}`.toLowerCase();
    return combined.includes('get_nearby_radars_v2');
  }

  private static normalizeTrip(row: any) {
    return {
      id: row?.id,
      userId: row?.user_id,
      startLocation: row?.start_location ?? null,
      endLocation: row?.end_location ?? null,
      distance: row?.distance != null ? Number(row.distance) : 0,
      duration: row?.duration != null ? Number(row.duration) : 0,
      score: row?.score != null ? Number(row.score) : 0,
      startTime: row?.start_time ?? null,
      endTime: row?.end_time ?? null,
      createdAt: row?.created_at ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  }

  private static toTripInsert(payload: TripPayload) {
    return {
      user_id: payload.userId,
      start_location: payload.startLocation,
      end_location: payload.endLocation,
      distance: payload.distance,
      duration: payload.duration,
      score: payload.score ?? 0,
      start_time: payload.startTime,
      end_time: payload.endTime,
    };
  }

  private static async insertTrip(payload: TripPayload) {
    const { data, error } = await supabase
      .from('trips')
      .insert([this.toTripInsert(payload)])
      .select('*')
      .single();

    if (error) throw error;
    return data ? this.normalizeTrip(data) : null;
  }

  private static async readTripQueue(): Promise<QueuedTripPayload[]> {
    try {
      const raw = await AsyncStorage.getItem(this.TRIP_QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (error) {
      console.warn('Supabase read trip queue error:', error);
      return [];
    }
  }

  private static async writeTripQueue(queue: QueuedTripPayload[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.TRIP_QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.warn('Supabase write trip queue error:', error);
    }
  }

  private static async enqueueTrip(payload: TripPayload): Promise<void> {
    const queue = await this.readTripQueue();
    queue.push({
      ...payload,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
    });
    await this.writeTripQueue(queue);
  }

  private static async flushQueuedTrips(): Promise<void> {
    if (this.isTripQueueProcessing) return;
    this.isTripQueueProcessing = true;
    try {
      const queue = await this.readTripQueue();
      if (queue.length === 0) return;

      const remaining: QueuedTripPayload[] = [];
      for (const item of queue) {
        try {
          await this.insertTrip(item);
        } catch (error) {
          remaining.push({
            ...item,
            retryCount: (item.retryCount || 0) + 1,
          });
        }
      }

      await this.writeTripQueue(remaining);
      if (remaining.length > 0) {
        console.warn('Supabase trip queue pending:', remaining.length);
      }
    } finally {
      this.isTripQueueProcessing = false;
    }
  }

  /**
   * Fetches radars within a given radius using PostGIS
   * @param latitude User's latitude
   * @param longitude User's longitude
   * @param radiusMeters Search radius in meters
   */
  static async getNearbyRadars(
    latitude: number,
    longitude: number,
    radiusMeters: number,
    options?: { minConfidence?: number; verifiedOnly?: boolean }
  ) {
    if (!this.ensureSupabaseAvailable('getNearbyRadars')) return [];
    try {
      const baseArgs = {
        lat: latitude,
        long: longitude,
        radius_meters: radiusMeters,
      };
      const requestedMinConfidence = options?.minConfidence ?? 0;
      const requestedVerifiedOnly = options?.verifiedOnly ?? false;
      const extendedArgs = {
        ...baseArgs,
        min_confidence: requestedMinConfidence,
        verified_only: requestedVerifiedOnly,
      };

      const callNearbyLegacyRpc = async (args: Record<string, any>) => {
        let { data, error } = await supabase.rpc('get_nearby_radars', args);
        if (error && this.isNearbyRadarsLegacySignatureError(error)) {
          const legacyResult = await supabase.rpc('get_nearby_radars', baseArgs);
          data = legacyResult.data;
          error = legacyResult.error;
        }
        return { data, error };
      };

      let usedV2 = true;
      let { data, error } = await supabase.rpc('get_nearby_radars_v2', extendedArgs);

      if (error && this.isNearbyRadarsV2Missing(error)) {
        usedV2 = false;
        const legacyResult = await callNearbyLegacyRpc(extendedArgs);
        data = legacyResult.data;
        error = legacyResult.error;
      }

      if (
        !error &&
        Array.isArray(data) &&
        data.length === 0 &&
        (requestedVerifiedOnly || requestedMinConfidence > 0)
      ) {
        const relaxedArgs = {
          ...baseArgs,
          min_confidence: 0,
          verified_only: false,
        };
        const relaxedResult = usedV2
          ? await supabase.rpc('get_nearby_radars_v2', relaxedArgs)
          : await callNearbyLegacyRpc(relaxedArgs);
        if (!relaxedResult.error && Array.isArray(relaxedResult.data) && relaxedResult.data.length > 0) {
          data = relaxedResult.data;
        }
      }

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      if (!this.shouldLogError(error)) return [];
      const now = Date.now();
      if (now - this.lastNearbyRadarsErrorAt > this.NEARBY_RADAR_ERROR_THROTTLE_MS) {
        this.lastNearbyRadarsErrorAt = now;
        console.error('Supabase getNearbyRadars error:', error);
      } else {
        console.warn('Supabase getNearbyRadars degraded; using fallback sources.');
      }
      return [];
    }
  }

  /**
   * Reports a new radar location and stores a report for points.
   * Returns { radarId, reportId } when successful.
   */
  static async reportRadar(radarData: any) {
    if (!this.ensureSupabaseAvailable('reportRadar')) return null;
    try {
      const { data: radarRow, error: radarError } = await supabase
        .from('radars')
        .insert([
          {
            type: radarData.type,
            location: `POINT(${radarData.longitude} ${radarData.latitude})`, // PostGIS format
            confidence: radarData.confidence,
            reported_by: radarData.reportedBy,
          },
        ])
        .select('id')
        .single();

      if (radarError) throw radarError;

      const { data: reportRow, error: reportError } = await supabase
        .from('radar_reports')
        .insert([
          {
            radar_id: radarRow?.id || null,
            reporter_id: radarData.reportedBy,
            type: radarData.type,
            location: `POINT(${radarData.longitude} ${radarData.latitude})`,
          },
        ])
        .select('id')
        .single();

      if (reportError) throw reportError;
      return { radarId: radarRow?.id ?? null, reportId: reportRow?.id ?? null };
    } catch (error) {
      if (this.shouldLogError(error)) {
        console.error('Supabase reportRadar error:', error);
      }
      return null;
    }
  }

  /**
   * Fetches user profile
   */
  static async getProfile(userId: string) {
    if (!this.ensureSupabaseAvailable('getProfile')) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle(); // Use maybeSingle instead of single to handle 0 rows without error

      if (error) throw error;
      return data;
    } catch (error: any) {
      if (isSupabaseEnvMissingError(error)) return null;
      // PGRST116 is "The result contains 0 rows" when using .single()
      // We are now using .maybeSingle() so this shouldn't happen, but good to keep safe.
      if (error.code !== 'PGRST116') {
         console.error('Supabase getProfile error:', error);
      }
      return null;
    }
  }

  static async getSubscriptionSnapshot(userId: string): Promise<{
    subscriptionType: 'free' | 'premium' | 'pro';
    adsRemoved: boolean;
    subscriptionExpiresAt?: string | null;
    rcCustomerId?: string | null;
    accountLinkRequiredUntil?: string | null;
  } | null> {
    if (!this.ensureSupabaseAvailable('getSubscriptionSnapshot')) return null;
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data, error } = await supabase
          .from('profiles')
          .select(this.buildSubscriptionSnapshotSelect())
          .eq('id', userId)
          .maybeSingle();

        if (!error) {
          if (!data) return null;
          const rawType = data.subscription_type;
          const subscriptionType: 'free' | 'premium' | 'pro' =
            rawType === 'premium' || rawType === 'pro' ? rawType : 'free';
          return {
            subscriptionType,
            adsRemoved: Boolean((data as any).ads_removed),
            subscriptionExpiresAt:
              typeof (data as any).subscription_expires_at === 'string'
                ? (data as any).subscription_expires_at
                : null,
            rcCustomerId: typeof (data as any).rc_customer_id === 'string' ? (data as any).rc_customer_id : null,
            accountLinkRequiredUntil:
              typeof (data as any).account_link_required_until === 'string'
                ? (data as any).account_link_required_until
                : null,
          };
        }

        const missingColumn = this.extractMissingProfileColumn(error);
        if (missingColumn) {
          this.markUnsupportedProfileColumn(missingColumn);
          continue;
        }
        throw error;
      }
      return null;
    } catch (error) {
      if (this.shouldLogError(error)) {
        console.error('Supabase getSubscriptionSnapshot error:', error);
      }
      return null;
    }
  }

  static async upsertSubscriptionSnapshot(
    userId: string,
    snapshot: {
      subscriptionType: 'free' | 'premium' | 'pro';
      adsRemoved: boolean;
      subscriptionExpiresAt?: string | null;
      rcCustomerId?: string | null;
      accountLinkRequiredUntil?: string | null;
    }
  ) {
    return this.upsertProfile(userId, {
      id: userId,
      subscription_type: snapshot.subscriptionType,
      ads_removed: snapshot.adsRemoved,
      subscription_expires_at: snapshot.subscriptionExpiresAt ?? null,
      rc_customer_id: snapshot.rcCustomerId ?? null,
      account_link_required_until: snapshot.accountLinkRequiredUntil ?? null,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Fetches top users for leaderboard
   */
  static async getLeaderboard(limit: number = 20) {
    if (!this.ensureSupabaseAvailable('getLeaderboard')) return [];
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_leaderboard', {
        limit_count: limit,
      });

      if (!rpcError && rpcData) {
        return rpcData;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, username, points, rank, avatar_url')
        .order('points', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    } catch (error) {
      if (this.shouldLogError(error)) {
        console.error('Supabase getLeaderboard error:', error);
      }
      return [];
    }
  }

  static async confirmNearbyReport(params: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    type?: string | null;
  }) {
    if (!this.ensureSupabaseAvailable('confirmNearbyReport')) return null;
    try {
      const { data, error } = await supabase.rpc('confirm_nearby_report', {
        p_lat: params.latitude,
        p_long: params.longitude,
        p_radius_meters: params.radiusMeters,
        p_type: params.type ?? null,
      });

      if (error) throw error;
      return data ?? null;
    } catch (error) {
      if (this.shouldLogError(error)) {
        console.error('Supabase confirmNearbyReport error:', error);
      }
      return null;
    }
  }

  static async updateProfile(userId: string, updates: any) {
    if (!this.ensureSupabaseAvailable('updateProfile')) {
      return { id: userId, ...updates, _localOnly: true };
    }
    try {
      let candidate = this.sanitizeProfilePayload(updates || {});
      if (Object.keys(candidate).length === 0) {
        return await this.getProfile(userId);
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data, error } = await supabase
          .from('profiles')
          .update(candidate)
          .eq('id', userId)
          .select()
          .single();

        if (!error) return data;

        const missingColumn = this.extractMissingProfileColumn(error);
        if (missingColumn) {
          this.markUnsupportedProfileColumn(missingColumn);
          candidate = this.sanitizeProfilePayload(candidate);
          if (Object.keys(candidate).length === 0) {
            return await this.getProfile(userId);
          }
          continue;
        }
        throw error;
      }
      return null;
    } catch (error) {
      if (this.isUsernameConstraintError(error)) {
        console.warn('Supabase updateProfile: username already taken.');
        return null;
      }
      if (this.shouldLogError(error)) {
        console.error('Supabase updateProfile error:', error);
      }
      return null;
    }
  }

  static async isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean | null> {
    if (!this.ensureSupabaseAvailable('isUsernameAvailable')) return null;
    const clean = String(username || '').trim();
    if (!clean) return false;

    try {
      let query = supabase.from('profiles').select('id').eq('username', clean).limit(1);
      if (excludeUserId) {
        query = query.neq('id', excludeUserId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return !data || data.length === 0;
    } catch (error) {
      if (this.shouldLogError(error)) {
        console.warn('Supabase isUsernameAvailable check failed:', error);
      }
      return null;
    }
  }

  static async getEmailForUsername(username: string): Promise<string | null> {
    if (!this.ensureSupabaseAvailable('getEmailForUsername')) return null;
    try {
      const { data, error } = await supabase.rpc('get_email_for_username', {
        p_username: username,
      });

      if (error) throw error;
      return data ?? null;
    } catch (error) {
      if (this.shouldLogError(error)) {
        console.error('Supabase getEmailForUsername error:', error);
      }
      return null;
    }
  }

  static async upsertProfile(userId: string, updates: any) {
    if (!this.ensureSupabaseAvailable('upsertProfile')) {
      return { id: userId, ...updates, _localOnly: true };
    }
    try {
      let candidate = this.sanitizeProfilePayload({ id: userId, ...(updates || {}) });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data, error } = await supabase
          .from('profiles')
          .upsert(candidate, { onConflict: 'id' })
          .select()
          .single();

        if (!error) return data;

        const missingColumn = this.extractMissingProfileColumn(error);
        if (missingColumn) {
          this.markUnsupportedProfileColumn(missingColumn);
          candidate = this.sanitizeProfilePayload(candidate);
          continue;
        }
        throw error;
      }
      return null;
    } catch (error) {
      if (this.shouldLogError(error)) {
        console.error('Supabase upsertProfile error:', error);
      }
      return null;
    }
  }

  static async createTrip(params: TripPayload) {
    if (!this.ensureSupabaseAvailable('createTrip')) return null;
    try {
      await this.flushQueuedTrips();
      return await this.insertTrip(params);
    } catch (error) {
      if (this.shouldLogError(error)) {
        console.error('Supabase createTrip error:', error);
      }
      await this.enqueueTrip(params);
      return null;
    }
  }

  static async getPendingTripQueueCount(): Promise<number> {
    const queue = await this.readTripQueue();
    return queue.length;
  }

  /**
   * Fetches user's trip history from Supabase
   */
  static async getUserTrips(userId?: string) {
    if (!this.ensureSupabaseAvailable('getUserTrips')) return [];
    try {
      await this.flushQueuedTrips();
      let query = supabase
        .from('trips')
        .select('*')
        .order('created_at', { ascending: false });
      if (userId) {
        query = query.eq('user_id', userId);
      }
      const { data, error } = await query;

      if (error) throw error;
      return (data || []).map((row: any) => this.normalizeTrip(row));
    } catch (error) {
      if (this.shouldLogError(error)) {
        console.error('Supabase getUserTrips error:', error);
      }
      return [];
    }
  }
}

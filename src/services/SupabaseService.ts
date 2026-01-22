import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';

import { supabase } from '../../utils/supabase';

export class SupabaseService {
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
  /**
   * Fetches radars within a given radius using PostGIS
   * @param latitude User's latitude
   * @param longitude User's longitude
   * @param radiusMeters Search radius in meters
   */
  static async getNearbyRadars(latitude: number, longitude: number, radiusMeters: number) {
    try {
      // Call a Postgres function (RPC) that uses PostGIS st_dwithin
      const { data, error } = await supabase.rpc('get_nearby_radars', {
        lat: latitude,
        long: longitude,
        radius_meters: radiusMeters,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Supabase getNearbyRadars error:', error);
      return [];
    }
  }

  /**
   * Reports a new radar location and stores a report for points.
   * Returns { radarId, reportId } when successful.
   */
  static async reportRadar(radarData: any) {
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
      console.error('Supabase reportRadar error:', error);
      return null;
    }
  }

  /**
   * Fetches user profile
   */
  static async getProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle(); // Use maybeSingle instead of single to handle 0 rows without error

      if (error) throw error;
      return data;
    } catch (error: any) {
      // PGRST116 is "The result contains 0 rows" when using .single()
      // We are now using .maybeSingle() so this shouldn't happen, but good to keep safe.
      if (error.code !== 'PGRST116') {
         console.error('Supabase getProfile error:', error);
      }
      return null;
    }
  }

  /**
   * Fetches top users for leaderboard
   */
  static async getLeaderboard(limit: number = 20) {
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
      console.error('Supabase getLeaderboard error:', error);
      return [];
    }
  }

  static async confirmNearbyReport(params: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    type?: string | null;
  }) {
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
      console.error('Supabase confirmNearbyReport error:', error);
      return null;
    }
  }

  static async updateProfile(userId: string, updates: any) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Supabase updateProfile error:', error);
      return null;
    }
  }

  static async getEmailForUsername(username: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc('get_email_for_username', {
        p_username: username,
      });

      if (error) throw error;
      return data ?? null;
    } catch (error) {
      console.error('Supabase getEmailForUsername error:', error);
      return null;
    }
  }

  static async upsertProfile(userId: string, updates: any) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .upsert({ id: userId, ...updates }, { onConflict: 'id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Supabase upsertProfile error:', error);
      return null;
    }
  }

  static async createTrip(params: {
    userId: string;
    startLocation?: string | null;
    endLocation?: string | null;
    distance: number;
    duration: number;
    score?: number;
    startTime?: string | null;
    endTime?: string | null;
  }) {
    try {
      const { data, error } = await supabase
        .from('trips')
        .insert([
          {
            user_id: params.userId,
            start_location: params.startLocation,
            end_location: params.endLocation,
            distance: params.distance,
            duration: params.duration,
            score: params.score ?? 0,
            start_time: params.startTime,
            end_time: params.endTime,
          },
        ])
        .select('*')
        .single();

      if (error) throw error;
      return data ? this.normalizeTrip(data) : null;
    } catch (error) {
      console.error('Supabase createTrip error:', error);
      return null;
    }
  }

  /**
   * Fetches user's trip history from Supabase
   */
  static async getUserTrips(userId?: string) {
    try {
      let query = supabase
        .from('trips')
        .select('*')
        .order('created_at', { ascending: false });
      if (userId) {
        query = query.eq('user_id', userId);
      }
      const { data, error } = await query;

      if (error) throw error;
      return (data || []).map((row) => this.normalizeTrip(row));
    } catch (error) {
      console.error('Supabase getUserTrips error:', error);
      return [];
    }
  }
}

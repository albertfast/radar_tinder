import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';

import { supabase } from '../../utils/supabase';

export class SupabaseService {
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
   * Reports a new radar location
   */
  static async reportRadar(radarData: any) {
    try {
      const { data, error } = await supabase
        .from('radars')
        .insert([
          {
            type: radarData.type,
            location: `POINT(${radarData.longitude} ${radarData.latitude})`, // PostGIS format
            confidence: radarData.confidence,
            reported_by: radarData.reportedBy,
          },
        ])
        .select();

      if (error) throw error;
      return data;
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
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, points, avatar_url')
        .order('points', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Supabase getLeaderboard error:', error);
      return [];
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
}

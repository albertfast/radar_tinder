import { User } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Rank = 'Rookie' | 'Scout' | 'Ranger' | 'Commander' | 'Legend';

export const RANKS: { name: Rank; minPoints: number }[] = [
  { name: 'Rookie', minPoints: 0 },
  { name: 'Scout', minPoints: 500 },
  { name: 'Ranger', minPoints: 2000 },
  { name: 'Commander', minPoints: 5000 },
  { name: 'Legend', minPoints: 10000 },
];

export class GamificationService {
  private static STORAGE_KEY = 'user_gamification_stats';

  static getRank(points: number): Rank {
    for (let i = RANKS.length - 1; i >= 0; i--) {
      if (points >= RANKS[i].minPoints) {
        return RANKS[i].name;
      }
    }
    return 'Rookie';
  }

  static getLevel(xp: number): number {
    return Math.floor(Math.sqrt(xp / 100)) + 1;
  }

  static getNextLevelXp(level: number): number {
    return Math.pow(level, 2) * 100;
  }

  static async addPoints(currentPoints: number, currentXp: number, amount: number): Promise<{ points: number; xp: number; levelUp: boolean; newRank?: Rank }> {
    const newPoints = currentPoints + amount;
    const newXp = currentXp + amount;
    
    const oldLevel = this.getLevel(currentXp);
    const newLevel = this.getLevel(newXp);
    const levelUp = newLevel > oldLevel;

    const oldRank = this.getRank(currentPoints);
    const newRank = this.getRank(newPoints);
    const rankChanged = newRank !== oldRank;

    // Sync with Supabase
    // We assume the user ID is passed or available via a store, but for a static service method 
    // we might need to change the signature or rely on the caller to update the DB.
    // Ideally, this method should just calculate the new state, and the caller (e.g. RadarScreen)
    // calls SupabaseService.updateProfile.
    
    // However, to keep it encapsulated, let's assume we pass userId
    // For now, we return the calculated values and let the caller handle the DB update 
    // to avoid circular dependencies or auth store access here.
    
    return {
      points: newPoints,
      xp: newXp,
      levelUp,
      newRank: rankChanged ? newRank : undefined
    };
  }

  static async getLeaderboard(): Promise<{ id: string; name: string; points: number; rank: Rank; avatar?: string }[]> {
    const { SupabaseService } = require('./SupabaseService'); // Late import to avoid cycles if any
    
    // Fetch real data
    const profiles = await SupabaseService.getLeaderboard(10);
    
    if (!profiles || profiles.length === 0) {
      return [];
    }

    return profiles.map((p: any) => ({
      id: p.id,
      name: p.display_name || p.username || 'Anonymous',
      points: p.points || 0,
      rank: (p.rank as Rank) || this.getRank(p.points || 0),
      avatar: p.avatar_url,
    }));
  }
}

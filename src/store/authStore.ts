import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User } from '../types';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../../utils/supabase';
import { SupabaseService } from '../services/SupabaseService';
import { useSettingsStore } from './settingsStore';

// Custom storage for React Native using Expo SecureStore
const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch (e) {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (e) {}
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (e) {}
  },
};

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (identifier: string, password: string) => Promise<{ data: any; error: any }>;
  signUp: (
    email: string,
    password: string,
    profile?: { username?: string; displayName?: string; avatarUrl?: string }
  ) => Promise<{ data: any; error: any }>;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      signIn: async (identifier: string, password: string) => {
        set({ isLoading: true });
        try {
          let resolvedEmail = identifier;
          if (!identifier.includes('@')) {
            const emailLookup = await SupabaseService.getEmailForUsername(identifier);
            if (!emailLookup) {
              set({ isLoading: false });
              return { data: null, error: new Error('Username not found.') };
            }
            resolvedEmail = emailLookup;
          }

          const { data, error } = await supabase.auth.signInWithPassword({
            email: resolvedEmail,
            password,
          });

          if (error) {
            set({ isLoading: false });
            return { data: null, error };
          }

          if (data.user) {
            // Fetch profile
            const profile = await SupabaseService.getProfile(data.user.id);
            
            // Map Supabase User + Profile to our App User type
            const displayName =
              profile?.display_name || profile?.username || data.user.email!.split('@')[0];
            const appUser: User = {
              id: data.user.id,
              email: data.user.email!,
              username: profile?.username,
              displayName: profile?.display_name,
              name: displayName,
              subscriptionType: profile?.subscription_type || 'free',
              avatarUrl: profile?.avatar_url,
              profileImage: profile?.avatar_url,
              points: profile?.points || 0,
              rank: profile?.rank || 'Rookie',
              xp: profile?.xp || 0,
              level: profile?.level || 1,
              stats: profile?.stats || { reports: 0, confirmations: 0, distanceDriven: 0 },
              createdAt: new Date(data.user.created_at),
              updatedAt: new Date(),
            };

            const unitSystem = profile?.unit_system;
            if (unitSystem === 'metric' || unitSystem === 'imperial') {
              useSettingsStore.getState().setUnitSystem(unitSystem);
            }

            set({ user: appUser, isAuthenticated: true, isLoading: false });
          }

          return { data, error: null };
        } catch (error) {
          set({ isLoading: false });
          return { data: null, error };
        }
      },

      signUp: async (
        email: string,
        password: string,
        profile?: { username?: string; displayName?: string; avatarUrl?: string }
      ) => {
        set({ isLoading: true });
        try {
          const meta = {
            username: profile?.username,
            display_name: profile?.displayName || profile?.username,
            avatar_url: profile?.avatarUrl,
          };
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: meta,
            },
          });

          if (error) {
            set({ isLoading: false });
            return { data: null, error };
          }
          
          if (data.user) {
            await SupabaseService.upsertProfile(data.user.id, {
              email,
              username: profile?.username,
              display_name: profile?.displayName || profile?.username,
              avatar_url: profile?.avatarUrl,
              stats: { reports: 0, confirmations: 0, distanceDriven: 0 },
              points: 0,
              xp: 0,
              level: 1,
              rank: 'Rookie',
            });
          }

          set({ isLoading: false });
          return { data, error: null };
        } catch (error) {
          set({ isLoading: false });
          return { data: null, error };
        }
      },

      refreshProfile: async () => {
        const currentUser = get().user;
        if (!currentUser) return;

        try {
          const profile = await SupabaseService.getProfile(currentUser.id);
          if (!profile) return;

          set({
            user: {
              ...currentUser,
              username: profile.username ?? currentUser.username,
              displayName: profile.display_name ?? currentUser.displayName,
              name:
                profile.display_name ||
                profile.username ||
                currentUser.name ||
                currentUser.email.split('@')[0],
              avatarUrl: profile.avatar_url ?? currentUser.avatarUrl,
              profileImage: profile.avatar_url ?? currentUser.profileImage,
              points: profile.points ?? currentUser.points,
              rank: profile.rank ?? currentUser.rank,
              xp: profile.xp ?? currentUser.xp,
              level: profile.level ?? currentUser.level,
              stats: profile.stats ?? currentUser.stats,
              updatedAt: new Date(),
            },
          });
        } catch (error) {
          console.error('Failed to refresh profile:', error);
        }
      },

      logout: async () => {
        await supabase.auth.signOut();
        set({ user: null, isAuthenticated: false });
      },

      updateUser: (userData: Partial<User>) => {
        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, ...userData } });
        }
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => secureStorage),
    }
  )
);

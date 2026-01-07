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
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>;
  signUp: (email: string, password: string) => Promise<{ data: any; error: any }>;
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

      signIn: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
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
            const appUser: User = {
              id: data.user.id,
              email: data.user.email!,
              name: profile?.full_name || profile?.name || data.user.email!.split('@')[0],
              subscriptionType: profile?.subscription_type || 'free',
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

      signUp: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
          });

          if (error) {
            set({ isLoading: false });
            return { data: null, error };
          }
          
          // Note: Profile creation usually happens via Postgres Trigger on public.users insert
          // But if we need manual creation, we would do it here.
          // For now, we assume trigger or just ignore profile until login.

          set({ isLoading: false });
          return { data, error: null };
        } catch (error) {
          set({ isLoading: false });
          return { data: null, error };
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

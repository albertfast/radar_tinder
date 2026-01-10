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

let inflightAnonymousSignIn: Promise<{ data: any; error: any }> | null = null;

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (identifier: string, password: string) => Promise<{ data: any; error: any }>;
  signInAnonymously: () => Promise<{ data: any; error: any }>;
  signUp: (
    email: string,
    password: string,
    profile?: { username?: string; displayName?: string; avatarUrl?: string }
  ) => Promise<{ data: any; error: any }>;
  signInWithProvider: (params: {
    provider: 'apple' | 'google';
    idToken: string;
    nonce?: string;
    profile?: { email?: string | null; displayName?: string | null; avatarUrl?: string | null };
  }) => Promise<{ data: any; error: any }>;
  hydrateFromSupabaseSession: () => Promise<boolean>;
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

      signInAnonymously: async () => {
        if (inflightAnonymousSignIn) return inflightAnonymousSignIn;

        inflightAnonymousSignIn = (async () => {
          set({ isLoading: true });

          // Supabase anonymous auth (creates a temporary user + session)
          // Requires "Anonymous sign-ins" enabled in Supabase Auth settings.
          const signInFn = (supabase.auth as any).signInAnonymously;
          if (typeof signInFn !== 'function') {
            throw new Error(
              'Supabase anonymous sign-in is not available (missing auth.signInAnonymously).'
            );
          }
          const { data, error } = await signInFn.call(supabase.auth);

          if (error) {
            const message = String((error as any)?.message || '');
            if (message.includes('Anonymous sign-ins are disabled') || message.includes('anonymous') && message.includes('disabled')) {
              set({ isLoading: false });
              return {
                data: null,
                error: new Error(
                  'Supabase anonymous sign-ins are disabled. Enable it in Supabase Dashboard → Authentication → Providers → Anonymous.'
                ),
              };
            }
            if (message.includes('No API key found in request') || message.toLowerCase().includes('apikey')) {
              set({ isLoading: false });
              return {
                data: null,
                error: new Error(
                  'Supabase rejected the request (missing apikey). Check EXPO_PUBLIC_SUPABASE_KEY is set (anon key) and restart Metro.'
                ),
              };
            }
            set({ isLoading: false });
            return { data: null, error };
          }

          const supabaseUser = data?.user;
          if (!supabaseUser) {
            set({ isLoading: false });
            return { data: null, error: new Error('Anonymous sign-in failed: missing user') };
          }

          let profile = await SupabaseService.getProfile(supabaseUser.id);
          if (!profile) {
            const displayName = 'Driver';
            await SupabaseService.upsertProfile(supabaseUser.id, {
              email: supabaseUser.email,
              display_name: displayName,
              stats: { reports: 0, confirmations: 0, distanceDriven: 0 },
              points: 0,
              xp: 0,
              level: 1,
              rank: 'Rookie',
            });
            profile = await SupabaseService.getProfile(supabaseUser.id);
          }

          const displayName =
            profile?.display_name ||
            profile?.username ||
            supabaseUser.email?.split('@')[0] ||
            'Driver';

          const appUser: User = {
            id: supabaseUser.id,
            email: supabaseUser.email || '',
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
            createdAt: new Date(supabaseUser.created_at),
            updatedAt: new Date(),
          };

          const unitSystem = profile?.unit_system;
          if (unitSystem === 'metric' || unitSystem === 'imperial') {
            useSettingsStore.getState().setUnitSystem(unitSystem);
          }

          set({ user: appUser, isAuthenticated: true, isLoading: false });
          return { data, error: null };
        })();

        try {
          return await inflightAnonymousSignIn;
        } catch (error) {
          set({ isLoading: false });
          return { data: null, error };
        } finally {
          inflightAnonymousSignIn = null;
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

      signInWithProvider: async (params) => {
        set({ isLoading: true });
        try {
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: params.provider,
            token: params.idToken,
            nonce: params.nonce,
          });

          if (error) {
            set({ isLoading: false });
            return { data: null, error };
          }

          if (data.user) {
            let profile = await SupabaseService.getProfile(data.user.id);
            if (!profile) {
              const displayName =
                params.profile?.displayName ||
                params.profile?.email?.split('@')[0] ||
                data.user.email?.split('@')[0] ||
                'Driver';

              await SupabaseService.upsertProfile(data.user.id, {
                email: params.profile?.email || data.user.email,
                display_name: displayName,
                avatar_url: params.profile?.avatarUrl,
                stats: { reports: 0, confirmations: 0, distanceDriven: 0 },
                points: 0,
                xp: 0,
                level: 1,
                rank: 'Rookie',
              });
              profile = await SupabaseService.getProfile(data.user.id);
            }

            const displayName =
              profile?.display_name || profile?.username || data.user.email?.split('@')[0] || 'Driver';
            const appUser: User = {
              id: data.user.id,
              email: data.user.email || params.profile?.email || '',
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

      hydrateFromSupabaseSession: async () => {
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error || !data.session?.user) return false;

          const profile = await SupabaseService.getProfile(data.session.user.id);
          if (!profile) return false;

          const displayName =
            profile?.display_name ||
            profile?.username ||
            data.session.user.email?.split('@')[0] ||
            'Driver';
          const appUser: User = {
            id: data.session.user.id,
            email: data.session.user.email || '',
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
            createdAt: new Date(data.session.user.created_at),
            updatedAt: new Date(),
          };

          const unitSystem = profile?.unit_system;
          if (unitSystem === 'metric' || unitSystem === 'imperial') {
            useSettingsStore.getState().setUnitSystem(unitSystem);
          }

          set({ user: appUser, isAuthenticated: true });
          return true;
        } catch (error) {
          return false;
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
        const { FirebaseAuthService } = require('../services/FirebaseAuthService');
        await FirebaseAuthService.signOut();
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

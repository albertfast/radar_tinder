import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AccessBootstrapState, EntitlementSnapshot, User } from '../types';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../../utils/supabase';
import { SupabaseService } from '../services/SupabaseService';
import { useSettingsStore } from './settingsStore';

// Custom storage for React Native using Expo SecureStore
const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch {}
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch {}
  },
};

let inflightAnonymousSignIn: Promise<{ data: any; error: any }> | null = null;
const GUEST_USER_ID_KEY = 'rt_guest_user_id_v1';

const buildGuestUser = (guestId: string): User => ({
  id: guestId,
  email: 'guest@radartinder.local',
  name: 'Guest Driver',
  displayName: 'Guest Driver',
  subscriptionType: 'free',
  adsRemoved: false,
  points: 0,
  xp: 0,
  level: 1,
  rank: 'Rookie',
  stats: { reports: 0, confirmations: 0, distanceDriven: 0 },
  createdAt: new Date(),
  updatedAt: new Date(),
});

const normalizeSubscriptionType = (value: unknown): User['subscriptionType'] => {
  if (value === 'free' || value === 'premium' || value === 'pro') {
    return value;
  }
  return 'free';
};

const normalizeAdsRemoved = (profile: any): boolean => {
  if (typeof profile?.ads_removed === 'boolean') return profile.ads_removed;
  if (typeof profile?.adsRemoved === 'boolean') return profile.adsRemoved;
  return false;
};

const normalizeOptionalDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const normalizePersistedUser = (value: unknown): User | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, any>;
  if (!raw.id || !raw.email) return null;

  return {
    ...raw,
    subscriptionType: normalizeSubscriptionType(raw.subscriptionType),
    subscriptionExpiresAt: normalizeOptionalDate(raw.subscriptionExpiresAt),
    accountLinkRequiredUntil: normalizeOptionalDate(raw.accountLinkRequiredUntil),
    createdAt: normalizeOptionalDate(raw.createdAt) || new Date(),
    updatedAt: normalizeOptionalDate(raw.updatedAt) || new Date(),
    adsRemoved: Boolean(raw.adsRemoved),
    stats: raw.stats || { reports: 0, confirmations: 0, distanceDriven: 0 },
    points: Number(raw.points) || 0,
    xp: Number(raw.xp) || 0,
    level: Number(raw.level) || 1,
    rank: raw.rank || 'Rookie',
  } as User;
};

const normalizeEntitlementSnapshot = (value: unknown): EntitlementSnapshot | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, any>;
  if (!raw.userId) return null;
  return {
    userId: String(raw.userId),
    subscriptionType: normalizeSubscriptionType(raw.subscriptionType),
    adsRemoved: Boolean(raw.adsRemoved),
    subscriptionExpiresAt: normalizeOptionalDate(raw.subscriptionExpiresAt),
    accountLinkRequiredUntil: normalizeOptionalDate(raw.accountLinkRequiredUntil),
    rcCustomerId: typeof raw.rcCustomerId === 'string' ? raw.rcCustomerId : undefined,
    syncedAt: normalizeOptionalDate(raw.syncedAt),
  };
};

const toEntitlementSnapshot = (
  user: Pick<
    User,
    'id' | 'subscriptionType' | 'adsRemoved' | 'subscriptionExpiresAt' | 'accountLinkRequiredUntil' | 'rcCustomerId'
  >,
  syncedAt: Date = new Date()
): EntitlementSnapshot => ({
  userId: user.id,
  subscriptionType: normalizeSubscriptionType(user.subscriptionType),
  adsRemoved: Boolean(user.adsRemoved),
  subscriptionExpiresAt: user.subscriptionExpiresAt,
  accountLinkRequiredUntil: user.accountLinkRequiredUntil,
  rcCustomerId: user.rcCustomerId,
  syncedAt,
});

const shouldPersistAdminSession =
  __DEV__ && /^(1|true|yes)$/i.test(process.env.EXPO_PUBLIC_ADMIN_DEBUG_PERSIST || '');
const allowAdminSession = __DEV__;

const resolveAccessSnapshot = (
  currentUser: User,
  profile: any,
  isAdminSession: boolean,
  lastKnownEntitlement?: EntitlementSnapshot | null
): {
  subscriptionType: User['subscriptionType'];
  adsRemoved: boolean;
  subscriptionExpiresAt?: Date;
  accountLinkRequiredUntil?: Date;
  rcCustomerId?: string;
} => {
  const profileSubscriptionType = normalizeSubscriptionType(profile?.subscription_type);
  const profileAdsRemoved = normalizeAdsRemoved(profile);
  const profileSubscriptionExpiresAt = normalizeOptionalDate(profile?.subscription_expires_at);
  const profileAccountLinkRequiredUntil = normalizeOptionalDate(profile?.account_link_required_until);
  const profileRcCustomerId =
    typeof profile?.rc_customer_id === 'string' ? profile.rc_customer_id : undefined;

  const matchedSnapshot =
    lastKnownEntitlement && lastKnownEntitlement.userId === currentUser.id
      ? lastKnownEntitlement
      : null;

  const localEntitlement = matchedSnapshot || {
    userId: currentUser.id,
    subscriptionType: currentUser.subscriptionType,
    adsRemoved: Boolean(currentUser.adsRemoved),
    subscriptionExpiresAt: currentUser.subscriptionExpiresAt,
    accountLinkRequiredUntil: currentUser.accountLinkRequiredUntil,
    rcCustomerId: currentUser.rcCustomerId,
    syncedAt: undefined,
  };

  const localPaidState =
    localEntitlement.subscriptionType !== 'free' || Boolean(localEntitlement.adsRemoved);
  const profilePaidState = profileSubscriptionType !== 'free' || profileAdsRemoved;
  const shouldPreferLocalRcState =
    !isAdminSession &&
    localPaidState &&
    !profilePaidState &&
    Boolean(localEntitlement.rcCustomerId || profileRcCustomerId);

  if (isAdminSession) {
    return {
      subscriptionType: 'pro',
      adsRemoved: true,
      subscriptionExpiresAt:
        profileSubscriptionExpiresAt ?? localEntitlement.subscriptionExpiresAt ?? undefined,
      accountLinkRequiredUntil:
        profileAccountLinkRequiredUntil ?? localEntitlement.accountLinkRequiredUntil ?? undefined,
      rcCustomerId: profileRcCustomerId ?? localEntitlement.rcCustomerId ?? undefined,
    };
  }

  return {
    subscriptionType: shouldPreferLocalRcState
      ? localEntitlement.subscriptionType
      : profileSubscriptionType,
    adsRemoved: shouldPreferLocalRcState
      ? Boolean(localEntitlement.adsRemoved)
      : profileAdsRemoved,
    subscriptionExpiresAt: shouldPreferLocalRcState
      ? localEntitlement.subscriptionExpiresAt ?? profileSubscriptionExpiresAt ?? undefined
      : profileSubscriptionExpiresAt ?? localEntitlement.subscriptionExpiresAt ?? undefined,
    accountLinkRequiredUntil: shouldPreferLocalRcState
      ? localEntitlement.accountLinkRequiredUntil ?? profileAccountLinkRequiredUntil ?? undefined
      : profileAccountLinkRequiredUntil ?? localEntitlement.accountLinkRequiredUntil ?? undefined,
    rcCustomerId: profileRcCustomerId ?? localEntitlement.rcCustomerId ?? undefined,
  };
};

const buildAppUserFromProfile = ({
  authUser,
  profile,
  currentUser,
  lastKnownEntitlement,
}: {
  authUser: { id: string; email?: string | null; created_at?: string | null };
  profile: any;
  currentUser?: User | null;
  lastKnownEntitlement?: EntitlementSnapshot | null;
}): User => {
  const previousUser = currentUser?.id === authUser.id ? currentUser : null;
  const fallbackName =
    authUser.email?.split('@')[0] || previousUser?.displayName || previousUser?.name || 'Driver';
  const displayName = profile?.display_name || profile?.username || fallbackName;
  const isAdminSession = allowAdminSession && Boolean(previousUser?.isAdminSession);

  const baseUser: User = {
    id: authUser.id,
    email: authUser.email || previousUser?.email || '',
    username: profile?.username ?? previousUser?.username,
    displayName: profile?.display_name ?? previousUser?.displayName,
    name: displayName,
    subscriptionType: normalizeSubscriptionType(profile?.subscription_type),
    subscriptionExpiresAt: normalizeOptionalDate(profile?.subscription_expires_at),
    accountLinkRequiredUntil: normalizeOptionalDate(profile?.account_link_required_until),
    rcCustomerId:
      typeof profile?.rc_customer_id === 'string'
        ? profile.rc_customer_id
        : previousUser?.rcCustomerId,
    avatarUrl: profile?.avatar_url ?? previousUser?.avatarUrl,
    profileImage: profile?.avatar_url ?? previousUser?.profileImage,
    carImage: profile?.car_image_url ?? previousUser?.carImage,
    carDetails: previousUser?.carDetails,
    points: profile?.points ?? previousUser?.points ?? 0,
    rank: profile?.rank ?? previousUser?.rank ?? 'Rookie',
    xp: profile?.xp ?? previousUser?.xp ?? 0,
    level: profile?.level ?? previousUser?.level ?? 1,
    stats: profile?.stats ?? previousUser?.stats ?? { reports: 0, confirmations: 0, distanceDriven: 0 },
    adsRemoved: normalizeAdsRemoved(profile),
    createdAt: normalizeOptionalDate(authUser.created_at) || previousUser?.createdAt || new Date(),
    updatedAt: new Date(),
    isAdminSession: isAdminSession ? true : undefined,
  };

  const resolvedAccess = resolveAccessSnapshot(
    baseUser,
    profile,
    isAdminSession,
    lastKnownEntitlement
  );

  return {
    ...baseUser,
    subscriptionType: resolvedAccess.subscriptionType,
    subscriptionExpiresAt: resolvedAccess.subscriptionExpiresAt,
    accountLinkRequiredUntil: resolvedAccess.accountLinkRequiredUntil,
    rcCustomerId: resolvedAccess.rcCustomerId,
    adsRemoved: resolvedAccess.adsRemoved,
  };
};

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;
  accessBootstrapState: AccessBootstrapState;
  lastKnownEntitlement: EntitlementSnapshot | null;
  lastEntitlementSyncAt?: Date;
  signIn: (identifier: string, password: string) => Promise<{ data: any; error: any }>;
  signInAnonymously: () => Promise<{ data: any; error: any }>;
  signInAsGuest: () => Promise<{ data: any; error: any }>;
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
  normalizeAccessState: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => void;
  applyEntitlementSnapshot: (snapshot: EntitlementSnapshot) => void;
  restoreLastKnownEntitlement: () => boolean;
  setLoading: (loading: boolean) => void;
  setHasHydrated: (hydrated: boolean) => void;
  setAccessBootstrapState: (state: AccessBootstrapState) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      hasHydrated: false,
      accessBootstrapState: 'idle',
      lastKnownEntitlement: null,
      lastEntitlementSyncAt: undefined,

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
            const profile = await SupabaseService.getProfile(data.user.id);
            const appUser = buildAppUserFromProfile({
              authUser: data.user,
              profile,
              currentUser: get().user,
              lastKnownEntitlement: get().lastKnownEntitlement,
            });

            const unitSystem = profile?.unit_system;
            if (unitSystem === 'metric' || unitSystem === 'imperial') {
              useSettingsStore.getState().setUnitSystem(unitSystem);
            }

            set({
              user: appUser,
              isAuthenticated: true,
              isLoading: false,
              lastKnownEntitlement: toEntitlementSnapshot(appUser),
              lastEntitlementSyncAt: new Date(),
            });
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

          const signInFn = (supabase.auth as any).signInAnonymously;
          if (typeof signInFn !== 'function') {
            throw new Error(
              'Supabase anonymous sign-in is not available (missing auth.signInAnonymously).'
            );
          }
          const { data, error } = await signInFn.call(supabase.auth);

          if (error) {
            const message = String((error as any)?.message || '');
            if (
              message.includes('Anonymous sign-ins are disabled') ||
              (message.includes('anonymous') && message.includes('disabled'))
            ) {
              set({ isLoading: false });
              return {
                data: null,
                error: new Error(
                  'Supabase anonymous sign-ins are disabled. Enable it in Supabase Dashboard → Authentication → Providers → Anonymous.'
                ),
              };
            }
            if (
              message.includes('No API key found in request') ||
              message.toLowerCase().includes('apikey')
            ) {
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
              unit_system: useSettingsStore.getState().unitSystem,
              stats: { reports: 0, confirmations: 0, distanceDriven: 0 },
              points: 0,
              xp: 0,
              level: 1,
              rank: 'Rookie',
            });
            profile = await SupabaseService.getProfile(supabaseUser.id);
          }

          const appUser = buildAppUserFromProfile({
            authUser: supabaseUser,
            profile,
            currentUser: get().user,
            lastKnownEntitlement: get().lastKnownEntitlement,
          });

          const unitSystem = profile?.unit_system;
          if (unitSystem === 'metric' || unitSystem === 'imperial') {
            useSettingsStore.getState().setUnitSystem(unitSystem);
          }

          set({
            user: appUser,
            isAuthenticated: true,
            isLoading: false,
            lastKnownEntitlement: toEntitlementSnapshot(appUser),
            lastEntitlementSyncAt: new Date(),
          });
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

      signInAsGuest: async () => {
        set({ isLoading: true });
        try {
          let guestId = await secureStorage.getItem(GUEST_USER_ID_KEY);
          if (!guestId) {
            guestId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            await secureStorage.setItem(GUEST_USER_ID_KEY, guestId);
          }

          const appUser = buildGuestUser(guestId);
          set({
            user: appUser,
            isAuthenticated: true,
            isLoading: false,
            lastKnownEntitlement: toEntitlementSnapshot(appUser),
            lastEntitlementSyncAt: new Date(),
          });
          return { data: { user: appUser }, error: null };
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
              unit_system: useSettingsStore.getState().unitSystem,
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
                unit_system: useSettingsStore.getState().unitSystem,
                stats: { reports: 0, confirmations: 0, distanceDriven: 0 },
                points: 0,
                xp: 0,
                level: 1,
                rank: 'Rookie',
              });
              profile = await SupabaseService.getProfile(data.user.id);
            }

            const appUser = buildAppUserFromProfile({
              authUser: {
                id: data.user.id,
                email: data.user.email || params.profile?.email || '',
                created_at: data.user.created_at,
              },
              profile,
              currentUser: get().user,
              lastKnownEntitlement: get().lastKnownEntitlement,
            });

            const unitSystem = profile?.unit_system;
            if (unitSystem === 'metric' || unitSystem === 'imperial') {
              useSettingsStore.getState().setUnitSystem(unitSystem);
            }

            set({
              user: appUser,
              isAuthenticated: true,
              isLoading: false,
              lastKnownEntitlement: toEntitlementSnapshot(appUser),
              lastEntitlementSyncAt: new Date(),
            });
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

          const appUser = buildAppUserFromProfile({
            authUser: data.session.user,
            profile,
            currentUser: get().user,
            lastKnownEntitlement: get().lastKnownEntitlement,
          });

          const unitSystem = profile?.unit_system;
          if (unitSystem === 'metric' || unitSystem === 'imperial') {
            useSettingsStore.getState().setUnitSystem(unitSystem);
          }

          set({ user: appUser, isAuthenticated: true });
          return true;
        } catch {
          return false;
        }
      },

      normalizeAccessState: async () => {
        try {
          let currentUser = get().user;
          if (!currentUser) {
            const hydrated = await get().hydrateFromSupabaseSession();
            if (!hydrated) return;
            currentUser = get().user;
          }
          if (!currentUser) return;
          if (currentUser.id.startsWith('guest-')) return;

          const profile = await SupabaseService.getProfile(currentUser.id);
          const normalizedUser = buildAppUserFromProfile({
            authUser: {
              id: currentUser.id,
              email: currentUser.email,
              created_at: currentUser.createdAt.toISOString(),
            },
            profile,
            currentUser,
            lastKnownEntitlement: get().lastKnownEntitlement,
          });

          const unitSystem = profile?.unit_system;
          if (unitSystem === 'metric' || unitSystem === 'imperial') {
            useSettingsStore.getState().setUnitSystem(unitSystem);
          }

          set({
            user: normalizedUser,
            isAuthenticated: true,
          });
        } catch (error) {
          console.error('Failed to normalize access state:', error);
        }
      },

      refreshProfile: async () => {
        const currentUser = get().user;
        if (!currentUser) return;
        if (currentUser.id.startsWith('guest-')) return;

        try {
          const profile = await SupabaseService.getProfile(currentUser.id);
          const refreshedUser = buildAppUserFromProfile({
            authUser: {
              id: currentUser.id,
              email: currentUser.email,
              created_at: currentUser.createdAt.toISOString(),
            },
            profile,
            currentUser,
            lastKnownEntitlement: get().lastKnownEntitlement,
          });

          const unitSystem = profile?.unit_system;
          if (unitSystem === 'metric' || unitSystem === 'imperial') {
            useSettingsStore.getState().setUnitSystem(unitSystem);
          }

          set({ user: refreshedUser });
        } catch (error) {
          console.error('Failed to refresh profile:', error);
        }
      },

      logout: async () => {
        const { FirebaseAuthService } = require('../services/FirebaseAuthService');
        const { SubscriptionService } = require('../services/SubscriptionService');
        await SubscriptionService.logOutRevenueCatUser().catch(() => {});
        await FirebaseAuthService.signOut();
        await supabase.auth.signOut();
        set({
          user: null,
          isAuthenticated: false,
          accessBootstrapState: 'idle',
          lastKnownEntitlement: null,
          lastEntitlementSyncAt: undefined,
        });
      },

      updateUser: (userData: Partial<User>) => {
        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, ...userData } });
        }
      },

      applyEntitlementSnapshot: (snapshot: EntitlementSnapshot) => {
        const normalizedSnapshot = normalizeEntitlementSnapshot(snapshot);
        if (!normalizedSnapshot) return;
        const currentUser = get().user;
        const syncTime = normalizedSnapshot.syncedAt || new Date();
        set((state) => ({
          user:
            currentUser && currentUser.id === normalizedSnapshot.userId
              ? {
                  ...currentUser,
                  subscriptionType: normalizedSnapshot.subscriptionType,
                  adsRemoved: normalizedSnapshot.adsRemoved,
                  subscriptionExpiresAt: normalizedSnapshot.subscriptionExpiresAt,
                  accountLinkRequiredUntil: normalizedSnapshot.accountLinkRequiredUntil,
                  rcCustomerId: normalizedSnapshot.rcCustomerId,
                  updatedAt: new Date(),
                }
              : state.user,
          lastKnownEntitlement: {
            ...normalizedSnapshot,
            syncedAt: syncTime,
          },
          lastEntitlementSyncAt: syncTime,
        }));
      },

      restoreLastKnownEntitlement: () => {
        const currentUser = get().user;
        const snapshot = get().lastKnownEntitlement;
        if (!currentUser || !snapshot || snapshot.userId !== currentUser.id) return false;

        set({
          user: {
            ...currentUser,
            subscriptionType: snapshot.subscriptionType,
            adsRemoved: snapshot.adsRemoved,
            subscriptionExpiresAt: snapshot.subscriptionExpiresAt,
            accountLinkRequiredUntil: snapshot.accountLinkRequiredUntil,
            rcCustomerId: snapshot.rcCustomerId,
            updatedAt: new Date(),
          },
          lastEntitlementSyncAt: snapshot.syncedAt || get().lastEntitlementSyncAt || new Date(),
        });
        return true;
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setHasHydrated: (hydrated: boolean) => {
        set({ hasHydrated: hydrated });
      },

      setAccessBootstrapState: (state: AccessBootstrapState) => {
        set({ accessBootstrapState: state });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => {
        const sanitizedUser = state.user
          ? (() => {
              if (shouldPersistAdminSession) {
                return state.user as User;
              }
              const { isAdminSession: _isAdminSession, ...restUser } = state.user as User;
              return restUser as User;
            })()
          : null;
        return {
          user: sanitizedUser,
          isAuthenticated: state.isAuthenticated,
          isLoading: state.isLoading,
          lastKnownEntitlement: state.lastKnownEntitlement,
          lastEntitlementSyncAt: state.lastEntitlementSyncAt,
        };
      },
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<AuthState>) || {};
        return {
          ...currentState,
          ...persisted,
          user: normalizePersistedUser(persisted.user),
          isAuthenticated:
            typeof persisted.isAuthenticated === 'boolean'
              ? persisted.isAuthenticated
              : currentState.isAuthenticated,
          isLoading:
            typeof persisted.isLoading === 'boolean' ? persisted.isLoading : currentState.isLoading,
          lastKnownEntitlement: normalizeEntitlementSnapshot(persisted.lastKnownEntitlement),
          lastEntitlementSyncAt: normalizeOptionalDate(persisted.lastEntitlementSyncAt),
          hasHydrated: false,
          accessBootstrapState: 'idle',
        };
      },
      onRehydrateStorage: () => (state, error) => {
        state?.setHasHydrated(true);
        if (error) {
          state?.setAccessBootstrapState('error');
        }
      },
    }
  )
);


import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, processLock } from '@supabase/supabase-js'

const FETCH_TIMEOUT_MS = 20000;

const lockWithoutTimeout = async (name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
  // In React Native we don't have multi-tab concurrency, and the acquire-timeout warnings are noisy.
  // Using an infinite process-level lock prevents "timed out" warnings while still serializing auth operations.
  return processLock(name, -1, fn);
};

const fetchWithTimeout: typeof fetch = async (input: any, init?: any) => {
  const AbortControllerImpl = (globalThis as any).AbortController;
  if (!AbortControllerImpl) {
    return fetch(input, init);
  }

  const controller = new AbortControllerImpl();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...(init || {}), signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const MISSING_ENV_MESSAGE =
  'Missing Supabase env: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY in build/runtime environment.';

const createMissingEnvError = () => new Error(MISSING_ENV_MESSAGE);

const createUnavailableSupabaseClient = () => {
  const fail = async () => ({ data: null, error: createMissingEnvError() });

  const channelRef: any = {
    on: () => channelRef,
    subscribe: () => channelRef,
  };

  const query: any = {
    select: () => query,
    insert: () => query,
    update: () => query,
    upsert: () => query,
    delete: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: fail,
    single: fail,
    then: (onFulfilled: any, onRejected: any) => fail().then(onFulfilled, onRejected),
    catch: (onRejected: any) => fail().catch(onRejected),
    finally: (onFinally: any) => fail().finally(onFinally),
  };

  return {
    auth: {
      signInWithPassword: fail,
      signInWithIdToken: fail,
      signUp: fail,
      signInAnonymously: fail,
      signOut: async () => ({ error: null }),
      getSession: async () => ({
        data: { session: null },
        error: createMissingEnvError(),
      }),
    },
    rpc: fail,
    from: () => query,
    channel: () => channelRef,
    removeChannel: () => {},
  } as any;
};

if (__DEV__) {
  console.log('Supabase env', {
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
  });
}

if (!isSupabaseConfigured) {
  console.error(MISSING_ENV_MESSAGE);
}

export const supabase = isSupabaseConfigured
  ? createClient(
      supabaseUrl!,
      supabaseAnonKey!,
      {
        global: {
          fetch: fetchWithTimeout,
        },
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: false,
          persistSession: true,
          detectSessionInUrl: false,
          lock: lockWithoutTimeout,
        },
      }
    )
  : createUnavailableSupabaseClient();

export { isSupabaseConfigured };

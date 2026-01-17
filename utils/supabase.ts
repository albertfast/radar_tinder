
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

if (__DEV__) {
  console.log('Supabase env', {
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
  });
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY (anon/public key) in .env and restart Metro.'
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
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
  });

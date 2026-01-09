
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, processLock } from '@supabase/supabase-js'

const lockWithTimeout = async (name: string, acquireTimeout: number, fn: () => Promise<any>) => {
  const effectiveTimeout = acquireTimeout < 0 ? acquireTimeout : Math.max(acquireTimeout, 20000);
  return processLock(name, effectiveTimeout, fn);
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: lockWithTimeout,
    },
  });

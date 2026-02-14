import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import { NativeModules } from 'react-native';

// Custom storage for React Native using Expo SecureStore
const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch (error) {
      console.warn('[settingsStore] SecureStore getItem failed:', name, error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (error) {
      console.warn('[settingsStore] SecureStore setItem failed:', name, error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (error) {
      console.warn('[settingsStore] SecureStore removeItem failed:', name, error);
    }
  },
};

interface SettingsState {
  hasHydrated: boolean;
  unitSystem: 'metric' | 'imperial'; // metric = km, imperial = miles
  voiceWarningsEnabled: boolean;
  hapticAlertsEnabled: boolean;
  keepAwakeWhileDriving: boolean;
  warningVolume: number;
  setHasHydrated: (hydrated: boolean) => void;
  toggleUnitSystem: () => void;
  setUnitSystem: (unitSystem: 'metric' | 'imperial') => void;
  setVoiceWarningsEnabled: (enabled: boolean) => void;
  setHapticAlertsEnabled: (enabled: boolean) => void;
  setKeepAwakeWhileDriving: (enabled: boolean) => void;
  setWarningVolume: (value: number) => void;
  resetToRegionalDefaults: () => void;
}

const getRegionFromLocale = (locale?: string | null): string | null => {
  if (!locale || typeof locale !== 'string') return null;
  const normalized = locale.replace(/_/g, '-');
  const tokens = normalized.split('-').filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
    if (/^[A-Za-z]{2}$/.test(token)) {
      return token.toUpperCase();
    }
  }
  return null;
};

const detectDeviceRegion = (): string | null => {
  try {
    const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = getRegionFromLocale(intlLocale);
    if (region) return region;
  } catch {}

  const settings = (NativeModules as any)?.SettingsManager?.settings;
  const iosLocale =
    settings?.AppleLocale ||
    (Array.isArray(settings?.AppleLanguages) ? settings.AppleLanguages[0] : null);
  const androidLocale = (NativeModules as any)?.I18nManager?.localeIdentifier;
  return getRegionFromLocale(iosLocale || androidLocale);
};

const defaultUnitSystem = (): 'metric' | 'imperial' => {
  const region = detectDeviceRegion();
  return region === 'US' ? 'imperial' : 'metric';
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      unitSystem: defaultUnitSystem(),
      voiceWarningsEnabled: true,
      hapticAlertsEnabled: true,
      keepAwakeWhileDriving: true,
      warningVolume: 90,
      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
      toggleUnitSystem: () => set((state) => ({ 
        unitSystem: state.unitSystem === 'metric' ? 'imperial' : 'metric' 
      })),
      setUnitSystem: (unitSystem) => set({ unitSystem }),
      setVoiceWarningsEnabled: (enabled) => set({ voiceWarningsEnabled: enabled }),
      setHapticAlertsEnabled: (enabled) => set({ hapticAlertsEnabled: enabled }),
      setKeepAwakeWhileDriving: (enabled) => set({ keepAwakeWhileDriving: enabled }),
      setWarningVolume: (value) =>
        set({ warningVolume: Math.max(0, Math.min(100, Math.round(value))) }),
      resetToRegionalDefaults: () =>
        set({
          unitSystem: defaultUnitSystem(),
          voiceWarningsEnabled: true,
          hapticAlertsEnabled: true,
          keepAwakeWhileDriving: true,
          warningVolume: 90,
        }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => secureStorage),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[settingsStore] Rehydrate failed:', error);
        }
        state?.setHasHydrated(true);
      },
    }
  )
);

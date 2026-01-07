import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

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

interface SettingsState {
  unitSystem: 'metric' | 'imperial'; // metric = km, imperial = miles
  toggleUnitSystem: () => void;
  setUnitSystem: (unitSystem: 'metric' | 'imperial') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      unitSystem: 'metric',
      toggleUnitSystem: () => set((state) => ({ 
        unitSystem: state.unitSystem === 'metric' ? 'imperial' : 'metric' 
      })),
      setUnitSystem: (unitSystem) => set({ unitSystem }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => secureStorage),
    }
  )
);

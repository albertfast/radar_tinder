import { create } from 'zustand';

interface UiState {
  tabBarHiddenReasons: Record<string, boolean>;
  isTabBarHidden: boolean;
  hideTabBar: (reason: string) => void;
  showTabBar: (reason: string) => void;
  clearTabBarReasons: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  tabBarHiddenReasons: {},
  isTabBarHidden: false,
  hideTabBar: (reason) =>
    set((state) => {
      const normalized = reason.trim();
      if (!normalized) return state;
      if (state.tabBarHiddenReasons[normalized]) return state;
      const nextReasons = { ...state.tabBarHiddenReasons, [normalized]: true };
      return {
        tabBarHiddenReasons: nextReasons,
        isTabBarHidden: Object.keys(nextReasons).length > 0,
      };
    }),
  showTabBar: (reason) =>
    set((state) => {
      const normalized = reason.trim();
      if (!normalized) return state;
      if (!state.tabBarHiddenReasons[normalized]) return state;
      const nextReasons = { ...state.tabBarHiddenReasons };
      delete nextReasons[normalized];
      return {
        tabBarHiddenReasons: nextReasons,
        isTabBarHidden: Object.keys(nextReasons).length > 0,
      };
    }),
  clearTabBarReasons: () =>
    set({
      tabBarHiddenReasons: {},
      isTabBarHidden: false,
    }),
}));

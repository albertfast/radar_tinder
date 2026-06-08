import { create } from 'zustand';
import { LatLng, RouteChoice, RouteData, SearchResult, UnitSystem, RouteStep } from '../types/map';

interface NavigationStore {
  // Location
  userLocation: LatLng | null;
  userSpeed: number; // m/s
  userHeading: number;
  accuracy: number;

  // Unit system
  unitSystem: UnitSystem;
  countryCode: string | null;

  // Search
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;

  // Route
  destination: LatLng | null;
  destinationName: string;
  route: RouteData | null;
  routeAlternatives: RouteChoice[];
  isRouting: boolean;

  // Navigation
  isNavigating: boolean;
  currentStepIndex: number;
  remainingStepDistance: number;
  remainingDistance: number;
  remainingDuration: number;
  eta: Date | null;
  distanceToRoute: number;
  routeHeading: number | null;
  isOffRoute: boolean;
  hasArrived: boolean;

  // Speed limits
  speedLimit: number | null; // km/h internal

  // Driving session (DriveScreen without active turn-by-turn route)
  isDrivingSession: boolean;

  // Actions
  setUserLocation: (loc: { lat: number; lng: number; accuracy: number; speed: number | null; heading: number | null }) => void;
  setUnitSystem: (system: UnitSystem, code: string | null) => void;
  setSearchQuery: (q: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setIsSearching: (v: boolean) => void;
  setDestination: (dest: LatLng | null, name?: string) => void;
  setRoute: (route: RouteData | null) => void;
  setRouteAlternatives: (routes: RouteChoice[]) => void;
  selectRouteAlternative: (routeId: string) => void;
  setIsRouting: (v: boolean) => void;
  startNavigation: () => void;
  stopNavigation: () => void;
  setCurrentStepIndex: (i: number) => void;
  setRemainingStepDistance: (d: number) => void;
  setRemainingDistance: (d: number) => void;
  setRemainingDuration: (d: number) => void;
  setEta: (d: Date | null) => void;
  setDistanceToRoute: (d: number) => void;
  setRouteHeading: (heading: number | null) => void;
  setIsOffRoute: (value: boolean) => void;
  setHasArrived: (value: boolean) => void;
  setSpeedLimit: (v: number | null) => void;
  setDrivingSession: (active: boolean) => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  userLocation: null,
  userSpeed: 0,
  userHeading: 0,
  accuracy: 0,
  unitSystem: 'metric',
  countryCode: null,
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  destination: null,
  destinationName: '',
  route: null,
  routeAlternatives: [],
  isRouting: false,
  isNavigating: false,
  currentStepIndex: 0,
  remainingStepDistance: 0,
  remainingDistance: 0,
  remainingDuration: 0,
  eta: null,
  distanceToRoute: 0,
  routeHeading: null,
  isOffRoute: false,
  hasArrived: false,
  speedLimit: null,
  isDrivingSession: false,

  setUserLocation: (loc) =>
    set({
      userLocation: { lat: loc.lat, lng: loc.lng },
      userSpeed: Math.max(0, loc.speed ?? 0),
      userHeading: loc.heading ?? 0,
      accuracy: loc.accuracy,
    }),

  setUnitSystem: (system, code) => set({ unitSystem: system, countryCode: code }),

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsSearching: (v) => set({ isSearching: v }),

  setDestination: (dest, name) =>
    set({ destination: dest, destinationName: name ?? '', route: null, routeAlternatives: [] }),

  setRoute: (route) => set({ route, hasArrived: false }),
  setRouteAlternatives: (routes) => set({ routeAlternatives: routes }),
  selectRouteAlternative: (routeId) =>
    set((state) => {
      const selected = state.routeAlternatives.find((route) => route.id === routeId);
      if (!selected) {
        return {};
      }

      return {
        route: selected,
        remainingDistance: selected.distance,
        remainingDuration: selected.duration,
        eta: new Date(Date.now() + selected.duration * 1000),
        currentStepIndex: 0,
        remainingStepDistance: 0,
        distanceToRoute: 0,
        routeHeading: null,
        isOffRoute: false,
        hasArrived: false,
      };
    }),
  setIsRouting: (v) => set({ isRouting: v }),

  startNavigation: () => set({ isNavigating: true, hasArrived: false }),
  stopNavigation: () =>
    set({
      isNavigating: false,
      route: null,
      destination: null,
      destinationName: '',
      currentStepIndex: 0,
      routeAlternatives: [],
      remainingStepDistance: 0,
      remainingDistance: 0,
      remainingDuration: 0,
      eta: null,
      distanceToRoute: 0,
      routeHeading: null,
      isOffRoute: false,
      hasArrived: false,
      speedLimit: null,
    }),

  setCurrentStepIndex: (i) => set({ currentStepIndex: i }),
  setRemainingStepDistance: (d) => set({ remainingStepDistance: d }),
  setRemainingDistance: (d) => set({ remainingDistance: d }),
  setRemainingDuration: (d) => set({ remainingDuration: d }),
  setEta: (d) => set({ eta: d }),
  setDistanceToRoute: (d) => set({ distanceToRoute: d }),
  setRouteHeading: (heading) => set({ routeHeading: heading }),
  setIsOffRoute: (value) => set({ isOffRoute: value }),
  setHasArrived: (value) => set({ hasArrived: value }),
  setSpeedLimit: (v) => set({ speedLimit: v }),
  setDrivingSession: (active) => set({ isDrivingSession: active }),
}));

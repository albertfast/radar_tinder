import { create } from 'zustand';
import { RadarLocation, RadarAlert } from '../types';

interface RadarState {
  radarLocations: RadarLocation[];
  activeAlerts: RadarAlert[];
  isDetecting: boolean;
  currentLocation: { 
    latitude: number; 
    longitude: number;
    heading?: number | null;
    speed?: number | null;
  } | null;
  
  // Actions
  setRadarLocations: (locations: RadarLocation[]) => void;
  addRadarLocation: (location: RadarLocation) => void;
  removeRadarLocation: (id: string) => void;
  setActiveAlerts: (alerts: RadarAlert[]) => void;
  addAlert: (alert: RadarAlert) => void;
  acknowledgeAlert: (id: string) => void;
  setDetecting: (detecting: boolean) => void;
  setCurrentLocation: (location: { 
    latitude: number; 
    longitude: number;
    heading?: number | null;
    speed?: number | null;
  }) => void;
  clearAlerts: () => void;
}

export const useRadarStore = create<RadarState>((set, get) => ({
  radarLocations: [],
  activeAlerts: [],
  isDetecting: false,
  currentLocation: null,

  setRadarLocations: (locations) => {
    set({ radarLocations: locations });
  },

  addRadarLocation: (location) => {
    set((state) => ({
      radarLocations: [...state.radarLocations, location],
    }));
  },

  removeRadarLocation: (id) => {
    set((state) => ({
      radarLocations: state.radarLocations.filter((loc) => loc.id !== id),
    }));
  },

  setActiveAlerts: (alerts) => {
    set({ activeAlerts: alerts });
  },

  addAlert: (alert) => {
    set((state) => ({
      activeAlerts: [...state.activeAlerts, alert],
    }));
  },

  acknowledgeAlert: (id) => {
    set((state) => ({
      activeAlerts: state.activeAlerts.map((alert) =>
        alert.id === id ? { ...alert, acknowledged: true } : alert
      ),
    }));
  },

  setDetecting: (detecting) => {
    set({ isDetecting: detecting });
  },

  setCurrentLocation: (location) => {
    set({ currentLocation: location });
  },

  clearAlerts: () => {
    set({ activeAlerts: [] });
  },
}));
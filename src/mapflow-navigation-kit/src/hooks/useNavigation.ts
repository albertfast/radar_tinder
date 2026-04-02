import { useCallback } from 'react';
import { useNavigationStore } from '../stores/navigationStore';

/**
 * High-level navigation state machine.
 * Provides clean methods to control navigation flow.
 */
export function useNavigation() {
  const {
    isNavigating, isRouting,
    route, destination, destinationName,
    startNavigation, stopNavigation,
    setDestination,
  } = useNavigationStore();

  /** Select a destination and calculate route */
  const navigateTo = useCallback(
    (lat: number, lng: number, name: string) => {
      setDestination({ lat, lng }, name);
    },
    [setDestination],
  );

  /** Begin active turn-by-turn navigation */
  const start = useCallback(() => {
    startNavigation();
  }, [startNavigation]);

  /** Stop everything — clear route, destination, nav state */
  const stop = useCallback(() => {
    stopNavigation();
  }, [stopNavigation]);

  /** Whether we're in any active navigation state */
  const isActive = isNavigating || isRouting;

  return {
    // State
    isActive,
    isNavigating,
    isRouting,
    route,
    destination,
    destinationName,
    // Actions
    navigateTo,
    start,
    stop,
  };
}

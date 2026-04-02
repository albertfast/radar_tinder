import { useCallback } from 'react';
import { getRoute } from '../services/api';
import { useNavigationStore } from '../stores/navigationStore';
import { RouteData } from '../types/map';

export function useRouting() {
  const {
    userLocation,
    destination,
    setRoute,
    setIsRouting,
    setRemainingDistance,
    setRemainingDuration,
    setEta,
    setCurrentStepIndex,
    setIsOffRoute,
    setHasArrived,
    setSpeedLimit,
  } = useNavigationStore();

  const calculateRoute = useCallback(async () => {
    if (!userLocation || !destination) return;

    setIsRouting(true);
    try {
      const data: RouteData = await getRoute(
        userLocation.lat,
        userLocation.lng,
        destination.lat,
        destination.lng,
      );

      setRoute(data);
      setRemainingDistance(data.distance);
      setRemainingDuration(data.duration);
      setEta(new Date(Date.now() + data.duration * 1000));
      setCurrentStepIndex(0);
      setIsOffRoute(false);
      setHasArrived(false);
    } catch (e) {
      console.error('Routing error:', e);
      setRoute(null);
      setCurrentStepIndex(0);
      setRemainingDistance(0);
      setRemainingDuration(0);
      setEta(null);
      setIsOffRoute(false);
      setHasArrived(false);
      setSpeedLimit(null);
    } finally {
      setIsRouting(false);
    }
  }, [userLocation, destination, setRoute, setIsRouting, setRemainingDistance, setRemainingDuration, setEta, setCurrentStepIndex, setIsOffRoute, setHasArrived, setSpeedLimit]);

  return { calculateRoute };
}

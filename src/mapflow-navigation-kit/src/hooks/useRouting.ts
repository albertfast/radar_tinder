import { useCallback } from 'react';
import { getRoutes } from '../services/api';
import { useNavigationStore } from '../stores/navigationStore';

export function useRouting() {
  const {
    userLocation,
    destination,
    setRoute,
    setRouteAlternatives,
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
      const routes = await getRoutes(
        userLocation.lat,
        userLocation.lng,
        destination.lat,
        destination.lng,
      );
      const data = routes[0];

      if (!data) {
        throw new Error('No route found');
      }

      setRoute(data);
      setRouteAlternatives(routes);
      setRemainingDistance(data.distance);
      setRemainingDuration(data.duration);
      setEta(new Date(Date.now() + data.duration * 1000));
      setCurrentStepIndex(0);
      setIsOffRoute(false);
      setHasArrived(false);
    } catch (e) {
      console.error('Routing error:', e);
      setRoute(null);
      setRouteAlternatives([]);
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
  }, [userLocation, destination, setRoute, setRouteAlternatives, setIsRouting, setRemainingDistance, setRemainingDuration, setEta, setCurrentStepIndex, setIsOffRoute, setHasArrived, setSpeedLimit]);

  return { calculateRoute };
}

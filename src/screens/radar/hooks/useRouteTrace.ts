import { useCallback } from 'react';

type RouteTraceStep = {
  instruction: string;
  distanceMeters: number | null;
  maneuver?: string;
};

type RouteTracePayload = {
  destination: string;
  points: number;
  steps: RouteTraceStep[];
};

const isTruthyFlag = (value?: string) => /^(1|true|yes)$/i.test(value || '');
const ROUTE_TRACE_ENABLED = isTruthyFlag(process.env.EXPO_PUBLIC_ROUTE_TRACE);

const formatTraceDistance = (distanceMeters: number | null) => {
  if (distanceMeters === null || distanceMeters === undefined) return 'n/a';
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
};

export function useRouteTrace() {
  const logRouteSteps = useCallback((payload: RouteTracePayload) => {
    if (!ROUTE_TRACE_ENABLED) return;
    console.log('[RadarScreen] Route step list start', {
      destination: payload.destination,
      points: payload.points,
      steps: payload.steps.length,
    });
    payload.steps.forEach((step, index) => {
      console.log(`[RadarScreen] Step ${index + 1}/${payload.steps.length}`, {
        distance: formatTraceDistance(step.distanceMeters),
        maneuver: step.maneuver || 'continue',
        instruction: step.instruction,
      });
    });
    console.log('[RadarScreen] Route step list end');
  }, []);

  return {
    routeTraceEnabled: ROUTE_TRACE_ENABLED,
    logRouteSteps,
  };
}

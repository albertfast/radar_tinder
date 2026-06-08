import { useMemo } from 'react';
import { RadarAlert } from '../types';
import { useRadarStore } from '../store/radarStore';

const isSpeedCameraAlert = (alert: RadarAlert) => {
  const type = String(alert.type || '').toLowerCase();
  const markerKind = String(alert.markerKind || '').toLowerCase();
  return (
    type === 'speed_camera' ||
    type === 'fixed' ||
    type === 'red_light' ||
    markerKind === 'camera' ||
    markerKind === 'red_light'
  );
};

export function useDrivingRadarAlertBanner(): RadarAlert | null {
  const activeAlerts = useRadarStore((state) => state.activeAlerts);

  return useMemo(() => {
    const candidates = activeAlerts
      .filter((alert) => !alert.acknowledged)
      .filter(isSpeedCameraAlert)
      .sort((a, b) => Number(a.distance || 0) - Number(b.distance || 0));
    return candidates[0] ?? null;
  }, [activeAlerts]);
}

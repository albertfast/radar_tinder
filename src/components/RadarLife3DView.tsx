import React, { useMemo } from 'react';
import { Platform, UIManager, ViewProps, requireNativeComponent } from 'react-native';
import { logWarn } from '../utils/logger';

export type RadarLifeThemeVariant = 'contour_orbit';

export interface RadarLife3DViewProps extends ViewProps {
  rotationSpeed?: number;
  pulseEnabled?: boolean;
  signalLevel?: number;
  dangerLevel?: number;
  themeVariant?: RadarLifeThemeVariant;
  paused?: boolean;
}

const NATIVE_VIEW_NAME = 'RTRadarLife3DView';

const RadarLife3DView = (props: RadarLife3DViewProps) => {
  const NativeRadarLife3DView = useMemo(() => {
    if (Platform.OS !== 'android') return null;
    const config = UIManager.getViewManagerConfig?.(NATIVE_VIEW_NAME);
    if (!config) return null;
    return requireNativeComponent<RadarLife3DViewProps>(NATIVE_VIEW_NAME);
  }, []);

  if (!NativeRadarLife3DView) {
    logWarn('RadarLife3DView is not available, falling back to legacy radar animation.');
    return null;
  }

  return <NativeRadarLife3DView {...props} />;
};

export default RadarLife3DView;

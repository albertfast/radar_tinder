import React, { useMemo } from 'react';
import { Platform, UIManager, ViewProps, requireNativeComponent } from 'react-native';
import { logWarn } from '../utils/logger';

export interface Radar3DViewProps extends ViewProps {
  rotationSpeed?: number;
  pulseEnabled?: boolean;
  onRadarClick?: (event: any) => void;
}

const NATIVE_VIEW_NAME = 'RTRadar3DView';

const Radar3DView = (props: Radar3DViewProps) => {
  const NativeRadar3DView = useMemo(() => {
    if (Platform.OS !== 'android') return null;
    const config = UIManager.getViewManagerConfig?.(NATIVE_VIEW_NAME);
    if (!config) return null;
    return requireNativeComponent<Radar3DViewProps>(NATIVE_VIEW_NAME);
  }, []);

  if (!NativeRadar3DView) {
    logWarn('Radar3DView is not available, falling back to 2D animation.');
    return null;
  }

  return <NativeRadar3DView {...props} />;
};

export default Radar3DView;

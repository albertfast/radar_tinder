import React, { useMemo } from 'react';
import { Platform, UIManager, ViewProps, requireNativeComponent } from 'react-native';
import { logWarn } from '../utils/logger';

const Radar3DView = (props: ViewProps) => {
  const NativeRadar3DView = useMemo(() => {
    if (Platform.OS !== 'android') return null;
    const config = UIManager.getViewManagerConfig?.('Radar3DView');
    if (!config) return null;
    return requireNativeComponent<ViewProps>('Radar3DView');
  }, []);

  if (!NativeRadar3DView) {
    logWarn('Radar3DView is not available, falling back to Lottie.');
    return null;
  }

  return <NativeRadar3DView {...props} />;
};

export default Radar3DView;

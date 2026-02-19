import React from 'react';
import { Platform, UIManager, ViewProps, requireNativeComponent } from 'react-native';
import { logWarn } from '../utils/logger';

export interface Radar3DViewProps extends ViewProps {
  rotationSpeed?: number;
  pulseEnabled?: boolean;
  onRadarClick?: (event: any) => void;
}

const NATIVE_VIEW_NAME = 'RTRadar3DGLView';
const NATIVE_COMPONENT_CACHE_KEY = '__RT_NATIVE_COMPONENT_RTRadar3DGLView__';
let nativeComponent: React.ComponentType<Radar3DViewProps> | null | undefined;
let unavailableLogged = false;

const getNativeComponent = () => {
  if (nativeComponent !== undefined) return nativeComponent;
  const globalCache = globalThis as unknown as Record<string, unknown>;
  const cachedGlobal =
    globalCache[NATIVE_COMPONENT_CACHE_KEY] as typeof nativeComponent;
  if (cachedGlobal !== undefined) {
    nativeComponent = cachedGlobal;
    return nativeComponent;
  }

  if (Platform.OS !== 'android') {
    nativeComponent = null;
    globalCache[NATIVE_COMPONENT_CACHE_KEY] = nativeComponent;
    return nativeComponent;
  }

  const config = UIManager.getViewManagerConfig?.(NATIVE_VIEW_NAME);
  if (!config) {
    nativeComponent = null;
    globalCache[NATIVE_COMPONENT_CACHE_KEY] = nativeComponent;
    return nativeComponent;
  }

  nativeComponent = requireNativeComponent<Radar3DViewProps>(NATIVE_VIEW_NAME);
  globalCache[NATIVE_COMPONENT_CACHE_KEY] = nativeComponent;
  return nativeComponent;
};

const Radar3DView = (props: Radar3DViewProps) => {
  const NativeRadar3DView = getNativeComponent();

  if (!NativeRadar3DView) {
    if (!unavailableLogged) {
      unavailableLogged = true;
      logWarn('Radar3DView is not available, falling back to 2D animation.');
    }
    return null;
  }

  return <NativeRadar3DView {...props} />;
};

export default Radar3DView;

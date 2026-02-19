import React from 'react';
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
const NATIVE_COMPONENT_CACHE_KEY = '__RT_NATIVE_COMPONENT_RTRadarLife3DView__';
let nativeComponent:
  | React.ComponentType<RadarLife3DViewProps>
  | null
  | undefined;
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

  nativeComponent = requireNativeComponent<RadarLife3DViewProps>(NATIVE_VIEW_NAME);
  globalCache[NATIVE_COMPONENT_CACHE_KEY] = nativeComponent;
  return nativeComponent;
};

const RadarLife3DView = (props: RadarLife3DViewProps) => {
  const NativeRadarLife3DView = getNativeComponent();

  if (!NativeRadarLife3DView) {
    if (!unavailableLogged) {
      unavailableLogged = true;
      logWarn('RadarLife3DView is not available, falling back to legacy radar animation.');
    }
    return null;
  }

  return <NativeRadarLife3DView {...props} />;
};

export default RadarLife3DView;

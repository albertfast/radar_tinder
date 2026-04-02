import React from 'react';
import { Platform, UIManager, ViewProps, requireNativeComponent } from 'react-native';

export interface GraphicRadarPanelViewProps extends ViewProps {
  signalLevel?: number;
  dangerLevel?: number;
  paused?: boolean;
}

const NATIVE_VIEW_NAME = 'RTGraphicRadarPanelView';

let nativeComponent: React.ComponentType<GraphicRadarPanelViewProps> | null | undefined;

const getNativeComponent = () => {
  if (nativeComponent !== undefined) {
    return nativeComponent;
  }

  if (Platform.OS !== 'android') {
    nativeComponent = null;
    return nativeComponent;
  }

  const config = UIManager.getViewManagerConfig?.(NATIVE_VIEW_NAME);
  if (!config) {
    nativeComponent = null;
    return nativeComponent;
  }

  nativeComponent = requireNativeComponent<GraphicRadarPanelViewProps>(NATIVE_VIEW_NAME);
  return nativeComponent;
};

const GraphicRadarPanelView = (props: GraphicRadarPanelViewProps) => {
  const NativeGraphicRadarPanelView = getNativeComponent();
  if (!NativeGraphicRadarPanelView) {
    return null;
  }

  return <NativeGraphicRadarPanelView {...props} />;
};

export default GraphicRadarPanelView;

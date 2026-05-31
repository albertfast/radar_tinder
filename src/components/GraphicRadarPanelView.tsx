import React from 'react';
import { Platform, StyleSheet, UIManager, View, ViewProps, requireNativeComponent } from 'react-native';
import { RadarAnimation } from './RadarAnimation';

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
    const { style, signalLevel = 0.55, dangerLevel = 0.15, paused } = props;
    return (
      <View style={[style, styles.fallback]} pointerEvents="none">
        <RadarAnimation
          size={230}
          rendererMode="life3d"
          signalLevel={signalLevel}
          dangerLevel={dangerLevel}
          paused={paused}
        />
      </View>
    );
  }

  return <NativeGraphicRadarPanelView {...props} />;
};

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default GraphicRadarPanelView;

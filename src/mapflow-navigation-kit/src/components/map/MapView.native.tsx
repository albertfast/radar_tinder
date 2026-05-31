import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import MAP_HTML from '../../utils/mapHtml';
import { resolveSpeedCameraMarkerUri } from '../../../../native/SpeedCameraMarker';

export { useMapBridge } from './map-bridge';

import type { MapViewport } from '../../types/viewport';

interface MapViewProps {
  onMapReady?: () => void;
  onMapClick?: (lat: number, lng: number) => void;
  onOverlayMarkerPress?: (markerId: string) => void;
  onViewportChange?: (viewport: MapViewport) => void;
  webViewRef?: React.RefObject<WebView | null>;
}

export default function MapView({
  onMapReady,
  onMapClick,
  onOverlayMarkerPress,
  onViewportChange,
  webViewRef,
}: MapViewProps) {
  const internalRef = useRef<WebView | null>(null);
  const resolvedRef = webViewRef ?? internalRef;
  const speedCameraIconUriRef = useRef('');

  useEffect(() => {
    let mounted = true;
    resolveSpeedCameraMarkerUri()
      .then((uri) => {
        if (!mounted || !uri) return;
        speedCameraIconUriRef.current = uri;
        const payload = JSON.stringify({ type: 'setSpeedCameraIcon', payload: { uri } });
        const js = `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(payload)} })); true;`;
        resolvedRef.current?.injectJavaScript(js);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'mapReady') {
          if (speedCameraIconUriRef.current) {
            const payload = JSON.stringify({
              type: 'setSpeedCameraIcon',
              payload: { uri: speedCameraIconUriRef.current },
            });
            const js = `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(payload)} })); true;`;
            resolvedRef.current?.injectJavaScript(js);
          }
          onMapReady?.();
        } else if (data.type === 'mapClick') {
          onMapClick?.(data.payload.lat, data.payload.lng);
        } else if (data.type === 'overlayMarkerPress' && data.payload?.id) {
          onOverlayMarkerPress?.(String(data.payload.id));
        } else if (data.type === 'viewportChange' && data.payload) {
          onViewportChange?.(data.payload as MapViewport);
        }
      } catch {
        // Ignore malformed map messages from the embedded page.
      }
    },
    [onMapClick, onMapReady, onOverlayMarkerPress, onViewportChange, resolvedRef],
  );

  return (
    <View style={styles.container}>
      <WebView
        ref={resolvedRef}
        originWhitelist={['*']}
        source={{ html: MAP_HTML, baseUrl: 'https://mapflow.local' }}
        style={styles.webview}
        onMessage={handleMessage}
        scrollEnabled={false}
        overScrollMode="never"
        bounces={false}
        javaScriptEnabled
        androidLayerType="hardware"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050c18',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

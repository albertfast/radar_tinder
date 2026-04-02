import React, { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import MAP_HTML from '../../utils/mapHtml';

export { useMapBridge } from './map-bridge';

interface MapViewProps {
  onMapReady?: () => void;
  onMapClick?: (lat: number, lng: number) => void;
  onOverlayMarkerPress?: (markerId: string) => void;
  webViewRef?: React.RefObject<WebView | null>;
}

export default function MapView({
  onMapReady,
  onMapClick,
  onOverlayMarkerPress,
  webViewRef,
}: MapViewProps) {
  const internalRef = useRef<WebView | null>(null);
  const resolvedRef = webViewRef ?? internalRef;

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'mapReady') {
          onMapReady?.();
        } else if (data.type === 'mapClick') {
          onMapClick?.(data.payload.lat, data.payload.lng);
        } else if (data.type === 'overlayMarkerPress' && data.payload?.id) {
          onOverlayMarkerPress?.(String(data.payload.id));
        }
      } catch {
        // Ignore malformed map messages from the embedded page.
      }
    },
    [onMapClick, onMapReady, onOverlayMarkerPress],
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

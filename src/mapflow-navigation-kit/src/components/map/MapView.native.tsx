import React, { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { buildMapHtml } from '../../utils/mapHtml';
import { MAP_MARKER_ICON_URIS } from '../../../../native/mapMarkerSvgAssets';

export { useMapBridge } from './map-bridge';

import type { MapViewport } from '../../types/viewport';

interface MapViewProps {
  onMapReady?: () => void;
  onMapError?: (message: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  onOverlayMarkerPress?: (markerId: string) => void;
  onRouteSelect?: (routeId: string) => void;
  onViewportChange?: (viewport: MapViewport) => void;
  webViewRef?: React.RefObject<WebView | null>;
  initialLocation?: { lat: number; lng: number } | null;
  reloadToken?: number;
}

export default function MapView({
  onMapReady,
  onMapError,
  onMapClick,
  onOverlayMarkerPress,
  onRouteSelect,
  onViewportChange,
  webViewRef,
  initialLocation,
  reloadToken = 0,
}: MapViewProps) {
  const internalRef = useRef<WebView | null>(null);
  const resolvedRef = webViewRef ?? internalRef;

  const htmlSource = React.useMemo(() => {
    return buildMapHtml(MAP_MARKER_ICON_URIS, initialLocation || undefined);
  }, [initialLocation, reloadToken]);

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
        } else if (data.type === 'selectRoute' && data.payload?.id) {
          onRouteSelect?.(String(data.payload.id));
        } else if (data.type === 'viewportChange' && data.payload) {
          onViewportChange?.(data.payload as MapViewport);
        } else if (data.type === 'mapError') {
          onMapError?.(String(data.payload?.message || 'Map failed to load'));
        }
      } catch {
        // Ignore malformed map messages from the embedded page.
      }
    },
    [onMapClick, onMapError, onMapReady, onOverlayMarkerPress, onRouteSelect, onViewportChange],
  );

  return (
    <View style={styles.container}>
      <WebView
        ref={resolvedRef}
        originWhitelist={['*']}
        source={{ html: htmlSource, baseUrl: 'https://mapflow.local' }}
        style={styles.webview}
        onMessage={handleMessage}
        onError={() => onMapError?.('WebView failed to load the map.')}
        onHttpError={() => onMapError?.('Map HTTP request failed.')}
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

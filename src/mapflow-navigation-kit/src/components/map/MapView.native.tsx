import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';
import MAP_HTML from '../../utils/mapHtml';

export { useMapBridge } from './map-bridge';

type ReactNativeWebViewModule = typeof import('react-native-webview');

let cachedReactNativeWebViewModule: ReactNativeWebViewModule | null | undefined;
let cachedWebViewAvailability: { available: boolean; reason?: string } | null = null;

const getEmbeddedMapAvailability = () => {
  if (cachedWebViewAvailability) {
    return cachedWebViewAvailability;
  }

  try {
    const webViewModule =
      cachedReactNativeWebViewModule ??
      (require('react-native-webview') as ReactNativeWebViewModule);
    cachedReactNativeWebViewModule = webViewModule;

    const resolvedComponent = webViewModule?.WebView ?? webViewModule?.default;
    if (!resolvedComponent) {
      cachedWebViewAvailability = {
        available: false,
        reason: 'react-native-webview loaded without a usable WebView export.',
      };
      return cachedWebViewAvailability;
    }

    cachedWebViewAvailability = { available: true };
    return cachedWebViewAvailability;
  } catch (error) {
    cachedReactNativeWebViewModule = null;
    cachedWebViewAvailability = {
      available: false,
      reason: error instanceof Error ? error.message : 'react-native-webview failed to load.',
    };
    return cachedWebViewAvailability;
  }
};

export const isEmbeddedMapViewAvailable = () => getEmbeddedMapAvailability().available;

interface MapViewProps {
  onMapReady?: () => void;
  onMapClick?: (lat: number, lng: number) => void;
  webViewRef?: React.RefObject<WebView | null>;
  onUnavailable?: (reason: string) => void;
}

export default function MapView({
  onMapReady,
  onMapClick,
  webViewRef,
  onUnavailable,
}: MapViewProps) {
  const internalRef = useRef<WebView | null>(null);
  const resolvedRef = webViewRef ?? internalRef;
  const availability = useMemo(() => getEmbeddedMapAvailability(), []);

  useEffect(() => {
    if (!availability.available) {
      onUnavailable?.(
        availability.reason || 'Embedded map is unavailable in this build.'
      );
    }
  }, [availability, onUnavailable]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'mapReady') {
          onMapReady?.();
        } else if (data.type === 'mapClick') {
          onMapClick?.(data.payload.lat, data.payload.lng);
        }
      } catch {
        // Ignore malformed map messages from the embedded page.
      }
    },
    [onMapClick, onMapReady],
  );

  const WebViewComponent = availability.available
    ? cachedReactNativeWebViewModule?.WebView ??
      cachedReactNativeWebViewModule?.default ??
      null
    : null;

  if (!WebViewComponent) {
    return (
      <View style={[styles.container, styles.unavailableContainer]}>
        <Text style={styles.unavailableTitle}>Map unavailable</Text>
        <Text style={styles.unavailableBody}>
          {availability.reason || 'Embedded map could not be prepared in this build.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebViewComponent
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
  unavailableContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  unavailableTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  unavailableBody: {
    marginTop: 10,
    color: '#AFC4DD',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

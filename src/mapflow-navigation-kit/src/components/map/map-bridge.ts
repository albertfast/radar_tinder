import { useRef, useCallback } from 'react';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';
import { MapMessage } from '../../types/map';

/**
 * Bridge for React Native ↔ WebView communication.
 * WebView map sends messages via postMessage, we listen here.
 * We send commands to the map via injectJavaScript.
 */
export function useMapBridge() {
  const webViewRef = useRef<WebView | null>(null);

  // Send a command from React Native → WebView
  const sendToMap = useCallback((msg: MapMessage) => {
    const json = JSON.stringify(msg);
    const js = `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(json)} })); true;`;
    webViewRef.current?.injectJavaScript(js);
  }, []);

  // Parse a message coming from WebView → React Native
  const parseMapMessage = useCallback((event: WebViewMessageEvent): MapMessage | null => {
    try {
      const msg: MapMessage = JSON.parse(event.nativeEvent.data);
      return msg;
    } catch {
      return null;
    }
  }, []);

  return { webViewRef, sendToMap, parseMapMessage };
}

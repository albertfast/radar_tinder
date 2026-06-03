import { useRef, useCallback } from 'react';
import { MapMessage } from '../../types/map';

export interface NativeMapHandle {
  dispatchMapMessage: (message: MapMessage) => void;
}

export function useMapBridge() {
  const webViewRef = useRef<NativeMapHandle | null>(null);

  const sendToMap = useCallback((msg: MapMessage) => {
    webViewRef.current?.dispatchMapMessage(msg);
  }, []);

  const parseMapMessage = useCallback((): MapMessage | null => null, []);
  return { webViewRef, sendToMap, parseMapMessage };
}

import { NativeModules, Platform } from 'react-native';

type SpeedCameraMarkerModule = {
  getDataUri: (sizePx: number) => Promise<string>;
};

const nativeModule = NativeModules.RTSpeedCameraMarker as SpeedCameraMarkerModule | undefined;

const MARKER_SIZE_PX = 96;

/** Android: Java Canvas 3D marker. Other platforms: empty (map uses Canvas fallback). */
export async function resolveSpeedCameraMarkerUri(sizePx = MARKER_SIZE_PX): Promise<string> {
  if (Platform.OS === 'android' && nativeModule?.getDataUri) {
    try {
      const uri = await nativeModule.getDataUri(sizePx);
      if (typeof uri === 'string' && uri.startsWith('data:image/')) {
        return uri;
      }
    } catch {
      // Fall through to WebView canvas fallback.
    }
  }
  return '';
}

export { MARKER_SIZE_PX };

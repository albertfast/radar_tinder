import { NativeModules, Platform } from 'react-native';
import { MAP_MARKER_ICON_URIS } from './mapMarkerSvgAssets';

type SpeedCameraMarkerModule = {
  getDataUri: (sizePx: number) => Promise<string>;
};

const nativeModule = NativeModules.RTSpeedCameraMarker as SpeedCameraMarkerModule | undefined;

const MARKER_SIZE_PX = 96;

/** Uses the bundled speed-camera artwork; Android native Canvas remains a fallback. */
export async function resolveSpeedCameraMarkerUri(sizePx = MARKER_SIZE_PX): Promise<string> {
  if (MAP_MARKER_ICON_URIS.speedCamera) {
    return MAP_MARKER_ICON_URIS.speedCamera;
  }

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

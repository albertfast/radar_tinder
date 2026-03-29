import { useEffect, useState } from 'react';
import { Asset } from 'expo-asset';
import { RadarLocation } from '../../types';

type MarkerAssetKey =
  | 'camera'
  | 'red_light'
  | 'police'
  | 'mobile'
  | 'traffic_enforcement';

type MarkerAssetRecord = Record<MarkerAssetKey, string>;

const MARKER_ASSET_MODULES: Record<MarkerAssetKey, number> = {
  camera: require('../../../assets/drive-markers/speed-camera-marker.png'),
  red_light: require('../../../assets/drive-markers/red-light-marker.png'),
  police: require('../../../assets/drive-markers/police-marker.png'),
  mobile: require('../../../assets/drive-markers/mobile-marker.png'),
  traffic_enforcement: require('../../../assets/drive-markers/traffic-enforcement-marker.png'),
};

const resolveMarkerAssetKey = (
  markerKind?: RadarLocation['markerKind'] | string | null,
  type?: RadarLocation['type'] | string | null
): MarkerAssetKey => {
  if (markerKind === 'red_light' || type === 'red_light') return 'red_light';
  if (markerKind === 'police' || type === 'police') return 'police';
  if (markerKind === 'mobile' || type === 'mobile') return 'mobile';
  if (markerKind === 'traffic_enforcement' || type === 'traffic_enforcement') {
    return 'traffic_enforcement';
  }
  return 'camera';
};

export function useRadarMarkerAssetUris() {
  const [assetUris, setAssetUris] = useState<MarkerAssetRecord | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        Object.entries(MARKER_ASSET_MODULES).map(async ([key, moduleId]) => {
          const asset = Asset.fromModule(moduleId);
          if (!asset.localUri) {
            await asset.downloadAsync();
          }

          return [key, asset.localUri || asset.uri] as const;
        })
      );

      if (cancelled) {
        return;
      }

      setAssetUris(Object.fromEntries(entries) as MarkerAssetRecord);
    })().catch(() => {
      if (!cancelled) {
        setAssetUris(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    assetUris,
    resolveMarkerAssetKey,
  };
}

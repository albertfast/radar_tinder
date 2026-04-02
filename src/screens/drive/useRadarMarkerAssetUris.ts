import { RadarLocation } from '../../types';

type MarkerAssetKey =
  | 'camera'
  | 'red_light'
  | 'police'
  | 'mobile'
  | 'traffic_enforcement';

type MarkerAssetRecord = Record<MarkerAssetKey, string>;

const toSvgDataUri = (svg: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;

const buildMarkerSvg = (accent: string, iconMarkup: string) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="56" height="68" viewBox="0 0 56 68" fill="none">
    <path
      d="M28 62C23.2 55 15 47.6 15 35.4C15 22.9 20.8 12 28 12C35.2 12 41 22.9 41 35.4C41 47.6 32.8 55 28 62Z"
      fill="#F8FBFF"
      stroke="#D7E0EC"
      stroke-width="1.4"
    />
    <circle cx="28" cy="28" r="10.8" fill="${accent}"/>
    <circle cx="24.4" cy="23.8" r="3" fill="rgba(255,255,255,0.22)"/>
    ${iconMarkup}
  </svg>
`;

const MARKER_ASSET_URIS: MarkerAssetRecord = {
  camera: toSvgDataUri(
    buildMarkerSvg(
      '#FF6F61',
      `
        <rect x="21.6" y="24.8" width="12.8" height="7.8" rx="2.4" fill="none" stroke="#FFFFFF" stroke-width="1.9"/>
        <circle cx="28" cy="28.7" r="2.3" fill="none" stroke="#FFFFFF" stroke-width="1.9"/>
        <path d="M35.3 22.6C37.1 23.4 38.4 24.9 38.8 26.9" stroke="#FFFFFF" stroke-width="1.7" stroke-linecap="round"/>
      `
    )
  ),
  red_light: toSvgDataUri(
    buildMarkerSvg(
      '#FF5A7A',
      `
        <rect x="24.5" y="18.9" width="7" height="16.8" rx="3.4" fill="none" stroke="#FFFFFF" stroke-width="1.8"/>
        <circle cx="28" cy="23.5" r="1.1" fill="#FFFFFF"/>
        <circle cx="28" cy="28.2" r="1.1" fill="#FFFFFF"/>
        <circle cx="28" cy="32.9" r="1.1" fill="#FFFFFF"/>
        <rect x="26.9" y="35.6" width="2.2" height="4.2" rx="1.1" fill="#FFFFFF"/>
      `
    )
  ),
  police: toSvgDataUri(
    buildMarkerSvg(
      '#4C9AFF',
      `
        <path d="M28 18.8L34.2 21.7V27.2C34.2 31.4 31.8 34.9 28 36.5C24.2 34.9 21.8 31.4 21.8 27.2V21.7L28 18.8Z" fill="#FFFFFF"/>
        <path d="M28 23.7L28.9 25.5L30.9 25.7L29.4 26.9L29.9 28.9L28 27.8L26.1 28.9L26.6 26.9L25.1 25.7L27.1 25.5L28 23.7Z" fill="#4C9AFF"/>
      `
    )
  ),
  mobile: toSvgDataUri(
    buildMarkerSvg(
      '#FFB347',
      `
        <rect x="24.6" y="19.7" width="6.8" height="14.6" rx="2.5" fill="none" stroke="#FFFFFF" stroke-width="1.8"/>
        <circle cx="28" cy="31.2" r="0.9" fill="#FFFFFF"/>
        <path d="M33.2 21.4C34.9 22.1 36.1 23.5 36.5 25.4" stroke="#FFFFFF" stroke-width="1.7" stroke-linecap="round"/>
      `
    )
  ),
  traffic_enforcement: toSvgDataUri(
    buildMarkerSvg(
      '#F48C5C',
      `
        <path d="M28 20.5L33.7 31.6H22.3L28 20.5Z" fill="none" stroke="#FFFFFF" stroke-width="1.9" stroke-linejoin="round"/>
        <rect x="27" y="24.9" width="2" height="4.6" rx="1" fill="#FFFFFF"/>
        <circle cx="28" cy="32" r="1" fill="#FFFFFF"/>
      `
    )
  ),
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
  return {
    assetUris: MARKER_ASSET_URIS,
    resolveMarkerAssetKey,
  };
}

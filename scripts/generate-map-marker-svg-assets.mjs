import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const markersRoot = path.join(projectRoot, 'assets/markers');

const coreIcons = {
  speedCamera: 'assets/markers/speed-camera/speed-v1.svg',
  vehicle: 'assets/markers/car-v2.svg',
  destination: 'assets/markers/dest-v1.svg',
  redLight: 'assets/markers/rl-v5.svg',
  gas: 'assets/markers/gas-v1.svg',
};

const excludedPoiCategories = new Set([
  'accident',
  'car',
  'destination',
  'police',
  'parking',
  'bus',
  'red-light',
  'road-work',
  'speed-camera',
  'traffic-jam',
]);

const categoryMatchers = {
  airport: ['airport', 'aerodrome'],
  atm: ['atm'],
  bakery: ['bakery'],
  bank: ['bank'],
  bar: ['bar', 'pub'],
  basketball: ['basketball'],
  beach: ['beach'],
  cafe: ['cafe', 'coffee'],
  camping: ['camp_site', 'camping', 'campground'],
  'car-rental': ['car_rental', 'car rental'],
  church: ['church'],
  cinema: ['cinema'],
  clinic: ['clinic', 'doctors'],
  concert: ['concert', 'music_venue', 'music venue'],
  dentist: ['dentist'],
  fastfood: ['fast_food', 'fast food'],
  ferry: ['ferry', 'ferry_terminal'],
  'fire-station': ['fire_station', 'fire station'],
  football: ['football', 'soccer'],
  forest: ['forest', 'wood'],
  'gas-station': ['fuel', 'gas', 'petrol', 'charging_station', 'charging station'],
  gym: ['gym', 'fitness_centre', 'fitness center', 'fitness'],
  hospital: ['hospital'],
  hotel: ['hotel'],
  kindergarten: ['kindergarten'],
  lake: ['lake', 'water'],
  library: ['library'],
  mall: ['mall', 'shopping_centre', 'shopping center'],
  market: ['market', 'marketplace', 'supermarket', 'grocery'],
  mosque: ['mosque'],
  motel: ['motel'],
  mountain: ['mountain', 'peak'],
  museum: ['museum'],
  nightclub: ['nightclub'],
  park: ['park', 'garden'],
  pharmacy: ['pharmacy'],
  picnic: ['picnic', 'picnic_site'],
  playground: ['playground'],
  'post-office': ['post_office', 'post office'],
  restaurant: ['restaurant'],
  school: ['school'],
  swimming: ['swimming', 'swimming_pool'],
  taxi: ['taxi'],
  temple: ['temple'],
  tennis: ['tennis'],
  theater: ['theatre', 'theater'],
  toilet: ['toilets', 'toilet', 'restroom'],
  trail: ['trail', 'hiking', 'path'],
  train: ['train_station', 'railway station', 'station', 'railway'],
  university: ['university', 'college'],
  vet: ['veterinary', 'vet'],
  viewpoint: ['viewpoint'],
  waterfall: ['waterfall'],
  wifi: ['wifi', 'internet_access'],
};

const categoryPriority = {
  hospital: 100,
  pharmacy: 96,
  'gas-station': 94,
  restaurant: 82,
  cafe: 80,
  fastfood: 78,
  toilet: 76,
  market: 72,
  atm: 70,
  bank: 68,
  hotel: 64,
  train: 62,
  airport: 62,
  ferry: 58,
};

const categoryMaxCount = {
  hospital: 4,
  pharmacy: 4,
  'gas-station': 5,
  restaurant: 4,
  cafe: 4,
  fastfood: 4,
  toilet: 3,
};

const categoryMinZoom = {
  'gas-station': 14.2,
  hospital: 14.6,
  pharmacy: 14.6,
  restaurant: 14.8,
  cafe: 14.8,
  fastfood: 14.8,
  toilet: 14.8,
  park: 14.8,
  school: 15.0,
  hotel: 15.0,
  atm: 15.0,
  bank: 15.0,
};

function iconKeyForCategory(category) {
  return category.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
}

function listCategoryDirectories() {
  return fs
    .readdirSync(markersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function pickCategorySvg(category) {
  const directory = path.join(markersRoot, category);
  const files = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.svg'))
    .map((entry) => entry.name)
    .sort((left, right) => {
      const leftIsV1 = /-v1\.svg$/i.test(left);
      const rightIsV1 = /-v1\.svg$/i.test(right);
      if (leftIsV1 !== rightIsV1) return leftIsV1 ? -1 : 1;
      return left.localeCompare(right);
    });

  return files[0] ? `assets/markers/${category}/${files[0]}` : null;
}

function svgToDataUri(svg) {
  const compactSvg = svg
    .replace(/\r\n/g, '\n')
    .replace(/>\s+</g, '><')
    .trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(compactSvg)}`;
}

const categoryIcons = Object.fromEntries(
  listCategoryDirectories()
    .filter((category) => !excludedPoiCategories.has(category))
    .map((category) => [iconKeyForCategory(category), pickCategorySvg(category)])
    .filter(([, relativePath]) => Boolean(relativePath))
);

const icons = {
  ...categoryIcons,
  ...coreIcons,
};

const output = Object.fromEntries(
  Object.entries(icons).map(([key, relativePath]) => {
    const absolutePath = path.join(projectRoot, relativePath);
    const svg = fs.readFileSync(absolutePath, 'utf8');
    return [key, svgToDataUri(svg)];
  })
);

const poiCategoryConfig = Object.fromEntries(
  listCategoryDirectories()
    .filter((category) => !excludedPoiCategories.has(category))
    .map((category) => {
      const iconKey = iconKeyForCategory(category);
      return [
        category,
        {
          iconKey,
          matchTerms: categoryMatchers[category] || [category.replace(/-/g, ' ')],
          minZoom: categoryMinZoom[category] || 15.6,
          maxCount: categoryMaxCount[category] || 3,
          priority: categoryPriority[category] || 50,
        },
      ];
    })
    .filter(([, config]) => Boolean(output[config.iconKey]))
);

const target = path.join(projectRoot, 'src/native/mapMarkerSvgAssets.ts');
const contents = `// Generated by scripts/generate-map-marker-svg-assets.mjs. Do not edit by hand.

export const MAP_MARKER_ICON_URIS = ${JSON.stringify(output, null, 2)} as const;

export const POI_CATEGORY_CONFIG = ${JSON.stringify(poiCategoryConfig, null, 2)} as const;

export type MapMarkerIconKey = keyof typeof MAP_MARKER_ICON_URIS;
export type MapMarkerIconUris = Partial<Record<MapMarkerIconKey, string>>;
export type PoiCategory = keyof typeof POI_CATEGORY_CONFIG;
`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== contents) {
    console.error(`${path.relative(projectRoot, target)} is out of date. Run node scripts/generate-map-marker-svg-assets.mjs`);
    process.exit(1);
  }
  process.exit(0);
}

fs.writeFileSync(target, contents);

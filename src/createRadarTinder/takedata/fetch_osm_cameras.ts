/**
 * OpenStreetMap Overpass API'den Trafik Kameralarını Çekme Script'i
 * * Bu script dünya genelindeki tüm hız ve trafik kameralarını çeker
 * ve Supabase'e yüklemek için hazırlar. Büyük bölgeleri grid'lere bölerek
 * 504 Gateway Timeout hatalarını engeller.
 * * Kullanım: bun run ./fetch_osm_cameras.ts
 */

import * as fs from 'fs';

// Overpass API'nin daha stabil olan ana aynaları
const OVERPASS_ENDPOINTS = [
  'https://lz4.overpass-api.de/api/interpreter',
'https://z.overpass-api.de/api/interpreter',
'https://overpass-api.de/api/interpreter'
];

// Grid boyutu (Derece cinsinden). 10 derece Overpass için ideal bir boyuttur.
const GRID_STEP = 10;

const WORLD_BOUNDS = [
  // Kuzey Amerika
  { name: 'north_america_east', minLat: 25, maxLat: 50, minLng: -80, maxLng: -60 },
{ name: 'north_america_central', minLat: 25, maxLat: 50, minLng: -100, maxLng: -80 },
{ name: 'north_america_west', minLat: 25, maxLat: 50, minLng: -130, maxLng: -100 },
// Avrupa
{ name: 'europe_west', minLat: 35, maxLat: 60, minLng: -10, maxLng: 10 },
{ name: 'europe_central', minLat: 35, maxLat: 60, minLng: 10, maxLng: 30 },
{ name: 'europe_east', minLat: 35, maxLat: 60, minLng: 30, maxLng: 50 },
// Asya (Sınırları biraz daralttım, Asya devasa)
{ name: 'asia_west', minLat: 10, maxLat: 45, minLng: 50, maxLng: 80 },
{ name: 'asia_central', minLat: 10, maxLat: 55, minLng: 80, maxLng: 120 },
{ name: 'asia_east', minLat: 10, maxLat: 55, minLng: 120, maxLng: 150 },
// Güney Amerika
{ name: 'south_america_north', minLat: -10, maxLat: 15, minLng: -85, maxLng: -35 },
{ name: 'south_america_south', minLat: -60, maxLat: -10, minLng: -80, maxLng: -35 },
// Afrika
{ name: 'africa_north', minLat: 15, maxLat: 40, minLng: -20, maxLng: 40 },
{ name: 'africa_south', minLat: -40, maxLat: 15, minLng: 10, maxLng: 55 },
// Okyanusya
{ name: 'oceania', minLat: -50, maxLat: 0, minLng: 110, maxLng: 180 },
];

interface OSMCamera {
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

interface ProcessedCamera {
  source: string;
  source_id: string;
  latitude: number;
  longitude: number;
  camera_type: string;
  speed_limit: number | null;
  road_name: string | null;
  direction: string | null;
  country: string | null;
  verified: boolean;
}

/**
 * Büyük bir bölgeyi daha küçük 10x10 derecelik grid'lere böler
 */
function getGridChunks(bounds: typeof WORLD_BOUNDS[0]) {
  const chunks = [];
  for (let lat = bounds.minLat; lat < bounds.maxLat; lat += GRID_STEP) {
    for (let lng = bounds.minLng; lng < bounds.maxLng; lng += GRID_STEP) {
      chunks.push({
        minLat: lat,
        maxLat: Math.min(lat + GRID_STEP, bounds.maxLat),
                  minLng: lng,
                  maxLng: Math.min(lng + GRID_STEP, bounds.maxLng)
      });
    }
  }
  return chunks;
}

/**
 * Overpass API sorgusu ile kamera verilerini çek
 */
async function fetchCamerasFromOverpass(chunk: any, attempt = 1): Promise<OSMCamera[]> {
  const query = `
  [out:json][timeout:60];
  (
    node["highway"="speed_camera"](${chunk.minLat},${chunk.minLng},${chunk.maxLat},${chunk.maxLng});
    node["enforcement"="maxspeed"](${chunk.minLat},${chunk.minLng},${chunk.maxLat},${chunk.maxLng});
    node["enforcement"="average_speed"](${chunk.minLat},${chunk.minLng},${chunk.maxLat},${chunk.maxLng});
    node["enforcement"="traffic_signals"](${chunk.minLat},${chunk.minLng},${chunk.maxLat},${chunk.maxLng});
    node["highway"="traffic_signals"]["traffic_signals"="camera"](${chunk.minLat},${chunk.minLng},${chunk.maxLat},${chunk.maxLng});
  );
  out body;
  `;

  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch (parseError) {
        throw new Error("Failed to parse JSON (Server returned HTML/Error page)");
      }

      return data.elements || [];
    } catch (error) {
      lastError = error as Error;
      // Diğer endpoint'e geçmeden önce çok kısa bekle
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  throw lastError;
}

/**
 * OSM tag'lerini standart formata çevir
 */
function processOSMCamera(camera: OSMCamera): ProcessedCamera {
  const tags = camera.tags || {};

  let cameraType = 'speed_fixed';
  if (tags.highway === 'speed_camera') {
    cameraType = 'speed_fixed';
  } else if (tags.enforcement === 'average_speed') {
    cameraType = 'speed_average';
  } else if (tags.enforcement === 'traffic_signals') {
    cameraType = 'red_light';
  } else if (tags.enforcement === 'maxspeed') {
    cameraType = 'speed_fixed';
  } else if (tags['traffic_signals'] === 'camera') {
    cameraType = 'traffic_light';
  }

  let speedLimit: number | null = null;
  if (tags.maxspeed) {
    const match = tags.maxspeed.match(/(\d+)/);
    if (match) {
      speedLimit = parseInt(match[1]);
    }
  }

  return {
    source: 'osm',
    source_id: `osm_node_${camera.id}`,
    latitude: camera.lat,
    longitude: camera.lon,
    camera_type: cameraType,
    speed_limit: speedLimit,
    road_name: tags.name || tags['name:en'] || tags['addr:street'] || null,
    direction: tags.direction || null,
    country: tags['addr:country'] || tags['is_in:country'] || null,
    verified: false
  };
}

/**
 * Ana fonksiyon
 */
async function fetchAllCameras() {
  console.log('🚀 Starting global traffic camera fetch from OSM...\n');

  const allCameras: ProcessedCamera[] = [];
  const stats = {
    total: 0,
    byType: {} as Record<string, number>,
    byRegion: {} as Record<string, number>
  };

  for (const bounds of WORLD_BOUNDS) {
    console.log(`\n📍 Processing region: ${bounds.name}`);
    const chunks = getGridChunks(bounds);
    console.log(`   Divided into ${chunks.length} chunks to avoid timeouts.`);

    let regionTotal = 0;

    for (let i = 0; i < chunks.length; i++) {
      process.stdout.write(`   Fetching chunk ${i + 1}/${chunks.length}... `);

      try {
        const cameras = await fetchCamerasFromOverpass(chunks[i]);
        const processed = cameras.map(processOSMCamera);

        allCameras.push(...processed);
        regionTotal += processed.length;

        processed.forEach(cam => {
          stats.total++;
          stats.byType[cam.camera_type] = (stats.byType[cam.camera_type] || 0) + 1;
        });

        console.log(`✓ Found ${processed.length} cameras`);

        // Overpass'i bloklamamak için her başarılı chunk'tan sonra dinlen (Rate Limit koruması)
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (error) {
        console.log(`✗ Failed: ${(error as Error).message}`);
      }
    }

    stats.byRegion[bounds.name] = regionTotal;
  }

  // Sonuçları kaydet
  const outputFile = '/home/z/my-project/download/osm_cameras_all.json';

  // Klasör yoksa oluştur
  const dir = '/home/z/my-project/download';
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputFile, JSON.stringify(allCameras, null, 2));

  console.log('\n📊 Statistics:');
  console.log(`   Total cameras: ${stats.total}`);
  console.log(`   By type: ${JSON.stringify(stats.byType, null, 2)}`);
  console.log(`\n✅ Saved to: ${outputFile}`);

  return allCameras;
}

// Çalıştır
fetchAllCameras().catch(console.error);

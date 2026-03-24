🎯 Ana Veri Kaynakları
1. OpenStreetMap (OSM) - Overpass API ⭐ En Önerilen
Tamamen ücretsiz, API anahtarı gerektirmez
Dünya genelinde kapsam
JSON formatında çıktı

// Örnek sorgu
[out:json][timeout:25];
(
  node["highway"="speed_camera"]({{bbox}});
  node["enforcement"="maxspeed"]({{bbox}});
);
out body;


2. Lufop API ⭐ Avrupa İçin En İyi
20+ Avrupa ülkesi kapsamı
Aylık güncellenen veritabanı
Sabit, mobil, kırmızı ışık ve ortalama hız kameraları
Website: https://lufop.net/en/lufop-api


3. Hükümet Açık Veri Portalları

| Ülke | Portal | Veri Türü |
|------|--------|-----------|
| ABD | data.gov | Trafik kameraları |
| Avustralya | data.act.gov.au | Hız kameraları |
| Kanada | ouvert.canada.ca | Trafik kameraları |
| İngiltere | data.gov.uk | Hız kameraları |



4. GitHub Açık Kaynak Projeleri
Open-GATSO-POI: Avrupa hız kameraları, günlük güncelleme
catchcam: Offline kamera dedektörü
waze_traffic_api: Waze verilerinden polis raporları

Supabase Veritabanı Şeması

 CREATE TABLE traffic_cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  camera_type camera_type NOT NULL, -- speed_fixed, red_light, speed_mobile, etc.
  speed_limit INTEGER,
  road_name VARCHAR(255),
  country_id INTEGER,
  source VARCHAR(50) NOT NULL, -- 'osm', 'lufop', 'gov_data'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Konum indeksi
CREATE INDEX idx_cameras_location
  ON traffic_cameras USING GIST (point(longitude, latitude));


Expo/React Native Entegrasyonu

// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// services/cameraService.ts
export async function getNearbyCameras(lat: number, lng: number, radiusKm: number) {
  const { data } = await supabase.rpc('get_nearby_cameras', {
    user_lat: lat,
    user_lng: lng,
    radius_km: radiusKm
  });
  return data;
}


⚠️ Yasal Uyarılar
Fransa: Hız kamerası konumları yasak, "tehlikeli bölge" olarak işaretleyin
İsviçre: Hız kamerası uyarıları tamamen yasak

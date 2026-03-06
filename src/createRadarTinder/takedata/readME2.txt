OSM + Government Camera Ingest Workspace

# Klasördeki script'ler:
src/createRadarTinder/takedata/
├── fetch_osm_cameras.ts      # Eski prototip OSM script'i, brute-force ve timeout riski var
├── process_geojson.ts        # Verified gov dataset'lerini external_radars formatına çevirir
├── upload_to_supabase.ts     # process_geojson çıktısını external_radars tablosuna upsert eder
├── location_tracking_strategy.ts  # Mobil konum takibi strateji notları
└── us_state_data_sources.ts  # Verified gov source manifest'i

ABD Eyalleri İçin Veri Kaynakları

| Eyalet | Portal | Veri Türü |
|--------|--------|-----------|
| **DC** | opendata.dc.gov | Speed + Traffic Cameras |
| **NY** | opendata.cityofnewyork.us | Red Light + Speed Cameras |
| **CA** | data.ca.gov | Caltrans Traffic Cameras |
| **IL (Chicago)** | data.cityofchicago.org | Speed + Red Light Cameras |
| **FL** | fl511.com | Real-time Traffic Cameras |
| **TX** | txdot.gov | Traffic Cameras |
| **WA** | wsdot.wa.gov | Traffic Cameras API |
| **MD** | data.imap.maryland.gov | Speed Cameras |

Production Notları

- OSM baseline artık Supabase edge function + cron ile ingest ediliyor.
- Government dataset'ler için sadece verified + driver_alert kaynakları external_radars'a yazılmalı.
- CCTV ve benzeri enforcement olmayan kaynaklar `map_only` olarak işaretlenmeli.
- Violation dataset'leri kamera feed'i sayılmaz; `manual_review` olmadan ingest edilmemeli.

Kamera Uyarı Sistemi - Uygulanabilir Hibrit Yöntem
SÜREKLİ LOCATION KONTROLÜ VERİMSİZDİR! ❌
Bunun yerine akıllı hibrit sistem kullanın:

🎯 Strateji 1: Geofencing (En Battery-Efficient)

// iOS/Android native geofencing kullan
// Uygulama kapalı olsa bile çalışır!
// Battery: MINIMAL

await Location.startGeofencingAsync('camera-alert', [
  {
    identifier: 'camera_123',
    latitude: 38.9658,
    longitude: -77.0760,
    radius: 300, // 300m çapında bölge
    notifyOnEnter: true,  // Girince uyar
    notifyOnExit: false   // Çıkınca sessiz
  }
]);



Limit: iOS/Android max 20 geofence aynı anda aktif edebilir. Bu yüzden:

Kullanıcının rotasındaki veya yakın cache'indeki en kritik 20 alert-eligible kamerayı dinamik olarak güncelle.
🎯 Strateji 2: Akıllı Konum Takibi


// Hız bazlı güncelleme aralığı
const updateInterval = speed => {
  if (speed < 5) return 10000;    // Yürüyüş: 10 sn
  if (speed < 15) return 5000;    // Şehir: 5 sn
  if (speed < 25) return 3000;    // Ana yol: 3 sn
  return 2000;                     // Otoyol: 2 sn
};

// Sadece önündeki kameraları kontrol et
const isCameraAhead = (camera, userLocation, heading) => {
  const bearingToCamera = calculateBearing(userLocation, camera);
  const diff = Math.abs(heading - bearingToCamera);
  return diff <= 45; // ±45 derece içindeyse "önünde"
};


Strateji 3: Önbellek (Cache) Mekanizması

// Kullanıcının 5km çevresindeki veya rota koridorundaki kameraları cache'le
// Sadece cache dışına çıkınca, reroute olunca veya 1-2 km ilerleyince API çağır

const cachedCameras = await AsyncStorage.getItem('nearby_cameras');
if (!cachedCameras || needsRefresh(userLocation)) {
  const cameras = await fetchNearbyCameras(lat, lng, 5000); // 5km
  await AsyncStorage.setItem('nearby_cameras', JSON.stringify(cameras));
}


📱 Uygulama Senaryosu: "5328 Fulton St."
Kullanıcı bu sokaktan geçerken:

┌─────────────────────────────────────────────────────────────┐
│  1. Kullanıcı hareket ediyor (speed: 15 m/s = 54 km/h)     │
│                                                             │
│  2. Her 5 saniyede konum güncelle                          │
│     ↓                                                       │
│  3. Cache'teki kameraları kontrol et                       │
│     - Distance hesapla (Haversine formülü)                 │
│     - Direction kontrol et (önünde mi?)                    │
│     ↓                                                       │
│  4. Kamera 300m yaklaştıysa → UYARI VER!                   │
│     - Ses + Titreşim + Push Notification                   │
│     - "Connecticut Avenue'de hız kamerası 300m ilerde!"    │
│     - "Hız sınırı: 35 mph | Sizin hızınız: 54 mph"        │
└─────────────────────────────────────────────────────────────┘

Batarya Optimizasyonu Özeti

 | Mod | Yöntem | Battery | Güncelleme |
|-----|--------|---------|------------|
| **Background** | Geofencing | %1-2/gün | OS tetikler |
| **Foreground** | Smart Tracking | %5-10/saat | Dinamik |
| **Navigation** | High Accuracy | %15-20/saat | Her 1-2 sn |

Script Kullanımı

1. DC sample dataset'lerini normalize et:
   `bun run src/createRadarTinder/takedata/process_geojson.ts`
2. Map-only CCTV'yi de dahil etmek istersen:
   `bun run src/createRadarTinder/takedata/process_geojson.ts --include-map-only`
3. Driver-alert satırlarını Supabase'e yükle:
   `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun run src/createRadarTinder/takedata/upload_to_supabase.ts`




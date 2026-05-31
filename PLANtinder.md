## Driving Mode Camera Logic + Device Coverage Fix (Play)

### Summary
- Driving Mode’da radar davranışını iki moda böleceğim:
  - **Rota yoksa:** haritanın o anki viewport’unda yalnızca `speed_camera` markerları gösterilecek.
  - **Rota varsa:** yalnızca rota üstündeki `speed_camera` markerları gösterilecek ve bildirimler sadece bu setten üretilecek.
- Kullanıcı rotadan saparsa güncelleme daha hızlı tetiklenecek (reroute + radar refresh).
- Play’deki “supported devices” düşüşü için ABI hedefi **`arm64-v8a + armeabi-v7a`** olacak.

### Key Implementation Changes
- **Map viewport bridge (WebView → RN):**
  - `mapHtml.ts` içinde `moveend` sırasında center/zoom/bounds bilgisi `postMessage` ile gönderilecek.
  - `MapView.native.tsx` yeni mesaj tipini okuyacak.
  - `MapFlowNavigationScreen` yeni callback prop’u ile viewport bilgisini dışarı verecek.

- **Public/interface updates:**
  - `MapFlowNavigationScreen` props:
    - `onViewportChange?: (viewport) => void`
  - `MapView` props:
    - `onViewportChange?: (viewport) => void`
  - `RadarService.getRouteAwareRadars(...)` genişletilecek:
    - `allowedTypes?: RadarLocation['type'][]`
    - `headingToleranceDeg?: number`
    - `minAheadMeters?: number`
    - mevcut `corridorMeters` korunacak

- **Radar selection logic (RadarScreen):**
  - **No route:** viewport merkezinden radius query + bounds içinde filtre + `type === 'speed_camera'`.
  - **Route active:** `getRouteAwareRadars` ile rota üstü kamera listesi (`speed_camera` only).
  - Marker kaynağı tekilleştirilecek; Map ve Basic aynı “aktif radar listesi”ni kullanacak.
  - Fetch mekanizması:
    - periyodik refresh devam,
    - viewport değişiminde debounce’lu hızlı refresh,
    - off-route durumunda anlık refresh (cooldown’lu).

- **Alert strictness (yan sokak uyarısını kesmek için):**
  - Route corridor ve heading toleransı sıkılaştırılacak (daha dar koridor).
  - Background alert üretimi sadece rota üstü `speed_camera` için yapılacak.
  - “Yol üzerinde değilse bildirim yok” kuralı foreground/background akışta aynılaştırılacak.

- **Marker SVG redesign (camera):**
  - `mapHtml.ts` içindeki `camera` marker SVG’i mevcut koyu mavi harita paletine uyumlu, daha net/temiz bir ikonla güncellenecek (yüksek kontrast, küçük halo, düşük görsel gürültü).

- **Android device coverage fix:**
  - `android/gradle.properties`:
    - `reactNativeArchitectures=arm64-v8a,armeabi-v7a`
    - (`x86_64` prod hedefinden çıkarılacak, seçtiğin profile göre)
  - Manifest feature’lar `required=false` kalacak (mevcut iyi).

### Test Plan
1. **No route / viewport test**
   - Adres yazmadan Map tabında farklı şehir bölgesine pan+zoom:
   - Sadece `speed_camera` markerları görünmeli, viewport değişince liste/markerlar güncellenmeli.
2. **Route test**
   - Hedef girip rota başlat:
   - Haritada sadece rota üstü `speed_camera` markerları görünmeli.
3. **Off-route test**
   - Rota dışına sap:
   - Kısa sürede reroute + yeni rota kameraları güncellenmeli.
4. **Notification correctness**
   - Rota üzerindeki kamerada bildirim gelmeli.
   - Paralel/üst sokak kamerasında bildirim gelmemeli.
5. **Android compatibility**
   - `./gradlew bundleRelease`
   - Üretilen AAB’de `arm64-v8a` + `armeabi-v7a` kontrolü.
   - Play Console App Bundle Explorer’da ABI doğrulaması.

### Assumptions / Defaults
- Seçimlerin sabitlendi:
  - No-route kapsam: **viewport bazlı**
  - Route/alert tipi: **sadece `speed_camera`**
  - ABI hedefi: **`arm64-v8a + armeabi-v7a`**
- “Tüm telefonlar” pratikte Play/OS kısıtları nedeniyle “desteklenen Android sürümleri + seçilen ABI’ler” anlamında uygulanacak.

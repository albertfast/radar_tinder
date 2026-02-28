# Radar Tinder Stabilizasyon Planı (AI + Navigasyon + Bildirim + Parity)

## Özet
Bu planın hedefi, iOS/Android’de aynı kullanıcı için stabil ve doğru sürüş deneyimi üretmek:  
1) AI model yükleme hatasını bitirmek,  
2) bildirim spam/çift uyarıları kesmek,  
3) rota dışı radar uyarılarını engellemek,  
4) dönüş talimatı ve reroute doğruluğunu artırmak,  
5) hız/speed-limit + trafik + map UX’i düzeltmek,  
6) varış/flow/persistence/history sorunlarını kapatmak,  
7) archive aşamasında dSYM uyarısını operasyonel olarak kontrol altına almak.

Teslim şekli: Her paket ayrı uygulanır, her paketin sonunda manuel test + onay alınır.

---

## Paket 1 — AI Model Yükleme (P0)
Amaç: `AI Module not available` ve preload kararsızlığını bitirmek.

Uygulama:
1. `AIDiagnoseScreen` içinde dinamik import kırılmalarını kaldırıp AI servis init akışını deterministik hale getir.
2. `AIService` için tek giriş noktası oluştur: önce native runtime check, sonra embedded model URI çözümleme, sonra session create.
3. Hata sınıflarını tek tip contract ile UI’a geçir: `native_module_missing`, `model_uri_invalid`, `file_corrupt`, `session_create_failed`.
4. `getModelDiagnostics()` çıktısını teşhis ekranında zorunlu göster (native modül, model dosya boyutu, URI tipi, son hata kodu).

Dosyalar:
- [AIService.ts](/Users/asahiner/Documents/projects/radar_tinder/src/services/AIService.ts)
- [AIDiagnoseScreen.tsx](/Users/asahiner/Documents/projects/radar_tinder/src/screens/AIDiagnoseScreen.tsx)

Onay testi:
1. iOS TestFlight ve local debug’da “Try Again” sonrası preload başarılı.
2. Başarısız durumda kullanıcı mesajı net hata sınıfını gösterir.
3. “internet sorunu” gibi yanlış yönlendirme olmaz.

---

## Paket 2 — Bildirim Politikası Sadeleştirme (P0)
Amaç: art arda ve çift bildirimleri bitirmek; tek kural kaynağı.

Uygulama:
1. Sistem push kuralı: uygulama foreground ise OS push gönderme; in-app banner/voice/haptic kullan. Uygulama background/inactive ise OS push gönder.
2. Radar bildirim dedupe anahtarı: `radarId + routeSessionId + directionBucket`; 120 sn throttle.
3. “Driving Protection Active” bildirimi bir sürüş oturumunda bir kez.
4. `BackgroundService` ve `useRadarDataSync` arasında bildirim sorumluluğunu ayır: foreground duyuru yalnız UI katmanında, push yalnız background katmanında.

Dosyalar:
- [NotificationService.ts](/Users/asahiner/Documents/projects/radar_tinder/src/services/NotificationService.ts)
- [BackgroundService.ts](/Users/asahiner/Documents/projects/radar_tinder/src/services/BackgroundService.ts)
- [useRadarDataSync.ts](/Users/asahiner/Documents/projects/radar_tinder/src/screens/radar/hooks/useRadarDataSync.ts)

Onay testi:
1. Aynı radar için kısa aralıkta tekrar push yok.
2. Foreground’da üst üste sistem push yok.
3. Arka planda uygulama açıkken tekil push çalışır.

---

## Paket 3 — Rota Dışı Radar Uyarısı Kapatma (P0)
Amaç: `1228 Sutter St` gibi rota dışı speed camera bildirimlerini kesmek.

Uygulama:
1. `RadarService` içindeki sentetik/mock radar enjeksiyonunu tamamen kaldır.
2. Radar aday filtresi:
   - rota koridoru mesafesi (polyline segment distance) <= 120 m,
   - heading farkı <= 55 derece,
   - ETA penceresi 10–90 sn.
3. Sadece route-matched radarlar alert pipeline’a girsin.

Dosyalar:
- [RadarService.ts](/Users/asahiner/Documents/projects/radar_tinder/src/services/RadarService.ts)
- [BackgroundService.ts](/Users/asahiner/Documents/projects/radar_tinder/src/services/BackgroundService.ts)

Onay testi:
1. `34th Ave -> 520 Mason St` sürüşünde rota dışı kamera uyarısı gelmez.
2. Rota üstündeki kamera/sabit radar uyarısı doğru zamanda gelir.

---

## Paket 4 — Navigasyon Doğruluğu ve Reroute (P0)
Amaç: “geç dön diyor”, “yanlış yönde kalıyor” davranışlarını düzeltmek.

Uygulama:
1. Step progression: yalnız step end noktasına bakma yerine route polyline üzerinde ilerleme yüzdesi + step end proximity birlikte kullan.
2. Turn announcement pencereleri hız duyarlı hale getir: yaklaşık 500m, 200m, 80m, “şimdi dön”.
3. Off-route tespiti:
   - polyline’a dik mesafe > 35m ve 3 ardışık tick -> reroute,
   - > 60m tekil sert sapma -> acil reroute.
4. Route seçim skorunu düzelt: `duration_in_traffic` öncelikli, yanlış string tabanlı “highway” heuristiği kaldır.

Dosyalar:
- [useRadarNavigation.ts](/Users/asahiner/Documents/projects/radar_tinder/src/screens/radar/hooks/useRadarNavigation.ts)
- [GoogleMapsService.ts](/Users/asahiner/Documents/projects/radar_tinder/src/services/GoogleMapsService.ts)

Onay testi:
1. Dönüş yaklaşırken talimat doğru sırada güncellenir.
2. Dönüş kaçırıldığında 3–8 sn içinde reroute.
3. ETA ve kalan mesafe sapması düşer.

---

## Paket 5 — Harita Trafik + Hız + Speed Limit HUD (P1)
Amaç: daha canlı harita, gerçek trafik görünümü, net hız/limit geri bildirimi.

Uygulama:
1. Map üzerinde `showsTraffic` aktif et.
2. Map stilini kontrastlı ve daha canlı temaya geçir (road class ayrımı belirgin).
3. Map tab HUD ekle:
   - anlık hız,
   - mevcut yol speed limit,
   - overspeed renk durumu:
     - limit altı: normal,
     - %0–5 üstü: sarı,
     - %5–10 üstü: turuncu,
     - %10+ üstü: kırmızı soft glow.
4. Speed limit sorgusunu cache’li ve harekete bağlı yap (yol/segment değişmedikçe tekrar çağırma).

Dosyalar:
- [RadarMap.tsx](/Users/asahiner/Documents/projects/radar_tinder/src/components/RadarMap.tsx)
- [modernMapStyle.ts](/Users/asahiner/Documents/projects/radar_tinder/src/utils/modernMapStyle.ts)
- [RadarMapTab.tsx](/Users/asahiner/Documents/projects/radar_tinder/src/screens/radar/components/driving/RadarMapTab.tsx)
- [GoogleMapsService.ts](/Users/asahiner/Documents/projects/radar_tinder/src/services/GoogleMapsService.ts)

Onay testi:
1. Trafik yoğunluğu katmanı görünür.
2. Hız değeri map ekranında sürekli güncellenir.
3. Limit aşımı renk geçişleri doğru çalışır.

---

## Paket 6 — Varış Mesajı Tekilleştirme + Drive Flow (P1)
Amaç: “You have arrived” çoğaltmasını kaldırmak; Start Driving sonrası geçişleri netleştirmek.

Uygulama:
1. Arrival UI tek kaynakta render edilsin (duplicate kartları kaldır).
2. Arrival TTS latch ile bir kez çalınsın.
3. `DriveShortcutScreen` akışı `forceTab: Basic` sabitinden çıkarılsın:
   - center radar tab: varsayılan `Map`,
   - home “Drive Basic” butonu: `Basic`,
   - pro kullanıcı `Graphic`’e geçebilsin.
4. Map sürüşündeyken Basic/Map/Graphic geçişi kullanıcıya erişilebilir kalsın (kilitlenme hissi kaldır).

Dosyalar:
- [RadarDrivingShell.tsx](/Users/asahiner/Documents/projects/radar_tinder/src/screens/radar/components/driving/RadarDrivingShell.tsx)
- [RadarMapTab.tsx](/Users/asahiner/Documents/projects/radar_tinder/src/screens/radar/components/driving/RadarMapTab.tsx)
- [DriveShortcutScreen.tsx](/Users/asahiner/Documents/projects/radar_tinder/src/screens/DriveShortcutScreen.tsx)
- [MainTabNavigator.tsx](/Users/asahiner/Documents/projects/radar_tinder/src/navigation/MainTabNavigator.tsx)
- [RadarScreen.tsx](/Users/asahiner/Documents/projects/radar_tinder/src/screens/RadarScreen.tsx)

Onay testi:
1. Varışta tek kart görünür.
2. Start Driving sonrası Map’e geçiş tutarlı.
3. Drive Basic / center radar / Graphic geçişleri beklenen şekilde çalışır.

---

## Paket 7 — Access/Persistence ve Ads Parity (P1)
Amaç: kullanıcı/pro bilgisi, reklam görünürlüğü ve profil verisinin app reopen sonrası kaybolmaması.

Uygulama:
1. Boot sırası: session hydrate -> server profile refresh -> access normalize -> UI render.
2. `subscriptionType` ve `adsRemoved` server-authoritative; stale local fallback kaldır.
3. Ads render guard: auth/settings hydration tamamlanmadan reklam kararına gitme (flicker ve yanlış reklam önlenir).
4. Foreground dönüşünde profile refresh + access normalize.

Dosyalar:
- [authStore.ts](/Users/asahiner/Documents/projects/radar_tinder/src/store/authStore.ts)
- [App.tsx](/Users/asahiner/Documents/projects/radar_tinder/App.tsx)
- [access.ts](/Users/asahiner/Documents/projects/radar_tinder/src/utils/access.ts)
- [RadarScreen.tsx](/Users/asahiner/Documents/projects/radar_tinder/src/screens/RadarScreen.tsx)
- [RadarHomeDashboard.tsx](/Users/asahiner/Documents/projects/radar_tinder/src/screens/radar/components/RadarHomeDashboard.tsx)

Onay testi:
1. Pro kullanıcıda reopen sonrası reklam geri gelmez.
2. Profil adı/avatar/subscription stabil kalır.
3. Free/pro/admin görünüm parity iOS/Android’de aynıdır.

---

## Paket 8 — Trip History Unit + Details Akışı (P1)
Amaç: mile/km tutarsızlığı ve çalışmayan “Details”i düzeltmek.

Uygulama:
1. History distance render’ı `unitSystem` tabanlı formatter ile yapılır.
2. “Details” butonu aktif hale getirilir ve Trip Detail/Graph akışına gider.
3. Detail ekranı en az şu metrikleri gösterir: mesafe, süre, ort hız, tepe hız, ETA sapması; Pro’da ek analiz kartları.

Dosyalar:
- [HistoryScreen.tsx](/Users/asahiner/Documents/projects/radar_tinder/src/screens/HistoryScreen.tsx)
- (gerekirse) yeni detay ekranı ve navigator kayıtları ilgili navigation dosyalarında.

Onay testi:
1. Araç ayarı mile ise history mile gösterir.
2. Details tıklanır, detay/graph ekranı açılır.
3. Metrikler rota verisiyle tutarlı.

---

## Paket 9 — iOS Archive dSYM Uyarı Yönetimi (P2)
Amaç: Hermes dSYM uyarısını release pipeline’da kontrol altına almak.

Uygulama:
1. iOS release build ayarlarını gözden geçir: dSYM üretimi/packaging doğrulansın.
2. Archive sonrası symbol doğrulama script’i eklenir; app dSYM zorunlu, Hermes dSYM “warning ama non-blocking” olarak raporlanır.
3. Upload dokümantasyonuna net karar notu eklenir (blocker değilse release’i durdurmama politikası).

Dosyalar:
- [Podfile](/Users/asahiner/Documents/projects/radar_tinder/ios/Podfile)
- [project.pbxproj](/Users/asahiner/Documents/projects/radar_tinder/ios/RadarTinder.xcodeproj/project.pbxproj)
- [eas.json](/Users/asahiner/Documents/projects/radar_tinder/eas.json)
- (opsiyonel) iOS archive doğrulama script dosyası.

Onay testi:
1. Archive/upload blocker hata vermez.
2. Symbol raporu üretir, Hermes durumu açıkça loglanır.

---

## Public API / Interface Değişiklikleri
1. `RadarAlert` tipine dahili teşhis alanları eklenir: route/heading eşleşme skoru (UI’da gösterilmek zorunda değil).
2. `AIService` hata dönüş contract’ı netleşir; teşhis çıktısı standardize edilir.
3. `Drive` tab geçiş parametreleri netleşir (`forceTab` davranışı deterministic).
4. Yeni dış API yok; değişiklikler uygulama içi store/service sınırında.

---

## Test Matrisi (Sıralı Onay)
1. AI Diagnose: preload + error class doğrulama.
2. Notification: foreground/background dedupe.
3. Route relevance: rota dışı radar yok.
4. Turn timing + reroute.
5. Map traffic + speed/speed-limit + overspeed color.
6. Arrival dedupe + tab flow.
7. Auth/profile/ads persistence.
8. History unit + details navigation.
9. iOS archive symbol report.

---

## Varsayımlar ve Seçilen Varsayılanlar
1. İş kuralı değişmiyor: free/pro/admin/adsRemoved mantığı korunur.
2. Bildirim politikası varsayılanı: foreground’da sistem push yok, background’da var.
3. Sentetik radar enjeksiyonu tamamen kaldırılır.
4. Harita sağlayıcısı mevcut yapı (Google Maps) üzerinden iyileştirilir; provider değişikliği bu turda yok.
5. Hermes dSYM uyarısı release blocker değil; operasyonel raporlanıp takip edilir.

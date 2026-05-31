# Production Release Checklist (Radar Tinder)

Bu liste, production gönderimi öncesi hızlı ve güvenli final kontroldür.

## A) Güvenlik / Erişim Kontrolleri

- [x] Profilde `Admin Sign In` butonu default gizli.
- [x] Admin girişi yalnızca build satırına **7 kez dokununca** görünür.
- [x] Admin login production build’de kapalı (`__DEV__` dışında login yok).
- [ ] Release build’de profil ekranında admin butonunun başlangıçta görünmediğini manuel doğrula.

## B) Legal / Uyum Kontrolleri

- [x] Uygulama içi `Privacy Policy` metni güncellendi.
- [x] Uygulama içi `Terms of Service` metni güncellendi.
- [x] Sorumluluk sınırlaması, doğruluk garantisi yokluğu ve sürüş sorumluluğu maddeleri eklendi.
- [x] Subscription ekranında Terms ve Privacy metinleri tıklanabilir link yapıldı.
- [x] Play fiyatları RevenueCat `priceString` ile lokalize gösteriliyor (sabit `$` kaldırıldı).
- [x] Deneme şartları + iptal yolu `SubscriptionLegalBlock` ile paywall/onboarding'de gösteriliyor.
- [x] "Manage subscription" Google Play abonelik sayfasına yönlendiriyor.
- [x] EN/TR i18n (cihaz diline göre).
- [ ] Uygulama içi Terms/Privacy ekranlarını açıp metin akışını ve scroll davranışını cihazda kontrol et.
- [ ] TR ve US test hesaplarıyla satın alma fiyatının Play cart ile eşleştiğini doğrula.

## C) Sürüm / Build Tutarlılığı

- [x] Profil ekranında sürüm satırı dinamik: `v{appVersion} • build {nativeBuildVersion}`.
- [x] Drawer footer sürüm satırı dinamik hale getirildi.
- [ ] Release archive sonrası `Radar Settings > Build Fingerprint` alanını kontrol et.

## D) Firebase / İzleme

- [x] Performance Monitoring SDK eklendi (`@react-native-firebase/perf`).
- [x] iOS pod entegrasyonu tamamlandı (`RNFBPerf`, `FirebasePerformance`).
- [x] `firebase.json` içinde `perf_auto_collection_enabled: true` ayarı eklendi.
- [ ] Xcode Scheme’e `-FIRDebugEnabled` verip Performance loglarını kısa bir testte doğrula.
- [ ] Firebase Console > Performance dashboard’da ilk event’leri doğrula.

## D.1) iOS Ödeme Gerçekliği (Kritik)

- [ ] TestFlight satın alımlarının Apple sandbox olduğunu doğrula (gerçek karttan çekim yapılmaz).
- [ ] Gerçek ücretlendirme yalnızca App Store production yayında gerçekleşir.
- [ ] RevenueCat Dashboard'da iOS ürün ID’lerinin app içi planlarla eşleştiğini doğrula:
	- Weekly: `pro_subscription_weekly` / `pro_subscription:weekly`
	- Yearly: `pro_subscription_yearly` / `pro_subscription:yearly`
	- Remove Ads: `remove_ads`

## E) iOS Release Akışı

- [ ] Preflight çalıştır:

```bash
bash scripts/ios-archive-preflight.sh
```

- [ ] Archive adımlarını uygula:

```text
ios/RadarTinder.xcworkspace -> Scheme: RadarTinder -> Release -> Product > Archive
```

- [ ] Tam detay için: `docs/release/IOS_LOCAL_ARCHIVE.md`

## F) Android Release Akışı

- [x] Navigasyon rotası turkuaz (`mapTheme.ts` / `mapHtml.ts`).
- [x] Speed camera 3D PNG marker (`assets/markers/speed_camera_3d.png`).
- [x] Production OSM fallback: `EXPO_PUBLIC_LIVE_OSM_FALLBACK=true` (`.env.submit` + `eas.json` production).
- [x] Play closed→open rehberi: [PLAY_CONSOLE_CLOSED_TO_OPEN.md](PLAY_CONSOLE_CLOSED_TO_OPEN.md).
- [x] Supabase audit SQL: [SUPABASE_PRE_PUBLISH_AUDIT.sql](SUPABASE_PRE_PUBLISH_AUDIT.sql).
- [ ] Supabase Dashboard → Authentication → **Anonymous** provider ON (TrialOffer için).
- [x] Release ABI hedefi: `armeabi-v7a` + `arm64-v8a` (`android/gradle.properties`).
- [ ] RevenueCat Android ürün ID doğrulaması (weekly/yearly/remove_ads) Play Console ile eşleşiyor.
- [ ] AAB üret:

```bash
cd android
./gradlew bundleRelease
```

- [ ] 16 KB doğrulama:

```bash
bash scripts/android-verify-16kb.sh android/app/build/outputs/bundle/release/app-release.aab
```

- [ ] Tam detay için: `docs/release/ANDROID_16KB_CHECKLIST.md`

## G) Son Smoke Test (Önerilen)

- [ ] Login / Logout
- [ ] Radar harita açılışı
- [ ] Leaderboard açılışı
- [ ] Subscription ekranı ve Terms/Privacy linkleri
- [ ] Profile ekranı: sürüm satırı ve 7-tap admin unlock davranışı

## H) Release Notu (Kısa)

Önerilen release notu maddeleri:

- Gizli admin erişim akışı production için güvenli hale getirildi.
- Privacy Policy ve Terms metinleri güncellendi.
- Firebase Performance Monitoring entegrasyonu tamamlandı.
- Sürüm/build görünürlüğü dinamikleştirildi.

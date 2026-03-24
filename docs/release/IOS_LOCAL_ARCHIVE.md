# iOS Local Archive (Deterministic)

Bu akış, Xcode archive sırasında yanlış klasörden eski JS bundle alınmasını engeller.

## 0) Cache / DerivedData Temizliği (Önerilen)

Repo kökünden:

```bash
pnpm clean:cache
pnpm start:clean
```

## 1) Preflight Kontrolü

Repo kökünden:

```bash
bash scripts/ios-archive-preflight.sh
```

Bu script şunları doğrular:
- Doğru workspace/project kullanımı (`ios/RadarTinder.xcworkspace`)
- `Pods/Manifest.lock` ve `Podfile.lock` senkronu
- Bundle phase içinde `BUNDLE_COMMAND="export:embed"`
- `PROJECT_DIR` / `SRCROOT` değerlerinin mevcut checkout'a işaret etmesi

## 2) Xcode ile Archive

1. `ios/RadarTinder.xcworkspace` aç.
2. Scheme: `RadarTinder`
3. Build Configuration: `Release`
4. Product -> Clean Build Folder
5. Product -> Archive

## 3) Archive Sonrası Doğrulama

App içinde `Radar Settings` ekranına gir ve `Build Fingerprint` kartını kontrol et:
- `v{appVersion} • build {nativeBuildVersion}`
- `fingerprint = {gitShortSha}-{timestamp}`

Bu fingerprint, arşivlenen build'in gerçekten güncel commit'ten üretildiğini doğrular.

## 4) TestFlight Upload

Organizer üzerinden archive seçip `Distribute App` -> `App Store Connect` akışını tamamla.

## Sorun Giderme

- `Pod sandbox is out of sync`:
  - `cd ios && pod install`
- `PROJECT_DIR mismatch`:
  - Yanlış workspace/proje açılmış olabilir; sadece bu repo altındaki `ios/RadarTinder.xcworkspace` kullanılmalı.
- `Bundle phase does not use export:embed`:
  - `ios/RadarTinder.xcodeproj/project.pbxproj` içinde React bundle script'ini kontrol et.

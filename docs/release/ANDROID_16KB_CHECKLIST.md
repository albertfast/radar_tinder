# Android 16 KB Compliance Checklist

Bu checklist, Play Console'daki 16 KB page-size uyarısını release öncesi lokalde yakalamak içindir.

## 1) Release Artifact Üret

Örnek:

```bash
cd android
./gradlew bundleRelease
```

Beklenen çıktı:
- `android/app/build/outputs/bundle/release/app-release.aab`

## 2) Otomatik 16 KB Doğrulama Script'i

Repo kökünden:

```bash
bash scripts/android-verify-16kb.sh android/app/build/outputs/bundle/release/app-release.aab
```

Script kontrolleri:
- AAB için `bundletool dump config` içinde `PAGE_ALIGNMENT_16K`
- APK için `zipalign -c -P 16`
- Artifact içindeki tüm `.so` dosyalarında ELF `LOAD` alignment >= `2**14`

## 3) Fail-Fast Kuralı

Script fail ederse upload yapılmamalı.

Özellikle şu durumlar bloklanmalı:
- `PAGE_ALIGNMENT_16K` yoksa
- `zipalign -P 16` başarısızsa
- Herhangi bir `.so` dosyası `2**12` veya daha düşük alignment taşıyorsa

## 4) CI Entegrasyonu (Önerilen)

CI job sırası:
1. Release AAB üret
2. `android-verify-16kb.sh` çalıştır
3. Başarılıysa yalnızca o zaman Play upload adımına geç

## 5) Notlar

- `bundletool` PATH'te yoksa `BUNDLETOOL_JAR` env değişkeni ile jar yolu verilebilir.
- `zipalign` PATH'te yoksa script `ANDROID_HOME` / `ANDROID_SDK_ROOT` altından otomatik bulmayı dener.

# Google Play Store & Subscription Setup Guide

## 1. RevenueCat Kurulumu (3-Day Free Trial + Subscription)

### RevenueCat Dashboard'da Yapılacaklar:

1. **RevenueCat hesabı oluştur**: https://www.revenuecat.com/
2. **Yeni proje oluştur**: "Radar Tinder"
3. **Google Play Store bağlantısı kur**:
   - Google Play Console'dan Service Account JSON key al
   - RevenueCat'e yükle

### Ürünleri Google Play Console'da Oluştur:

```
Product ID: radar_pro_weekly
Price: $3.99/week
Trial: None

Product ID: radar_pro_yearly  
Price: $19.99/year
Trial: 3 days free

Product ID: radar_remove_ads
Price: $0.99 (one-time)
```

### RevenueCat'te Entitlements ve Offerings:

**Entitlements:**
- `pro` - Premium özelliklere erişim
- `remove_ads` - Reklam kaldırma

**Offerings > Default:**
- Weekly: radar_pro_weekly
- Yearly: radar_pro_yearly (3-day trial included)
- Remove Ads: radar_remove_ads

---

## 2. GitHub Secrets Ekle (Android Build için)

Repository Settings > Secrets and Variables > Actions:

```
ANDROID_KEYSTORE_BASE64     # Keystore dosyası (base64 encoded)
ANDROID_KEYSTORE_PASSWORD   # Keystore şifresi
ANDROID_KEY_ALIAS           # Key alias (örn: release-key)
ANDROID_KEY_PASSWORD        # Key şifresi
```

### Keystore Oluşturma:
```bash
keytool -genkeypair -v -storetype PKCS12 -keystore release.keystore -alias release-key -keyalg RSA -keysize 2048 -validity 10000

# Base64'e çevir:
base64 -i release.keystore | pbcopy  # macOS
base64 release.keystore | xclip      # Linux
```

---

## 3. RevenueCat API Keys

SubscriptionService.ts dosyasına gerçek API key'leri ekle:

```typescript
const REVENUECAT_API_KEY = Platform.select({
  ios: 'appl_XXXXXX',      // RevenueCat iOS Public Key
  android: 'goog_XXXXXX',  // RevenueCat Android Public Key
}) || '';
```

RevenueCat Dashboard > Project Settings > API Keys bölümünden alınır.

---

## 4. Google Play Console Kurulumu

### 4.1 Uygulama Oluştur
1. https://play.google.com/console adresine git
2. "Create app" tıkla
3. App name: "Radar Tinder"
4. Default language: English (US)
5. App or game: App
6. Free or paid: Free (with in-app purchases)

### 4.2 Store Listing
- Short description (80 char max)
- Full description (4000 char max)
- App icon (512x512 PNG)
- Feature graphic (1024x500 PNG)
- Screenshots (min 2):
  - Phone: 1080x1920 veya 1920x1080
  - Tablet: 1200x1920 veya 1920x1200

### 4.3 App Content
- Privacy policy URL (gerekli)
- App access (login gerektiriyor mu?)
- Ads (contains ads = Yes)
- Content rating questionnaire
- Target audience (13+)
- Data safety form

### 4.4 In-App Products
Monetization > Products > Subscriptions:
1. "Create subscription" tıkla
2. Product ID: radar_pro_yearly
3. Name: Radar Pro Yearly
4. Price: $19.99
5. "Free trial" sekmesi: 3 days

### 4.5 Testing
- Internal testing: AAB dosyasını yükle
- Test kullanıcıları ekle (email adresleri)
- Test linkini paylaş

---

## 5. AAB Upload & Release

### GitHub Actions ile Otomatik Build:
Workflow çalıştıktan sonra:
1. Actions > android-release > Artifacts bölümünden AAB indir
2. Play Console > Release > Production > Create new release
3. AAB'yi sürükle bırak
4. Release notes yaz
5. Review and rollout

### Manuel Build:
```bash
# Production AAB oluştur
eas build --platform android --profile production --local

# Ya da doğrudan
cd android
./gradlew bundleRelease
```

---

## 6. Subscription Flow

```
User opens app
    ↓
TrialOfferScreen displayed
    ↓
User taps "Start 3-Day Free Trial"
    ↓
Firebase Anonymous Auth (tracks user)
    ↓
RevenueCat shows Google Play payment sheet
    ↓
User subscribes (3-day trial starts)
    ↓
After 3 days: $19.99/year billed
    ↓
Pro features unlocked
```

---

## 7. Checklist

- [ ] RevenueCat hesabı oluşturuldu
- [ ] Google Play Service Account bağlandı
- [ ] In-app products oluşturuldu (yearly, weekly, remove_ads)
- [ ] RevenueCat API keys güncellendi
- [ ] Android Keystore oluşturuldu
- [ ] GitHub Secrets eklendi
- [ ] AAB build test edildi
- [ ] Internal testing yapıldı
- [ ] Store listing tamamlandı
- [ ] Production'a submit edildi

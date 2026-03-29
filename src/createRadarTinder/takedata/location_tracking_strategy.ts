/**
 * KONUM TAKİBİ VE KAMERA UYARI SİSTEMİ
 * =====================================
 * 
 * Bu dosya, kullanıcının konumunu takip ederek yakındaki kameraları
 * tespit eden ve önceden uyaran sistem için tasarım önerilerini içerir.
 * 
 * ÖNEMLI: Sürekli location kontrolü BATARYA tüketir!
 * Bu yüzden akıllı algoritmalar kullanmalıyız.
 */

// ============================================================
// STRATEJI 1: GEOFENCING (En Verimli Yöntem)
// ============================================================

/**
 * Geofencing Nedir?
 * -----------------
 * Belirli coğrafi bölgeler (çemberler) tanımlarız ve kullanıcı bu bölgeye
 * girdiğinde veya çıktığında sistem bizi haberdar eder.
 * 
 * Avantajları:
 * - İşletim sistemi seviyesinde çalışır (iOS/Android native)
 * - Uygulama kapalı olsa bile çalışır
 * - Minimum batarya tüketimi
 * - Background processing optimize
 * 
 * Kullanım:
 * - Her kamera için 200-500m çapında bir geofence oluştur
 * - Kullanıcı geofence'e girdiğinde detaylı kontrol yap
 */

// Expo/React Native Implementation
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GEOFENCE_TASK = 'geofence-camera-alert';
const PROXIMITY_THRESHOLD = 500; // 500 metre - uyarı mesafesi
const ALERT_THRESHOLD = 300; // 300 metre - aktif uyarı

// ============================================================
// STRATEJI 2: AKILLI KONUM TAKİBİ
// ============================================================

/**
 * Akıllı Konum Takibi Algoritması
 * --------------------------------
 * 
 * 1. HAREKET ALGILAMA
 *    - Kullanıcı hareket etmiyorsa güncellemeyi yavaşlat
 *    - Hareket halindeyken daha sık güncelle
 * 
 * 2. HIZ TABANLI GÜNCELLEME
 *    - Yüksek hız = daha sık güncelleme (daha erken uyarı gerekir)
 *    - Düşük hız = daha seyrek güncelleme
 * 
 * 3. ÖNBELLEK (CACHE)
 *    - Kullanıcının çevresindeki kameraları önceden yükle
 *    - Sadece cache'te olmayan bölgeler için API çağır
 * 
 * 4. YÖN TAHMİNİ
 *    - Kullanıcının gidiş yönünü tahmin et
 *    - Sadece önündeki kameraları kontrol et
 */

interface LocationUpdate {
  latitude: number;
  longitude: number;
  speed: number; // m/s
  heading: number; // derece
  timestamp: number;
}

interface CachedCamera {
  id: string;
  latitude: number;
  longitude: number;
  camera_type: string;
  speed_limit: number | null;
  distance: number;
  bearing: number; // Kullanıcıya göre açı
}

class SmartLocationTracker {
  private lastLocation: LocationUpdate | null = null;
  private nearbyCameras: CachedCamera[] = [];
  private updateInterval: number = 5000; // Varsayılan 5 saniye
  private watchSubscription: Location.LocationSubscription | null = null;

  /**
   * Dinamik güncelleme aralığı hesapla
   * Hız arttıkça daha sık güncelle
   */
  private calculateUpdateInterval(speed: number): number {
    if (speed < 5) return 10000;        // Yürüyüş: 10 saniye
    if (speed < 15) return 5000;        // Şehir içi: 5 saniye
    if (speed < 25) return 3000;        // Ana yol: 3 saniye
    return 2000;                         // Otoyol: 2 saniye
  }

  /**
   * Kullanıcının gidiş yönüne göre kamera mı?
   */
  private isCameraAhead(
    cameraLat: number, 
    cameraLng: number,
    userLat: number,
    userLng: number,
    heading: number
  ): boolean {
    // Kullanıcıdan kameraya bearing hesapla
    const bearingToCamera = this.calculateBearing(
      userLat, userLng, cameraLat, cameraLng
    );

    // Bearing farkı (yön farkı)
    let bearingDiff = Math.abs(heading - bearingToCamera);
    if (bearingDiff > 180) bearingDiff = 360 - bearingDiff;

    // ±45 derece içindeyse "önünde" sayılır
    return bearingDiff <= 45;
  }

  /**
   * İki nokta arası bearing (yön) hesapla
   */
  private calculateBearing(
    lat1: number, lng1: number,
    lat2: number, lng2: number
  ): number {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;

    const y = Math.sin(dLng) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  /**
   * Mesafe hesapla (Haversine formülü)
   */
  private calculateDistance(
    lat1: number, lng1: number,
    lat2: number, lng2: number
  ): number {
    const R = 6371000; // Dünya yarıçapı (metre)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * 
              Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Yakındaki kameraları kontrol et ve uyarı ver
   */
  private checkNearbyCameras(location: LocationUpdate): void {
    const now = Date.now();

    for (const camera of this.nearbyCameras) {
      const distance = this.calculateDistance(
        location.latitude, location.longitude,
        camera.latitude, camera.longitude
      );

      // Mesafe güncelle
      camera.distance = distance;

      // Yön kontrolü
      const isAhead = this.isCameraAhead(
        camera.latitude, camera.longitude,
        location.latitude, location.longitude,
        location.heading
      );

      // Uyarı gerekli mi?
      if (distance < ALERT_THRESHOLD && isAhead) {
        this.triggerAlert(camera, location.speed);
      } else if (distance < PROXIMITY_THRESHOLD && isAhead) {
        this.triggerWarning(camera, distance);
      }
    }
  }

  private triggerAlert(camera: CachedCamera, currentSpeed: number): void {
    const speedLimit = camera.speed_limit || 0;
    const isSpeeding = speedLimit > 0 && (currentSpeed * 3.6) > speedLimit;

    console.log(`🚨 ALERT: ${camera.camera_type} camera in ${camera.distance}m!`);
    if (isSpeeding) {
      console.log(`⚠️ SPEEDING! Limit: ${speedLimit} km/h, You: ${(currentSpeed * 3.6).toFixed(0)} km/h`);
    }
    
    // Push notification, ses, titreşim vs.
  }

  private triggerWarning(camera: CachedCamera, distance: number): void {
    console.log(`⚠️ WARNING: ${camera.camera_type} camera ${distance.toFixed(0)}m ahead`);
  }

  /**
   * Konum takibini başlat
   */
  async startTracking(): Promise<void> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission denied');
    }

    // Background permission (iOS için critical)
    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();

    this.watchSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 50, // Her 50 metrede bir güncelle
        timeInterval: this.updateInterval,
      },
      (location) => {
        const update: LocationUpdate = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          speed: location.coords.speed || 0,
          heading: location.coords.heading || 0,
          timestamp: location.timestamp,
        };

        // Dinamik interval güncelle
        this.updateInterval = this.calculateUpdateInterval(update.speed);

        // Kameraları kontrol et
        this.checkNearbyCameras(update);

        // Cache güncelle (gerekirse)
        this.updateCameraCache(update);

        this.lastLocation = update;
      }
    );
  }

  /**
   * Kamera cache'ini güncelle - kullanıcı çevresindeki kameraları yükle
   */
  private async updateCameraCache(location: LocationUpdate): Promise<void> {
    // Cache sadece 2km'den daha uzak kameralar için güncelle
    const furthestCamera = Math.max(
      ...this.nearbyCameras.map(c => c.distance), 0
    );

    if (furthestCamera < 1500) {
      // Cache'te yeterli kamera var, güncelleme gerekmez
      return;
    }

    try {
      // API'den yeni kameraları çek
      const response = await fetch(
        `/api/cameras/nearby?lat=${location.latitude}&lng=${location.longitude}&radius=3000`
      );
      const cameras = await response.json();

      // Cache'i güncelle
      this.nearbyCameras = cameras.map((c: any) => ({
        ...c,
        distance: this.calculateDistance(
          location.latitude, location.longitude,
          c.latitude, c.longitude
        ),
        bearing: this.calculateBearing(
          location.latitude, location.longitude,
          c.latitude, c.longitude
        )
      }));
    } catch (error) {
      console.error('Failed to update camera cache:', error);
    }
  }

  stopTracking(): void {
    this.watchSubscription?.remove();
    this.watchSubscription = null;
  }
}

// ============================================================
// STRATEJI 3: GEOFENCING API (En Battery-Efficient)
// ============================================================

/**
 * Expo Location Geofencing kullanımı
 * 
 * iOS ve Android'de native geofencing desteği var.
 * Bu, OS seviyesinde çalışır ve minimum batarya tüketir.
 */

// Geofence tanımlama
async function setupGeofences(cameras: CachedCamera[]) {
  const regions = cameras.map(camera => ({
    identifier: camera.id,
    latitude: camera.latitude,
    longitude: camera.longitude,
    radius: PROXIMITY_THRESHOLD,
    notifyOnEnter: true,
    notifyOnExit: false,
  }));

  // Task tanımla
  TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
    if (error) {
      console.error('Geofence error:', error);
      return;
    }

    const { eventType, region } = data as any;
    
    if (eventType === Location.GeofencingEventType.Enter) {
      // Kullanıcı geofence'e girdi
      console.log(`📍 Entered geofence: ${region.identifier}`);
      
      // Detaylı kontrol ve uyarı
      checkAndAlertCamera(region.identifier);
    }
  });

  // Geofencing başlat
  await Location.startGeofencingAsync(GEOFENCE_TASK, regions.slice(0, 20)); // Max 20 region
}

async function checkAndAlertCamera(cameraId: string) {
  // Kullanıcının mevcut konumunu al
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High
  });

  // Kamera detaylarını çek ve uyarı ver
  console.log(`🚨 Camera ${cameraId} nearby!`);
}

// ============================================================
// ÖNERİLEN MİMARİ
// ============================================================

/**
 * HİBRİT YAKLAŞIM (En İyi Performans)
 * ------------------------------------
 * 
 * 1. BACKGROUND MODE (Uygulama kapalı/minimized):
 *    - Native Geofencing API kullan (20 region limit)
 *    - Kullanıcının rotasındaki en yakın 20 kamerayı takip et
 *    - Battery impact: MINIMAL
 * 
 * 2. FOREGROUND MODE (Uygulama açık):
 *    - Smart Location Tracking kullan
 *    - Dinamik güncelleme aralığı
 *    - Direction-aware alerts
 *    - Battery impact: LOW-MEDIUM
 * 
 * 3. NAVIGATION MODE (Navigasyon aktif):
 *    - Daha sık güncellemeler
 *    - Route-based predictions
 *    - Battery impact: MEDIUM
 * 
 * 
 * BATARYA OPTİMİZASYON İPUÇLARI:
 * -------------------------------
 * - Accuracy.High yerine Balanced kullan (çoğu durumda yeterli)
 * - DistanceInterval kullan (her saniye değil, her 50-100 metrede)
 * - Uygulama background'a geçince tracking'i azalt
 * - Geofencing'i önceliklendir (20 region limitini akıllı kullan)
 * - Cache mekanizmasını iyi yönet (API çağrılarını minimize et)
 */

export { SmartLocationTracker, setupGeofences, PROXIMITY_THRESHOLD, ALERT_THRESHOLD };

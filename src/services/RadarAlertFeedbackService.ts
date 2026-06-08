import * as Haptics from 'expo-haptics';
import { AppState } from 'react-native';
import { RadarAlert } from '../types';
import { useSettingsStore } from '../store/settingsStore';
import { VoiceGuidanceService } from './VoiceGuidanceService';
import { NotificationService } from './NotificationService';
import { formatDistance } from '../utils/format';
import {
  formatRadarAnnouncementTiming,
  formatRadarSpeedLimitAnnouncement,
  formatRadarTypeLabel,
  getRadarShortLocation,
} from '../utils/radarAlerts';

export class RadarAlertFeedbackService {
  private static lastAnnouncedKey = '';
  private static lastAnnouncedAt = 0;

  static async deliver(
    alert: RadarAlert,
    locationLabel?: string,
    options?: { playSound?: boolean; vibrate?: boolean; dedupeKey?: string }
  ): Promise<void> {
    const settings = useSettingsStore.getState();
    const hydrated = settings.hasHydrated;
    const playSound =
      options?.playSound ??
      (hydrated && settings.voiceWarningsEnabled && settings.warningVolume > 0);
    const vibrate = options?.vibrate ?? (hydrated && settings.hapticAlertsEnabled);

    const dedupeKey = options?.dedupeKey || `${alert.radarId}:${Math.round(alert.distance * 1000)}`;
    const now = Date.now();
    if (dedupeKey === this.lastAnnouncedKey && now - this.lastAnnouncedAt < 8000) {
      return;
    }
    this.lastAnnouncedKey = dedupeKey;
    this.lastAnnouncedAt = now;

    if (vibrate) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }

    const isForeground = AppState.currentState === 'active';

    if (isForeground && playSound) {
      const unitSystem = settings.unitSystem;
      const distanceText = formatDistance(alert.distance, unitSystem);
      const shortLocation = getRadarShortLocation(locationLabel || alert.locationLabel);
      const locationSuffix = shortLocation ? ` near ${shortLocation}` : '';
      const timingText = formatRadarAnnouncementTiming(alert);
      const speedLimitText = formatRadarSpeedLimitAnnouncement(alert, unitSystem);
      const speedLimitSuffix = speedLimitText ? ` ${speedLimitText}.` : '';
      const message = `${formatRadarTypeLabel(alert.type)} ahead${locationSuffix}.${speedLimitSuffix} ${distanceText}. ${timingText}.`;
      await VoiceGuidanceService.speak(message, {
        cooldownKey: `radar:${alert.radarId}`,
        cooldownMs: 6000,
      });
    }

    if (!isForeground) {
      await NotificationService.sendRadarAlert(alert, locationLabel, {
        playSound,
        vibrate,
      });
    }
  }
}

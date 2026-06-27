import { useEffect, useMemo, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { RadarAlert } from '../../../types';
import { VoiceGuidanceService } from '../../../services/VoiceGuidanceService';
import { NotificationService } from '../../../services/NotificationService';
import { useSettingsStore } from '../../../store/settingsStore';
import { formatDistance } from '../../../utils/format';
import {
  formatRadarAnnouncementTiming,
  formatRadarSpeedLimitAnnouncement,
  formatRadarTypeLabel,
  getRadarShortLocation,
} from '../../../utils/radarAlerts';

type Params = {
  activeAlerts: RadarAlert[];
  isDriving: boolean;
  hasHydrated: boolean;
  hapticAlertsEnabled: boolean;
  voicePlaybackEnabled: boolean;
  warningVolume: number;
  unitSystem: 'metric' | 'imperial';
};

export const useActiveRadarAlertFeedback = ({
  activeAlerts,
  isDriving,
  hasHydrated,
  hapticAlertsEnabled,
  voicePlaybackEnabled,
  warningVolume,
  unitSystem,
}: Params) => {
  const lastAnnouncedAlertIdRef = useRef<string | null>(null);

  const activeAlert = useMemo<RadarAlert | null>(() => {
    const unacknowledged = activeAlerts.filter((alert) => !alert.acknowledged);
    return unacknowledged.sort((a, b) => a.distance - b.distance)[0] || null;
  }, [activeAlerts]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!activeAlert) {
      lastAnnouncedAlertIdRef.current = null;
      return;
    }
    if (!isDriving) return;
    if (lastAnnouncedAlertIdRef.current === activeAlert.id) return;
    lastAnnouncedAlertIdRef.current = activeAlert.id;

    if (hapticAlertsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }

    if (voicePlaybackEnabled) {
      const liveSettings = useSettingsStore.getState();
      const liveVoiceEnabled =
        liveSettings.hasHydrated && liveSettings.voiceWarningsEnabled && liveSettings.warningVolume > 0;
      if (!liveVoiceEnabled) {
        return;
      }

      const radarLabel = formatRadarTypeLabel(activeAlert.type);
      const distanceText = formatDistance(activeAlert.distance, unitSystem);
      const shortLocation = getRadarShortLocation(activeAlert.locationLabel);
      const locationSuffix = shortLocation ? ` near ${shortLocation}` : '';
      const timingText = formatRadarAnnouncementTiming(activeAlert);
      const speedLimitText = formatRadarSpeedLimitAnnouncement(activeAlert, unitSystem);
      const speedLimitSuffix = speedLimitText ? ` ${speedLimitText}.` : '';
      const message = `${radarLabel} ahead${locationSuffix}.${speedLimitSuffix} ${distanceText}. ${timingText}.`;

      VoiceGuidanceService.speak(message, {
        cooldownKey: `active_alert:${activeAlert.id}`,
        cooldownMs: 6000,
      });
    }
  }, [
    activeAlert,
    hasHydrated,
    hapticAlertsEnabled,
    isDriving,
    unitSystem,
    voicePlaybackEnabled,
    warningVolume,
  ]);

  useEffect(() => {
    if (!voicePlaybackEnabled) {
      VoiceGuidanceService.syncMuteState().catch(() => {});
      NotificationService.silenceAllAudioNow().catch(() => {
        VoiceGuidanceService.stop().catch(() => {});
      });
    }
  }, [voicePlaybackEnabled]);

  return activeAlert;
};

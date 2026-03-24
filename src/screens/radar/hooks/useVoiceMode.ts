import { useCallback, useMemo } from 'react';
import { NotificationService } from '../../../services/NotificationService';
import { VoiceGuidanceService } from '../../../services/VoiceGuidanceService';

type UseVoiceModeArgs = {
  hasHydrated: boolean;
  voiceWarningsEnabled: boolean;
  hapticAlertsEnabled: boolean;
  warningVolume: number;
  setVoiceWarningsEnabled: (enabled: boolean) => void;
  setWarningVolume: (volume: number) => void;
};

export function useVoiceMode({
  hasHydrated,
  voiceWarningsEnabled,
  hapticAlertsEnabled,
  warningVolume,
  setVoiceWarningsEnabled,
  setWarningVolume,
}: UseVoiceModeArgs) {
  const voicePlaybackEnabled = hasHydrated && voiceWarningsEnabled && warningVolume > 0;

  const alertModeLabel = useMemo(() => {
    if (voicePlaybackEnabled) return 'Voice on';
    if (hasHydrated && hapticAlertsEnabled) return 'Vibrate only';
    return 'Silent';
  }, [hasHydrated, hapticAlertsEnabled, voicePlaybackEnabled]);

  const toggleVoiceWarnings = useCallback(() => {
    const nextEnabled = !voiceWarningsEnabled;
    setVoiceWarningsEnabled(nextEnabled);

    if (nextEnabled && warningVolume <= 0) {
      setWarningVolume(70);
    }

    if (!nextEnabled) {
      VoiceGuidanceService.stop().catch(() => {});
      NotificationService.silenceAllAudioNow().catch(() => {});
    }
  }, [setVoiceWarningsEnabled, setWarningVolume, voiceWarningsEnabled, warningVolume]);

  return {
    voicePlaybackEnabled,
    alertModeLabel,
    toggleVoiceWarnings,
  };
}

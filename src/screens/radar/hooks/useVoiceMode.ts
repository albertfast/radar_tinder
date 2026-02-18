import { useCallback, useMemo } from 'react';
import * as Speech from 'expo-speech';
import { NotificationService } from '../../../services/NotificationService';

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
      NotificationService.silenceAllAudioNow().catch(() => {
        Speech.stop();
      });
    }
  }, [setVoiceWarningsEnabled, setWarningVolume, voiceWarningsEnabled, warningVolume]);

  return {
    voicePlaybackEnabled,
    alertModeLabel,
    toggleVoiceWarnings,
  };
}

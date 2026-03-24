import * as Speech from 'expo-speech';
import { useSettingsStore } from '../store/settingsStore';
import { VOICE_GATE_V2_ENABLED } from '../screens/radar/constants';

type VoiceSpeakOptions = {
  language?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  interrupt?: boolean;
  cooldownKey?: string;
  cooldownMs?: number;
};

export class VoiceGuidanceService {
  private static cooldownByKey: Record<string, number> = {};

  static isVoiceEnabled(): boolean {
    const settings = useSettingsStore.getState();
    if (!VOICE_GATE_V2_ENABLED) {
      return settings.voiceWarningsEnabled;
    }
    return (
      settings.hasHydrated &&
      settings.voiceWarningsEnabled &&
      settings.warningVolume > 0
    );
  }

  static async syncMuteState(): Promise<void> {
    if (!this.isVoiceEnabled()) {
      await this.stop();
    }
  }

  static async stop(): Promise<void> {
    try {
      Speech.stop();
    } catch {}
  }

  static async speak(text: string, options?: VoiceSpeakOptions): Promise<boolean> {
    if (!text || !text.trim()) return false;
    if (!this.isVoiceEnabled()) return false;

    const now = Date.now();
    if (options?.cooldownKey && options?.cooldownMs) {
      const lastSpokenAt = this.cooldownByKey[options.cooldownKey] || 0;
      if (now - lastSpokenAt < options.cooldownMs) {
        return false;
      }
    }

    const settings = useSettingsStore.getState();
    const volume =
      typeof options?.volume === 'number'
        ? options.volume
        : Math.max(0, Math.min(1, settings.warningVolume / 100));

    if (options?.interrupt !== false) {
      await this.stop();
    }

    Speech.speak(text.trim(), {
      language: options?.language || 'en-US',
      rate: options?.rate ?? 0.95,
      pitch: options?.pitch ?? 1,
      volume,
    });

    if (options?.cooldownKey) {
      this.cooldownByKey[options.cooldownKey] = now;
    }
    return true;
  }

  static resetCooldown(prefix?: string): void {
    if (!prefix) {
      this.cooldownByKey = {};
      return;
    }
    Object.keys(this.cooldownByKey).forEach((key) => {
      if (key.startsWith(prefix)) {
        delete this.cooldownByKey[key];
      }
    });
  }
}

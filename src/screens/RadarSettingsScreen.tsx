import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Alert, useWindowDimensions } from 'react-native';
import { Text, Switch, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { SupabaseService } from '../services/SupabaseService';
import { ANIMATION_TIMING } from '../utils/animationConstants';
import { useAutoHideTabBar } from '../hooks/use-auto-hide-tab-bar';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import AdBanner from '../components/AdBanner';

const RadarSettingsScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const {
    unitSystem,
    setUnitSystem,
    voiceWarningsEnabled,
    hapticAlertsEnabled,
    keepAwakeWhileDriving,
    warningVolume,
    setVoiceWarningsEnabled,
    setHapticAlertsEnabled,
    setKeepAwakeWhileDriving,
    setWarningVolume,
    resetToRegionalDefaults,
  } = useSettingsStore();
  const { user } = useAuthStore();
  const { onScroll, onScrollBeginDrag, onScrollEndDrag } = useAutoHideTabBar();
  const drift = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    pulse.value = withRepeat(
      withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [drift, pulse]);

  const orbBaseSize = Math.max(220, Math.min(360, Math.round(width * 0.8)));
  const orbLargeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-16, 28]) },
      { translateY: interpolate(drift.value, [0, 1], [-20, 24]) },
      { scale: interpolate(pulse.value, [0, 1], [0.96, 1.08]) },
    ],
    opacity: interpolate(pulse.value, [0, 1], [0.34, 0.46]),
  }));

  const orbSmallStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [18, -24]) },
      { translateY: interpolate(drift.value, [0, 1], [14, -18]) },
      { scale: interpolate(pulse.value, [0, 1], [1.08, 0.94]) },
    ],
    opacity: interpolate(pulse.value, [0, 1], [0.24, 0.38]),
  }));

  const handleUnitToggle = async () => {
    const currentUnit = unitSystem;
    const nextUnit = unitSystem === 'metric' ? 'imperial' : 'metric';
    setUnitSystem(nextUnit);

    if (!user?.id) return;
    const updated = await SupabaseService.updateProfile(user.id, { unit_system: nextUnit });
    if (!updated) {
      setUnitSystem(currentUnit);
      Alert.alert('Settings', 'Failed to sync settings. Check your connection.');
    }
  };

  const handlePreviewAlert = async () => {
    if (hapticAlertsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
    if (voiceWarningsEnabled && warningVolume > 0) {
      Speech.stop();
      Speech.speak('Speed camera ahead. Eight hundred feet. Drive carefully.', {
        language: 'en-US',
        rate: 0.95,
        pitch: 1,
        volume: warningVolume / 100,
      });
      return;
    }
    Alert.alert(
      'Preview',
      'Voice alert is disabled or volume is set to 0. Enable voice warnings to hear preview.'
    );
  };

  const handleResetDefaults = async () => {
    const previousUnit = unitSystem;
    resetToRegionalDefaults();
    const nextUnit = useSettingsStore.getState().unitSystem;
    if (!user?.id || previousUnit === nextUnit) return;

    const updated = await SupabaseService.updateProfile(user.id, { unit_system: nextUnit });
    if (!updated) {
      setUnitSystem(previousUnit);
      Alert.alert('Settings', 'Failed to sync reset unit preference. Check your connection.');
    }
  };

  const SettingCard = ({
    title,
    subtitle,
    icon,
    right,
    onPress,
    children,
    delay,
  }: {
    title: string;
    subtitle: string;
    icon: any;
    right?: React.ReactNode;
    onPress?: () => void;
    children?: React.ReactNode;
    delay: number;
  }) => (
    <Animated.View entering={FadeInUp.delay(delay).duration(ANIMATION_TIMING.BASE)}>
      <LinearGradient
        colors={['rgba(8, 17, 34, 0.95)', 'rgba(8, 13, 24, 0.82)']}
        style={styles.settingCard}
      >
        <TouchableOpacity
          style={styles.settingContent}
          onPress={onPress}
          disabled={!onPress}
          activeOpacity={0.7}
        >
          <View style={styles.settingLeft}>
            <View style={styles.settingIconBox}>
              <MaterialCommunityIcons name={icon} size={20} color="#4ECDC4" style={styles.settingIcon} />
            </View>
            <View style={styles.settingCopy}>
              <Text style={styles.settingLabel}>{title}</Text>
              <Text style={styles.settingSubLabel}>{subtitle}</Text>
            </View>
          </View>
          {right}
        </TouchableOpacity>
        {children ? <View style={styles.settingBody}>{children}</View> : null}
      </LinearGradient>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#02040A', '#040A19', '#071326']}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.backgroundOrb,
          styles.backgroundOrbA,
          {
            width: orbBaseSize,
            height: orbBaseSize,
            borderRadius: orbBaseSize / 2,
          },
          orbLargeStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.backgroundOrb,
          styles.backgroundOrbB,
          {
            width: Math.round(orbBaseSize * 0.72),
            height: Math.round(orbBaseSize * 0.72),
            borderRadius: Math.round(orbBaseSize * 0.36),
          },
          orbSmallStyle,
        ]}
      />
      <Animated.View 
        style={[styles.header, { paddingTop: insets.top + 6 }]}
        entering={FadeInDown.duration(ANIMATION_TIMING.BASE)}
      >
        <IconButton 
          icon="chevron-left" 
          iconColor="white" 
          size={30} 
          onPress={() => navigation.goBack()} 
        />
        <Animated.Text 
          style={styles.headerTitle}
          entering={FadeInDown.delay(50).duration(ANIMATION_TIMING.BASE)}
        >
          Radar Settings
        </Animated.Text>
        <Text style={styles.headerSubtitle}>Alerts, navigation behavior and unit preferences</Text>
      </Animated.View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 30 }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        scrollEventThrottle={16}
      >
        <SettingCard
          title="Distance Unit"
          subtitle="US opens with miles by default, others use kilometers"
          icon="ruler"
          delay={120}
          onPress={handleUnitToggle}
          right={
            <View style={styles.valuePill}>
              <Text style={styles.settingValue}>
                {unitSystem === 'metric' ? 'Kilometers (km)' : 'Miles (mi)'}
              </Text>
            </View>
          }
        />

        <SettingCard
          title="Warning Sound Level"
          subtitle="Applies to spoken and future alarm-based alerts"
          icon="volume-high"
          delay={180}
          right={<Text style={styles.settingValue}>{warningVolume}%</Text>}
        >
          <View style={styles.volumeRow}>
            {[25, 50, 75, 100].map((volume) => (
              <TouchableOpacity
                key={volume}
                style={[styles.volumeChip, warningVolume === volume && styles.volumeChipActive]}
                onPress={() => setWarningVolume(volume)}
              >
                <Text style={[styles.volumeChipText, warningVolume === volume && styles.volumeChipTextActive]}>
                  {volume}%
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SettingCard>

        <SettingCard
          title="Voice Alerts"
          subtitle="Announces upcoming hazards while driving"
          icon="microphone"
          delay={240}
          onPress={() => setVoiceWarningsEnabled(!voiceWarningsEnabled)}
          right={
            <Switch
              value={voiceWarningsEnabled}
              onValueChange={setVoiceWarningsEnabled}
              color="#4ECDC4"
            />
          }
        />

        <SettingCard
          title="Haptic Alerts"
          subtitle="Vibration feedback for high-priority warnings"
          icon="vibrate"
          delay={300}
          onPress={() => setHapticAlertsEnabled(!hapticAlertsEnabled)}
          right={
            <Switch
              value={hapticAlertsEnabled}
              onValueChange={setHapticAlertsEnabled}
              color="#4ECDC4"
            />
          }
        />

        <SettingCard
          title="Keep Screen Awake"
          subtitle="Prevents screen lock while driving mode is active"
          icon="cellphone-lock"
          delay={360}
          onPress={() => setKeepAwakeWhileDriving(!keepAwakeWhileDriving)}
          right={
            <Switch
              value={keepAwakeWhileDriving}
              onValueChange={setKeepAwakeWhileDriving}
              color="#4ECDC4"
            />
          }
        />

        <Animated.View entering={FadeInUp.delay(420).duration(ANIMATION_TIMING.BASE)}>
          <LinearGradient
            colors={['rgba(8, 17, 34, 0.95)', 'rgba(8, 13, 24, 0.82)']}
            style={styles.settingCard}
          >
            <View style={styles.quickRow}>
              <TouchableOpacity style={styles.quickButton} onPress={handlePreviewAlert}>
                <MaterialCommunityIcons name="bullhorn" size={16} color="#4ECDC4" />
                <Text style={styles.quickButtonText}>Preview Alert</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickButton, styles.quickButtonDanger]}
                onPress={handleResetDefaults}
              >
                <MaterialCommunityIcons name="restore" size={16} color="#F97373" />
                <Text style={[styles.quickButtonText, styles.quickButtonDangerText]}>
                  Reset Defaults
                </Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Animated.View>

        <Text style={styles.footerHint}>
          Settings are stored on device. Distance unit syncs to profile when logged in.
        </Text>

        <View style={styles.adContainer}>
          <AdBanner />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#02040A',
  },
  backgroundOrb: {
    position: 'absolute',
  },
  backgroundOrbA: {
    top: -90,
    right: -120,
    backgroundColor: 'rgba(56, 189, 248, 0.35)',
  },
  backgroundOrbB: {
    bottom: 120,
    left: -70,
    backgroundColor: 'rgba(34, 197, 94, 0.28)',
  },
  header: {
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  headerTitle: {
    color: 'white',
    fontSize: 34,
    fontWeight: '900',
    marginLeft: 10,
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    color: '#8FA2BF',
    marginLeft: 14,
    marginTop: 4,
    marginBottom: 10,
    fontSize: 13,
  },
  content: {
    paddingHorizontal: 18,
  },
  settingCard: {
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.24)',
    overflow: 'hidden',
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  settingIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.35)',
    backgroundColor: 'rgba(78, 205, 196, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  settingIcon: {
    marginRight: 0,
  },
  settingCopy: {
    flex: 1,
  },
  settingLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  settingSubLabel: {
    color: '#8FA2BF',
    fontSize: 12,
    marginTop: 3,
  },
  settingBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  valuePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(78, 205, 196, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.4)',
  },
  settingValue: {
    color: '#6EE7E3',
    fontSize: 12,
    fontWeight: '700',
  },
  volumeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  volumeChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  volumeChipActive: {
    backgroundColor: 'rgba(78, 205, 196, 0.25)',
    borderColor: 'rgba(78, 205, 196, 0.8)',
  },
  volumeChipText: {
    color: '#AFC4DE',
    fontSize: 12,
    fontWeight: '700',
  },
  volumeChipTextActive: {
    color: '#6EE7E3',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  quickButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.35)',
    backgroundColor: 'rgba(10, 20, 36, 0.95)',
    paddingVertical: 11,
  },
  quickButtonDanger: {
    borderColor: 'rgba(249, 115, 115, 0.45)',
    backgroundColor: 'rgba(34, 11, 15, 0.88)',
  },
  quickButtonText: {
    color: '#6EE7E3',
    fontSize: 12,
    fontWeight: '700',
  },
  quickButtonDangerText: {
    color: '#FCA5A5',
  },
  footerHint: {
    color: '#7A91AF',
    fontSize: 12,
    paddingHorizontal: 2,
    marginTop: 2,
  },
  adContainer: {
    marginTop: 12,
    marginBottom: 6,
    alignItems: 'center',
  },
});

export default RadarSettingsScreen;

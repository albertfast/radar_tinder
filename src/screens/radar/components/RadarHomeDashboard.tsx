import React from 'react';
import {
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { formatDistance, formatSpeed } from '../../../utils/format';
import { getResponsiveHeight } from '../../../constants/layout';
import AdBanner from '../../../components/AdBanner';

const RADAR_LOOP_GIF = require('../../../../assets/radar_loopnice_transparent.gif');

type ProFeature = {
  title: string;
  subtitle: string;
  icon: string;
  color: string;
};

type RadarHomeDashboardProps = {
  styles: any;
  insetsTop: number;
  tabBarInset: number;
  width: number;
  proSliderRef: React.RefObject<FlatList | null>;
  proSliderIndex: number;
  proFeatures: ProFeature[];
  radarAuraSize: number;
  radarAnimationSize: number;
  closestRadar: any;
  nearestRadarSummary: string;
  currentSpeed: number;
  unitSystem: 'imperial' | 'metric';
  voicePlaybackEnabled: boolean;
  hasHydrated: boolean;
  hapticAlertsEnabled: boolean;
  alertModeLabel: string;
  voiceWarningsEnabled: boolean;
  canUsePro: boolean;
  onOpenDrawer: () => void;
  onOpenProfile: () => void;
  onNavigateSubscription: () => void;
  onToggleDrivingMode: () => void;
  onOpenDriveBasic: () => void;
  onOpenAlerts: () => void;
  onToggleVoiceWarnings: () => void;
  showHomeAd: boolean;
};

type StatPillProps = {
  styles: any;
  icon: any;
  label: string;
  value: string;
  accent?: string;
};

const StatPill = ({
  styles,
  icon,
  label,
  value,
  accent = '#4ECDC4',
}: StatPillProps) => {
  return (
    <View style={[styles.statCard, { borderColor: `${accent}40`, backgroundColor: `${accent}12` }]}>
      <View style={[styles.statIcon, { backgroundColor: `${accent}26` }]}>
        <MaterialCommunityIcons name={icon} size={18} color={accent} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
};

const ProSlideItem = ({
  item,
  width,
  styles,
  onNavigateSubscription,
}: {
  item: ProFeature;
  width: number;
  styles: any;
  onNavigateSubscription: () => void;
}) => (
  <View
    style={{
      width: width - 40,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
    }}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={[styles.proIconBox, { backgroundColor: `${item.color}20` }]}> 
        <MaterialCommunityIcons name={item.icon as any} size={20} color={item.color} />
      </View>
      <View style={{ marginLeft: 12 }}>
        <Text style={{ color: 'white', fontWeight: 'bold' }}>{item.title}</Text>
        <Text style={{ color: '#aaa', fontSize: 11 }}>{item.subtitle}</Text>
      </View>
    </View>
    <TouchableOpacity
      style={{ backgroundColor: item.color, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 }}
      onPress={onNavigateSubscription}
    >
      <Text style={{ fontSize: 10, fontWeight: 'bold', color: 'black' }}>UPGRADE</Text>
    </TouchableOpacity>
  </View>
);

export function RadarHomeDashboard({
  styles,
  insetsTop,
  tabBarInset,
  width,
  proSliderRef,
  proSliderIndex,
  proFeatures,
  radarAuraSize,
  radarAnimationSize,
  closestRadar,
  nearestRadarSummary,
  currentSpeed,
  unitSystem,
  voicePlaybackEnabled,
  hasHydrated,
  hapticAlertsEnabled,
  alertModeLabel,
  voiceWarningsEnabled,
  canUsePro,
  onOpenDrawer,
  onOpenProfile,
  onNavigateSubscription,
  onToggleDrivingMode,
  onOpenDriveBasic,
  onOpenAlerts,
  onToggleVoiceWarnings,
  showHomeAd,
}: RadarHomeDashboardProps) {
  const homeBottomInset = tabBarInset + Math.max(28, Math.round(width * 0.08));
  const isCompactWidth = width <= 420;
  const heroVerticalPadding = isCompactWidth ? 10 : 14;
  const heroTopMargin = isCompactWidth ? 2 : 6;
  const buttonBottomSpacing = isCompactWidth ? getResponsiveHeight(8) : getResponsiveHeight(10);
  const contentBottomPadding = Math.max(
    homeBottomInset,
    showHomeAd ? getResponsiveHeight(82) : getResponsiveHeight(52)
  );
  const quickPanelMinHeight = Math.max(
    getResponsiveHeight(118),
    Math.round(tabBarInset * (showHomeAd ? 0.96 : 0.86))
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F172A', '#020617']} style={StyleSheet.absoluteFill} />

      <View style={[styles.mainHeader, { paddingTop: insetsTop + 10 }]}> 
        <TouchableOpacity onPress={onOpenDrawer} style={styles.iconBtn}>
          <MaterialCommunityIcons name="menu" size={28} color="#F8FAFC" />
        </TouchableOpacity>

        <Text style={styles.appName}>
          RADAR <Text style={{ color: '#FF5252' }}>TINDER</Text>
        </Text>

        <View style={styles.headerRight}>
          <TouchableOpacity onPress={onOpenProfile} style={styles.iconBtn}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: '#334155',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <MaterialCommunityIcons name="account" size={18} color="#94A3B8" />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: contentBottomPadding }}
        showsVerticalScrollIndicator={false}
        scrollEnabled
      >
        {!canUsePro && (
          <View style={styles.sliderContainer}>
            <LinearGradient colors={['#111827', '#0B1224']} style={styles.sliderGradient}>
              <FlatList
                ref={proSliderRef}
                data={proFeatures}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                getItemLayout={(_, index) => ({
                  length: width - 40,
                  offset: (width - 40) * index,
                  index,
                })}
                onScrollToIndexFailed={({ index }) => {
                  proSliderRef.current?.scrollToOffset({
                    offset: (width - 40) * Math.max(0, Math.min(index, proFeatures.length - 1)),
                    animated: true,
                  });
                }}
                renderItem={({ item }) => (
                  <ProSlideItem
                    item={item}
                    width={width}
                    styles={styles}
                    onNavigateSubscription={onNavigateSubscription}
                  />
                )}
                keyExtractor={(item) => item.title}
              />
              <View style={styles.pager}>
                {proFeatures.map((_, i) => (
                  <View
                    key={i}
                    style={[styles.dot, i === proSliderIndex ? { backgroundColor: '#4ECDC4', width: 16 } : {}]}
                  />
                ))}
              </View>
            </LinearGradient>
          </View>
        )}

        {showHomeAd ? (
          <View
            style={[
              styles.homeAdContainer,
              { minHeight: 62, justifyContent: 'center' },
            ]}
          >
            <AdBanner />
          </View>
        ) : null}

        <View style={[styles.heroCard, { marginTop: heroTopMargin, paddingVertical: heroVerticalPadding }]}>
          <LinearGradient
            colors={['#0B1224', '#08101f']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroGlowPrimary} />
          <View style={styles.heroGlowSecondary} />

          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroEyebrow}>Immersive radar</Text>
              <Text style={styles.heroTitle}>Live 3D Radar</Text>
            </View>
            <View style={styles.heroActions}>
              <View style={styles.heroBadge}>
                <MaterialCommunityIcons name="cube-scan" size={18} color="#0B1424" />
                <Text style={styles.heroBadgeText}>3D</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.voicePill,
                  voiceWarningsEnabled ? styles.voicePillOn : styles.voicePillOff,
                ]}
                onPress={onToggleVoiceWarnings}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons
                  name={voiceWarningsEnabled ? 'volume-high' : 'volume-mute'}
                  size={16}
                  color={voiceWarningsEnabled ? '#0B1424' : '#E2E8F0'}
                />
                <Text
                  style={[
                    styles.voicePillText,
                    voiceWarningsEnabled ? styles.voicePillTextOn : styles.voicePillTextOff,
                  ]}
                >
                  {voiceWarningsEnabled ? 'Mute' : 'Unmute'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.radarShell}>
            <View
              style={[
                styles.radarAura,
                {
                  width: radarAuraSize,
                  height: radarAuraSize,
                  borderRadius: radarAuraSize / 2,
                },
              ]}
            />
            <View
              style={{
                position: 'absolute',
                width: Math.round(radarAnimationSize * 1.06),
                height: Math.round(radarAnimationSize * 1.06),
                borderRadius: Math.round(radarAnimationSize * 0.53),
                backgroundColor: 'rgba(78,205,196,0.08)',
                borderWidth: 1,
                borderColor: 'rgba(56,189,248,0.10)',
              }}
            />
            <View
              style={{
                width: radarAnimationSize,
                height: radarAnimationSize,
                borderRadius: radarAnimationSize / 2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  width: Math.round(radarAnimationSize * 0.72),
                  height: Math.round(radarAnimationSize * 0.72),
                  borderRadius: Math.round(radarAnimationSize * 0.36),
                  backgroundColor: 'rgba(3,20,37,0.92)',
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  width: Math.round(radarAnimationSize * 0.28),
                  height: Math.round(radarAnimationSize * 0.28),
                  borderRadius: Math.round(radarAnimationSize * 0.14),
                  backgroundColor: 'rgba(78,205,196,0.14)',
                  shadowColor: '#4ECDC4',
                  shadowOpacity: 0.45,
                  shadowRadius: 24,
                  elevation: 10,
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  width: Math.round(radarAnimationSize * 0.16),
                  height: Math.round(radarAnimationSize * 0.16),
                  borderRadius: Math.round(radarAnimationSize * 0.08),
                  backgroundColor: 'rgba(255,179,71,0.12)',
                }}
              />
              <Image
                source={RADAR_LOOP_GIF}
                style={{
                  width: Math.round(radarAnimationSize * 1.22),
                  height: Math.round(radarAnimationSize * 1.22),
                  opacity: 0.92,
                }}
                resizeMode="contain"
              />
            </View>
            <View style={[styles.radarChip, styles.radarChipLeft]}>
              <MaterialCommunityIcons name="radar" size={18} color="#4ECDC4" />
              <Text style={styles.radarChipText}>Live sweep</Text>
            </View>
            <View style={[styles.radarChip, styles.radarChipRight]}>
              <MaterialCommunityIcons
                name={closestRadar ? 'map-marker-distance' : 'map-search'}
                size={18}
                color={closestRadar ? '#FFB347' : '#94A3B8'}
              />
              <Text style={styles.radarChipText}>
                {closestRadar ? formatDistance(closestRadar.distance, unitSystem) : 'Scanning'}
              </Text>
            </View>
          </View>

          <View style={styles.statRow}>
            <StatPill styles={styles} icon="map-marker-distance" label="Nearest radar" value={nearestRadarSummary} accent="#4ECDC4" />
            <StatPill styles={styles} icon="speedometer" label="Speed" value={formatSpeed(currentSpeed, unitSystem)} accent="#FF5252" />
            <StatPill
              styles={styles}
              icon={
                voicePlaybackEnabled
                  ? 'bell-ring'
                  : hasHydrated && hapticAlertsEnabled
                    ? 'vibrate'
                    : 'bell-off'
              }
              label="Alert mode"
              value={alertModeLabel}
              accent="#38BDF8"
            />
          </View>

          <TouchableOpacity
            style={[styles.startButton, { marginBottom: buttonBottomSpacing }]}
            onPress={onToggleDrivingMode}
          >
            <LinearGradient
              colors={['#FF6B6B', '#FF5252']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.startButtonGradient}
            >
              <View>
                <Text style={styles.startText}>START DRIVING</Text>
                <Text style={styles.startSubtext}>3D radar, live alerts and routing</Text>
              </View>
              <View style={styles.startBadge}>
                <MaterialCommunityIcons name="steering" size={20} color="#0B1424" />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <View style={[styles.homeQuickPanel, { minHeight: quickPanelMinHeight }]}>
            <View style={styles.homeQuickRow}>
              <TouchableOpacity
                style={[styles.homeQuickButton, styles.homeQuickButtonPrimary]}
                onPress={onOpenDriveBasic}
                activeOpacity={0.86}
              >
                <MaterialCommunityIcons name="radar" size={18} color="#4ECDC4" />
                <Text style={styles.homeQuickButtonText}>Drive Basic</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.homeQuickButton}
                onPress={onOpenAlerts}
                activeOpacity={0.86}
              >
                <MaterialCommunityIcons name="bell-alert-outline" size={18} color="#38BDF8" />
                <Text style={styles.homeQuickButtonText}>Alerts</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.homeQuickMeta}>
              {closestRadar
                ? `Nearest radar: ${nearestRadarSummary}`
                : 'No nearby radars detected yet.'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

import React from 'react';
import {
  FlatList,
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
import { RadarAnimation } from '../../../components/RadarAnimation';

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
  onOpenDrawer: () => void;
  onOpenProfile: () => void;
  onNavigateSubscription: () => void;
  onToggleDrivingMode: () => void;
};

type StatPillProps = {
  styles: any;
  icon: any;
  label: string;
  value: string;
  accent?: string;
};

const StatPill = ({ styles, icon, label, value, accent = '#4ECDC4' }: StatPillProps) => (
  <View style={[styles.statCard, { borderColor: `${accent}40`, backgroundColor: `${accent}12` }]}>
    <View style={[styles.statIcon, { backgroundColor: `${accent}26` }]}>
      <MaterialCommunityIcons name={icon} size={18} color={accent} />
    </View>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

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
  onOpenDrawer,
  onOpenProfile,
  onNavigateSubscription,
  onToggleDrivingMode,
}: RadarHomeDashboardProps) {
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
        contentContainerStyle={{ paddingBottom: tabBarInset + getResponsiveHeight(150) }}
        showsVerticalScrollIndicator={false}
        scrollEnabled
      >
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

        <View style={styles.homeAdContainer}>
          <AdBanner />
        </View>

        <View style={[styles.heroCard, { marginTop: 6, paddingVertical: 14 }]}>
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
            <View style={styles.heroBadge}>
              <MaterialCommunityIcons name="cube-scan" size={18} color="#0B1424" />
              <Text style={styles.heroBadgeText}>3D</Text>
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
            <RadarAnimation size={radarAnimationSize} />
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
            style={[styles.startButton, { marginBottom: Math.max(tabBarInset + getResponsiveHeight(24), getResponsiveHeight(112)) }]}
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
        </View>
      </ScrollView>
    </View>
  );
}

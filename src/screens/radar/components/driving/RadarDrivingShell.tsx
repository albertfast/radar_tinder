import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { RadarAlert, RadarLocation } from '../../../../types';
import { formatDistance } from '../../../../utils/format';
import { TabType } from '../../types';
import { radarScreenStyles as styles } from '../../styles/radarScreenStyles';
import {
  formatRadarSpeedLimitText,
  formatRadarTimingText,
  formatRadarTypeLabel,
  getRadarDisplayLocation,
} from '../../../../utils/radarAlerts';

type IncidentOption = {
  id: 'radar' | 'police' | 'crash' | 'roadwork' | 'missed';
  label: string;
  emoji: string;
  icon: string;
  color: string;
  reportType: RadarLocation['type'];
  reportTag?: 'default' | 'missed_camera';
};

const INCIDENT_OPTIONS: IncidentOption[] = [
  {
    id: 'radar',
    label: 'Radar',
    emoji: '📸',
    icon: 'camera',
    color: '#22D3EE',
    reportType: 'speed_camera',
  },
  {
    id: 'police',
    label: 'Police',
    emoji: '👮',
    icon: 'police-badge',
    color: '#3B82F6',
    reportType: 'police',
  },
  {
    id: 'crash',
    label: 'Crash',
    emoji: '🚨',
    icon: 'car-emergency',
    color: '#FB7185',
    reportType: 'traffic_enforcement',
  },
  {
    id: 'roadwork',
    label: 'Road Work',
    emoji: '🚧',
    icon: 'traffic-cone',
    color: '#F59E0B',
    reportType: 'mobile',
  },
  {
    id: 'missed',
    label: 'Missed Camera',
    emoji: '🎯',
    icon: 'cctv',
    color: '#F97316',
    reportType: 'speed_camera',
    reportTag: 'missed_camera',
  },
];

type RadarDrivingShellProps = {
  insetsTop: number;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  canUsePro: boolean;
  onOpenSubscription: () => void;
  onExitHome: () => void;
  onOpenSettings: () => void;
  isNavigationStarted: boolean;
  isMapNavigationActive: boolean;
  activeAlert: RadarAlert | null;
  unitSystem: 'metric' | 'imperial';
  acknowledgeAlert: (id: string) => void;
  routeCoords: any[];
  routeMetaDestinationLabel?: string;
  navInstruction?: string;
  navDistanceLabel?: string;
  hasArrived: boolean;
  onEndTrip: () => void;
  basicContent: React.ReactNode;
  mapContent: React.ReactNode;
  graphicContent: React.ReactNode;
  floatingFabBottom: number;
  reportModalVisible: boolean;
  setReportModalVisible: (visible: boolean) => void;
  onReportRadar: (type: RadarLocation['type'], reportTag?: 'default' | 'missed_camera') => void;
};

export function RadarDrivingShell({
  insetsTop,
  activeTab,
  setActiveTab,
  canUsePro,
  onOpenSubscription,
  onExitHome,
  onOpenSettings,
  isNavigationStarted,
  isMapNavigationActive,
  activeAlert,
  unitSystem,
  acknowledgeAlert,
  routeCoords,
  routeMetaDestinationLabel,
  navInstruction,
  navDistanceLabel,
  hasArrived,
  onEndTrip,
  basicContent,
  mapContent,
  graphicContent,
  floatingFabBottom,
  reportModalVisible,
  setReportModalVisible,
  onReportRadar,
}: RadarDrivingShellProps) {
  const showFloatingFab = activeTab !== 'Map';

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#1A1A1A']} style={StyleSheet.absoluteFill} />

      <View style={[styles.drivingHeader, { paddingTop: insetsTop + 8 }]}>
        <IconButton icon="home-variant" iconColor="#fff" size={28} onPress={onExitHome} />
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.drivingModeTitle}>DRIVING MODE</Text>
          <Text style={styles.drivingModeSub}>MAP</Text>
        </View>
        <IconButton icon="cog" iconColor="#fff" onPress={onOpenSettings} />
      </View>

      {hasArrived && activeTab !== 'Map' ? (
        <Animated.View
          style={styles.navigationProgress}
          entering={FadeInUp.duration(300)}
        >
          <View style={styles.progressIcon}>
            <MaterialCommunityIcons name="flag-checkered" size={18} color="#4ECDC4" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.progressTitle}>You have arrived</Text>
            <Text style={styles.progressSubtitle}>End the trip when parked safely.</Text>
          </View>
          <TouchableOpacity style={styles.arrivedEndTripButton} onPress={onEndTrip}>
            <Text style={styles.arrivedEndTripText}>End Trip</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : activeAlert && routeCoords.length > 0 ? (
        <Animated.View
          style={styles.liveAlertBanner}
          entering={FadeInUp.duration(300)}
        >
          <View style={styles.liveAlertIcon}>
            <MaterialCommunityIcons name="alert" size={18} color="#FF5252" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.liveAlertTitle}>
              {activeAlert.type ? formatRadarTypeLabel(activeAlert.type) : 'Alert'}
            </Text>
            <Text style={styles.liveAlertSubtitle}>
              {formatDistance(activeAlert.distance, unitSystem)}
              {getRadarDisplayLocation(activeAlert.locationLabel, 'full')
                ? ` • ${getRadarDisplayLocation(activeAlert.locationLabel, 'full')}`
                : ''}
              {formatRadarSpeedLimitText(activeAlert, unitSystem)
                ? ` • ${formatRadarSpeedLimitText(activeAlert, unitSystem)}`
                : ''}
              {' • '}
              {formatRadarTimingText(activeAlert)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => acknowledgeAlert(activeAlert.id)}
            style={styles.liveAlertDismiss}
          >
            <MaterialCommunityIcons name="close" size={16} color="#94A3B8" />
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      <View style={styles.tabBar}>
        {(['Basic', 'Map', 'Graphic'] as TabType[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabItem, activeTab === tab && styles.activeTabItem]}
            onPress={() => {
              if (tab === 'Graphic' && !canUsePro) {
                onOpenSubscription();
                return;
              }
              setActiveTab(tab);
            }}
          >
            <Text style={[styles.tabText, activeTab === tab && { color: '#FF5252' }]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, display: activeTab === 'Basic' ? 'flex' : 'none' }}>
          {basicContent}
        </View>
        <View style={{ flex: 1, display: activeTab === 'Map' ? 'flex' : 'none' }}>
          {mapContent}
        </View>
        <View style={{ flex: 1, display: activeTab === 'Graphic' ? 'flex' : 'none' }}>
          {graphicContent}
        </View>
      </View>

      {showFloatingFab ? (
        <TouchableOpacity
          style={[styles.fab, { bottom: floatingFabBottom }]}
          onPress={() => setReportModalVisible(true)}
        >
          <MaterialCommunityIcons name="plus" size={32} color="white" />
        </TouchableOpacity>
      ) : null}

      <Modal visible={reportModalVisible} transparent animationType="slide">
        <BlurView intensity={20} style={StyleSheet.absoluteFill}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setReportModalVisible(false)} />
          <View style={styles.reportSheet}>
            <Text style={styles.sheetTitle}>Add Incident</Text>
            <Text style={{ color: '#94A3B8', textAlign: 'center', marginTop: 8, marginBottom: 18 }}>
              Tap only if it is safe.
            </Text>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                rowGap: 14,
              }}
            >
              {INCIDENT_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  onPress={() => onReportRadar(option.reportType, option.reportTag || 'default')}
                  style={{
                    width: '48%',
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: 'rgba(148,163,184,0.2)',
                    backgroundColor: 'rgba(15,23,42,0.92)',
                    paddingVertical: 16,
                    paddingHorizontal: 12,
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <View
                    style={[
                      styles.reportIconBig,
                      {
                        backgroundColor: `${option.color}20`,
                        width: 62,
                        height: 62,
                        borderRadius: 20,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name={option.icon as any} size={30} color={option.color} />
                  </View>
                  <Text style={{ color: '#E2E8F0', fontWeight: '700', fontSize: 15 }}>
                    {option.label} {option.emoji}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </BlurView>
      </Modal>
    </View>
  );
}

export type { RadarDrivingShellProps };

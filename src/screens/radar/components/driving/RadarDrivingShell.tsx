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

type RadarDrivingShellProps = {
  insetsTop: number;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  canUsePro: boolean;
  onOpenSubscription: () => void;
  onExitHome: () => void;
  onOpenSettings: () => void;
  isMapNavigationActive: boolean;
  activeAlert: RadarAlert | null;
  unitSystem: 'metric' | 'imperial';
  acknowledgeAlert: (id: string) => void;
  routeCoords: any[];
  routeMetaDestinationLabel?: string;
  navInstruction?: string;
  navDistanceLabel?: string;
  basicContent: React.ReactNode;
  mapContent: React.ReactNode;
  graphicContent: React.ReactNode;
  floatingFabBottom: number;
  reportModalVisible: boolean;
  setReportModalVisible: (visible: boolean) => void;
  onReportRadar: (type: RadarLocation['type']) => void;
};

export function RadarDrivingShell({
  insetsTop,
  activeTab,
  setActiveTab,
  canUsePro,
  onOpenSubscription,
  onExitHome,
  onOpenSettings,
  isMapNavigationActive,
  activeAlert,
  unitSystem,
  acknowledgeAlert,
  routeCoords,
  routeMetaDestinationLabel,
  navInstruction,
  navDistanceLabel,
  basicContent,
  mapContent,
  graphicContent,
  floatingFabBottom,
  reportModalVisible,
  setReportModalVisible,
  onReportRadar,
}: RadarDrivingShellProps) {
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

      {activeAlert ? (
        <Animated.View
          style={styles.liveAlertBanner}
          entering={FadeInUp.duration(300)}
        >
          <View style={styles.liveAlertIcon}>
            <MaterialCommunityIcons name="alert" size={18} color="#FF5252" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.liveAlertTitle}>{activeAlert.type ? formatAlertType(activeAlert.type) : 'Alert'}</Text>
            <Text style={styles.liveAlertSubtitle}>
              {formatDistance(activeAlert.distance, unitSystem)}
              {activeAlert.locationLabel
                ? ` • ${activeAlert.locationLabel.split(',').slice(0, 2).join(', ')}`
                : ''}
              {' • '}
              ETA {Math.max(1, Math.round(activeAlert.estimatedTime * 60))} min
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => acknowledgeAlert(activeAlert.id)}
            style={styles.liveAlertDismiss}
          >
            <MaterialCommunityIcons name="close" size={16} color="#94A3B8" />
          </TouchableOpacity>
        </Animated.View>
      ) : (
        routeCoords.length > 0 &&
        !isMapNavigationActive && (
          <Animated.View
            style={styles.navigationProgress}
            entering={FadeInUp.duration(300)}
          >
            <View style={styles.progressIcon}>
              <MaterialCommunityIcons name="navigation" size={18} color="#4ECDC4" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.progressTitle}>{routeMetaDestinationLabel || 'Navigation Active'}</Text>
              <Text style={styles.progressSubtitle}>{navInstruction || 'Following route...'}</Text>
            </View>
            <View style={styles.progressDistance}>
              <Text style={styles.progressDistanceText}>{navDistanceLabel || ''}</Text>
            </View>
          </Animated.View>
        )
      )}

      {!isMapNavigationActive && (
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
      )}

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

      <TouchableOpacity
        style={[styles.fab, { bottom: floatingFabBottom }]}
        onPress={() => setReportModalVisible(true)}
      >
        <MaterialCommunityIcons name="plus" size={32} color="white" />
      </TouchableOpacity>

      <Modal visible={reportModalVisible} transparent animationType="slide">
        <BlurView intensity={20} style={StyleSheet.absoluteFill}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setReportModalVisible(false)} />
          <View style={styles.reportSheet}>
            <Text style={styles.sheetTitle}>Report Hazard</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginVertical: 20 }}>
              <TouchableOpacity onPress={() => onReportRadar('police')} style={{ alignItems: 'center' }}>
                <View style={[styles.reportIconBig, { backgroundColor: '#FF5252' }]}>
                  <MaterialCommunityIcons name="police-badge" size={30} color="white" />
                </View>
                <Text style={{ color: 'white', marginTop: 8 }}>Police</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => onReportRadar('speed_camera')} style={{ alignItems: 'center' }}>
                <View style={[styles.reportIconBig, { backgroundColor: '#2196F3' }]}>
                  <MaterialCommunityIcons name="camera" size={30} color="white" />
                </View>
                <Text style={{ color: 'white', marginTop: 8 }}>Camera</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>
    </View>
  );
}

function formatAlertType(type?: RadarAlert['type']) {
  switch (type) {
    case 'red_light':
      return 'Red Light Camera';
    case 'fixed':
      return 'Fixed Camera';
    case 'mobile':
      return 'Mobile Radar';
    case 'police':
      return 'Police';
    case 'traffic_enforcement':
      return 'Traffic Enforcement';
    case 'speed_camera':
    default:
      return 'Speed Camera';
  }
}

export type { RadarDrivingShellProps };

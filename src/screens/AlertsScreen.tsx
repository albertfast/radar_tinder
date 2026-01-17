import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInUp,
  SlideInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
  Extrapolate
} from 'react-native-reanimated';
import { useRadarStore } from '../store/radarStore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { DatabaseService } from '../services/DatabaseService';
import { RadarAlert } from '../types';
import { formatDistance } from '../utils/format';
import { ANIMATION_TIMING, STAGGER_DELAYS } from '../utils/animationConstants';
import { HapticPatterns } from '../utils/hapticFeedback';

const allowLayoutAnimations = Platform.OS !== 'android';

const formatAlertType = (type?: RadarAlert['type']) => {
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
};

const AlertCard3D = ({
  alert,
  unitSystem,
  onAcknowledge,
}: {
  alert: RadarAlert;
  unitSystem: 'metric' | 'imperial';
  onAcknowledge: (id: string) => void;
}) => {
  const offset = useSharedValue(50);
  const rotation = useSharedValue(10);

  useEffect(() => {
    offset.value = withSpring(0, { damping: 12, stiffness: 90 });
    rotation.value = withSpring(0, { damping: 12, stiffness: 90 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: offset.value },
      { perspective: 1000 },
      { rotateX: `${rotation.value}deg` },
      { scale: interpolate(offset.value, [0, 50], [1, 0.9], Extrapolate.CLAMP) },
    ],
    opacity: interpolate(offset.value, [0, 50], [1, 0], Extrapolate.CLAMP),
  }));

  const distanceLabel = formatDistance(alert.distance, unitSystem);
  const etaMinutes = Number.isFinite(alert.estimatedTime)
    ? Math.max(1, Math.round(alert.estimatedTime * 60))
    : null;
  const timeLabel = alert.createdAt instanceof Date ? alert.createdAt.toLocaleTimeString() : '';
  const label = formatAlertType(alert.type);
  const severityColor = alert.severity === 'high' ? '#FF5252' : '#4ECDC4';

  return (
    <Animated.View style={[styles.alertWrapper, animatedStyle]}>
      <Surface style={styles.alertCard} elevation={4}>
        <LinearGradient
          colors={['#1C1C1E', '#252525']}
          style={styles.cardGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={[styles.alertLeftBar, { backgroundColor: severityColor }]} />
          <View style={styles.alertContent}>
            <View style={styles.alertHeader}>
              <View style={[styles.alertIconContainer, { shadowColor: severityColor, shadowOpacity: 0.5, shadowRadius: 10 }]}>
                <MaterialCommunityIcons name="alert" size={26} color={severityColor} />
              </View>
              <View style={styles.alertTitleContainer}>
                <Text style={styles.alertTitle}>{label}</Text>
                <Text style={styles.alertSubtitle}>{distanceLabel} away</Text>
              </View>
              <TouchableOpacity style={styles.okButton} onPress={() => onAcknowledge(alert.id)}>
                <Text style={styles.okButtonText}>OK</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.alertFooter}>
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="clock-outline" size={14} color="#666" />
                <Text style={styles.alertMeta}>
                  {' '}
                  ETA: {etaMinutes ? `${etaMinutes} min` : '--'}
                </Text>
              </View>
              <Text style={styles.alertMeta}>{timeLabel}</Text>
            </View>
          </View>
        </LinearGradient>
      </Surface>
    </Animated.View>
  );
};

const AlertsScreen = ({ navigation }: any) => {
  const { activeAlerts, acknowledgeAlert, clearAlerts } = useRadarStore();
  const { user } = useAuthStore();
  const { unitSystem } = useSettingsStore();
  const [historyAlerts, setHistoryAlerts] = useState<RadarAlert[]>([]);

  const visibleAlerts = useMemo(
    () => activeAlerts.filter((alert) => !alert.acknowledged),
    [activeAlerts]
  );

  useEffect(() => {
    const loadHistory = async () => {
      if (!user) return;
      try {
        const history = await DatabaseService.getAlerts(user.id);
        setHistoryAlerts(history.slice(0, 15));
      } catch (error) {
        console.warn('Failed to load alert history:', error);
      }
    };

    loadHistory();
  }, [user?.id, activeAlerts.length]);

  return (
    <Animated.View 
      style={styles.container}
      entering={SlideInUp.duration(ANIMATION_TIMING.SLOW)}
    >
      <LinearGradient colors={['#000000', '#121212']} style={styles.background} />

      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            HapticPatterns.light();
            navigation.goBack();
          }} 
          style={{ marginRight: 15 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={32} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Alerts</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => {
          HapticPatterns.medium();
          clearAlerts();
        }}>
          <Text style={styles.clearAllText}>Clear All</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Active Alerts ({visibleAlerts.length})</Text>

        {visibleAlerts.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="bell-check" size={22} color="#4ECDC4" />
            <Text style={styles.emptyTitle}>No active alerts</Text>
            <Text style={styles.emptySubtitle}>
              Alerts appear as live banners while driving.
            </Text>
          </View>
        ) : (
          visibleAlerts.map((alert) => (
            <AlertCard3D
              key={alert.id}
              alert={alert}
              unitSystem={unitSystem}
              onAcknowledge={acknowledgeAlert}
            />
          ))
        )}

        <Text style={[styles.sectionTitle, { marginTop: 30 }]}>Alert History</Text>
        {historyAlerts.length === 0 ? (
          <Text style={styles.emptyHistoryText}>No saved alerts yet.</Text>
        ) : (
          historyAlerts.map((alert, index) => (
            <Animated.View
              key={alert.id}
              entering={allowLayoutAnimations ? FadeInUp.delay(ANIMATION_TIMING.BASE + index * STAGGER_DELAYS.ITEM_BASE).duration(ANIMATION_TIMING.BASE) : undefined}
            >
              <Surface style={styles.historyCard} elevation={1}>
                <View style={styles.historyIcon}>
                  <MaterialCommunityIcons
                    name={alert.severity === 'high' ? 'alert-octagon' : 'alert-circle-outline'}
                    size={24}
                    color="#8E8E93"
                  />
                </View>
                <View style={styles.historyContent}>
                  <Text style={styles.historyTitle}>{formatAlertType(alert.type)}</Text>
                  <Text style={styles.historySubtitle}>
                    {formatDistance(alert.distance, unitSystem)} • {alert.createdAt.toLocaleString()}
                  </Text>
                </View>
              </Surface>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', paddingTop: 50 },
  background: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: 'white' },
  clearAllText: { color: '#FF5252', fontSize: 16, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  sectionTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },

  alertWrapper: { marginBottom: 20 },
  alertCard: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#1C1C1E', transform: [{ perspective: 1000 }] },
  cardGradient: { flexDirection: 'row' },
  alertLeftBar: { width: 6, backgroundColor: '#FF5252' },
  alertContent: { flex: 1, padding: 15 },
  alertHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  alertIconContainer: { marginRight: 15 },
  alertTitleContainer: { flex: 1 },
  alertTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  alertSubtitle: { color: '#8E8E93', fontSize: 14 },
  okButton: { backgroundColor: '#1F2937', paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(78,205,196,0.4)' },
  okButtonText: { color: '#4ECDC4', fontWeight: 'bold', fontSize: 12 },
  alertFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  alertMeta: { color: '#666', fontSize: 12 },

  emptyCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.2)',
    marginBottom: 10,
  },
  emptyTitle: { color: 'white', fontSize: 16, fontWeight: '600', marginTop: 8 },
  emptySubtitle: { color: '#94A3B8', fontSize: 12, marginTop: 4, textAlign: 'center' },

  historyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C1E', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  historyIcon: { marginRight: 15 },
  historyContent: { flex: 1 },
  historyTitle: { color: 'white', fontSize: 16, fontWeight: '600' },
  historySubtitle: { color: '#8E8E93', fontSize: 12, marginTop: 2 },
  emptyHistoryText: { color: '#6B7280', fontSize: 12 },
});

export default AlertsScreen;

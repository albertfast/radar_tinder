import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSettingsStore } from '../store/settingsStore';
import { formatDistance, formatSpeed } from '../utils/format';
import { TAB_BAR_HEIGHT } from '../constants/layout';

const MAX_DISPLAY_SPEED_KPH = 220;

const TripDetailScreen = ({ navigation, route }: any) => {
  const trip = route?.params?.trip;
  const unitSystem = useSettingsStore((state) => state.unitSystem);

  const metrics = useMemo(() => {
    const distanceMeters = Number(trip?.distance || 0);
    const durationSeconds = Number(trip?.duration || 0);
    const distanceKm = distanceMeters / 1000;
    const avgSpeedRaw = Number(trip?.avgSpeedKph);
    const topSpeedRaw = Number(trip?.topSpeedKph);
    const avgSpeedKph =
      Number.isFinite(avgSpeedRaw) && avgSpeedRaw >= 0 && avgSpeedRaw <= MAX_DISPLAY_SPEED_KPH
        ? avgSpeedRaw
        : null;
    const topSpeedKph =
      Number.isFinite(topSpeedRaw) && topSpeedRaw >= 0 && topSpeedRaw <= MAX_DISPLAY_SPEED_KPH
        ? topSpeedRaw
        : null;
    const movingDurationSeconds = Math.max(0, Number(trip?.movingDuration || 0));
    const speedSamplesCount = Math.max(0, Number(trip?.speedSamplesCount || 0));
    const telemetryQuality =
      speedSamplesCount >= 20 ? 'High' : speedSamplesCount >= 5 ? 'Medium' : 'Limited';
    const syncStatus = trip?.userId ? 'Account synced' : 'Pending sync';

    return {
      distanceKm,
      durationSeconds,
      avgSpeedKph,
      topSpeedKph,
      movingDurationSeconds,
      speedSamplesCount,
      telemetryQuality,
      syncStatus,
      score: Number(trip?.score || 0),
    };
  }, [trip]);

  const formatDuration = (seconds: number) => {
    const mins = Math.max(0, Math.round(seconds / 60));
    const hours = Math.floor(mins / 60);
    const remain = mins % 60;
    if (hours <= 0) return `${remain} min`;
    return `${hours}h ${remain}m`;
  };

  const formatOptionalSpeed = (value: number | null) =>
    typeof value === 'number' ? formatSpeed(value, unitSystem) : '—';

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F172A', '#020617']} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={30} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: TAB_BAR_HEIGHT + 24 }}>
        <Surface style={styles.routeCard}>
          <Text style={styles.routeTitle}>Route</Text>
          <Text style={styles.routeLine}>{trip?.startLocation || 'Start not available'}</Text>
          <Text style={styles.routeArrow}>↓</Text>
          <Text style={styles.routeLine}>{trip?.endLocation || 'Destination not available'}</Text>
        </Surface>

        <View style={styles.metricGrid}>
          <MetricTile label="Distance" value={formatDistance(metrics.distanceKm, unitSystem)} icon="map-marker-distance" tone="#4ECDC4" />
          <MetricTile label="Duration" value={formatDuration(metrics.durationSeconds)} icon="clock-outline" tone="#FACC15" />
          <MetricTile label="Avg speed" value={formatOptionalSpeed(metrics.avgSpeedKph)} icon="speedometer" tone="#38BDF8" />
          <MetricTile label="Top speed" value={formatOptionalSpeed(metrics.topSpeedKph)} icon="speedometer-medium" tone="#FB7185" />
          <MetricTile label="Moving time" value={formatDuration(metrics.movingDurationSeconds)} icon="timeline-clock-outline" tone="#A78BFA" />
          <MetricTile label="GPS samples" value={String(metrics.speedSamplesCount)} icon="crosshairs-gps" tone="#34D399" />
        </View>

        <Surface style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Drive Analysis</Text>
          <Text style={styles.summaryText}>Trip score: {metrics.score}/100</Text>
          <Text style={styles.summaryText}>Telemetry quality: {metrics.telemetryQuality}</Text>
          <Text style={styles.summaryText}>Sync status: {metrics.syncStatus}</Text>
        </Surface>
      </ScrollView>
    </View>
  );
};

const MetricTile = ({ label, value, icon, tone }: { label: string; value: string; icon: string; tone: string }) => (
  <Surface style={styles.metricTile}>
    <MaterialCommunityIcons name={icon as any} size={18} color={tone} />
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={[styles.metricValue, { color: tone }]}>{value}</Text>
  </Surface>
);

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  backBtn: { padding: 5 },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: '800' },
  routeCard: {
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
  },
  routeTitle: { color: '#94A3B8', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  routeLine: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
  routeArrow: { color: '#4ECDC4', fontSize: 18, fontWeight: '800', marginVertical: 8 },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginBottom: 14,
  },
  metricTile: {
    width: '48.5%',
    borderRadius: 16,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    gap: 6,
  },
  metricLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  metricValue: { color: '#F8FAFC', fontSize: 20, fontWeight: '800' },
  summaryCard: {
    borderRadius: 18,
    backgroundColor: 'rgba(8,25,48,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.35)',
    padding: 16,
  },
  summaryTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  summaryText: { color: '#CBD5E1', fontSize: 14, lineHeight: 22 },
});

export default TripDetailScreen;

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ANIMATION_TIMING, STAGGER_DELAYS } from '../../utils/animationConstants';
import { BarChart, LineChart, StatCard } from '../../components/AnimatedCharts';
import { SupabaseService } from '../../services/SupabaseService';
import { useAuthStore } from '../../store/authStore';
import { DatabaseService } from '../../services/DatabaseService';
import { useRadarStore } from '../../store/radarStore';
import { useAutoHideTabBar } from '../../hooks/use-auto-hide-tab-bar';
import { TAB_BAR_HEIGHT } from '../../constants/layout';
import { hasProAccess } from '../../utils/access';
import ProGate from '../../components/ProGate';
import AdBanner from '../../components/AdBanner';

interface RadarGraphicViewProps {
  totalDistance: number;
  drivingStartTime: Date | null;
  currentSpeed: number;
  unitSystem: 'metric' | 'imperial';
}

const emptyWeeklyTrips = [
  { day: 'Sun', trips: 0, distance: 0 },
  { day: 'Mon', trips: 0, distance: 0 },
  { day: 'Tue', trips: 0, distance: 0 },
  { day: 'Wed', trips: 0, distance: 0 },
  { day: 'Thu', trips: 0, distance: 0 },
  { day: 'Fri', trips: 0, distance: 0 },
  { day: 'Sat', trips: 0, distance: 0 },
];


export const RadarGraphicView: React.FC<RadarGraphicViewProps> = ({
  totalDistance,
  drivingStartTime,
  currentSpeed,
  unitSystem,
}) => {
  const { user } = useAuthStore();
  const canUse = hasProAccess(user);
  const activeAlerts = useRadarStore((state) => state.activeAlerts);
  const { onScroll, onScrollBeginDrag, onScrollEndDrag } = useAutoHideTabBar();
  const [weeklyData, setWeeklyData] = useState(emptyWeeklyTrips);
  const [speedData, setSpeedData] = useState<Array<{ time: string; speed: number }>>([]);
  const lastSpeedSampleRef = useRef(0);
  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);
  const [weeklyDurationSeconds, setWeeklyDurationSeconds] = useState(0);
  const [weeklyAlertCount, setWeeklyAlertCount] = useState(0);
  const lastRecentIds = useRef<string>('');

  // Load real data from Supabase
  useEffect(() => {
    if (canUse) {
      loadDrivingData();
    }
  }, [user?.id]);

  useEffect(() => {
    if (drivingStartTime) {
      setSpeedData([]);
      lastSpeedSampleRef.current = 0;
    }
  }, [drivingStartTime]);

  useEffect(() => {
    if (!drivingStartTime) return;
    const now = Date.now();
    if (now - lastSpeedSampleRef.current < 5000) return;
    lastSpeedSampleRef.current = now;
    const nowDate = new Date();
    const hh = String(nowDate.getHours()).padStart(2, '0');
    const mm = String(nowDate.getMinutes()).padStart(2, '0');
    const timeLabel = `${hh}:${mm}`;
    const sampleSpeed = Math.max(0, Math.round(currentSpeed));
    setSpeedData((prev) => {
      const next = [...prev, { time: timeLabel, speed: sampleSpeed }];
      return next.slice(-12);
    });
  }, [currentSpeed, drivingStartTime]);

  const loadDrivingData = async () => {
    try {
      
      // Load user's weekly trip statistics
      const trips = await SupabaseService.getUserTrips(user?.id);
      // Group trips by day of week
      const dayMap: { [key: string]: { trips: number; distance: number } } = {};
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
      let durationSeconds = 0;
      
      days.forEach(day => {
        dayMap[day] = { trips: 0, distance: 0 };
      });

      trips.forEach((trip: any) => {
        const date = trip.createdAt ? new Date(trip.createdAt) : null;
        if (!date || Number.isNaN(date.getTime())) return;
        if (date.getTime() < weekStart) return;
        const dayName = days[date.getDay()];
        if (dayMap[dayName]) {
          dayMap[dayName].trips += 1;
          dayMap[dayName].distance += (trip.distance || 0) / 1000; // Convert to km
          durationSeconds += Number(trip.duration || 0);
        }
      });

      const newWeeklyData = days.map(day => ({
        day,
        trips: dayMap[day].trips,
        distance: dayMap[day].distance,
      }));
      setWeeklyData(newWeeklyData);
      setWeeklyDurationSeconds(durationSeconds);

      // Load recent radar alerts/incidents if available
      // Note: This assumes you have a method to fetch recent radar incidents
      // For now, using mock data
      
    } catch (error) {
      console.error('Failed to load driving data:', error);
      // Keep using mock data on error
    }
  };

  const formatTimeAgo = (date?: Date) => {
    if (!date) return 'Just now';
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 60 * 1000) return `${Math.max(1, Math.round(diffMs / 1000))}s ago`;
    if (diffMs < 60 * 60 * 1000) return `${Math.max(1, Math.round(diffMs / (60 * 1000)))}m ago`;
    if (diffMs < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.round(diffMs / (60 * 60 * 1000)))}h ago`;
    const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
    return `${days}d ago`;
  };

  const loadRecentActivity = async () => {
    if (!user?.id) {
      setRecentAlerts([]);
      setWeeklyAlertCount(0);
      return;
    }

    try {
      const history = await DatabaseService.getAlerts(user.id);
      const merged = [...activeAlerts, ...history].reduce((acc: any[], alert: any) => {
        if (acc.find((item) => item.id === alert.id)) return acc;
        acc.push(alert);
        return acc;
      }, []);

      merged.sort((a: any, b: any) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });

      const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const weeklyAlerts = merged.filter((item: any) => {
        const created = item.createdAt ? new Date(item.createdAt).getTime() : 0;
        return created >= weekStart;
      });
      setWeeklyAlertCount(weeklyAlerts.length);

      const activities = merged.slice(0, 6).map((alert: any) => {
        const type = String(alert.type || 'radar');
        const meta = {
          speed_camera: { title: 'Speed Camera', icon: 'radar', color: '#FF5252' },
          police: { title: 'Police Spotted', icon: 'police-badge', color: '#FF6B6B' },
          mobile: { title: 'Mobile Radar', icon: 'car-wrench', color: '#FFB300' },
          red_light: { title: 'Red Light Camera', icon: 'traffic-light', color: '#FF8A65' },
          traffic_enforcement: { title: 'Traffic Enforcement', icon: 'alert-circle', color: '#FFA500' },
          info: { title: 'Driving Session', icon: 'road-variant', color: '#4ECDC4' },
        }[type] || { title: 'Radar Alert', icon: 'alert', color: '#FFA500' };

        const distanceLabel =
          typeof alert.distance === 'number' && Number.isFinite(alert.distance)
            ? `${formatDistance(alert.distance)} away`
            : 'Nearby';

        const createdAt = alert.createdAt instanceof Date
          ? alert.createdAt
          : alert.createdAt
            ? new Date(alert.createdAt)
            : undefined;

        return {
          id: alert.id,
          type,
          title: meta.title,
          location: distanceLabel,
          time: formatTimeAgo(createdAt),
          icon: meta.icon,
          color: meta.color,
        };
      });

      const ids = activities.map((item) => item.id).join('|');
      if (ids !== lastRecentIds.current) {
        setRecentAlerts(activities);
        lastRecentIds.current = ids;
      }
    } catch (error) {
      console.warn('Failed to load recent activity:', error);
    }
  };
  const formatDistance = (km: number) => {
    if (unitSystem === 'imperial') {
      const miles = km * 0.621371;
      return `${miles.toFixed(2)} mi`;
    }
    return `${km.toFixed(2)} km`;
  };

  const formatDuration = (startTime: Date | null) => {
    if (!startTime) return '0m';
    const seconds = Math.floor((Date.now() - startTime.getTime()) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  useEffect(() => {
    if (!canUse) return;
    loadRecentActivity();
  }, [user?.id, activeAlerts.length, canUse]);

  const weeklyStats = {
    totalDistance: weeklyData.reduce((acc, d) => acc + d.distance, 0),
    totalTrips: weeklyData.reduce((acc, d) => acc + d.trips, 0),
    avgSpeed: speedData.length
      ? Math.round(speedData.reduce((acc, d) => acc + d.speed, 0) / speedData.length)
      : 0,
  };

  const weeklyDurationLabel = useMemo(() => {
    if (!weeklyDurationSeconds) return '0h';
    const hours = weeklyDurationSeconds / 3600;
    if (hours < 1) {
      const mins = Math.max(1, Math.round(weeklyDurationSeconds / 60));
      return `${mins}m`;
    }
    return `${hours.toFixed(1)}h`;
  }, [weeklyDurationSeconds]);

  const speedSummary = {
    average: speedData.length
      ? Math.round(speedData.reduce((acc, d) => acc + d.speed, 0) / speedData.length)
      : 0,
    peak: speedData.length ? Math.max(...speedData.map(d => d.speed)) : 0,
    stability: speedData.length
      ? Math.max(0, 100 - (Math.max(...speedData.map(d => d.speed)) - Math.min(...speedData.map(d => d.speed))))
      : 0,
  };

  const speedSeries = speedData.length ? speedData : [{ time: '--', speed: 0 }];

  const displayDistance = formatDistance(weeklyStats.totalDistance);
  const displayAvgSpeed = `${weeklyStats.avgSpeed} ${unitSystem === 'imperial' ? 'MPH' : 'KM/H'}`;

  if (!canUse) {
    return (
      <ProGate
        title="Graphic Dashboard"
        subtitle="Upgrade to Pro to unlock weekly stats and activity insights."
      />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.containerContent, { paddingBottom: TAB_BAR_HEIGHT + 32 }]}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      scrollEventThrottle={16}
    >
      {/* Current Session Stats */}
      <Animated.View
        style={styles.statsGrid}
        entering={FadeInDown.delay(0).duration(ANIMATION_TIMING.BASE)}
      >
        <StatBox
          icon="navigation"
          label="Distance"
          value={formatDistance(totalDistance)}
          color="#4ECDC4"
          delay={0}
        />
        <StatBox
          icon="clock-outline"
          label="Duration"
          value={formatDuration(drivingStartTime)}
          color="#FFD700"
          delay={100}
        />
        <StatBox
          icon="speedometer"
          label="Current Speed"
          value={`${Math.round(currentSpeed)} ${unitSystem === 'imperial' ? 'MPH' : 'KM/H'}`}
          color="#FF5252"
          delay={200}
        />
      </Animated.View>

      {/* Weekly Trips Chart */}
      <Animated.View
        style={styles.section}
        entering={FadeInDown.delay(100).duration(ANIMATION_TIMING.SLOW)}
      >
        <LinearGradient
          colors={['rgba(28, 28, 30, 0.6)', 'rgba(37, 37, 37, 0.6)']}
          style={styles.sectionCard}
        >
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="chart-bar" size={20} color="#4ECDC4" />
            <Text style={styles.sectionTitle}>Weekly Trips</Text>
          </View>
          <BarChart
            data={weeklyData.map(d => ({ 
              label: d.day, 
              value: d.trips,
              color: ['#FF6B6B', '#FFA500', '#FFD700', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][weeklyData.indexOf(d)]
            }))}
            height={180}
            maxValue={7}
          />
        </LinearGradient>
      </Animated.View>

      {/* Speed History Chart */}
      <Animated.View
        style={styles.section}
        entering={FadeInDown.delay(200).duration(ANIMATION_TIMING.SLOW)}
      >
        <LinearGradient
          colors={['rgba(28, 28, 30, 0.6)', 'rgba(37, 37, 37, 0.6)']}
          style={styles.sectionCard}
        >
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="chart-line" size={20} color="#45B7D1" />
            <Text style={styles.sectionTitle}>Speed Trends (Today)</Text>
          </View>
          <View style={styles.speedSummary}>
            <View style={styles.speedCardWrapper}>
              <StatCard
                title="Avg speed"
                value={`${speedSummary.average} ${unitSystem === 'imperial' ? 'MPH' : 'KM/H'}`}
                color="#45B7D1"
                trend="stable"
              />
            </View>
            <View style={styles.speedCardWrapper}>
              <StatCard
                title="Top speed"
                value={`${speedSummary.peak} ${unitSystem === 'imperial' ? 'MPH' : 'KM/H'}`}
                color="#FF6B6B"
                trend="up"
              />
            </View>
            <View style={styles.speedCardWrapper}>
              <StatCard
                title="Stability"
                value={`${speedSummary.stability}%`}
                color="#4ECDC4"
                trend="down"
              />
            </View>
          </View>
          <LineChart
            data={speedSeries.map(d => d.speed)}
            labels={speedSeries.map(d => d.time)}
            height={160}
            maxValue={100}
            color="#45B7D1"
          />
        </LinearGradient>
      </Animated.View>

      {/* Performance Metrics */}
      <Animated.View
        style={styles.section}
        entering={FadeInDown.delay(300).duration(ANIMATION_TIMING.SLOW)}
      >
        <LinearGradient
          colors={['rgba(28, 28, 30, 0.6)', 'rgba(37, 37, 37, 0.6)']}
          style={styles.sectionCard}
        >
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="gauge" size={20} color="#FFD700" />
            <Text style={styles.sectionTitle}>Performance Metrics</Text>
          </View>
          <View style={styles.metricsGrid}>
            <MetricCard
              icon="speedometer"
              label="Avg Speed"
              value={displayAvgSpeed}
              color="#45B7D1"
              delay={320}
            />
            <MetricCard
              icon="chart-line"
              label="Efficiency"
              value="94%"
              color="#96CEB4"
              delay={340}
            />
            <MetricCard
              icon="alert-circle"
              label="Alerts"
              value="5"
              color="#FF6B6B"
              delay={360}
            />
            <MetricCard
              icon="shield-check"
              label="Safety Score"
              value="9.2/10"
              color="#4ECDC4"
              delay={380}
            />
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Recent Activities */}
      <Animated.View
        style={styles.section}
        entering={FadeInDown.delay(400).duration(ANIMATION_TIMING.SLOW)}
      >
        <LinearGradient
          colors={['rgba(28, 28, 30, 0.6)', 'rgba(37, 37, 37, 0.6)']}
          style={styles.sectionCard}
        >
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="bell-alert" size={20} color="#FFA500" />
            <Text style={styles.sectionTitle}>Recent Activities</Text>
          </View>
          <View>
            {recentAlerts.length === 0 ? (
              <Text style={styles.emptyActivityText}>No recent activity yet.</Text>
            ) : recentAlerts.map((activity, idx) => (
              <Animated.View
                key={activity.id}
                entering={FadeInDown.delay(420 + idx * 50).duration(ANIMATION_TIMING.BASE)}
                style={styles.activityItem}
              >
                <LinearGradient
                  colors={[`${activity.color}20`, `${activity.color}10`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.activityGradient}
                >
                  <View style={styles.activityIconBox}>
                    <MaterialCommunityIcons 
                      name={activity.icon as any} 
                      size={20} 
                      color={activity.color}
                    />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityTitle}>{activity.title}</Text>
                    <Text style={styles.activityLocation}>{activity.location}</Text>
                  </View>
                  <Text style={styles.activityTime}>{activity.time}</Text>
                </LinearGradient>
              </Animated.View>
            ))}
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Weekly Summary */}
      <Animated.View
        style={styles.section}
        entering={FadeInDown.delay(500).duration(ANIMATION_TIMING.SLOW)}
      >
        <LinearGradient
          colors={['rgba(28, 28, 30, 0.6)', 'rgba(37, 37, 37, 0.6)']}
          style={styles.sectionCard}
        >
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="calendar-week" size={20} color="#96CEB4" />
            <Text style={styles.sectionTitle}>Weekly Summary</Text>
          </View>
          <View style={styles.summaryGrid}>
            <ActivityStat
              icon="navigation-variant"
              label="Total Distance"
              value={displayDistance}
              color="#4ECDC4"
              delay={520}
            />
            <ActivityStat
              icon="timer"
              label="Total Time"
              value={weeklyDurationLabel}
              color="#45B7D1"
              delay={540}
            />
            <ActivityStat
              icon="alert-outline"
              label="Alerts Detected"
              value={weeklyAlertCount.toString()}
              color="#FFB300"
              delay={560}
            />
          </View>
        </LinearGradient>
      </Animated.View>

      <View style={{ marginTop: 8 }}>
        <AdBanner />
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  );
};

const StatBox = ({ icon, label, value, color, delay }: any) => (
  <Animated.View entering={FadeInDown.delay(delay).duration(ANIMATION_TIMING.BASE)}>
    <LinearGradient
      colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.02)']}
      style={styles.statBox}
    >
      <MaterialCommunityIcons name={icon} size={22} color={color} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </LinearGradient>
  </Animated.View>
);

const MetricCard = ({ icon, label, value, color, delay }: any) => (
  <Animated.View
    entering={ZoomIn.delay(delay).duration(ANIMATION_TIMING.BASE)}
    style={styles.metricCardContainer}
  >
    <LinearGradient
      colors={[`${color}20`, `${color}10`]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.metricCard}
    >
      <MaterialCommunityIcons name={icon} size={24} color={color} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </LinearGradient>
  </Animated.View>
);

const ActivityStat = ({ icon, label, value, color, delay }: any) => (
  <Animated.View
    entering={FadeInDown.delay(delay).duration(ANIMATION_TIMING.BASE)}
    style={styles.activityStatContainer}
  >
    <LinearGradient
      colors={[`${color}15`, `${color}05`]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.activityStat}
    >
      <MaterialCommunityIcons name={icon} size={20} color={color} />
      <Text style={styles.activityStatLabel}>{label}</Text>
      <Text style={[styles.activityStatValue, { color }]}>{value}</Text>
    </LinearGradient>
  </Animated.View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  containerContent: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    minHeight: 100,
  },
  statLabel: {
    fontSize: 10,
    color: '#8f8f8f',
    marginTop: 8,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  speedSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  speedCardWrapper: { flex: 1 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCardContainer: {
    width: '48%',
  },
  metricCard: {
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  metricLabel: {
    fontSize: 10,
    color: '#a0a0a0',
    marginTop: 8,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  activityItem: {
    marginBottom: 12,
  },
  activityGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  activityIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'white',
  },
  activityLocation: {
    fontSize: 11,
    color: '#a0a0a0',
    marginTop: 2,
  },
  activityTime: {
    fontSize: 10,
    color: '#707070',
  },
  emptyActivityText: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  activityStatContainer: {
    flex: 1,
  },
  activityStat: {
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  activityStatLabel: {
    fontSize: 10,
    color: '#a0a0a0',
    marginTop: 8,
  },
  activityStatValue: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  spacer: {
    height: 40,
  },
});

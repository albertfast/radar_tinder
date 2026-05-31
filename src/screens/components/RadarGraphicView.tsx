import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ANIMATION_TIMING, STAGGER_DELAYS } from '../../utils/animationConstants';
import { BarChart, LineChart, StatCard } from '../../components/AnimatedCharts';
import NebulaCore3DView from '../../components/NebulaCore3DView';
import { SupabaseService } from '../../services/SupabaseService';
import { useAuthStore } from '../../store/authStore';
import { DatabaseService } from '../../services/DatabaseService';
import { useRadarStore } from '../../store/radarStore';
import { useNavigationStore } from '../../mapflow-navigation-kit';
import { useAutoHideTabBar } from '../../hooks/use-auto-hide-tab-bar';
import { TAB_BAR_HEIGHT } from '../../constants/layout';
import { hasProAccess } from '../../utils/access';
import ProGate from '../../components/ProGate';
import { formatRadarSpeedLimitText, formatRadarTimingText } from '../../utils/radarAlerts';

interface RadarGraphicViewProps {
  totalDistance: number;
  drivingStartTime: Date | null;
  currentSpeed: number;
  unitSystem: 'metric' | 'imperial';
  topOverlayInset?: number;
  onUpgrade?: () => void;
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

type SpeedPoint = { time: string; speed: number; trips?: number };

const isRouteSpeedCameraAlert = (alert: any) =>
  Boolean(alert?.routeMatched);

export const RadarGraphicView: React.FC<RadarGraphicViewProps> = ({
  totalDistance,
  drivingStartTime,
  currentSpeed,
  unitSystem,
  topOverlayInset = 0,
  onUpgrade,
}) => {
  const heroTopInset = Math.max(6, topOverlayInset - 104);
  const { user } = useAuthStore();
  const canUse = hasProAccess(user);
  const activeAlerts = useRadarStore((state) => state.activeAlerts);
  const navigationState = useNavigationStore((state) => ({
    remainingDistance: state.remainingDistance,
    remainingDuration: state.remainingDuration,
    routeDistance: state.route?.distance ?? 0,
    speedLimit: state.speedLimit,
    isNavigating: state.isNavigating,
  }));
  const { onScroll, onScrollBeginDrag, onScrollEndDrag } = useAutoHideTabBar();
  const [weeklyData, setWeeklyData] = useState(emptyWeeklyTrips);
  const [weeklySpeedData, setWeeklySpeedData] = useState<SpeedPoint[]>([]);
  const [speedData, setSpeedData] = useState<SpeedPoint[]>([]);
  const lastSpeedSampleRef = useRef(0);
  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);
  const [weeklyDurationSeconds, setWeeklyDurationSeconds] = useState(0);
  const [weeklyAlertCount, setWeeklyAlertCount] = useState(0);
  const lastRecentIds = useRef('');

  useEffect(() => {
    if (canUse) {
      loadDrivingData();
    }
  }, [canUse, user?.id, unitSystem]);

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
      const trips = await SupabaseService.getUserTrips(user?.id);
      const dayMap: { [key: string]: { trips: number; distance: number; avgSpeedSum: number; topSpeed: number; duration: number; movingDuration: number } } = {};
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
      let durationSeconds = 0;

      days.forEach((day) => {
        dayMap[day] = { trips: 0, distance: 0, avgSpeedSum: 0, topSpeed: 0, duration: 0, movingDuration: 0 };
      });

      trips.forEach((trip: any) => {
        const date = trip.createdAt ? new Date(trip.createdAt) : null;
        if (!date || Number.isNaN(date.getTime())) return;
        if (date.getTime() < weekStart) return;
        const dayName = days[date.getDay()];
        if (dayMap[dayName]) {
          const tripSpeedKph = Number(trip.avgSpeedKph ?? 0);
          const tripTopSpeedKph = Number(trip.topSpeedKph ?? tripSpeedKph ?? 0);
          const tripSpeed = unitSystem === 'imperial' ? Math.round(tripSpeedKph * 0.621371) : Math.round(tripSpeedKph);
          const tripTopSpeed = unitSystem === 'imperial' ? Math.round(tripTopSpeedKph * 0.621371) : Math.round(tripTopSpeedKph);
          const tripDuration = Number(trip.duration || 0);
          const tripMovingDuration = Number(trip.movingDuration || 0);
          dayMap[dayName].trips += 1;
          dayMap[dayName].distance += (trip.distance || 0) / 1000;
          dayMap[dayName].avgSpeedSum += Number.isFinite(tripSpeed) ? tripSpeed : 0;
          dayMap[dayName].topSpeed = Math.max(dayMap[dayName].topSpeed, Number.isFinite(tripTopSpeed) ? tripTopSpeed : 0);
          dayMap[dayName].duration += Number.isFinite(tripDuration) ? tripDuration : 0;
          dayMap[dayName].movingDuration += Number.isFinite(tripMovingDuration) ? tripMovingDuration : 0;
          durationSeconds += Number.isFinite(tripDuration) ? tripDuration : 0;
        }
      });

      const newWeeklyData = days.map((day) => ({
        day,
        trips: dayMap[day].trips,
        distance: dayMap[day].distance,
      }));
      const newWeeklySpeedData = days.map((day) => ({
        time: day,
        speed: dayMap[day].trips > 0 ? Math.round(dayMap[day].avgSpeedSum / dayMap[day].trips) : 0,
        trips: dayMap[day].trips,
      }));
      setWeeklyData(newWeeklyData);
      setWeeklySpeedData(newWeeklySpeedData);
      setWeeklyDurationSeconds(durationSeconds);
    } catch (error) {
      console.error('Failed to load driving data:', error);
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

        const createdAt =
          alert.createdAt instanceof Date
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

  const formatSecondsDuration = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '--';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${Math.max(1, minutes)}m`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
  };

  useEffect(() => {
    if (!canUse) return;
    loadRecentActivity();
  }, [user?.id, activeAlerts.length, canUse]);

  const weeklySpeedSamples = weeklySpeedData.filter((item) => (item.trips ?? 0) > 0 && item.speed > 0);
  const activeSpeedSamples = speedData.length > 0 ? speedData : weeklySpeedSamples;
  const weeklyTripCount = weeklyData.reduce((acc, item) => acc + item.trips, 0);
  const activeChartSeries =
    speedData.length > 0
      ? speedData
      : weeklySpeedSamples.length > 0
        ? weeklySpeedData
        : [{ time: '--', speed: 0 }];
  const hasSpeedChartData = speedData.length > 0 || weeklySpeedSamples.length > 0;
  const speedChartTitle = speedData.length > 0 ? 'Live Speed' : 'Speed Trends (Trips)';
  const speedChartCaption =
    speedData.length > 0
      ? `${speedData.length} live samples`
      : weeklySpeedSamples.length > 0
        ? `${weeklyTripCount} trips this week`
        : 'No speed samples yet';

  const weeklyStats = {
    totalDistance: weeklyData.reduce((acc, item) => acc + item.distance, 0),
    totalTrips: weeklyTripCount,
    avgSpeed: weeklySpeedSamples.length
      ? Math.round(weeklySpeedSamples.reduce((acc, item) => acc + item.speed, 0) / weeklySpeedSamples.length)
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
    average: activeSpeedSamples.length
      ? Math.round(activeSpeedSamples.reduce((acc, item) => acc + item.speed, 0) / activeSpeedSamples.length)
      : 0,
    peak: activeSpeedSamples.length
      ? Math.max(...activeSpeedSamples.map((item) => item.speed))
      : 0,
    stability: activeSpeedSamples.length
      ? Math.max(
          0,
          100 -
            (Math.max(...activeSpeedSamples.map((item) => item.speed)) -
              Math.min(...activeSpeedSamples.map((item) => item.speed)))
        )
      : 0,
  };

  const activeTripCount = weeklyStats.totalTrips;
  const tripEfficiency = speedSummary.peak > 0
    ? Math.max(0, Math.min(100, Math.round((speedSummary.average / speedSummary.peak) * 100)))
    : 0;
  const safetyScore = Math.max(0, Math.min(10, Number((10 - weeklyAlertCount * 0.3 - (speedSummary.peak - speedSummary.average) / 50).toFixed(1))));
  const displayDistance = formatDistance(weeklyStats.totalDistance);
  const displayAvgSpeed = `${weeklyStats.avgSpeed} ${unitSystem === 'imperial' ? 'MPH' : 'KM/H'}`;
  const heroSignalLevel = useMemo(
    () => Math.max(0.32, Math.min(1, (nearbyAlertIntensity(activeAlerts.length) + currentSpeed / 120) * 0.7)),
    [activeAlerts.length, currentSpeed]
  );
  const heroDangerLevel = useMemo(
    () => Math.max(0.1, Math.min(0.82, activeAlerts.length > 0 ? 0.3 + activeAlerts.length * 0.08 : 0.18)),
    [activeAlerts.length]
  );
  const heroNearestLabel = useMemo(() => {
    const nearest = activeAlerts.find(isRouteSpeedCameraAlert);
    if (!nearest || typeof nearest.distance !== 'number' || !Number.isFinite(nearest.distance)) {
      return 'Live scan';
    }
    return `${formatDistance(nearest.distance)} ahead`;
  }, [activeAlerts, unitSystem]);
  const heroRouteAlert = useMemo(() => {
    return [...activeAlerts]
      .filter(isRouteSpeedCameraAlert)
      .sort((a, b) => Number(a.distance || 0) - Number(b.distance || 0))[0] || null;
  }, [activeAlerts]);
  const routeRemainingKm = useMemo(() => {
    if (!navigationState.isNavigating || !Number.isFinite(navigationState.remainingDistance)) {
      return null;
    }
    return Math.max(0, navigationState.remainingDistance / 1000);
  }, [navigationState.isNavigating, navigationState.remainingDistance]);
  const routeRemainingLabel = useMemo(() => {
    if (routeRemainingKm === null) {
      return 'Route idle';
    }
    return `${formatDistance(routeRemainingKm)} left`;
  }, [routeRemainingKm, unitSystem]);
  const speedLimitDisplay = useMemo(() => {
    const speedLimit = navigationState.speedLimit;
    if (typeof speedLimit !== 'number' || !Number.isFinite(speedLimit) || speedLimit <= 0) {
      return null;
    }
    return unitSystem === 'imperial' ? Math.round(speedLimit * 0.621371) : Math.round(speedLimit);
  }, [navigationState.speedLimit, unitSystem]);
  const currentSpeedDisplay = Math.max(0, Math.round(currentSpeed));
  const speedTone = useMemo(() => {
    if (speedLimitDisplay === null || speedLimitDisplay <= 0) {
      return '#4ECDC4';
    }
    const ratio = currentSpeedDisplay / speedLimitDisplay;
    if (ratio > 1.2) return '#FF5252';
    if (ratio > 1) return '#F59E0B';
    return '#4ECDC4';
  }, [currentSpeedDisplay, speedLimitDisplay]);
  const speedTrendLabel = useMemo(() => {
    if (speedLimitDisplay === null || speedLimitDisplay <= 0) {
      return 'No limit lock';
    }
    const ratio = currentSpeedDisplay / speedLimitDisplay;
    if (ratio > 1.2) return 'Over limit';
    if (ratio > 1) return 'Above limit';
    return 'Within limit';
  }, [currentSpeedDisplay, speedLimitDisplay]);
  const routeAlertTitle = useMemo(() => {
    if (!heroRouteAlert) return 'No active route camera';
    return 'Speed camera on your route';
  }, [heroRouteAlert]);
  const routeAlertDetail = useMemo(() => {
    if (!heroRouteAlert) return 'Keep driving, the panel will highlight the next camera automatically.';
    const speedLimitText = formatRadarSpeedLimitText(heroRouteAlert, unitSystem);
    const timingText = formatRadarTimingText(heroRouteAlert);
    const parts = [timingText];
    if (speedLimitText) parts.push(speedLimitText);
    if (typeof heroRouteAlert.distance === 'number' && Number.isFinite(heroRouteAlert.distance)) {
      parts.push(`${formatDistance(heroRouteAlert.distance)} ahead`);
    }
    return parts.join(' • ');
  }, [heroRouteAlert, unitSystem]);
  const journeyProgress = useMemo(() => {
    if (!navigationState.isNavigating || routeRemainingKm === null) return 0;
    const routeTotalKm = Number(navigationState.routeDistance || 0) / 1000;
    const denominatorKm = routeTotalKm > 0 ? routeTotalKm : Math.max(routeRemainingKm + totalDistance, 0.1);
    return Math.max(0, Math.min(1, 1 - routeRemainingKm / denominatorKm));
  }, [navigationState.isNavigating, navigationState.routeDistance, routeRemainingKm, totalDistance]);
  const journeyProgressLabel = useMemo(() => {
    if (!navigationState.isNavigating) return 'Trip paused';
    const pct = Math.round(journeyProgress * 100);
    return `${pct}% complete`;
  }, [journeyProgress, navigationState.isNavigating]);
  const journeyRemainingLabel = useMemo(() => {
    if (!navigationState.isNavigating) return 'No active route';
    return routeRemainingLabel;
  }, [navigationState.isNavigating, routeRemainingLabel]);
  const routeDurationLabel = useMemo(
    () => (navigationState.isNavigating ? formatSecondsDuration(navigationState.remainingDuration) : '--'),
    [navigationState.isNavigating, navigationState.remainingDuration]
  );
  const speedUnitLabel = unitSystem === 'imperial' ? 'MPH' : 'KM/H';
  const currentSpeedLabel = `${currentSpeedDisplay} ${speedUnitLabel}`;
  const speedLimitLabel =
    speedLimitDisplay === null ? `-- ${speedUnitLabel}` : `${speedLimitDisplay} ${speedUnitLabel}`;

  if (!canUse) {
    return (
      <ProGate
        title="Graphic Drive"
        subtitle="Unlock the route-aware dashboard, live speed-limit context, and saved trip analytics."
        onUpgrade={onUpgrade}
        showAd={false}
      />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.containerContent,
        {
          paddingBottom: TAB_BAR_HEIGHT + 32,
        },
      ]}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      scrollEventThrottle={16}
    >
      <Animated.View
        style={[styles.radarHeroStage, { paddingTop: heroTopInset }]}
        entering={FadeInDown.delay(0).duration(ANIMATION_TIMING.BASE)}
      >
        <View style={styles.radarHeroHeader}>
          <View>
            <Text style={styles.radarHeroEyebrow}>Premium graphic</Text>
            <Text style={styles.radarHeroTitle}>Drive Visualization</Text>
          </View>
          <View style={styles.radarHeroChip}>
            <MaterialCommunityIcons name="diamond-stone" size={15} color="#4ECDC4" />
            <Text style={styles.radarHeroChipText}>Pro live panel</Text>
          </View>
        </View>

        <View style={styles.radarHeroImageShell}>
          <View style={styles.radarHeroDepthGlow} />
          <View style={styles.radarHeroDepthRingOuter} />
          <View style={styles.radarHeroDepthRingInner} />
          <NebulaCore3DView
            style={styles.radarHeroImage}
            signalLevel={heroSignalLevel}
            dangerLevel={heroDangerLevel}
            paused={false}
          />
          <LinearGradient
            colors={['rgba(3, 7, 18, 0.05)', 'rgba(3, 7, 18, 0.72)']}
            style={styles.radarHeroShade}
          />
          <View style={styles.heroOverlayTopRow}>
            <View style={styles.heroOverlayPill}>
              <MaterialCommunityIcons name="radar" size={15} color="#4ECDC4" />
              <Text style={styles.heroOverlayPillText}>Neon tracking</Text>
            </View>
            <View style={styles.heroOverlayPill}>
              <MaterialCommunityIcons name="map-marker-distance" size={15} color="#FFB36B" />
              <Text style={styles.heroOverlayPillText}>{heroNearestLabel}</Text>
            </View>
          </View>
        </View>

        <LinearGradient
          colors={heroRouteAlert ? ['rgba(41, 18, 20, 0.96)', 'rgba(18, 10, 19, 0.96)'] : ['rgba(10,18,35,0.96)', 'rgba(8,14,26,0.94)']}
          style={[styles.routeAlertCard, heroRouteAlert ? styles.routeAlertCardHot : null]}
        >
          <View style={styles.routeAlertHeader}>
            <View style={[styles.routeAlertIcon, { borderColor: `${heroRouteAlert ? '#FF5252' : '#4ECDC4'}55` }]}>
              <MaterialCommunityIcons
                name={heroRouteAlert ? 'radar' : 'alert-circle-outline'}
                size={20}
                color={heroRouteAlert ? '#FF6B6B' : '#4ECDC4'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.routeAlertTitle}>{routeAlertTitle}</Text>
              <Text style={styles.routeAlertText} numberOfLines={2}>
                {routeAlertDetail}
              </Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(4, journeyProgress * 100)}%`, backgroundColor: speedTone }]} />
          </View>
        </LinearGradient>

        <Animated.View
          style={styles.liveMetricsGrid}
          entering={FadeInDown.delay(STAGGER_DELAYS.ITEM_FAST).duration(ANIMATION_TIMING.BASE)}
        >
          <LiveMetricCard
            icon="map-marker-distance"
            label="Distance left"
            value={journeyRemainingLabel}
            color="#4ECDC4"
          />
          <LiveMetricCard
            icon="clock-outline"
            label="Duration left"
            value={routeDurationLabel}
            color="#FFD700"
          />
          <LiveMetricCard
            icon="speedometer"
            label="Current speed"
            value={currentSpeedLabel}
            color={speedTone}
          />
          <LiveMetricCard
            icon="sign-direction"
            label="Speed limit"
            value={speedLimitLabel}
            color={speedTone}
            footer={speedTrendLabel}
          />
        </Animated.View>
      </Animated.View>

      <Animated.View
        style={styles.section}
        entering={FadeInDown.delay(100).duration(ANIMATION_TIMING.SLOW)}
      >
        <LinearGradient
          colors={['rgba(7, 14, 29, 0.96)', 'rgba(15, 20, 37, 0.92)']}
          style={styles.sectionCard}
        >
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="chart-bar" size={20} color="#4ECDC4" />
            <Text style={styles.sectionTitle}>Weekly Trips</Text>
          </View>
          <BarChart
            data={weeklyData.map((item) => ({
              label: item.day,
              value: item.trips,
              color: ['#FF6B6B', '#FFA500', '#FFD700', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][weeklyData.indexOf(item)],
            }))}
            height={180}
            maxValue={7}
          />
        </LinearGradient>
      </Animated.View>

      <Animated.View
        style={styles.section}
        entering={FadeInDown.delay(200).duration(ANIMATION_TIMING.SLOW)}
      >
        <LinearGradient
          colors={['rgba(7, 14, 29, 0.96)', 'rgba(15, 20, 37, 0.92)']}
          style={styles.sectionCard}
        >
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="chart-line" size={20} color="#45B7D1" />
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionTitle}>{speedChartTitle}</Text>
              <Text style={styles.sectionCaption}>{speedChartCaption}</Text>
            </View>
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
            data={activeChartSeries.map((item) => item.speed)}
            labels={activeChartSeries.map((item) => item.time)}
            height={160}
            maxValue={Math.max(hasSpeedChartData ? 30 : 1, speedSummary.peak + 10)}
            color={hasSpeedChartData ? '#45B7D1' : '#334155'}
          />
        </LinearGradient>
      </Animated.View>

      <Animated.View
        style={styles.section}
        entering={FadeInDown.delay(300).duration(ANIMATION_TIMING.SLOW)}
      >
        <LinearGradient
          colors={['rgba(7, 14, 29, 0.96)', 'rgba(15, 20, 37, 0.92)']}
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
              value={`${tripEfficiency}%`}
              color="#96CEB4"
              delay={340}
            />
            <MetricCard
              icon="alert-circle"
              label="Alerts"
              value={String(weeklyAlertCount)}
              color="#FF6B6B"
              delay={360}
            />
            <MetricCard
              icon="shield-check"
              label="Safety Score"
              value={`${safetyScore}/10`}
              color="#4ECDC4"
              delay={380}
            />
          </View>
        </LinearGradient>
      </Animated.View>

      <Animated.View
        style={styles.section}
        entering={FadeInDown.delay(400).duration(ANIMATION_TIMING.SLOW)}
      >
        <LinearGradient
          colors={['rgba(7, 14, 29, 0.96)', 'rgba(15, 20, 37, 0.92)']}
          style={styles.sectionCard}
        >
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="bell-alert" size={20} color="#FFA500" />
            <Text style={styles.sectionTitle}>Recent Activities</Text>
          </View>
          <View>
            {recentAlerts.length === 0 ? (
              <Text style={styles.emptyActivityText}>No recent activity yet.</Text>
            ) : (
              recentAlerts.map((activity, index) => (
                <Animated.View
                  key={activity.id}
                  entering={FadeInDown.delay(420 + index * 50).duration(ANIMATION_TIMING.BASE)}
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
              ))
            )}
          </View>
        </LinearGradient>
      </Animated.View>

      <Animated.View
        style={styles.section}
        entering={FadeInDown.delay(500).duration(ANIMATION_TIMING.SLOW)}
      >
        <LinearGradient
          colors={['rgba(7, 14, 29, 0.96)', 'rgba(15, 20, 37, 0.92)']}
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

const LiveMetricCard = ({ icon, label, value, color, footer }: any) => (
  <LinearGradient
    colors={['rgba(15,23,42,0.96)', 'rgba(8,17,32,0.94)']}
    style={[styles.liveMetricCard, { borderColor: `${color}33` }]}
  >
    <View style={[styles.liveMetricIcon, { backgroundColor: `${color}18` }]}>
      <MaterialCommunityIcons name={icon} size={18} color={color} />
    </View>
    <View style={styles.liveMetricCopy}>
      <Text style={styles.liveMetricLabel}>{label}</Text>
      <Text style={[styles.liveMetricValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {footer ? <Text style={styles.liveMetricFooter}>{footer}</Text> : null}
    </View>
  </LinearGradient>
);

const nearbyAlertIntensity = (count: number) => Math.min(1, count / 6);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050816',
  },
  containerContent: {
    paddingHorizontal: 16,
  },
  radarHeroStage: {
    marginHorizontal: -16,
    marginBottom: 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#020617',
  },
  radarHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  radarHeroEyebrow: {
    color: '#4ECDC4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  radarHeroTitle: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  radarHeroChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(78,205,196,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  radarHeroChipText: {
    color: '#D7F5F2',
    fontSize: 12,
    fontWeight: '700',
  },
  radarHeroImageShell: {
    borderRadius: 28,
    overflow: 'hidden',
    width: '100%',
    aspectRatio: 640 / 426,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#050B16',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  radarHeroImage: {
    width: '100%',
    height: '100%',
  },
  radarHeroDepthGlow: {
    position: 'absolute',
    width: '78%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(78,205,196,0.12)',
    shadowColor: '#4ECDC4',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  radarHeroDepthRingOuter: {
    position: 'absolute',
    width: '70%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(125, 232, 223, 0.24)',
    transform: [{ scaleX: 1.06 }, { scaleY: 0.86 }],
  },
  radarHeroDepthRingInner: {
    position: 'absolute',
    width: '46%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    transform: [{ scaleX: 1.02 }, { scaleY: 0.92 }],
  },
  radarHeroShade: {
    ...StyleSheet.absoluteFillObject,
  },
  heroOverlayTopRow: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  heroOverlayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(2,7,18,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroOverlayPillText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  routeStrip: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  routeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: 'rgba(2,7,18,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  routeChipText: {
    color: '#D5E2F2',
    fontSize: 11,
    fontWeight: '800',
  },
  routeAlertCard: {
    marginTop: 12,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  routeAlertCardHot: {
    borderColor: 'rgba(255,82,82,0.42)',
  },
  routeAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  routeAlertIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
  },
  routeAlertTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  routeAlertText: {
    marginTop: 5,
    color: '#B8C6DA',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  journeyBoard: {
    marginTop: 12,
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  journeyBoardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  journeyBoardKicker: {
    color: '#7CE8DF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  journeyBoardTitle: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  journeyPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  journeyPillText: {
    fontSize: 12,
    fontWeight: '900',
  },
  journeyMetricsRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  journeyMetricCard: {
    flex: 1,
    borderRadius: 18,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  journeyMetricLabel: {
    color: '#91A0B7',
    fontSize: 11,
    fontWeight: '700',
  },
  journeyMetricValue: {
    marginTop: 6,
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '900',
  },
  progressTrack: {
    marginTop: 12,
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  journeyFooterRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  journeyFooterChip: {
    flex: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  journeyFooterText: {
    color: '#D5DEED',
    fontSize: 11,
    fontWeight: '800',
  },
  liveMetricsGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  liveMetricCard: {
    width: '48%',
    minHeight: 102,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveMetricIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveMetricCopy: {
    flex: 1,
    minWidth: 0,
  },
  liveMetricLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
  },
  liveMetricValue: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '900',
  },
  liveMetricFooter: {
    marginTop: 4,
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: -28,
    paddingHorizontal: 0,
    zIndex: 2,
  },
  statBox: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.16)',
    backgroundColor: 'rgba(7, 18, 31, 0.96)',
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
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.08)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionHeaderCopy: {
    flex: 1,
  },
  speedSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  speedCardWrapper: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  sectionCaption: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#8FA0B9',
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
    borderColor: 'rgba(103, 232, 249, 0.08)',
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
    borderColor: 'rgba(103, 232, 249, 0.07)',
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
    borderColor: 'rgba(103, 232, 249, 0.07)',
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

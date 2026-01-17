import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ANIMATION_TIMING, STAGGER_DELAYS } from '../../utils/animationConstants';
import { BarChart, LineChart, StatCard } from '../../components/AnimatedCharts';

const { width } = Dimensions.get('window');

interface TripStatsData {
  distance: number;
  duration: number;
  maxSpeed: number;
}

interface RadarGraphicViewProps {
  totalDistance: number;
  drivingStartTime: Date | null;
  currentSpeed: number;
  unitSystem: 'metric' | 'imperial';
}

// Mock data for dashboard
const weeklyTripsData = [
  { day: 'Mon', trips: 3, distance: 45.2 },
  { day: 'Tue', trips: 5, distance: 62.8 },
  { day: 'Wed', trips: 4, distance: 58.3 },
  { day: 'Thu', trips: 6, distance: 71.5 },
  { day: 'Fri', trips: 7, distance: 89.2 },
  { day: 'Sat', trips: 2, distance: 32.1 },
  { day: 'Sun', trips: 4, distance: 55.6 },
];

const speedHistoryData = [
  { time: '09:00', speed: 42 },
  { time: '10:15', speed: 58 },
  { time: '11:30', speed: 54 },
  { time: '12:45', speed: 67 },
  { time: '14:00', speed: 78 },
  { time: '15:20', speed: 70 },
  { time: '16:35', speed: 84 },
  { time: '17:50', speed: 63 },
  { time: '19:00', speed: 89 },
];

const recentActivities = [
  { 
    id: '1', 
    type: 'radar', 
    title: 'Speed Camera', 
    location: 'Main St', 
    time: '2 min ago',
    icon: 'radar',
    color: '#FF5252'
  },
  { 
    id: '2', 
    type: 'accident', 
    title: 'Accident Report', 
    location: 'Highway 101', 
    time: '15 min ago',
    icon: 'alert-circle',
    color: '#FFB300'
  },
  { 
    id: '3', 
    type: 'hazard', 
    title: 'Road Hazard', 
    location: 'Downtown Area', 
    time: '28 min ago',
    icon: 'alert',
    color: '#FFA500'
  },
  {
    id: '4',
    type: 'congestion',
    title: 'Heavy Traffic',
    location: 'Riverside Blvd',
    time: '45 min ago',
    icon: 'traffic-light',
    color: '#FF6B6B'
  },
  {
    id: '5',
    type: 'weather',
    title: 'Heavy Rain',
    location: 'Airport Region',
    time: '1h ago',
    icon: 'weather-rainy',
    color: '#4ECDC4'
  },
];

export const RadarGraphicView: React.FC<RadarGraphicViewProps> = ({
  totalDistance,
  drivingStartTime,
  currentSpeed,
  unitSystem,
}) => {
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

  const weeklyStats = {
    totalDistance: weeklyTripsData.reduce((acc, d) => acc + d.distance, 0),
    totalTrips: weeklyTripsData.reduce((acc, d) => acc + d.trips, 0),
    avgSpeed: Math.round(speedHistoryData.reduce((acc, d) => acc + d.speed, 0) / speedHistoryData.length),
  };

  const speedSummary = {
    average: Math.round(speedHistoryData.reduce((acc, d) => acc + d.speed, 0) / speedHistoryData.length),
    peak: Math.max(...speedHistoryData.map(d => d.speed)),
    stability: Math.max(0, 100 - (Math.max(...speedHistoryData.map(d => d.speed)) - Math.min(...speedHistoryData.map(d => d.speed)))),
  };

  const displayDistance = formatDistance(weeklyStats.totalDistance);
  const displayAvgSpeed = `${weeklyStats.avgSpeed} ${unitSystem === 'imperial' ? 'MPH' : 'KM/H'}`;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
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
            data={weeklyTripsData.map(d => ({ 
              label: d.day, 
              value: d.trips,
              color: ['#FF6B6B', '#FFA500', '#FFD700', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][weeklyTripsData.indexOf(d)]
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
            data={speedHistoryData.map(d => d.speed)}
            labels={speedHistoryData.map(d => d.time)}
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
            {recentActivities.map((activity, idx) => (
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
              value="18.5h"
              color="#45B7D1"
              delay={540}
            />
            <ActivityStat
              icon="alert-outline"
              label="Alerts Detected"
              value="12"
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#1a1a1a',
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

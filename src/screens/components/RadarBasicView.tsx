import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { RadarAnimation } from '../../components/RadarAnimation';
import { ANIMATION_TIMING, SPRING_CONFIGS } from '../../utils/animationConstants';

const { width, height } = Dimensions.get('window');

interface RadarBasicViewProps {
  currentSpeed: number;
  currentLocation: any;
  nearbyRadars: any[];
  isDriving: boolean;
  unitSystem: 'metric' | 'imperial';
}

export const RadarBasicView: React.FC<RadarBasicViewProps> = ({
  currentSpeed,
  currentLocation,
  nearbyRadars,
  isDriving,
  unitSystem,
}) => {
  const speedDisplay = unitSystem === 'imperial' ? Math.round(currentSpeed * 2.237) : Math.round(currentSpeed);

  return (
    <View style={styles.container}>
      <Animated.View 
        style={styles.radarContainer}
        entering={FadeInDown.duration(ANIMATION_TIMING.BASE)}
      >
        <RadarAnimation />
      </Animated.View>

      <Animated.View
        style={styles.speedometerContainer}
        entering={FadeInDown.delay(100).duration(ANIMATION_TIMING.BASE)}
      >
        <LinearGradient
          colors={['rgba(28, 28, 30, 0.8)', 'rgba(37, 37, 37, 0.8)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.speedometer}
        >
          <Text style={styles.speedValue}>{speedDisplay}</Text>
          <Text style={styles.speedUnit}>{unitSystem === 'imperial' ? 'MPH' : 'KM/H'}</Text>
        </LinearGradient>
      </Animated.View>

      <Animated.View
        style={styles.statsContainer}
        entering={FadeInDown.delay(200).duration(ANIMATION_TIMING.BASE)}
      >
        <StatCard
          icon="radar"
          label="Radars"
          value={nearbyRadars.length.toString()}
          color="#4ECDC4"
        />
        <StatCard
          icon="map-marker"
          label="Tracking"
          value={isDriving ? 'ON' : 'OFF'}
          color={isDriving ? '#27AE60' : '#8f8f8f'}
        />
      </Animated.View>
    </View>
  );
};

const StatCard = ({ icon, label, value, color }: any) => (
  <LinearGradient
    colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.02)']}
    style={styles.statCard}
  >
    <MaterialCommunityIcons name={icon} size={20} color={color} />
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
  </LinearGradient>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
  },
  radarContainer: {
    flex: 0.6,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  speedometerContainer: {
    marginVertical: 20,
  },
  speedometer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#4ECDC4',
  },
  speedValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#4ECDC4',
  },
  speedUnit: {
    fontSize: 12,
    color: '#8f8f8f',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statLabel: {
    fontSize: 12,
    color: '#8f8f8f',
    marginTop: 8,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
});

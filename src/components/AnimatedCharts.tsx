import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Text } from 'react-native-paper';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ANIMATION_TIMING } from '../utils/animationConstants';

const { width } = Dimensions.get('window');

interface BarChartProps {
  data: { label: string; value: number }[];
  maxValue?: number;
  colors?: string[];
  height?: number;
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  maxValue = Math.max(...data.map(d => d.value)),
  colors = ['#4ECDC4', '#FFD700', '#FF5252', '#27AE60', '#9C27B0'],
  height = 200,
}) => {
  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.chartContainer}>
        {data.map((item, index) => (
          <BarItem
            key={index}
            label={item.label}
            value={item.value}
            maxValue={maxValue}
            color={colors[index % colors.length]}
            delay={index * 100}
          />
        ))}
      </View>
    </View>
  );
};

const BarItem = ({ label, value, maxValue, color, delay }: any) => {
  const heightPercent = (value / maxValue) * 100;
  const animHeight = useSharedValue(0);

  useEffect(() => {
    animHeight.value = withTiming(heightPercent, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    height: `${animHeight.value}%`,
  }));

  return (
    <View style={styles.barWrapper}>
      <View style={styles.barContainer}>
        <Animated.View
          style={[
            styles.bar,
            { backgroundColor: color },
            animStyle,
          ]}
        />
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color }]}>{value}</Text>
    </View>
  );
};

export const LineChart: React.FC<LineChartProps> = ({
  data,
  labels = data.map((_, i) => i.toString()),
  color = '#4ECDC4',
  height = 200,
  maxValue = Math.max(...data),
}) => {
  const minValue = Math.min(...data);
  const range = maxValue - minValue || 1;

  // Normalize data to 0-100
  const normalizedData = data.map(val => ((val - minValue) / range) * 100);

  return (
    <View style={[styles.lineChartContainer, { height }]}>
      <View style={styles.lineChartInner}>
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((line) => (
          <View
            key={line}
            style={[
              styles.gridLine,
              { bottom: `${line}%` },
            ]}
          />
        ))}

        {/* Smooth connecting lines and points */}
        <View style={StyleSheet.absoluteFill}>
          {normalizedData.map((val, idx) => {
            const totalWidth = width - 32;
            const pointX = (idx / (normalizedData.length - 1 || 1)) * totalWidth;
            const pointY = (1 - val / 100) * height;

            return (
              <View
                key={`point-${idx}`}
                style={[
                  styles.dataPoint,
                  {
                    left: pointX + 16,
                    top: pointY,
                  },
                ]}
              >
                <Animated.View
                  entering={FadeInDown.delay(idx * 50).duration(ANIMATION_TIMING.BASE)}
                  style={[styles.point, { backgroundColor: color }]}
                />
              </View>
            );
          })}

          {/* Connection lines between points */}
          {normalizedData.map((val, idx) => {
            if (idx === 0) return null;
            const prevVal = normalizedData[idx - 1];
            const totalWidth = width - 32;
            
            const x1 = ((idx - 1) / (normalizedData.length - 1)) * totalWidth;
            const y1 = (1 - prevVal / 100) * height;
            const x2 = (idx / (normalizedData.length - 1)) * totalWidth;
            const y2 = (1 - val / 100) * height;

            const dx = x2 - x1;
            const dy = y2 - y1;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            return (
              <View
                key={`line-${idx}`}
                style={[
                  styles.lineConnection,
                  {
                    left: x1 + 16,
                    top: y1,
                    width: distance,
                    backgroundColor: color,
                    opacity: 0.6,
                    transform: [{ rotate: `${angle}deg` }, { translateY: -1 }],
                  },
                ]}
              />
            );
          })}
        </View>
      </View>

      {/* Labels */}
      <View style={styles.labelsContainer}>
        {labels.map((label, idx) => (
          <Text key={idx} style={styles.lineLabel}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: string;
  color?: string;
  trend?: 'up' | 'down' | 'stable';
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  color = '#4ECDC4',
  trend = 'stable',
}) => {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.02)']}
        style={[styles.statCard, { borderColor: color }]}
      >
        <Text style={styles.statTitle}>{title}</Text>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        <View style={styles.trendIndicator}>
          <Text
            style={[
              styles.trendText,
              {
                color:
                  trend === 'up' ? '#27AE60' : trend === 'down' ? '#FF5252' : '#FFD700',
              },
            ]}
          >
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 20,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: '100%',
    paddingHorizontal: 8,
  },
  barWrapper: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  barContainer: {
    height: '90%',
    width: '60%',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  bar: {
    width: '100%',
    borderRadius: 8,
  },
  label: {
    fontSize: 12,
    color: '#8f8f8f',
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
  },
  lineChartContainer: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  lineChartInner: {
    flex: 1,
    position: 'relative',
    marginBottom: 30,
  },
  gridLine: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  lineConnection: {
    position: 'absolute',
    height: 2,
    originX: 0,
    originY: 0.5,
  },
  dataPoint: {
    position: 'absolute',
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -10,
    marginBottom: -10,
  },
  point: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowColor: '#4ECDC4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  labelsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  lineLabel: {
    fontSize: 11,
    color: '#8f8f8f',
  },
  statCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTitle: {
    fontSize: 12,
    color: '#8f8f8f',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  trendIndicator: {
    marginTop: 4,
  },
  trendText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default { BarChart, LineChart, StatCard };

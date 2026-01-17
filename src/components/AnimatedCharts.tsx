import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Text } from 'react-native-paper';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ANIMATION_TIMING } from '../utils/animationConstants';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

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
  const chartWidth = width - 48;

  const points = useMemo(
    () =>
      data.map((val, idx) => {
        const x = (idx / Math.max(1, data.length - 1)) * chartWidth;
        const y = height - ((val - minValue) / range) * height;
        return { x, y, val, label: labels[idx] };
      }),
    [data, labels, chartWidth, height, minValue, range],
  );

  const path = useMemo(() => {
    if (points.length === 0) return '';
    return points.reduce((acc, p, idx) => {
      if (idx === 0) return `M ${p.x} ${p.y}`;
      const prev = points[idx - 1];
      const cx = (prev.x + p.x) / 2;
      return `${acc} C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
    }, '');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const first = points[0];
    const last = points[points.length - 1];
    return `${path} L ${last.x} ${height} L ${first.x} ${height} Z`;
  }, [path, points, height]);

  return (
    <View style={[styles.lineChartContainer, { height }]}>
      <Svg width={chartWidth} height={height}>
        <Defs>
          <SvgLinearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <Stop offset="100%" stopColor={color} stopOpacity={0.0} />
          </SvgLinearGradient>
        </Defs>

        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <Path
            key={ratio}
            d={`M0 ${height * ratio} H ${chartWidth}`}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />
        ))}

        {/* Area fill */}
        <Path d={areaPath} fill="url(#lineFill)" />

        {/* Line */}
        <Path d={path} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />

        {/* Points */}
        {points.map((p, idx) => (
          <Circle key={idx} cx={p.x} cy={p.y} r={6} fill="#0B1320" stroke={color} strokeWidth={2} />
        ))}
      </Svg>

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

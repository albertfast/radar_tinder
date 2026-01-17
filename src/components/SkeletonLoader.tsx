import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const SkeletonBox = ({ width = '100%', height = 20, borderRadius = 8, style }: any) => {
  const opacity = useSharedValue(0.5);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, {
        duration: 1200,
        easing: Easing.ease,
      }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          marginBottom: 12,
        },
        style,
        animatedStyle,
      ]}
    />
  );
};

export const SkeletonLoader = {
  // Profile screen skeleton
  Profile: () => (
    <View style={styles.skeletonContainer}>
      <SkeletonBox width={80} height={80} borderRadius={40} style={{ marginBottom: 20 }} />
      <SkeletonBox width="60%" height={24} style={{ marginBottom: 8 }} />
      <SkeletonBox width="40%" height={16} style={{ marginBottom: 20 }} />
      <SkeletonBox height={50} style={{ marginBottom: 12 }} />
      <SkeletonBox height={50} style={{ marginBottom: 12 }} />
      <SkeletonBox height={50} />
    </View>
  ),

  // Stats grid skeleton
  StatsGrid: () => (
    <View style={styles.skeletonContainer}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <SkeletonBox flex={1} height={100} borderRadius={12} />
        <SkeletonBox flex={1} height={100} borderRadius={12} />
        <SkeletonBox flex={1} height={100} borderRadius={12} />
      </View>
    </View>
  ),

  // List skeleton
  List: ({ items = 5 }: any) => (
    <View style={styles.skeletonContainer}>
      {Array.from({ length: items }).map((_, i) => (
        <View key={i} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <SkeletonBox width={50} height={50} borderRadius={25} />
            <View style={{ flex: 1 }}>
              <SkeletonBox width="70%" height={16} style={{ marginBottom: 8 }} />
              <SkeletonBox width="40%" height={12} />
            </View>
          </View>
        </View>
      ))}
    </View>
  ),

  // Card skeleton
  Card: ({ width = '100%', height = 150 }: any) => (
    <SkeletonBox width={width} height={height} borderRadius={12} />
  ),

  // Chart skeleton
  Chart: () => (
    <View style={styles.skeletonContainer}>
      <SkeletonBox height={200} borderRadius={12} style={{ marginBottom: 20 }} />
      <SkeletonBox width="50%" height={16} />
    </View>
  ),
};

const styles = StyleSheet.create({
  skeletonContainer: {
    padding: 16,
  },
});

export default SkeletonLoader;

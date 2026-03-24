import React, { useEffect, useMemo, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import RadarNavigator from './RadarNavigator';
import ProfileNavigator from './ProfileNavigator';
import AIDiagnoseScreen from '../screens/AIDiagnoseScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import PermitTestScreen from '../screens/PermitTestScreen';
import DriveShortcutScreen from '../screens/DriveShortcutScreen';
import { useUiStore } from '../store/uiStore';
import { TAB_BAR_HEIGHT } from '../constants/layout';

export type MainTabParamList = {
  Home: { forceTab?: string } | undefined;
  Permit: undefined;
  Drive: undefined;
  Diagnose: undefined;
  Leaderboard: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<keyof MainTabParamList, any> = {
  Home: 'home-variant',
  Permit: 'book-open-variant',
  Drive: 'radar',
  Diagnose: 'car-wrench',
  Leaderboard: 'trophy-outline',
  Profile: 'account-circle',
};

const PillTabBar = React.memo(({ state, descriptors, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tabBarHidden = useUiStore((s) => s.isTabBarHidden);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const horizontalPadding = Math.max(12, Math.min(20, Math.round(width * 0.04)));
  const iconShellSize = Math.max(42, Math.min(56, Math.round(width * 0.13)));
  const centerShellSize = Math.round(iconShellSize * 1.24);
  const centerLift = Math.max(4, Math.min(8, Math.round(width * 0.015)));
  const iconRadius = Math.max(14, Math.round(iconShellSize * 0.36));
  const centerRadius = Math.max(18, Math.round(centerShellSize * 0.35));

  useEffect(() => {
    const hideDistance = TAB_BAR_HEIGHT + Math.max(insets.bottom, 10) + 16;
    translateY.value = withTiming(tabBarHidden ? hideDistance : 0, { duration: 220 });
    opacity.value = withTiming(tabBarHidden ? 0 : 1, { duration: 160 });
  }, [tabBarHidden, insets.bottom]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const handleTabPress = useCallback(
    (route: (typeof state.routes)[number], isFocused: boolean) => {
      const isCenter = route.name === 'Drive';
      if (isFocused && !isCenter) return;

      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (event.defaultPrevented) return;

      if (isCenter) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        (navigation as any).navigate('Drive');
        return;
      }

      navigation.navigate(route.name as never);
    },
    [navigation, state.routes]
  );

  return (
    <Animated.View
      style={[
        styles.tabWrapper,
        {
          paddingBottom: Math.max(insets.bottom + 8, 18),
          paddingHorizontal: horizontalPadding
        },
        animatedStyle,
        tabBarHidden && Platform.OS === 'android' ? styles.tabHidden : null,
      ]}
      pointerEvents={tabBarHidden ? 'none' : 'auto'}
    >
      <LinearGradient
        colors={['rgba(15,23,42,0.95)', 'rgba(2,6,23,0.9)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.tabPill,
          {
            paddingHorizontal: Math.max(10, Math.min(16, Math.round(width * 0.03))),
            paddingVertical: Math.max(6, Math.min(10, Math.round(width * 0.02)))
          }
        ]}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const iconName = TAB_ICONS[route.name as keyof MainTabParamList] || 'circle';
          const isCenter = route.name === 'Drive';

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={() => handleTabPress(route, isFocused)}
              style={[
                styles.tabItem,
                isCenter && styles.tabItemCenter,
                isCenter ? { transform: [{ translateY: -centerLift }] } : null
              ]}
              activeOpacity={0.9}
            >
              <View
                style={[
                  styles.iconShell,
                  {
                    width: iconShellSize,
                    height: iconShellSize,
                    borderRadius: iconRadius
                  },
                  isFocused && styles.iconShellActive,
                  isCenter && styles.iconShellCenter,
                  isCenter
                    ? {
                        width: centerShellSize,
                        height: centerShellSize,
                        borderRadius: centerRadius
                      }
                    : null,
                ]}
              >
                <MaterialCommunityIcons
                  name={iconName}
                  size={isCenter ? Math.round(iconShellSize * 0.54) : isFocused ? Math.round(iconShellSize * 0.5) : Math.round(iconShellSize * 0.42)}
                  color={isFocused ? '#FF6B6B' : '#94A3B8'}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </LinearGradient>
    </Animated.View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.state.index === nextProps.state.index &&
    prevProps.state.routes === nextProps.state.routes &&
    prevProps.navigation === nextProps.navigation
  );
});

const MainTabNavigator = () => {
  const screenOptions = useMemo(() => ({
    headerShown: false,
    lazy: true,
  }), []);

  return (
    <Tab.Navigator
      id="main-tabs"
      screenOptions={screenOptions}
      tabBar={(props) => <PillTabBar {...props} />}
    >
      <Tab.Screen
        name="Home"
        component={RadarNavigator}
        options={{ lazy: true }}
      />

      <Tab.Screen
        name="Permit"
        component={PermitTestScreen}
        options={{ lazy: true }}
      />

      <Tab.Screen
        name="Drive"
        component={DriveShortcutScreen}
        options={{ lazy: true }}
      />

      <Tab.Screen
        name="Diagnose"
        component={AIDiagnoseScreen}
        options={{ lazy: true }}
      />

      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{ lazy: true }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{ lazy: true }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  tabPill: {
    flexDirection: 'row',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    backgroundColor: 'rgba(15,23,42,0.95)',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabHidden: {
    display: 'none',
  },
  tabItemCenter: {},
  iconShell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconShellCenter: {
    transform: [{ translateY: -2 }],
  },
  iconShellActive: {
    backgroundColor: 'rgba(255,107,107,0.12)',
  },
});

export default MainTabNavigator;

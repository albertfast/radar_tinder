import React, { useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import RadarNavigator from './RadarNavigator';
import ProfileNavigator from './ProfileNavigator';
import AIDiagnoseScreen from '../screens/AIDiagnoseScreen';
import HistoryScreen from '../screens/HistoryScreen';
import { useUiStore } from '../store/uiStore';
import { TAB_BAR_HEIGHT } from '../constants/layout';

export type MainTabParamList = {
  Home: { forceTab?: string } | undefined;
  Permit: { screen?: string } | undefined;
  Drive: { forceTab?: string } | undefined;
  Diagnose: undefined;
  History: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<keyof MainTabParamList, any> = {
  Home: 'home-variant',
  Permit: 'book-open-variant',
  Drive: 'radar',
  Diagnose: 'car-wrench',
  History: 'car-multiple',
  Profile: 'account-circle',
};

const PillTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const tabBarHidden = useUiStore((s) => s.tabBarHidden);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const hideDistance = TAB_BAR_HEIGHT + Math.max(insets.bottom, 10) + 16;
    translateY.value = withTiming(tabBarHidden ? hideDistance : 0, { duration: 220 });
    opacity.value = withTiming(tabBarHidden ? 0 : 1, { duration: 160 });
  }, [tabBarHidden, insets.bottom, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.tabWrapper, { paddingBottom: Math.max(insets.bottom, 10) }, animatedStyle]}
      pointerEvents={tabBarHidden ? 'none' : 'auto'}
    >
      <LinearGradient
        colors={['rgba(15,23,42,0.95)', 'rgba(2,6,23,0.9)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.tabPill}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name as never);
            }
          };

          const iconName = TAB_ICONS[route.name as keyof MainTabParamList] || 'circle';
          const isCenter = route.name === 'Drive';

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={onPress}
              style={[styles.tabItem, isCenter && styles.tabItemCenter]}
              activeOpacity={0.9}
            >
              <View
                style={[
                  styles.iconShell,
                  isFocused && styles.iconShellActive,
                  isCenter && styles.iconShellCenter,
                ]}
              >
                <MaterialCommunityIcons
                  name={iconName}
                  size={isCenter ? 30 : isFocused ? 26 : 22}
                  color={isFocused ? '#FF6B6B' : '#94A3B8'}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </LinearGradient>
    </Animated.View>
  );
};

const MainTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => <PillTabBar {...props} />}
    >
      <Tab.Screen
        name="Home"
        component={RadarNavigator}
      />

      <Tab.Screen
        name="Permit"
        component={RadarNavigator}
        initialParams={{ screen: 'PermitTest' }}
      />

      <Tab.Screen
        name="Drive"
        component={RadarNavigator}
        initialParams={{ forceTab: 'Graphic' }}
      />

      <Tab.Screen
        name="Diagnose"
        component={AIDiagnoseScreen}
      />

      <Tab.Screen
        name="History"
        component={HistoryScreen}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
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
    paddingHorizontal: 16,
  },
  tabPill: {
    flexDirection: 'row',
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  tabItemCenter: {
    transform: [{ translateY: -6 }],
  },
  iconShell: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconShellCenter: {
    width: 64,
    height: 64,
    borderRadius: 22,
  },
  iconShellActive: {
    backgroundColor: 'rgba(255,107,107,0.12)',
  },
});

export default MainTabNavigator;

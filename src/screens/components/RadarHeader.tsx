import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutUp, withTiming, Layout } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ANIMATION_TIMING, STAGGER_DELAYS } from '../../utils/animationConstants';
import { HapticPatterns } from '../../utils/hapticFeedback';

interface RadarHeaderProps {
  activeTab: 'Basic' | 'Map' | 'Graphic';
  setActiveTab: (tab: 'Basic' | 'Map' | 'Graphic') => void;
  isDriving: boolean;
  setIsDriving: (driving: boolean) => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  onReportPress: () => void;
  user: any;
}

export const RadarHeader: React.FC<RadarHeaderProps> = ({
  activeTab,
  setActiveTab,
  isDriving,
  setIsDriving,
  isMuted,
  setIsMuted,
  onReportPress,
  user,
}) => {
  const tabs: Array<'Basic' | 'Map' | 'Graphic'> = ['Basic', 'Map', 'Graphic'];

  return (
    <Animated.View
      style={styles.header}
      entering={FadeInDown.duration(ANIMATION_TIMING.BASE)}
    >
      {/* User Info */}
      <View style={styles.userInfo}>
        <View>
          <Text style={styles.greeting}>Drive Safe</Text>
          <Text style={styles.userEmail}>{user?.email?.split('@')[0] || 'Driver'}</Text>
        </View>
        <View style={styles.controls}>
          <IconButton
            icon={isMuted ? 'bell-off' : 'bell'}
            iconColor={isMuted ? '#8f8f8f' : '#4ECDC4'}
            size={24}
            onPress={() => {
              HapticPatterns.medium();
              setIsMuted(!isMuted);
            }}
            accessibilityLabel={isMuted ? 'Unmute notifications' : 'Mute notifications'}
          />
          <IconButton
            icon={isDriving ? 'pause-circle' : 'play-circle'}
            iconColor={isDriving ? '#FF5252' : '#27AE60'}
            size={24}
            onPress={() => {
              HapticPatterns.success();
              setIsDriving(!isDriving);
            }}
            accessibilityLabel={isDriving ? 'Stop tracking' : 'Start tracking'}
          />
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        {tabs.map((tab, index) => (
          <Animated.View
            key={tab}
            entering={FadeInDown.delay(index * STAGGER_DELAYS.ITEM_FAST).duration(ANIMATION_TIMING.BASE)}
            style={styles.tabWrapper}
          >
            <TabButton
              label={tab}
              isActive={activeTab === tab}
              onPress={() => {
                HapticPatterns.selection();
                setActiveTab(tab);
              }}
            />
          </Animated.View>
        ))}
      </View>

      {/* Report Button */}
      <Animated.View
        entering={FadeInDown.delay(300).duration(ANIMATION_TIMING.BASE)}
        style={styles.reportButtonContainer}
      >
        <LinearGradient
          colors={['#FF5252', '#FF1744']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.reportButton, { overflow: 'hidden' }]}
        >
          <MaterialCommunityIcons
            name="plus"
            size={24}
            color="white"
            onPress={() => {
              HapticPatterns.heavy();
              onReportPress();
            }}
            style={{ marginRight: 8 }}
          />
          <Text
            style={styles.reportButtonText}
            onPress={() => {
              HapticPatterns.heavy();
              onReportPress();
            }}
          >
            REPORT
          </Text>
        </LinearGradient>
      </Animated.View>
    </Animated.View>
  );
};

const TabButton = ({ label, isActive, onPress }: any) => (
  <Animated.View layout={Layout.springify()}>
    <LinearGradient
      colors={isActive ? ['#4ECDC4', '#3BA89C'] : ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
      style={[styles.tab, isActive && styles.tabActive]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <Animated.Text
        style={[
          styles.tabText,
          isActive && styles.tabTextActive,
        ]}
        entering={isActive ? FadeInDown.duration(ANIMATION_TIMING.BASE) : FadeOutUp.duration(ANIMATION_TIMING.FAST)}
      >
        {label}
      </Animated.Text>
    </LinearGradient>
  </Animated.View>
);

const styles = StyleSheet.create({
  header: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'rgba(20, 20, 20, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  userInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greeting: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
  },
  userEmail: {
    fontSize: 12,
    color: '#8f8f8f',
    marginTop: 4,
  },
  controls: {
    flexDirection: 'row',
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tabWrapper: {
    flex: 1,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    minHeight: 40,
  },
  tabActive: {
    borderColor: '#4ECDC4',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8f8f8f',
  },
  tabTextActive: {
    color: 'white',
  },
  reportButtonContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  reportButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
});

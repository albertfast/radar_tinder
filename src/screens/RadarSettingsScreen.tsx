import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Text, Switch, useTheme, IconButton, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInLeft } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { SupabaseService } from '../services/SupabaseService';
import { ANIMATION_TIMING, STAGGER_DELAYS } from '../utils/animationConstants';
import { useAutoHideTabBar } from '../hooks/use-auto-hide-tab-bar';
import { TAB_BAR_HEIGHT } from '../constants/layout';

const RadarSettingsScreen = ({ navigation }: any) => {
  const theme = useTheme();
  const [voiceWarning, setVoiceWarning] = useState(true);
  const [soundLevel, setSoundLevel] = useState(100);
  const { unitSystem, setUnitSystem } = useSettingsStore();
  const { user } = useAuthStore();
  const { onScroll, onScrollBeginDrag, onScrollEndDrag } = useAutoHideTabBar();

  const handleUnitToggle = async () => {
    const nextUnit = unitSystem === 'metric' ? 'imperial' : 'metric';
    setUnitSystem(nextUnit);

    if (!user?.id) return;
    const updated = await SupabaseService.updateProfile(user.id, { unit_system: nextUnit });
    if (!updated) {
      Alert.alert('Settings', 'Failed to sync settings. Check your connection.');
    }
  };

  const SettingItem = ({ label, value, icon, type = 'text', onPress, delay }: any) => (
    <Animated.View entering={FadeInDown.delay(delay).duration(ANIMATION_TIMING.BASE)}>
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.03)']}
        style={styles.settingCard}
      >
        <TouchableOpacity 
          style={styles.settingContent} 
          onPress={onPress}
          disabled={type === 'switch'}
          activeOpacity={0.7}
        >
          <View style={styles.settingLeft}>
            {icon && (
              <Animated.View entering={FadeInLeft.delay(delay + 50).duration(ANIMATION_TIMING.FAST)}>
                <MaterialCommunityIcons name={icon} size={24} color="#4ECDC4" style={styles.settingIcon} />
              </Animated.View>
            )}
            <Text style={styles.settingLabel}>{label}</Text>
          </View>
          {type === 'text' && (
            <Animated.Text 
              style={styles.settingValue}
              entering={FadeInDown.delay(delay + 80).duration(ANIMATION_TIMING.FAST)}
            >
              {value}
            </Animated.Text>
          )}
          {type === 'switch' && (
            <Animated.View entering={FadeInDown.delay(delay + 80).duration(ANIMATION_TIMING.FAST)}>
              <Switch 
                value={voiceWarning} 
                onValueChange={setVoiceWarning} 
                color="#4ECDC4"
              />
            </Animated.View>
          )}
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <Animated.View 
        style={styles.header}
        entering={FadeInDown.duration(ANIMATION_TIMING.BASE)}
      >
        <IconButton 
          icon="chevron-left" 
          iconColor="white" 
          size={30} 
          onPress={() => navigation.goBack()} 
        />
        <Animated.Text 
          style={styles.headerTitle}
          entering={FadeInDown.delay(50).duration(ANIMATION_TIMING.BASE)}
        >
          Radar Settings
        </Animated.Text>
      </Animated.View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + 24 }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        scrollEventThrottle={16}
      >
        <SettingItem 
          label="Distance Unit" 
          value={unitSystem === 'metric' ? 'Kilometers (km)' : 'Miles (mi)'} 
          icon="ruler"
          onPress={handleUnitToggle}
          delay={100}
        />
        <SettingItem 
          label="Warning Sound Level" 
          value={`${soundLevel}%`}
          icon="volume-high"
          delay={200}
        />
        <SettingItem 
          label="Voice Warning" 
          type="switch"
          icon="microphone"
          delay={300}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  headerTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  settingCard: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.2)',
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    marginRight: 12,
  },
  settingLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  settingValue: {
    color: '#4ECDC4',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default RadarSettingsScreen;

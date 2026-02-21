import React from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AdBanner from '../../../../components/AdBanner';
import { formatDistance, formatSpeed } from '../../../../utils/format';
import { radarScreenStyles as styles } from '../../styles/radarScreenStyles';

type RadarBasicTabProps = {
  currentSpeed: number;
  unitSystem: 'metric' | 'imperial';
  nearbyRadars: any[];
  tabBarInset: number;
};

export function RadarBasicTab({ currentSpeed, unitSystem, nearbyRadars, tabBarInset }: RadarBasicTabProps) {
  const speedParts = formatSpeed(currentSpeed, unitSystem).split(' ');
  const getRadarLabel = (radar: any) =>
    radar.type === 'police' ? 'Police Spotted' : 'Speed Camera';
  const getRadarStreetHint = (radar: any) => {
    const source = radar.locationHint || radar.locationLabel || '';
    if (!source) return '';
    return String(source)
      .split(',')
      .slice(0, 2)
      .join(', ')
      .trim();
  };

  return (
    <ScrollView
      style={styles.basicScroll}
      contentContainerStyle={[styles.basicContainer, { paddingBottom: tabBarInset + 22 }]}
      showsVerticalScrollIndicator={false}
      scrollEnabled
    >
      <View style={styles.basicTopAdContainer}>
        <AdBanner size="LARGE_BANNER" />
      </View>

      <View style={styles.hudCircle}>
        <Text style={styles.speedText}>{speedParts[0]}</Text>
        <Text style={styles.unitText}>{speedParts[1]}</Text>
        <View style={[styles.ring, { borderColor: '#4ECDC4' }]} />
        <View style={[styles.ring, { width: 230, height: 230, borderColor: 'rgba(78,205,196,0.3)', borderWidth: 1 }]} />
      </View>

      <View style={styles.alertsList}>
        <Text style={styles.sectionHeader}>NEARBY RADARS</Text>
        {nearbyRadars.length > 0 ? (
          nearbyRadars.slice(0, 20).map((radar, index) => (
            <View key={index} style={styles.alertItem}>
              <MaterialCommunityIcons
                name={radar.type === 'police' ? 'alarm-light' : 'camera'}
                size={24}
                color={radar.type === 'police' ? '#FF5252' : '#4ECDC4'}
              />
              <View style={{ flex: 1, marginLeft: 15 }}>
                <Text style={[styles.alertText, { marginLeft: 0 }]}>{getRadarLabel(radar)}</Text>
                {getRadarStreetHint(radar) ? (
                  <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 2 }}>
                    {getRadarStreetHint(radar)}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.alertDist}>{formatDistance(radar.distance, unitSystem)}</Text>
            </View>
          ))
        ) : (
          <Text style={{ color: '#666', marginTop: 10, textAlign: 'center' }}>Scanning area...</Text>
        )}
      </View>

      <View style={styles.basicBottomAdContainer}>
        <AdBanner size="MEDIUM_RECTANGLE" />
      </View>
    </ScrollView>
  );
}

export type { RadarBasicTabProps };

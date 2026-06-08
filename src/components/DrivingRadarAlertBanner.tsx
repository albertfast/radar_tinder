import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RadarAlert } from '../types';
import { formatDistance } from '../utils/format';
import { formatRadarTypeLabel } from '../utils/radarAlerts';

type DrivingRadarAlertBannerProps = {
  alert: RadarAlert | null;
  unitSystem: 'metric' | 'imperial';
  topOffset: number;
};

export function DrivingRadarAlertBanner({ alert, unitSystem, topOffset }: DrivingRadarAlertBannerProps) {
  const label = useMemo(() => {
    if (!alert) return null;
    const typeLabel = formatRadarTypeLabel(alert.type);
    const distanceLabel = formatDistance(alert.distance, unitSystem);
    return `${typeLabel} · ${distanceLabel}`;
  }, [alert, unitSystem]);

  if (!alert || !label) {
    return null;
  }

  const severityColor = alert.severity === 'high' ? '#FF5252' : alert.severity === 'medium' ? '#FFB020' : '#4ECDC4';

  return (
    <View pointerEvents="none" style={[styles.wrap, { top: topOffset }]}>
      <View style={[styles.banner, { borderColor: severityColor }]}>
        <MaterialCommunityIcons name="camera-control" size={20} color={severityColor} />
        <Text style={styles.text} numberOfLines={2}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 90,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
  },
  text: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
});

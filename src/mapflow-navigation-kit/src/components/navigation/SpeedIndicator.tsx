import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../utils/colors';
import { useNavigationStore } from '../../stores/navigationStore';
import { convertSpeed, getUnitLabel, getSpeedWarning } from '../../utils/units';

interface SpeedIndicatorProps {
  bottomOffset?: number;
}

export default memo(function SpeedIndicator({ bottomOffset = 0 }: SpeedIndicatorProps) {
  const insets = useSafeAreaInsets();
  const { userSpeed, speedLimit, isNavigating, isDrivingSession, route, unitSystem } = useNavigationStore();

  // Route preview ("Start Navigation") owns the bottom-left area — hide to avoid overlap.
  if (route && !isNavigating) {
    return null;
  }

  if (!isNavigating && !isDrivingSession) {
    return null;
  }

  const displaySpeed = convertSpeed(userSpeed, unitSystem);
  const displayLimit = speedLimit
    ? unitSystem === 'imperial'
      ? Math.round(speedLimit * 0.621371)
      : speedLimit
    : null;

  const warning = getSpeedWarning(displaySpeed, displayLimit);
  const unit = getUnitLabel(unitSystem);
  const bottom = (isNavigating ? Math.max(118, insets.bottom + 86) : Math.max(152, insets.bottom + 118)) + bottomOffset;

  return (
    <View style={[styles.container, { bottom }]} pointerEvents="none">
      <View style={[styles.metricBox, styles.speedBox, { borderColor: warning.color }]}>
        <Text style={[styles.speedLabel, { color: warning.color }]}>SPEED</Text>
        <Text style={[styles.speedValue, { color: warning.color }]}>{displaySpeed}</Text>
        <Text style={[styles.speedUnit, { color: warning.color }]}>{unit}</Text>
      </View>

      <View
        style={[
          styles.metricBox,
          styles.limitBox,
          { borderColor: warning.color },
        ]}
      >
        <Text style={styles.limitLabel}>LIMIT</Text>
        <Text style={[styles.limitValue, { color: warning.color }]}>{displayLimit ?? '--'}</Text>
        <Text style={[styles.limitUnit, { color: warning.color }]}>{unit}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 18,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricBox: {
    width: 56,
    height: 56,
    borderRadius: 15,
    backgroundColor: 'rgba(10, 25, 41, 0.9)',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  speedBox: {
  },
  speedLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.2,
    fontFamily: 'System',
  },
  speedValue: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'System',
    lineHeight: 26,
  },
  speedUnit: {
    fontSize: 9,
    fontWeight: '600',
    fontFamily: 'System',
  },
  limitBox: {
    borderColor: COLORS.border,
  },
  limitLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.2,
    fontFamily: 'System',
  },
  limitValue: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    fontFamily: 'System',
    lineHeight: 26,
  },
  limitUnit: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textSecondary,
    fontFamily: 'System',
  },
});

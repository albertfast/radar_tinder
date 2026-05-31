import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../utils/colors';
import { getUnitLabel, getSpeedWarning } from '../../utils/units';
import { useNavigationStore } from '../../stores/navigationStore';
import { convertSpeed } from '../../utils/units';

/**
 * Road-sign style speed limit display.
 * Circular white sign with red border (like real road signs),
 * or dark themed version matching the app style.
 */
export default memo(function SpeedLimitSign() {
  const { speedLimit, isNavigating, unitSystem } = useNavigationStore();

  if (!isNavigating || speedLimit === null) return null;

  const displayLimit = unitSystem === 'imperial'
    ? Math.round(speedLimit * 0.621371)
    : speedLimit;
  const unit = getUnitLabel(unitSystem);

  const currentSpeed = convertSpeed(
    useNavigationStore.getState().userSpeed,
    unitSystem,
  );
  const warning = getSpeedWarning(currentSpeed, displayLimit);

  return (
    <View style={styles.container}>
      <View style={[styles.sign, { borderColor: warning.color }]}>
        <View style={[styles.innerBorder, { borderColor: warning.color }]}>
          <Text style={[styles.value, { color: warning.color }]}>{displayLimit}</Text>
        </View>
      </View>
      <Text style={[styles.unitLabel, { color: warning.color }]}>{unit}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  sign: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },
  innerBorder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  value: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    fontFamily: 'System',
    lineHeight: 24,
  },
  unitLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: 'System',
    marginTop: 4,
    letterSpacing: 0.5,
  },
});

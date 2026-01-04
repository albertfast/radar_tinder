import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Dimensions, Platform, UIManager } from 'react-native';
import LottieView from 'lottie-react-native';
import Radar3DView from './Radar3DView';
import { logInfo } from '../utils/logger';

const { width } = Dimensions.get('window');
const SIZE = width * 0.8;

export const RadarAnimation = () => {
  const canUseRadar3D = useMemo(() => {
    if (Platform.OS !== 'android') return false;
    return !!UIManager.getViewManagerConfig?.('Radar3DView');
  }, []);

  useEffect(() => {
    if (canUseRadar3D) {
      logInfo('Radar3DView active');
    }
  }, [canUseRadar3D]);

  return (
    <View style={styles.container}>
      {canUseRadar3D ? (
        <Radar3DView style={styles.glView} />
      ) : (
        <>
          <LottieView
            source={{ uri: 'https://assets9.lottiefiles.com/packages/lf20_6p8vun.json' }}
            autoPlay
            loop
            style={styles.lottie}
          />
          <View style={styles.centerDot} />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    width: SIZE,
    height: SIZE,
  },
  lottie: {
    width: SIZE,
    height: SIZE,
  },
  glView: {
    width: SIZE,
    height: SIZE,
    backgroundColor: 'transparent',
  },
  centerDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2196F3',
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5,
  }
});

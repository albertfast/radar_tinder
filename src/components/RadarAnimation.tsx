import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import LottieView from 'lottie-react-native';

const { width } = Dimensions.get('window');
const SIZE = width * 0.8;

export const RadarAnimation = () => {
  return (
    <View style={styles.container}>
      <LottieView
        source={{ uri: 'https://assets9.lottiefiles.com/packages/lf20_6p8vun.json' }} // Radar scanning animation
        autoPlay
        loop
        style={styles.lottie}
      />
      {/* Overlay a subtle glow or center dot if needed */}
      <View style={styles.centerDot} />
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

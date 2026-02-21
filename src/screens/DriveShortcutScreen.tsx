import React, { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

const DriveShortcutScreen = ({ navigation }: any) => {
  useFocusEffect(
    useCallback(() => {
      const timeout = setTimeout(() => {
        navigation.navigate('Home', {
          screen: 'RadarMain',
          params: { forceTab: 'Basic' },
        });
      }, 0);

      return () => clearTimeout(timeout);
    }, [navigation])
  );

  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color="#4ECDC4" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default DriveShortcutScreen;

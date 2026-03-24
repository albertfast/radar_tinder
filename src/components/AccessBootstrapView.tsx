import React from 'react';
import { View, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '../constants/layout';

type AccessBootstrapViewProps = {
  title?: string;
  subtitle?: string;
};

export function AccessBootstrapView({
  title = 'Checking subscription',
  subtitle = 'Restoring your access and recent purchases.',
}: AccessBootstrapViewProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const maxContentWidth = Math.min(width - 32, 560);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F172A', '#020617']} style={StyleSheet.absoluteFill} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 26,
            paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 30,
          },
        ]}
      >
        <View style={[styles.card, { width: maxContentWidth }]}>
          <ActivityIndicator size="small" color="#4ECDC4" />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.28)',
    alignItems: 'center',
  },
  title: { color: 'white', fontWeight: '800', fontSize: 18, marginTop: 12, marginBottom: 6 },
  subtitle: { color: '#94A3B8', fontSize: 13, lineHeight: 18, textAlign: 'center' },
});

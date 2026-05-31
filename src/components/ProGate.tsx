import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import AdBanner from './AdBanner';

interface ProGateProps {
  title?: string;
  subtitle?: string;
  onUpgrade?: () => void | Promise<void>;
  adUnitId?: string;
  showAd?: boolean;
}

const ProGate: React.FC<ProGateProps> = ({
  title = 'Pro Feature',
  subtitle = 'Upgrade to unlock this feature.',
  onUpgrade,
  adUnitId,
  showAd = true,
}) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const maxContentWidth = Math.min(width - 32, 560);
  const featureGateAdUnitId =
    adUnitId ||
    process.env.EXPO_PUBLIC_ADMOB_LOCKED_FEATURE_UNIT_ID ||
    'ca-app-pub-9670547831022880/5261007755';

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
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="lock" size={26} color="#F59E0B" />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {onUpgrade ? (
            <TouchableOpacity onPress={onUpgrade} style={styles.cta}>
              <Text style={styles.ctaText}>Upgrade to Pro</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {showAd ? (
          <View style={[styles.featureAdWrap, { width: maxContentWidth }]}>
            <AdBanner size="MEDIUM_RECTANGLE" unitId={featureGateAdUnitId} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

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
    borderColor: 'rgba(245,158,11,0.35)',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245,158,11,0.18)',
    marginBottom: 12,
  },
  title: { color: 'white', fontWeight: '800', fontSize: 18, marginBottom: 6 },
  subtitle: { color: '#94A3B8', fontSize: 13, lineHeight: 18 },
  cta: {
    marginTop: 16,
    backgroundColor: '#F59E0B',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: { color: '#0B1424', fontWeight: '800', fontSize: 13 },
  featureAdWrap: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(15,23,42,0.45)',
    paddingVertical: 8,
  },
});

export default ProGate;

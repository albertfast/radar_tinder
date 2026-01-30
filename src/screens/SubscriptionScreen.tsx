import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../store/authStore';
import { SubscriptionService } from '../services/SubscriptionService';
import { AnalyticsService } from '../services/AnalyticsService';
import { useAutoHideTabBar } from '../hooks/use-auto-hide-tab-bar';
import { TAB_BAR_HEIGHT } from '../constants/layout';

const TITLE_FONT = Platform.select({ ios: 'Georgia', android: 'serif' });
const DISPLAY_FONT = Platform.select({ ios: 'AvenirNext-Heavy', android: 'sans-serif-condensed' });

const SubscriptionScreen = ({ navigation }: any) => {
  const [selectedPlan, setSelectedPlan] = useState<'weekly' | 'yearly' | 'adfree'>('yearly');
  const [isTrialEnabled, setIsTrialEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const { onScroll, onScrollBeginDrag, onScrollEndDrag } = useAutoHideTabBar();
  const trialAvailable = selectedPlan === 'yearly';
  const trialActive = trialAvailable && isTrialEnabled;

  const plans = {
    adfree: {
      id: 'remove_ads',
      name: 'Ad-Free Basic',
      price: '$0.99',
      period: 'once',
      trial: null,
      tag: 'AD-FREE',
      description: 'Remove ads. Limited access to core features.',
      accent: '#F59E0B',
    },
    weekly: {
      id: 'rc_weekly_399',
      name: 'Weekly',
      price: '$3.99',
      period: 'week',
      trial: null,
      tag: 'FLEXIBLE',
      description: 'Billed weekly. Starts immediately.',
      accent: '#FF8A3D',
    },
    yearly: {
      id: 'rc_yearly_1999',
      name: 'Yearly',
      price: '$19.99',
      period: 'year',
      trial: '3-Day Free Trial',
      tag: 'BEST VALUE',
      description: 'Then $19.99/year. About $0.38/week.',
      accent: '#2DD4BF',
    },
  };

  const { updateUser } = useAuthStore();

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const planToPurchase = trialActive ? 'yearly' : selectedPlan;

      await AnalyticsService.trackEvent('subscription_attempt', {
        plan: planToPurchase,
        trial: trialActive,
      });

      if (planToPurchase === 'adfree') {
        updateUser({ subscriptionType: 'free', adsRemoved: true });
      } else {
        updateUser({ subscriptionType: 'pro', adsRemoved: false });
      }
      navigation.goBack();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    await SubscriptionService.restorePurchases();
    setLoading(false);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0B0E14', '#121821', '#0B0E14']} style={styles.background} />
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <View style={styles.header}>
        <IconButton
          icon="close"
          iconColor="#F8FAFC"
          size={28}
          onPress={() => navigation.goBack()}
        />
        <TouchableOpacity onPress={handleRestore}>
          <Text style={styles.restoreText}>Restore</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_HEIGHT + 24 }]}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        scrollEventThrottle={16}
      >
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>PRO PASS</Text>
          <Text style={styles.heroTitle}>Drive with confidence</Text>
          <Text style={styles.heroSubtitle}>
            Unlock live radar alerts, navigation insights, and AI diagnostics with a plan that fits your ride.
          </Text>
        </View>

        <View style={styles.planStack}>
          <PlanOption
            plan={plans.yearly}
            isSelected={selectedPlan === 'yearly'}
            onSelect={() => {
              setSelectedPlan('yearly');
              setIsTrialEnabled(true);
            }}
          />
          <PlanOption
            plan={plans.adfree}
            isSelected={selectedPlan === 'adfree'}
            onSelect={() => {
              setSelectedPlan('adfree');
              setIsTrialEnabled(false);
            }}
          />
          <PlanOption
            plan={plans.weekly}
            isSelected={selectedPlan === 'weekly'}
            onSelect={() => {
              setSelectedPlan('weekly');
              setIsTrialEnabled(false);
            }}
          />
        </View>

        <View style={styles.trialRow}>
          <TouchableOpacity
            style={styles.trialToggle}
            onPress={() => {
              if (trialAvailable) setIsTrialEnabled(!isTrialEnabled);
            }}
            disabled={!trialAvailable}
          >
            <MaterialCommunityIcons
              name={trialActive ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={24}
              color={trialAvailable ? '#2DD4BF' : '#3A3F4B'}
            />
          </TouchableOpacity>
          <View style={styles.trialCopy}>
            <Text style={[styles.trialTitle, !trialAvailable && styles.mutedText]}>
              Enable 3-Day Free Trial
            </Text>
            <Text style={[styles.trialSubtitle, !trialAvailable && styles.mutedText]}>
              Yearly plan only. Weekly plan bills immediately.
            </Text>
          </View>
        </View>

        <View style={styles.featureGrid}>
          <FeatureTile icon="radar" text="Live radar & police alerts" tone="#FF8A3D" />
          <FeatureTile icon="map-marker-path" text="Safe-route navigation" tone="#38BDF8" />
          <FeatureTile icon="account-group" text="Community confirmations" tone="#FBBF24" />
          <FeatureTile icon="history" text="Trip history & weekly stats" tone="#34D399" />
          <FeatureTile icon="trophy" text="Leaderboard & driver rank" tone="#F97316" />
          <FeatureTile icon="car-cog" text="AI car diagnostics" tone="#2DD4BF" />
          <FeatureTile icon="block-helper" text="Ad-free experience" tone="#F59E0B" />
          <FeatureTile icon="clipboard-text" text="Permit test practice" tone="#60A5FA" />
        </View>

        <TouchableOpacity
          style={[styles.subscribeButton, loading && { opacity: 0.7 }]}
          onPress={handleSubscribe}
          disabled={loading}
        >
          <LinearGradient
            colors={['#F97316', '#FDBA74']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.subscribeGradient}
          >
            <Text style={styles.subscribeButtonText}>
              {loading ? 'PROCESSING...' : trialActive ? 'START 3-DAY FREE TRIAL' : 'SUBSCRIBE NOW'}
            </Text>
            <Text style={styles.subscribeSubtext}>
              {!loading &&
                (trialActive
                  ? `Then ${plans.yearly.price}/year after trial`
                  : selectedPlan === 'adfree'
                    ? 'One-time purchase'
                    : `${plans[selectedPlan].price}/${plans[selectedPlan].period} billed immediately`)}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.termsText}>
          Recurring billing. Free trial applies to the yearly plan only. Cancel anytime.
          By continuing you agree to our Terms of Service and Privacy Policy.
        </Text>
      </ScrollView>
    </View>
  );
};

const FeatureTile = ({ icon, text, tone }: { icon: string; text: string; tone: string }) => (
  <View style={[styles.featureTile, { borderColor: `${tone}40` }]}>
    <View style={[styles.featureIcon, { backgroundColor: `${tone}20` }]}>
      <MaterialCommunityIcons name={icon} size={18} color={tone} />
    </View>
    <Text style={styles.featureText}>{text}</Text>
  </View>
);

const PlanOption = ({ plan, isSelected, onSelect }: any) => (
  <TouchableOpacity
    style={[styles.planWrapper, isSelected && { borderColor: plan.accent }]}
    onPress={onSelect}
    activeOpacity={0.85}
  >
    <LinearGradient
      colors={
        isSelected
          ? [`${plan.accent}35`, `${plan.accent}10`]
          : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.planCard}
    >
      <View style={styles.planHeaderRow}>
        <Text style={styles.planName}>{plan.name}</Text>
        <View style={[styles.planTag, { backgroundColor: isSelected ? plan.accent : 'rgba(255,255,255,0.08)' }]}>
          <Text style={[styles.planTagText, isSelected && styles.planTagTextActive]}>{plan.tag}</Text>
        </View>
      </View>
      <View style={styles.planPriceRow}>
        <Text style={[styles.planPrice, { color: isSelected ? plan.accent : '#F8FAFC' }]}>{plan.price}</Text>
        <Text style={styles.planPeriod}>/{plan.period}</Text>
      </View>
      {plan.trial && <Text style={styles.planTrial}>{plan.trial}</Text>}
      <Text style={styles.planDetail}>{plan.description}</Text>
      <View style={[styles.planCheck, isSelected && { backgroundColor: plan.accent, borderColor: plan.accent }]}>
        {isSelected && <MaterialCommunityIcons name="check" size={16} color="#0B0E14" />}
      </View>
    </LinearGradient>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E14' },
  background: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  glowTop: { position: 'absolute', top: -120, right: -80, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(45,212,191,0.15)' },
  glowBottom: { position: 'absolute', bottom: -140, left: -90, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(249,115,22,0.18)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, paddingTop: 50 },
  restoreText: { color: '#94A3B8', fontSize: 14, marginRight: 20 },
  content: { padding: 20 },

  hero: { marginBottom: 20 },
  heroEyebrow: { color: '#94A3B8', letterSpacing: 2, fontSize: 11, fontWeight: '700' },
  heroTitle: { color: '#F8FAFC', fontSize: 30, fontWeight: '800', marginTop: 8, fontFamily: DISPLAY_FONT },
  heroSubtitle: { color: '#CBD5F5', fontSize: 14, marginTop: 10, lineHeight: 20 },

  planStack: { gap: 12, marginBottom: 18 },
  planWrapper: { borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  planCard: { padding: 18, borderRadius: 20, minHeight: 130 },
  planHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: { color: '#F8FAFC', fontSize: 18, fontWeight: '700', fontFamily: TITLE_FONT },
  planTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  planTagText: { color: '#CBD5F5', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  planTagTextActive: { color: '#0B0E14' },
  planPriceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 },
  planPrice: { fontSize: 28, fontWeight: '800' },
  planPeriod: { color: '#CBD5F5', fontSize: 14, marginLeft: 6, marginBottom: 4 },
  planTrial: { color: '#FBBF24', fontSize: 12, marginTop: 6, fontWeight: '700' },
  planDetail: { color: '#94A3B8', fontSize: 12, marginTop: 6 },
  planCheck: { position: 'absolute', right: 16, bottom: 16, width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  trialRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  trialToggle: { marginRight: 10 },
  trialCopy: { flex: 1 },
  trialTitle: { color: '#F8FAFC', fontWeight: '700', fontSize: 13 },
  trialSubtitle: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  mutedText: { color: '#475569' },

  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  featureTile: { width: '48%', borderRadius: 14, borderWidth: 1, padding: 12, backgroundColor: 'rgba(255,255,255,0.03)' },
  featureIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  featureText: { color: '#E2E8F0', fontSize: 12, fontWeight: '600' },

  subscribeButton: { borderRadius: 18, overflow: 'hidden' },
  subscribeGradient: { paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center', borderRadius: 18 },
  subscribeButtonText: { color: '#0B0E14', fontWeight: '900', fontSize: 14, letterSpacing: 0.6 },
  subscribeSubtext: { color: '#1E293B', fontSize: 12, marginTop: 6, fontWeight: '700' },

  termsText: { color: '#64748B', fontSize: 11, textAlign: 'center', marginTop: 20, lineHeight: 16 },
});

export default SubscriptionScreen;

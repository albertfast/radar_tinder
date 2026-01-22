import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ImageBackground, Dimensions } from 'react-native';
import { Text, Surface, Button, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../store/authStore';
import { SubscriptionService } from '../services/SubscriptionService';
import { AnalyticsService } from '../services/AnalyticsService';
import { useAutoHideTabBar } from '../hooks/use-auto-hide-tab-bar';
import { TAB_BAR_HEIGHT } from '../constants/layout';

const { width } = Dimensions.get('window');

const SubscriptionScreen = ({ navigation }: any) => {
  const [selectedPlan, setSelectedPlan] = useState<'weekly' | 'yearly'>('yearly');
  const [isTrialEnabled, setIsTrialEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const { onScroll, onScrollBeginDrag, onScrollEndDrag } = useAutoHideTabBar();
  const trialAvailable = selectedPlan === 'yearly';
  const trialActive = trialAvailable && isTrialEnabled;

  const plans = {
    weekly: {
      id: 'rc_weekly_399',
      name: 'Weekly',
      price: '$3.99',
      period: 'week',
      trial: null,
      savings: 'FLEXIBLE',
      description: 'Billed weekly. Starts immediately.'
    },
    yearly: {
      id: 'rc_yearly_1999',
      name: 'Yearly',
      price: '$19.99',
      period: 'year',
      trial: '3-Day Free Trial',
      savings: 'BEST VALUE',
      description: 'Then $19.99/year. About $0.38/week.'
    }
  };

  const { updateUser } = useAuthStore();

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      // In a real app, we'd find the matching RevenueCat package
      // const offerings = await SubscriptionService.getOfferings();
      // const pack = offerings?.availablePackages.find(p => p.identifier.includes(selectedPlan));
      
      // If trial is chosen, it maps to yearly per user request
      const planToPurchase = trialActive ? 'yearly' : selectedPlan;
      
      // await SubscriptionService.purchasePackage(pack);
      
      // Analytics
      await AnalyticsService.trackEvent('subscription_attempt', {
        plan: planToPurchase,
        trial: trialActive
      });

      // Mocking success for demo
      updateUser({ subscriptionType: 'pro' });
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
      <LinearGradient
        colors={['#000000', '#1a1a1a', '#000000']}
        style={styles.background}
      />
      
      <View style={styles.header}>
        <IconButton 
          icon="close" 
          iconColor="white" 
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
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="crown" size={80} color="#FFD700" />
          <View style={styles.glow} />
        </View>

        <Text style={styles.title}>Unlock PRO Features</Text>
        
        <View style={styles.featuresList}>
          <FeatureItem icon="radar" text="Live speed trap & police alerts" />
          <FeatureItem icon="map-marker-path" text="Navigation with safe-route guidance" />
          <FeatureItem icon="account-group" text="Community reports & confirmations" />
          <FeatureItem icon="history" text="Trip history & weekly insights" />
          <FeatureItem icon="trophy" text="Leaderboard & driver profile" />
          <FeatureItem icon="clipboard-text" text="Permit test practice" />
          <FeatureItem icon="car-cog" text="AI car diagnostics" />
          <FeatureItem icon="block-helper" text="Ad-free experience" />
        </View>

        <View style={styles.plansContainer}>
          <PlanOption 
            plan={{
              ...plans.yearly,
              trial: trialActive ? '3-Day Free Trial enabled' : '3-Day Free Trial available',
            }} 
            isSelected={selectedPlan === 'yearly'} 
            onSelect={() => { setSelectedPlan('yearly'); setIsTrialEnabled(true); }}
          />
          <PlanOption 
            plan={plans.weekly} 
            isSelected={selectedPlan === 'weekly'} 
            onSelect={() => { setSelectedPlan('weekly'); setIsTrialEnabled(false); }}
          />
        </View>

        <View style={styles.trialToggle}>
          <TouchableOpacity 
            style={styles.checkbox} 
            onPress={() => {
              if (trialAvailable) setIsTrialEnabled(!isTrialEnabled);
            }}
            disabled={!trialAvailable}
          >
            <MaterialCommunityIcons 
              name={trialActive ? "checkbox-marked" : "checkbox-blank-outline"} 
              size={24} 
              color={trialAvailable ? "#FFD700" : "#475569"} 
            />
          </TouchableOpacity>
          <Text style={[styles.trialText, !trialAvailable && styles.trialTextMuted]}>
            Enable 3-Day Free Trial (Yearly plan)
          </Text>
        </View>

        <TouchableOpacity 
          style={[styles.subscribeButton, loading && { opacity: 0.5 }]} 
          onPress={handleSubscribe}
          disabled={loading}
        >
          <LinearGradient
            colors={['#FFD700', '#FFA000']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientButton}
          >
            <Text style={styles.subscribeButtonText}>
              {loading ? 'PROCESSING...' : (trialActive ? 'START 3-DAY FREE TRIAL' : 'SUBSCRIBE NOW')}
            </Text>
            <Text style={styles.subscribeSubtext}>
              {!loading && (trialActive 
                ? `Then ${plans.yearly.price}/year after trial`
                : `${plans[selectedPlan].price}/${plans[selectedPlan].period} billed immediately`
              )}
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

const FeatureItem = ({ icon, text }: { icon: string, text: string }) => (
  <View style={styles.featureItem}>
    <MaterialCommunityIcons name="check-circle" size={20} color="#FFD700" />
    <Text style={styles.featureText}>{text}</Text>
  </View>
);

const PlanOption = ({ plan, isSelected, onSelect }: any) => (
  <TouchableOpacity
    style={[styles.planCardWrapper, isSelected && styles.planCardWrapperActive]}
    onPress={onSelect}
    activeOpacity={0.85}
  >
    <LinearGradient
      colors={
        isSelected
          ? ['rgba(255,215,0,0.18)', 'rgba(255,215,0,0.06)']
          : ['rgba(30,30,30,0.9)', 'rgba(10,10,10,0.9)']
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.planCard}
    >
      <View style={styles.planHeaderRow}>
        <Text style={[styles.planName, isSelected && styles.selectedText]}>{plan.name}</Text>
        {plan.savings && (
          <View style={[styles.planTag, isSelected && styles.planTagActive]}>
            <Text style={[styles.planTagText, isSelected && styles.planTagTextActive]}>{plan.savings}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.planPrice, isSelected && styles.selectedText]}>{plan.price}</Text>
      <Text style={[styles.planPer, isSelected && styles.selectedText]}>per {plan.period}</Text>
      {plan.trial && <Text style={styles.planTrial}>{plan.trial}</Text>}
      <Text style={styles.planDetail}>{plan.description}</Text>
      <View style={[styles.radioButton, isSelected && styles.selectedRadio]}>
        {isSelected && <View style={styles.radioInner} />}
      </View>
    </LinearGradient>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  background: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, paddingTop: 50 },
  restoreText: { color: '#8E8E93', fontSize: 14, marginRight: 20 },
  content: { padding: 20, alignItems: 'center' },
  iconContainer: { marginBottom: 20, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: '#FFD700', opacity: 0.2, transform: [{ scale: 1.5 }] },
  title: { fontSize: 28, fontWeight: 'bold', color: 'white', marginBottom: 30, textAlign: 'center' },
  featuresList: { width: '100%', marginBottom: 30, paddingHorizontal: 20 },
  featureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  featureText: { color: 'white', fontSize: 16, marginLeft: 15 },
  plansContainer: { width: '100%', marginBottom: 20, gap: 12 },
  planCardWrapper: { width: '100%' },
  planCardWrapperActive: { shadowColor: '#FFD700', shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  planCard: { borderRadius: 18, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  planHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  planName: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  planPrice: { color: 'white', fontSize: 28, fontWeight: '900' },
  planPer: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  planTrial: { color: '#FFD700', fontSize: 12, fontWeight: '700', marginTop: 8 },
  planDetail: { color: '#94A3B8', fontSize: 12, marginTop: 6 },
  planTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  planTagActive: { backgroundColor: 'rgba(255,215,0,0.18)' },
  planTagText: { color: '#94A3B8', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  planTagTextActive: { color: '#FFD700' },
  selectedText: { color: 'white' },
  radioButton: { position: 'absolute', right: 14, bottom: 14, width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#94A3B8', justifyContent: 'center', alignItems: 'center' },
  selectedRadio: { borderColor: '#FFD700' },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFD700' },
  trialToggle: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  checkbox: { marginRight: 10 },
  trialText: { color: 'white', fontSize: 14 },
  trialTextMuted: { color: '#64748B' },
  subscribeButton: { width: '100%', borderRadius: 30, overflow: 'hidden', marginBottom: 15 },
  gradientButton: { paddingVertical: 15, alignItems: 'center' },
  subscribeButtonText: { color: 'black', fontSize: 18, fontWeight: 'bold' },
  subscribeSubtext: { color: 'rgba(0,0,0,0.7)', fontSize: 12, marginTop: 2 },
  termsText: { color: '#666', fontSize: 10, textAlign: 'center', paddingHorizontal: 20 }
});

export default SubscriptionScreen;

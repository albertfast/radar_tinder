import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ImageBackground, Dimensions } from 'react-native';
import { Text, Surface, Button, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../store/authStore';
import { SubscriptionService } from '../services/SubscriptionService';
import { AnalyticsService } from '../services/AnalyticsService';

const { width } = Dimensions.get('window');

const SubscriptionScreen = ({ navigation }: any) => {
  const [selectedPlan, setSelectedPlan] = useState<'weekly' | 'monthly' | 'yearly' | 'remove_ads'>('yearly');
  const [isTrialEnabled, setIsTrialEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  const plans = {
    weekly: {
      id: 'weekly',
      price: '$3.99',
      period: 'week',
      trial: null,
      savings: null
    },
    monthly: {
      id: 'monthly',
      price: '$3.99',
      period: 'month',
      trial: null,
      savings: 'SAVE 20%'
    },
    yearly: {
      id: 'yearly',
      price: '$19.99',
      period: 'year',
      trial: '3 Days Free',
      savings: 'SAVE 80%'
    },
    remove_ads: {
      id: 'remove_ads',
      price: '$0.99',
      period: 'once',
      trial: null,
      savings: null,
      label: 'Remove Ads'
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
      const planToPurchase = isTrialEnabled ? 'yearly' : selectedPlan;
      
      // await SubscriptionService.purchasePackage(pack);
      
      // Analytics
      await AnalyticsService.trackEvent('subscription_attempt', {
        plan: planToPurchase,
        trial: isTrialEnabled
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

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="crown" size={80} color="#FFD700" />
          <View style={styles.glow} />
        </View>

        <Text style={styles.title}>Unlock PRO Features</Text>
        
        <View style={styles.featuresList}>
          <FeatureItem icon="speedometer" text="Real-time Radar Alerts" />
          <FeatureItem icon="map-marker-path" text="Advanced Route Planning" />
          <FeatureItem icon="car-connected" text="AI Car Diagnosis" />
          <FeatureItem icon="chart-bar" text="Detailed Driving Stats" />
          <FeatureItem icon="block-helper" text="Ad-Free Experience" />
        </View>

        <View style={styles.plansContainer}>
          <PlanOption 
            plan={plans.weekly} 
            isSelected={selectedPlan === 'weekly'} 
            onSelect={() => { setSelectedPlan('weekly'); setIsTrialEnabled(false); }}
          />
          <PlanOption 
            plan={plans.monthly} 
            isSelected={selectedPlan === 'monthly'} 
            onSelect={() => { setSelectedPlan('monthly'); setIsTrialEnabled(false); }}
          />
        </View>

        <View style={styles.plansContainer}>
          <PlanOption 
            plan={plans.yearly} 
            isSelected={selectedPlan === 'yearly'} 
            onSelect={() => { setSelectedPlan('yearly'); setIsTrialEnabled(true); }}
          />
          <PlanOption 
            plan={plans.remove_ads} 
            isSelected={selectedPlan === 'remove_ads'} 
            onSelect={() => { setSelectedPlan('remove_ads'); setIsTrialEnabled(false); }}
          />
        </View>

        <View style={styles.trialToggle}>
          <TouchableOpacity 
            style={styles.checkbox} 
            onPress={() => setIsTrialEnabled(!isTrialEnabled)}
          >
            <MaterialCommunityIcons 
              name={isTrialEnabled ? "checkbox-marked" : "checkbox-blank-outline"} 
              size={24} 
              color="#FFD700" 
            />
          </TouchableOpacity>
          <Text style={styles.trialText}>Enable 3-Day Free Trial</Text>
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
              {loading ? 'PROCESSING...' : (isTrialEnabled ? 'START FREE TRIAL' : 'SUBSCRIBE NOW')}
            </Text>
            <Text style={styles.subscribeSubtext}>
              {!loading && (isTrialEnabled 
                ? `Then ${plans['yearly'].price}/year`
                : `Pay ${plans[selectedPlan].price} ${plans[selectedPlan].period !== 'once' ? '/ ' + plans[selectedPlan].period : ''}`
              )}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.termsText}>
          Recurring billing. Cancel anytime. By continuing you agree to our Terms of Service and Privacy Policy.
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
    style={[styles.planCard, isSelected && styles.selectedPlanCard]} 
    onPress={onSelect}
    activeOpacity={0.8}
  >
    {plan.savings && (
      <View style={styles.savingsBadge}>
        <Text style={styles.savingsText}>{plan.savings}</Text>
      </View>
    )}
    <View style={styles.planHeader}>
      <Text style={[styles.planPeriod, isSelected && styles.selectedText]}>
        {plan.label || (plan.id.charAt(0).toUpperCase() + plan.id.slice(1))}
      </Text>
      <View style={[styles.radioButton, isSelected && styles.selectedRadio]}>
        {isSelected && <View style={styles.radioInner} />}
      </View>
    </View>
    <Text style={[styles.planPrice, isSelected && styles.selectedText]}>{plan.price}</Text>
    <Text style={[styles.planPer, isSelected && styles.selectedText]}>per {plan.period}</Text>
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
  plansContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 20 },
  planCard: { width: '48%', backgroundColor: '#1C1C1E', borderRadius: 16, padding: 15, borderWidth: 2, borderColor: '#333' },
  selectedPlanCard: { borderColor: '#FFD700', backgroundColor: '#2C2C2E' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  planPeriod: { color: '#8E8E93', fontSize: 16, fontWeight: 'bold' },
  planPrice: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  planPer: { color: '#8E8E93', fontSize: 12 },
  selectedText: { color: 'white' },
  radioButton: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#8E8E93', justifyContent: 'center', alignItems: 'center' },
  selectedRadio: { borderColor: '#FFD700' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFD700' },
  savingsBadge: { position: 'absolute', top: -10, right: -10, backgroundColor: '#FFD700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  savingsText: { color: 'black', fontSize: 10, fontWeight: 'bold' },
  trialToggle: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  checkbox: { marginRight: 10 },
  trialText: { color: 'white', fontSize: 14 },
  subscribeButton: { width: '100%', borderRadius: 30, overflow: 'hidden', marginBottom: 15 },
  gradientButton: { paddingVertical: 15, alignItems: 'center' },
  subscribeButtonText: { color: 'black', fontSize: 18, fontWeight: 'bold' },
  subscribeSubtext: { color: 'rgba(0,0,0,0.7)', fontSize: 12, marginTop: 2 },
  termsText: { color: '#666', fontSize: 10, textAlign: 'center', paddingHorizontal: 20 }
});

export default SubscriptionScreen;

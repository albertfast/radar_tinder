import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, Linking } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../store/authStore';
import { SubscriptionService } from '../services/SubscriptionService';
import { AnalyticsService } from '../services/AnalyticsService';
import { useAutoHideTabBar } from '../hooks/use-auto-hide-tab-bar';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import {
  APP_DISPLAY_NAME,
  APP_PRIVACY_POLICY_URL,
  APP_STANDARD_EULA_URL,
  APP_TERMS_URL,
} from '../config/appIdentity';

const TITLE_FONT = Platform.select({ ios: 'Georgia', android: 'serif' });
const DISPLAY_FONT = Platform.select({ ios: 'AvenirNext-Heavy', android: 'sans-serif-condensed' });
type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type PlanKey = 'weekly' | 'yearly' | 'adfree';

const SubscriptionScreen = ({ navigation }: any) => {
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>('yearly');
  const [loading, setLoading] = useState(false);
  const { onScroll, onScrollBeginDrag, onScrollEndDrag } = useAutoHideTabBar();
  const { user } = useAuthStore();
  const successMessage = user?.accountLinkRequiredUntil
    ? 'Your subscription is active. Link your account within 24h to keep access across devices.'
    : 'Your subscription is active.';

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
      id: 'pro_subscription_weekly',
      name: 'Weekly',
      price: '$3.99',
      period: 'week',
      trial: null,
      tag: 'FLEXIBLE',
      description: '$3.99/week billed immediately. Auto-renews until cancelled.',
      accent: '#FF8A3D',
    },
    yearly: {
      id: 'pro_subscription_yearly',
      name: 'Yearly',
      price: '$19.99',
      period: 'year',
      trial: '3-Day Free Trial',
      tag: 'BEST VALUE',
      description: '3-day free trial included, then $19.99/year. Auto-renews until cancelled.',
      accent: '#2DD4BF',
    },
  };
  const visiblePlanKeys: PlanKey[] =
    Platform.OS === 'ios' ? ['yearly', 'weekly'] : ['yearly', 'adfree', 'weekly'];
  const selectedPlanConfig = plans[selectedPlan];
  const selectedPlanDisclosure =
    selectedPlan === 'yearly'
      ? '3-day free trial included, then $19.99/year. Auto-renews until cancelled.'
      : selectedPlan === 'weekly'
        ? '$3.99/week billed immediately. Auto-renews until cancelled.'
        : '$0.99 one-time purchase. Limited access to core features.';

  const openExternalLink = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Link Unavailable', 'Please try again in your browser.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Link Unavailable', 'Please try again in your browser.');
    }
  };

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      if (!SubscriptionService.isConfigured()) {
        Alert.alert(
          'Payments Not Configured',
          'RevenueCat API key is missing. Configure EXPO_PUBLIC_REVENUECAT_IOS_API_KEY and EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY.'
        );
        return;
      }

      const planToPurchase = selectedPlan;

      await AnalyticsService.trackEvent('subscription_attempt', {
        plan: planToPurchase,
        trial: planToPurchase === 'yearly',
      });

      const resolution = await SubscriptionService.getPackageResolution(planToPurchase);
      const availablePackages = resolution.availablePackages;
      if (availablePackages.length === 0) {
        console.warn('[Subscription] offering packages empty for plan:', planToPurchase);
      }

      let purchaseSource = resolution.matchSource || 'unresolved_package';
      let purchased = false;
      let purchasedProductId =
        resolution.targetPackage?.product?.identifier || null;

      if (resolution.targetPackage) {
        purchased = await SubscriptionService.purchasePackage(resolution.targetPackage);
      } else {
        const directResolution = await SubscriptionService.getDirectProductResolution(planToPurchase);
        if (directResolution.targetProduct) {
          purchaseSource = directResolution.matchSource || 'canonical_product';
          purchasedProductId = directResolution.targetProduct.identifier;
          purchased = await SubscriptionService.purchaseStoreProduct(directResolution.targetProduct);
        } else {
          const availableProductsCopy = directResolution.debugProducts || 'None';
          Alert.alert(
            'Package Mapping Missing',
            `${resolution.offering?.identifier ? `Current offering: ${resolution.offering.identifier}\n\n` : ''}No package mapped for "${planToPurchase}".\n\nExpected package IDs:\n${resolution.expectedPackageIds.join(' / ')}\n\nExpected product IDs:\n${directResolution.expectedProductIds.join(' / ')}\n\nAvailable packages:\n${resolution.debugPackages || 'None'}\n\nAvailable direct products:\n${availableProductsCopy}`
          );
          return;
        }
      }

      if (!purchased) {
        Alert.alert(
          'Payment Failed',
          'Purchase could not be completed. Please try again.'
        );
        return;
      }

      await AnalyticsService.trackEvent('subscription_success', {
        source: purchaseSource,
        package_id: resolution.targetPackage?.identifier,
        product_id: purchasedProductId,
      });

      Alert.alert('Success', successMessage);
      navigation.goBack();
    } catch (err) {
      console.error('Subscription purchase error:', err);
      Alert.alert('Payment Error', 'An unexpected error occurred during payment.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    const restored = await SubscriptionService.restorePurchases();
    setLoading(false);
    if (restored) {
      Alert.alert('Restored', 'Your purchases have been restored.');
      navigation.goBack();
      return;
    }
    Alert.alert('Restore Failed', 'No purchases were restored.');
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
          <Text style={styles.heroEyebrow}>{APP_DISPLAY_NAME.toUpperCase()} PRO</Text>
          <Text style={styles.heroTitle}>Choose a clear subscription offer</Text>
          <Text style={styles.heroSubtitle}>
            Unlock live radar alerts, safer route context, and AI diagnostics with a simple auto-renewing plan.
          </Text>
        </View>

        <View style={styles.planStack}>
          {visiblePlanKeys.map((planKey) => (
            <PlanOption
              key={planKey}
              plan={plans[planKey]}
              isSelected={selectedPlan === planKey}
              onSelect={() => {
                setSelectedPlan(planKey);
              }}
            />
          ))}
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
              {loading
                ? 'PROCESSING...'
                : selectedPlan === 'yearly'
                  ? 'START 3-DAY FREE TRIAL'
                  : selectedPlan === 'weekly'
                    ? 'START WEEKLY PLAN'
                    : 'BUY AD-FREE BASIC'}
            </Text>
            {!loading ? <Text style={styles.subscribeSubtext}>{selectedPlanDisclosure}</Text> : null}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.termsText}>
          {selectedPlanConfig.name} subscription: {selectedPlanConfig.price}/{selectedPlanConfig.period}.
          {selectedPlan === 'yearly'
            ? ' Includes a 3-day free trial, then renews automatically until cancelled.'
            : selectedPlan === 'weekly'
              ? ' Charges immediately and renews automatically until cancelled.'
              : ' One-time purchase.'}
          {"\n"}
          By continuing you agree to the{' '}
          <Text style={styles.termsLink} onPress={() => { void openExternalLink(APP_STANDARD_EULA_URL); }}>
            Apple Standard EULA
          </Text>
          ,{' '}
          <Text style={styles.termsLink} onPress={() => { void openExternalLink(APP_PRIVACY_POLICY_URL); }}>
            Privacy Policy
          </Text>
          , and{' '}
          <Text style={styles.termsLink} onPress={() => { void openExternalLink(APP_TERMS_URL); }}>
            Terms & Conditions
          </Text>
          .
        </Text>
      </ScrollView>
    </View>
  );
};

const FeatureTile = ({ icon, text, tone }: { icon: MaterialIconName; text: string; tone: string }) => (
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

  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  featureTile: { width: '48%', borderRadius: 14, borderWidth: 1, padding: 12, backgroundColor: 'rgba(255,255,255,0.03)' },
  featureIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  featureText: { color: '#E2E8F0', fontSize: 12, fontWeight: '600' },

  subscribeButton: { borderRadius: 18, overflow: 'hidden' },
  subscribeGradient: { paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center', borderRadius: 18 },
  subscribeButtonText: { color: '#0B0E14', fontWeight: '900', fontSize: 14, letterSpacing: 0.6 },
  subscribeSubtext: { color: '#1E293B', fontSize: 12, marginTop: 6, fontWeight: '700' },

  termsText: { color: '#64748B', fontSize: 11, textAlign: 'center', marginTop: 20, lineHeight: 16 },
  termsLink: { color: '#9BDCF8', textDecorationLine: 'underline' },
});

export default SubscriptionScreen;

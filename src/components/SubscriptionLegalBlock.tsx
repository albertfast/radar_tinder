import React from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { PlanKey } from '../utils/subscriptionPricing';
import type { PlanPricing } from '../utils/subscriptionPricing';
import { openManageSubscriptions } from '../utils/subscriptionLinks';

type Props = {
  selectedPlan: PlanKey;
  trialActive: boolean;
  pricingByPlan: Partial<Record<PlanKey, PlanPricing | null>>;
  onTermsPress: () => void;
  onPrivacyPress: () => void;
  compact?: boolean;
};

export const SubscriptionLegalBlock = ({
  selectedPlan,
  trialActive,
  pricingByPlan,
  onTermsPress,
  onPrivacyPress,
  compact = false,
}: Props) => {
  const { t } = useTranslation();
  const yearlyPrice = pricingByPlan.yearly?.priceString || '—';
  const weeklyPrice = pricingByPlan.weekly?.priceString || '—';
  const storeIcon = Platform.OS === 'ios' ? 'apple' : 'google-play';
  const cancelHowKey = Platform.OS === 'ios' ? 'subscription.cancelHowIos' : 'subscription.cancelHowAndroid';

  const legalBody =
    selectedPlan === 'yearly' && trialActive
      ? t('subscription.legalYearlyTrial', { price: yearlyPrice })
      : selectedPlan === 'weekly'
        ? t('subscription.legalWeekly', { price: weeklyPrice })
        : t('subscription.legalAdFree');

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.termsHeader}>
        <MaterialCommunityIcons name="information-outline" size={16} color="#94A3B8" />
        <Text style={styles.termsEyebrow}>{t('subscription.offerTerms')}</Text>
      </View>
      <Text style={styles.legalText}>{legalBody}</Text>
      <Text style={styles.legalText}>{t(cancelHowKey)}</Text>

      <TouchableOpacity style={styles.manageButton} onPress={() => openManageSubscriptions()}>
        <MaterialCommunityIcons name={storeIcon} size={16} color="#7CE8DF" />
        <Text style={styles.manageText}>{t('subscription.manageSubscription')}</Text>
      </TouchableOpacity>

      <Text style={styles.footerLinks}>
        <Text style={styles.link} onPress={onTermsPress}>
          {t('subscription.terms')}
        </Text>
        {' · '}
        <Text style={styles.link} onPress={onPrivacyPress}>
          {t('subscription.privacy')}
        </Text>
      </Text>
      <Text style={styles.cancelHint}>{t('subscription.cancelAnytime')}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: 14, gap: 8 },
  wrapCompact: { marginTop: 10 },
  termsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  termsEyebrow: { color: '#94A3B8', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  legalText: { color: '#94A3B8', fontSize: 11, lineHeight: 16 },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  manageText: { color: '#7CE8DF', fontSize: 12, fontWeight: '700' },
  footerLinks: { color: '#64748B', fontSize: 11, textAlign: 'center', marginTop: 4 },
  link: { color: '#9BDCF8', textDecorationLine: 'underline' },
  cancelHint: { color: '#64748B', fontSize: 10, textAlign: 'center' },
});

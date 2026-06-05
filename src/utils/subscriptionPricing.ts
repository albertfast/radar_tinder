import type { PurchasesPackage } from 'react-native-purchases';
import type { PurchasesStoreProduct } from 'react-native-purchases';

export type PlanKey = 'weekly' | 'yearly' | 'adfree';

export type PlanPricing = {
  priceString: string;
  currencyCode?: string;
  periodLabel: string;
  hasIntroTrial: boolean;
  introLabel?: string;
  monthlyEquivalent?: string;
};

type PricingSource = PurchasesPackage | PurchasesStoreProduct | null;

const readProduct = (source: PricingSource): (PurchasesStoreProduct & Record<string, unknown>) | null => {
  if (!source) return null;
  const maybePackage = source as PurchasesPackage;
  return ((maybePackage.product || source) as PurchasesStoreProduct & Record<string, unknown>) || null;
};

const readIntroTrial = (source: PricingSource): boolean => {
  const product = readProduct(source);
  if (!product) return false;
  const intro = product.introPrice as { price?: number; period?: string } | undefined;
  if (intro && typeof intro.price === 'number') return true;
  const options = product.subscriptionOptions as Array<{ introPhase?: unknown }> | undefined;
  return Boolean(options?.some((opt) => opt?.introPhase));
};

export const formatPlanPricing = (
  source: PricingSource,
  plan: PlanKey
): PlanPricing | null => {
  const product = readProduct(source);
  if (!product?.priceString) return null;

  const priceString = product.priceString;
  const currencyCode = product.currencyCode;
  const hasIntroTrial = plan === 'yearly' && readIntroTrial(source);

  if (plan === 'adfree') {
    return {
      priceString,
      currencyCode,
      periodLabel: 'once',
      hasIntroTrial: false,
    };
  }

  if (plan === 'weekly') {
    return {
      priceString,
      currencyCode,
      periodLabel: 'week',
      hasIntroTrial: false,
    };
  }

  const price = Number(product.price);
  const monthlyEquivalent =
    Number.isFinite(price) && price > 0
      ? new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: currencyCode || 'USD',
          maximumFractionDigits: 2,
        }).format(price / 12)
      : undefined;

  return {
    priceString,
    currencyCode,
    periodLabel: 'year',
    hasIntroTrial,
    introLabel: hasIntroTrial ? '3 days free trial' : undefined,
    monthlyEquivalent,
  };
};

export const buildCtaLabel = (
  plan: PlanKey,
  pricing: PlanPricing | null,
  trialActive: boolean,
  t: (key: string, opts?: Record<string, string>) => string
): string => {
  if (!pricing) return t('subscription.subscribeNow');

  if (plan === 'adfree') {
    return `${t('subscription.removeAds')} ${pricing.priceString}`;
  }
  if (trialActive && pricing.hasIntroTrial) {
    return t('subscription.startTrial');
  }
  return `${t('subscription.subscribeNow')} — ${pricing.priceString}`;
};

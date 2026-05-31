import type { PurchasesPackage } from 'react-native-purchases';

export type PlanKey = 'weekly' | 'yearly' | 'adfree';

export type PlanPricing = {
  priceString: string;
  currencyCode?: string;
  periodLabel: string;
  hasIntroTrial: boolean;
  introLabel?: string;
  monthlyEquivalent?: string;
};

const readIntroTrial = (pkg: PurchasesPackage | null): boolean => {
  if (!pkg?.product) return false;
  const product = pkg.product as unknown as Record<string, unknown>;
  const intro = product.introPrice as { price?: number; period?: string } | undefined;
  if (intro && typeof intro.price === 'number') return true;
  const options = product.subscriptionOptions as Array<{ introPhase?: unknown }> | undefined;
  return Boolean(options?.some((opt) => opt?.introPhase));
};

export const formatPlanPricing = (
  pkg: PurchasesPackage | null,
  plan: PlanKey
): PlanPricing | null => {
  if (!pkg?.product?.priceString) return null;

  const priceString = pkg.product.priceString;
  const currencyCode = pkg.product.currencyCode;
  const hasIntroTrial = plan === 'yearly' && readIntroTrial(pkg);

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

  const price = Number(pkg.product.price);
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

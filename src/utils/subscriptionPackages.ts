import type { PurchasesPackage } from 'react-native-purchases';
import type { PlanKey } from './subscriptionPricing';

const PLAN_IDS: Record<PlanKey, string> = {
  weekly: 'pro_subscription_weekly',
  yearly: 'pro_subscription_yearly',
  adfree: 'remove_ads',
};

const getProductHints = (plan: PlanKey): string[] => {
  const fromEnv = {
    weekly: process.env.EXPO_PUBLIC_RC_PRODUCT_WEEKLY,
    yearly: process.env.EXPO_PUBLIC_RC_PRODUCT_YEARLY,
    adfree: process.env.EXPO_PUBLIC_RC_PRODUCT_ADFREE,
  }[plan];
  const fromPackageEnv = {
    weekly: process.env.EXPO_PUBLIC_RC_PACKAGE_WEEKLY,
    yearly: process.env.EXPO_PUBLIC_RC_PACKAGE_YEARLY,
    adfree: process.env.EXPO_PUBLIC_RC_PACKAGE_LIFETIME,
  }[plan];
  const aliases: Record<PlanKey, string[]> = {
    weekly: [
      '$rc_weekly',
      'rc_weekly',
      'pro_subscription:weekly',
      'pro_subscription_weekly',
      'weekly',
    ],
    yearly: [
      '$rc_annual',
      'rc_annual',
      '$rc_yearly',
      'rc_yearly',
      'pro_subscription:yearly',
      'pro_subscription_yearly',
      'yearly',
      'annual',
    ],
    adfree: ['$rc_lifetime', 'rc_lifetime', 'remove_ads', 'adfree', 'lifetime'],
  };

  return [fromEnv, fromPackageEnv, PLAN_IDS[plan], ...aliases[plan]]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.toLowerCase());
};

const packageTypeMatchesPlan = (pkg: PurchasesPackage, plan: PlanKey): boolean => {
  const packageType = String((pkg as { packageType?: string })?.packageType || '').toUpperCase();
  if (plan === 'weekly') return packageType === 'WEEKLY';
  if (plan === 'yearly') return packageType === 'ANNUAL' || packageType === 'YEARLY';
  return packageType === 'LIFETIME';
};

const packageMatchesPlan = (pkg: PurchasesPackage, plan: PlanKey) => {
  const id = String(pkg?.identifier || '').toLowerCase();
  const productId = String(pkg?.product?.identifier || '').toLowerCase();
  const hints = getProductHints(plan);
  if (hints.some((hint) => id === hint || productId === hint || id.includes(hint) || productId.includes(hint))) {
    return true;
  }
  if (plan === 'yearly') {
    return /annual|year|yearly/.test(id) || /annual|year|yearly/.test(productId);
  }
  if (plan === 'weekly') {
    return /week|weekly/.test(id) || /week|weekly/.test(productId);
  }
  return /lifetime|one[_-]?time|remove[_-]?ads|ad[_-]?free/.test(id) ||
    /lifetime|one[_-]?time|remove[_-]?ads|ad[_-]?free/.test(productId);
};

export const findPackageForPlan = (
  availablePackages: PurchasesPackage[],
  plan: PlanKey,
  offering: { weekly?: PurchasesPackage; annual?: PurchasesPackage; yearly?: PurchasesPackage; lifetime?: PurchasesPackage } | null
): PurchasesPackage | null => {
  const slotCandidate =
    plan === 'weekly'
      ? offering?.weekly
      : plan === 'yearly'
        ? offering?.annual || offering?.yearly
        : offering?.lifetime;
  if (slotCandidate) return slotCandidate as PurchasesPackage;

  const byHints = availablePackages.find((pkg) => packageMatchesPlan(pkg, plan));
  if (byHints) return byHints;

  return availablePackages.find((pkg) => packageTypeMatchesPlan(pkg, plan)) || null;
};

export const mapOfferingPackages = (
  availablePackages: PurchasesPackage[],
  offering: Parameters<typeof findPackageForPlan>[2]
): Record<PlanKey, PurchasesPackage | null> => ({
  weekly: findPackageForPlan(availablePackages, 'weekly', offering),
  yearly: findPackageForPlan(availablePackages, 'yearly', offering),
  adfree: findPackageForPlan(availablePackages, 'adfree', offering),
});

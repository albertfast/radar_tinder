import type { User } from '../types';

const DEFAULT_ADMIN_EMAILS = ['ahmetsahinersf@gmail.com'];

const normalizeEmail = (value?: string | null) => (value || '').trim().toLowerCase();

const parseAdminEmails = () => {
  const fromEnv = (process.env.EXPO_PUBLIC_ADMIN_EMAILS || '')
    .split(',')
    .map((item: string) => normalizeEmail(item))
    .filter(Boolean);

  const merged = new Set<string>([
    ...DEFAULT_ADMIN_EMAILS.map((item: string) => normalizeEmail(item)),
    ...fromEnv,
  ]);
  return merged;
};

const ADMIN_EMAILS = parseAdminEmails();

export const isAdminUser = (user?: User | null) => {
  const email = normalizeEmail(user?.email);
  return Boolean(email) && ADMIN_EMAILS.has(email);
};

export const hasProAccess = (user?: User | null) =>
  Boolean(user?.isAdminSession) ||
  user?.subscriptionType === 'pro' ||
  user?.subscriptionType === 'premium' ||
  isAdminUser(user);

export const isAdFreeLimited = (user?: User | null) =>
  !isAdminUser(user) &&
  !user?.isAdminSession &&
  user?.subscriptionType !== 'pro' &&
  user?.subscriptionType !== 'premium' &&
  Boolean(user?.adsRemoved);

export const isFreeWithAds = (user?: User | null) =>
  !isAdminUser(user) &&
  !user?.isAdminSession &&
  user?.subscriptionType === 'free' &&
  !user?.adsRemoved;

export const shouldShowHomeAds = (user?: User | null) => isFreeWithAds(user);

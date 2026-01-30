import type { User } from '../types';

export const hasProAccess = (user?: User | null) => user?.subscriptionType === 'pro';

export const isAdFreeLimited = (user?: User | null) =>
  user?.subscriptionType !== 'pro' && Boolean(user?.adsRemoved);

export const isFreeWithAds = (user?: User | null) =>
  user?.subscriptionType === 'free' && !user?.adsRemoved;

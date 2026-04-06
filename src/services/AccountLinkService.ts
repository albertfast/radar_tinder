import { Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { FirebaseAuthService } from './FirebaseAuthService';
import { SubscriptionService } from './SubscriptionService';
import { AnalyticsService } from './AnalyticsService';

export type AccountLinkProvider = 'apple' | 'google';

const providerLabel = (provider: AccountLinkProvider) =>
  provider === 'apple' ? 'Apple' : 'Google';

export class AccountLinkService {
  static isProviderSupported(provider: AccountLinkProvider): boolean {
    if (provider === 'apple') {
      return Platform.OS === 'ios';
    }
    return true;
  }

  static getSupportedProviders(): AccountLinkProvider[] {
    return (['apple', 'google'] as AccountLinkProvider[]).filter((provider) =>
      this.isProviderSupported(provider)
    );
  }

  static async linkCurrentUser(provider: AccountLinkProvider): Promise<{
    ok: boolean;
    provider: AccountLinkProvider;
    userId?: string;
    error?: unknown;
    message?: string;
  }> {
    if (!this.isProviderSupported(provider)) {
      return {
        ok: false,
        provider,
        message: `${providerLabel(provider)} sign-in is not available on this device.`,
      };
    }

    try {
      const authStore = useAuthStore.getState();
      const previousUserId = authStore.user?.id;
      const identity =
        provider === 'apple'
          ? await FirebaseAuthService.signInWithApple()
          : await FirebaseAuthService.signInWithGoogle();
      const nonce =
        typeof (identity as { nonce?: unknown }).nonce === 'string'
          ? (identity as { nonce?: string }).nonce
          : undefined;

      const { data, error } = await authStore.signInWithProvider({
        provider,
        idToken: identity.idToken,
        nonce,
        profile: identity.profile,
      });

      if (error) {
        return {
          ok: false,
          provider,
          error,
          message:
            typeof (error as any)?.message === 'string'
              ? (error as any).message
              : `Could not link ${providerLabel(provider)} right now.`,
        };
      }

      const nextUserId = data?.user?.id || useAuthStore.getState().user?.id;
      if (nextUserId) {
        await SubscriptionService.setUserId(nextUserId).catch(() => {});
        await SubscriptionService.syncAccessState().catch(() => {});
      }

      await AnalyticsService.trackEvent('account_linked', {
        provider,
        previous_user_id: previousUserId || 'guest',
        current_user_id: nextUserId || 'unknown',
      }).catch(() => {});

      return {
        ok: true,
        provider,
        userId: nextUserId,
      };
    } catch (error) {
      return {
        ok: false,
        provider,
        error,
        message:
          typeof (error as any)?.message === 'string'
            ? (error as any).message
            : `Could not link ${providerLabel(provider)} right now.`,
      };
    }
  }
}

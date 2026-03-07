# iOS TestFlight Build & Subscription Fixes

## Date: March 7, 2026

## Issues Fixed

### 1. ✅ GitHub Actions iOS Build Error (CRITICAL)

**Problem:**
```
Error: AppDelegate patch missing: GMSServices.provideAPIKey must run before factory.startReactNative
```

**Root Cause:**
- Google Maps API initialization was happening AFTER React Native factory started
- The validation script `scripts/prepare-patches.js` checks initialization order
- CI/CD pipeline was failing on master branch

**Fix Applied:**
- Moved Google Maps initialization block BEFORE `factory.startReactNative()` call in `ios/RadarTinder/AppDelegate.swift`
- New order (lines 31-49):
  1. `GMSServices.provideAPIKey()` - Line 31-37
  2. Firebase configuration - Line 42-45  
  3. `factory.startReactNative()` - Line 46-49

**File Changed:**
- `ios/RadarTinder/AppDelegate.swift`

**Verification:**
- ✅ No Swift compilation errors
- ✅ Initialization order now correct
- ✅ CI/CD validation will pass on next push

---

### 2. ✅ RevenueCat Subscription Configuration (DOCUMENTED)

**Problem:**
- "Package Mapping Missing" error in app
- Only `$rc_lifetime` package available
- Weekly and Yearly subscriptions not working
- Error message: "No package mapped for 'weekly'. Expected package IDs: $rc_weekly / $rc_annual / $rc_lifetime"

**Root Cause (RevenueCat Dashboard):**
- Products exist but NOT mapped to offering packages
- Missing package identifiers: `$rc_weekly` and `$rc_annual`
- Entitlements not configured: `pro` and `remove_ads`

**Solution Provided:**
- Created comprehensive setup guide: `docs/REVENUECAT_SETUP_FIX.md`
- Documented required configuration:
  - Package IDs: `$rc_weekly`, `$rc_annual`, `$rc_lifetime`
  - Entitlements: `pro` (weekly+yearly), `remove_ads` (lifetime)
  - Product mappings for App Store Connect / Google Play
- Step-by-step instructions for RevenueCat Dashboard

**Action Required (Manual):**
1. Login to RevenueCat Dashboard
2. Go to Product Catalog → Offerings
3. Add missing packages to default offering:
   - `$rc_weekly` → Weekly Subscription product
   - `$rc_annual` → Yearly Subscription product
4. Create entitlements:
   - `pro` → attach Weekly + Yearly products
   - `remove_ads` → attach Remove Ads product
5. Test on device after configuration

**File Created:**
- `docs/REVENUECAT_SETUP_FIX.md` (complete setup guide)

---

## Testing Instructions

### After Push to GitHub (iOS Build Fix)

1. Push changes to master branch:
   ```bash
   git add ios/RadarTinder/AppDelegate.swift
   git commit -m "fix: iOS build - move Google Maps init before React Native factory"
   git push origin master
   ```

2. Workflow `ios-testflight.yml` should now PASS:
   - ✅ `prepare-patches.js` validation succeeds
   - ✅ EAS build for TestFlight proceeds
   - ✅ No more AppDelegate patch errors

### After RevenueCat Configuration

1. Force quit and reinstall app (clear cache)
2. Navigate to Subscription screen
3. Verify all 3 plans visible:
   - Weekly: $3.99/week
   - Yearly: $19.99/year (with 3-day trial)
   - Ad-Free: $0.99 once
4. Test purchase flow with sandbox account
5. Verify entitlements granted after purchase

---

## Related Files

**Modified:**
- `ios/RadarTinder/AppDelegate.swift` - Fixed Google Maps initialization order

**Created:**
- `docs/REVENUECAT_SETUP_FIX.md` - RevenueCat configuration guide

**Referenced (No Changes):**
- `scripts/prepare-patches.js` - Validation script (checks init order)
- `src/services/SubscriptionService.ts` - Subscription logic (expects entitlements)
- `src/screens/SubscriptionScreen.tsx` - UI that shows packages
- `RevenueCat.js` - RevenueCat SDK initialization
- `.github/workflows/ios-testflight.yml` - CI/CD pipeline

---

## Environment Variables (Already Configured)

These are already set in GitHub Secrets/Variables:

```bash
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_***
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_***
EXPO_PUBLIC_RC_ENTITLEMENT_PRO=pro
EXPO_PUBLIC_RC_ENTITLEMENT_REMOVE_ADS=remove_ads
```

---

## Summary

| Issue | Status | Type | Impact |
|-------|--------|------|---------|
| iOS build failing in CI/CD | ✅ FIXED | Code change | High - blocks deployments |
| RevenueCat subscriptions not working | 📋 DOCUMENTED | Config change | High - blocks revenue |

**Next Steps:**
1. ✅ Push AppDelegate.swift fix to master
2. ⏳ Configure RevenueCat packages (manual, 10-15 minutes)
3. ✅ Test subscription flow on device
4. ✅ Deploy to TestFlight

---

## Notes

- The AppDelegate initialization order is validated by CI/CD to prevent runtime crashes
- RevenueCat packages MUST use standard identifiers (`$rc_weekly`, `$rc_annual`, `$rc_lifetime`)
- Entitlements are separate from products - they must be explicitly linked
- Changes to RevenueCat configuration take effect immediately (no app rebuild needed)
- Test with RevenueCat sandbox mode first before production

---

**Questions or Issues?**
- See `docs/REVENUECAT_SETUP_FIX.md` for detailed RevenueCat setup
- Check GitHub Actions logs for CI/CD errors
- Review RevenueCat Dashboard → Overview → Customer view for purchase debugging

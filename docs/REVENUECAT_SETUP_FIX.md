# RevenueCat Subscription Setup Fix Guide

## Current Problem

Your RevenueCat is showing "Package Mapping Missing" error because:
- ✅ Products are created in RevenueCat (Weekly, Yearly, Remove Ads)
- ❌ Packages are NOT properly mapped to the offering
- ❌ Only `$rc_lifetime` package exists (shown in error)
- ❌ Weekly and Yearly packages are missing

## Required Configuration

### 1. Package Identifiers (Must Match)

The app expects these EXACT package identifiers:

| Plan | Package Identifier | Product Identifier | Store Product ID |
|------|-------------------|-------------------|------------------|
| Weekly | `$rc_weekly` | `pro_subscription_weekly` | `premium_subscription:weekly` |
| Yearly | `$rc_annual` | `pro_subscription_yearly` | `premium_subscription:yearly` |
| Ad-Free | `$rc_lifetime` | `remove_ads` | `remove_ads` |

### 2. Entitlements Setup

Create these entitlements in RevenueCat dashboard:

1. **Entitlement: `pro`** (Pro subscription features)
   - Attach to: Weekly Subscription product
   - Attach to: Yearly Subscription product

2. **Entitlement: `remove_ads`** (Ad removal only)
   - Attach to: Remove All Advertisements product

## Step-by-Step Fix in RevenueCat Dashboard

### Step 1: Create Missing Packages in Offering

1. Go to RevenueCat Dashboard → **Product catalog** → **Offerings** tab
2. Click on your **default** offering (or create one if missing)
3. Add packages to the offering:

   **Package 1: Weekly**
   - Click "+ Add Package"
   - Package ID: `$rc_weekly`
   - Select Product: **Weekly Subscription** (`premium_subscription:weekly`)
   - Package Type: **Weekly**
   - Save

   **Package 2: Yearly**
   - Click "+ Add Package"
   - Package ID: `$rc_annual`
   - Select Product: **Yearly Subscription** (`premium_subscription:yearly`)
   - Package Type: **Annual**
   - Save

   **Package 3: Lifetime (Already exists, verify)**
   - Package ID: `$rc_lifetime`
   - Product: **Remove All Advertisements** (`remove_ads`)
   - Package Type: **Lifetime**

### Step 2: Set Up Entitlements

1. Go to **Product catalog** → **Entitlements** tab
2. Create or verify entitlements:

   **Entitlement 1: `pro`**
   - Click "+ New Entitlement"
   - Identifier: `pro`
   - Display Name: "Pro Access"
   - Click "Add Rules" → Attach these products:
     - ✅ Weekly Subscription (`premium_subscription:weekly`)
     - ✅ Yearly Subscription (`premium_subscription:yearly`)
   - Save

   **Entitlement 2: `remove_ads`**
   - Click "+ New Entitlement"
   - Identifier: `remove_ads`
   - Display Name: "Remove Advertisements"
   - Click "Add Rules" → Attach product:
     - ✅ Remove All Advertisements (`remove_ads`)
   - Save

### Step 3: Verify App Store Connect / Google Play Configuration

**For iOS (App Store Connect):**
1. Ensure these In-App Purchases exist:
   - `premium_subscription:weekly` (Auto-renewable subscription, Weekly)
   - `premium_subscription:yearly` (Auto-renewable subscription, Yearly)
   - `remove_ads` (Non-consumable or Lifetime subscription)

2. Prices should match:
   - Weekly: $3.99
   - Yearly: $19.99
   - Remove Ads: $0.99

3. Add to Subscription Group if using subscriptions

**For Android (Google Play Console):**
1. Go to Monetization → Subscriptions / In-app products
2. Ensure products exist with correct IDs
3. Activate products (must be in "Active" state)

### Step 4: Test Package Discovery

After configuration, the app will find packages in this order:

```typescript
// Weekly package search priority:
1. offering.weekly (slot-based)
2. Package with ID matching: $rc_weekly, rc_weekly, pro_subscription_weekly
3. Package with type: WEEKLY

// Yearly package search priority:
1. offering.annual or offering.yearly (slot-based)
2. Package with ID matching: $rc_annual, pro_subscription_yearly, rc_yearly
3. Package with type: ANNUAL or YEARLY

// Ad-Free package search priority:
1. offering.lifetime (slot-based)
2. Package with ID matching: $rc_lifetime, remove_ads, lifetime
3. Package with type: LIFETIME
```

## Testing After Fix

1. **Force quit the app**
2. **Reinstall** (to clear RevenueCat cache)
3. Open subscription screen
4. You should see:
   - ✅ Weekly plan: $3.99/week
   - ✅ Yearly plan: $19.99/year (with 3-day free trial)
   - ✅ Ad-Free Basic: $0.99 once
5. No "Package Mapping Missing" error

## Environment Variables (Already Configured)

The app reads these env vars (already set in your GitHub Actions):

```bash
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_...
EXPO_PUBLIC_RC_ENTITLEMENT_PRO=pro
EXPO_PUBLIC_RC_ENTITLEMENT_REMOVE_ADS=remove_ads
```

These match the entitlements you need to create: `pro` and `remove_ads`.

## Common Pitfalls

❌ **Don't use these package IDs** (won't work):
- `weekly`, `yearly`, `monthly` (missing `$rc_` or `rc_` prefix)
- `weekly_subscription_test` (doesn't match expected patterns)

✅ **Use standard RevenueCat package IDs**:
- `$rc_weekly`, `$rc_annual`, `$rc_lifetime`

❌ **Don't forget to attach products to entitlements**
- Products alone won't grant entitlements
- You must create entitlement → attach product relationship

## Verification Checklist

After completing setup:

- [ ] 3 packages exist in default offering
- [ ] Package `$rc_weekly` → Weekly Subscription product
- [ ] Package `$rc_annual` → Yearly Subscription product  
- [ ] Package `$rc_lifetime` → Remove Ads product
- [ ] Entitlement `pro` has Weekly + Yearly attached
- [ ] Entitlement `remove_ads` has Remove Ads attached
- [ ] All products are active in App Store / Play Store
- [ ] App builds successfully
- [ ] Subscription screen shows all 3 plans
- [ ] Purchase flow completes without errors

## Support

If issues persist after configuration:
1. Check RevenueCat Overview → Customer view (search by user ID)
2. Verify which entitlements are actually granted
3. Check Debug Logs in app with `__DEV__` build
4. Test with RevenueCat sandbox/test users first

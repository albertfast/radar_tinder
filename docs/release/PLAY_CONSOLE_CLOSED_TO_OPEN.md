# Play Console: Closed Testing → Open Testing → Production

## Why Open Testing is blocked today

Google Production access requires **all** of the following:

1. At least one closed testing release published.
2. **12 testers opted-in** (accepted the Play invite link) — not just 12 emails on a list.
3. Closed test running for **14 consecutive days** with those opted-in testers.

Dashboard often shows **4 opted-in** while **12 emails** are on the tester list. Emails added ≠ opted-in.

## Fix tester opt-in (do this first)

1. Play Console → **Testing** → **Closed testing** → your track (Alpha).
2. **Testers** tab → copy the **opt-in URL**.
3. Send the link to all 12 testers (WhatsApp/email). Each person must:
   - Open link while signed into the **same Google account** used for testing.
   - Tap **Become a tester** / **Download it on Google Play**.
4. Confirm **Opted-in** count rises to 12 in Console (can take a few hours).

## Stop email spam on every build

When creating a release:

- Uncheck **Notify testers** / choose **Don't notify** if only fixing small issues.
- Or use **Internal testing** only for rapid iteration; promote to Closed when ready for the 14-day clock.

## Release in review

If the latest build shows **In review**, wait for approval or check **Publishing overview** for policy holds (subscriptions, etc.). Upload policy-fixed build **1.0.6+** after review feedback is addressed.

## Recommended track flow

```text
Internal testing (fast, your team)
    → Closed testing (12 opted-in, 14 days)
    → Apply for production access
    → Open testing (optional wider beta)
    → Production
```

## US developer account and USD prices

A US Play developer account often shows **USD** in sandbox and on US-region test devices. That is expected. For **₺** validation, use a tester with a **Turkey Play account** on a physical device after installing the closed-test build.

## Device support warning (−2 phones)

Removing `x86` / `x86_64` from the production AAB is intentional (`armeabi-v7a` + `arm64-v8a` only). Real phones are unaffected; emulators without ARM translation may drop off the supported list.

## Pre-upload checklist (1.0.6+)

- [ ] Route line is **turquoise** on map (not purple).
- [ ] Speed camera markers use **3D PNG** asset.
- [ ] `EXPO_PUBLIC_LIVE_OSM_FALLBACK=true` in production EAS env.
- [ ] Supabase **Anonymous sign-in** enabled if using TrialOffer / anonymous flow (Dashboard → Authentication → Providers → Anonymous).
- [ ] Subscription legal block + Manage subscription link visible.
- [ ] `./gradlew bundleRelease` + 16KB script pass.

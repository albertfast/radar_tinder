# Radar Manual Smoke Checklist (Android-first)

## Preconditions
- Install debug dev build: `pnpm expo run:android`
- Start Metro clean: `pnpm start -- --clear`
- Login with a test account

## Keyboard + Map
1. Open Driving Mode > `Map` tab.
2. Tap destination input 20 times in a row.
3. Verify keyboard opens every time and input stays focused.
4. While input is focused, try map pan/zoom.
5. Verify map interaction is locked while typing.
6. Blur input (tap outside / dismiss keyboard).
7. Verify map pan/zoom/rotate is restored.

## Navigation Flow
1. Type destination and tap `GO`.
2. Verify polyline route, ETA and distance are shown.
3. Select a suggestion item.
4. Verify route updates and instruction dock appears.
5. Tap reset (`X`) in compact nav bar.
6. Verify route/suggestions/state are cleared safely.

## Drive Lifecycle
1. Start driving from Home dashboard.
2. Stop driving and verify transition back to home works.
3. Confirm no crash around trip save / interstitial logic.

## Hazard Reporting
1. Open report modal from FAB.
2. Submit `Police` and `Camera`.
3. Verify success path online, fallback path offline.
4. Tap a confirmable radar marker; verify confirm flow.

## Legacy Screens
1. Open drawer > `Alerts`.
2. Open drawer > `AR Radar`.
3. Ensure both screens are reachable and render.

## Build Smoke
1. `pnpm expo run:android` succeeds.
2. `cd android && ./gradlew bundleRelease` succeeds.

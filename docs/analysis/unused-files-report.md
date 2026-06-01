# Unused Files Analysis

Generated with `scripts/analyze-unused-files.mjs` (import + dynamic import + require graph).

## Snapshot
- `2026-02-19` pre-cleanup: `149` source files, `68` potential unreferenced, `15` cleanup candidates.
- `2026-02-19` post-cleanup: `135` source files, `54` potential unreferenced, `0` cleanup candidates, `54` hold entries.
- `2026-06-01` expanded audit: `180` source files, `65` potential unreferenced, `12` raw cleanup candidates, `53` hold entries.

## Deleted In Phase 2
- `src/components/Glassmorphism.tsx`
- `src/components/Radar3DScene.tsx`
- `src/components/Radar3DSkia.tsx`
- `src/components/ScreenTransition.tsx`
- `src/components/SkeletonLoader.tsx`
- `src/components/native/FileUploadCard.tsx`
- `src/components/native/LoginCard.tsx`
- `src/components/native/SidebarMenu.tsx`
- `src/screens/components/RadarBasicView.tsx`
- `src/screens/components/RadarHeader.tsx`
- `src/screens/components/RadarMapViewComponent.tsx`
- `src/services/SoundService.ts`
- `src/services/UserReportService.ts`
- `src/utils/SpatialIndex.ts`

## Hold / Keep Set
- `src/components/ui/**`
- `src/app/**`
- `src/hooks/use-mobile.ts`
- `src/hooks/use-toast.ts`
- `src/lib/db.ts`
- `src/lib/utils.ts`
- `src/types/expo-linear-gradient.d.ts`
- `src/screens/AlertsScreen.tsx`
- `src/screens/MapScreen.tsx`

## 2026-06-01 Expanded Audit

Command:

```bash
node scripts/analyze-unused-files.mjs
```

The analyzer is intentionally conservative, but it still has known blind spots:

- It does not resolve directory package entry points, so `import '../mapflow-navigation-kit'` can make `src/mapflow-navigation-kit/src/index.ts` look unused even though it is the public entry file.
- It only scans JS/TS source files, so standalone HTML animation demos are not counted.
- Type declaration files can be necessary even when nothing imports them directly.
- Native React view wrappers can be unused from JS while their Android managers still exist; verify before deleting native bridge code.

### Raw Analyzer Cleanup Output

Do not delete this whole list blindly; it includes false positives and manual-review items.

- `src/components/AccessBootstrapView.tsx`
- `src/components/GraphicRadarPanelView.tsx`
- `src/components/RadarMap.tsx`
- `src/constants/visualTokens.ts`
- `src/mapflow-navigation-kit/src/components/navigation/PresetSelector.tsx`
- `src/mapflow-navigation-kit/src/components/navigation/SavePresetModal.tsx`
- `src/mapflow-navigation-kit/src/components/navigation/SpeedLimitSign.tsx`
- `src/mapflow-navigation-kit/src/index.ts`
- `src/mapflow-navigation-kit/src/utils/mapMarkerAssets.ts`
- `src/services/AddressSuggestionService.ts`
- `src/types/expo-keep-awake.d.ts`
- `src/types/svg.d.ts`

### Likely Deletion Candidates

These had no app references in the expanded text search. Delete in a small batch, then run `pnpm exec tsc --noEmit --pretty false`.

- `src/components/AccessBootstrapView.tsx`
- `src/constants/visualTokens.ts`
- `src/mapflow-navigation-kit/src/components/navigation/PresetSelector.tsx`
- `src/mapflow-navigation-kit/src/components/navigation/SavePresetModal.tsx`
- `src/mapflow-navigation-kit/src/components/navigation/SpeedLimitSign.tsx`
- `src/mapflow-navigation-kit/src/utils/mapMarkerAssets.ts`
- `src/services/AddressSuggestionService.ts`
- `src/components/nebula-core-3d-animation.html`
- `src/components/speedometer-3d-animation.html`

### Manual Review / Keep For Now

- `src/mapflow-navigation-kit/src/index.ts`: false positive; used by `src/screens/DriveScreen.tsx` through the directory entry import.
- `src/types/expo-keep-awake.d.ts`: keep unless TypeScript still passes after removal; `DriveScreen` imports `expo-keep-awake`.
- `src/types/svg.d.ts`: keep while SVG imports/assets remain possible.
- `src/components/ui/**`, `src/hooks/use-mobile.ts`, `src/hooks/use-toast.ts`, `src/lib/utils.ts`: web/shadcn layer used by `src/app/**`; current hold set is still valid.
- `src/lib/db.ts`: keep with the web app hold set unless `src/app/**` is removed.
- `src/components/GraphicRadarPanelView.tsx`: JS wrapper is not imported by the current app, but native Android manager/source still exists and animation-porting docs reference it.
- `src/components/RadarMap.tsx`: no direct app import found, but it is a large legacy map component; delete only in a separate batch after a runtime smoke test of the Map tab.

## Notes
- Legacy screens were intentionally reconnected through navigation/drawer and are not cleanup targets.
- Static graph analysis can miss runtime/dynamic wiring; keep list is explicit by design.
- 2026-03-06 cleanup removed `src/utils/mapStyle.ts` and `src/screens/ARRadarScreen.tsx`.

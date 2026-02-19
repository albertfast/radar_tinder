# Unused Files Analysis

Generated with `scripts/analyze-unused-files.mjs` (import + dynamic import + require graph).

## Snapshot
- `2026-02-19` pre-cleanup: `149` source files, `68` potential unreferenced, `15` cleanup candidates.
- `2026-02-19` post-cleanup: `135` source files, `54` potential unreferenced, `0` cleanup candidates, `54` hold entries.

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
- `src/utils/mapStyle.ts`
- `src/screens/ARRadarScreen.tsx`
- `src/screens/AlertsScreen.tsx`
- `src/screens/MapScreen.tsx`

## Notes
- Legacy screens were intentionally reconnected through navigation/drawer and are not cleanup targets.
- Static graph analysis can miss runtime/dynamic wiring; keep list is explicit by design.

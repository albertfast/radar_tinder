# Radar Animation Porting Package

This is the exact set of files that build the animated home radar screen in this app and are the best candidates to copy into another React Native app.

## 1. Core Home Screen Chain

These are the files that render the screenshoted home-page animation:

- [src/screens/RadarScreen.tsx](src/screens/RadarScreen.tsx)
- [src/screens/radar/components/RadarHomeDashboard.tsx](src/screens/radar/components/RadarHomeDashboard.tsx)
- [src/components/RadarAnimation.tsx](src/components/RadarAnimation.tsx)
- [src/components/RadarLife3DView.tsx](src/components/RadarLife3DView.tsx)
- [src/components/GraphicRadarPanelView.tsx](src/components/GraphicRadarPanelView.tsx)

## 2. Native Android Files

If you want the native 3D/Canvas implementation, copy these too:

- [android/app/src/main/java/com/radartinder/app/radarlife/RadarLife3DView.java](android/app/src/main/java/com/radartinder/app/radarlife/RadarLife3DView.java)
- [android/app/src/main/java/com/radartinder/app/radarlife/RadarLife3DRenderer.java](android/app/src/main/java/com/radartinder/app/radarlife/RadarLife3DRenderer.java)
- [android/app/src/main/java/com/radartinder/app/radarlife/RadarLife3DViewManager.java](android/app/src/main/java/com/radartinder/app/radarlife/RadarLife3DViewManager.java)
- [android/app/src/main/java/com/radartinder/app/radarlife/RadarLifePackage.kt](android/app/src/main/java/com/radartinder/app/radarlife/RadarLifePackage.kt)
- [android/app/src/main/java/com/radartinder/app/ui/GraphicRadarPanelView.java](android/app/src/main/java/com/radartinder/app/ui/GraphicRadarPanelView.java)
- [android/app/src/main/java/com/radartinder/app/ui/GraphicRadarPanelViewManager.java](android/app/src/main/java/com/radartinder/app/ui/GraphicRadarPanelViewManager.java)
- [android/app/src/main/java/com/radartinder/app/ui/UIPackage.kt](android/app/src/main/java/com/radartinder/app/ui/UIPackage.kt)

## 3. Android Registration

These files register the native views into React Native. Without them the JS wrappers will not resolve:

- [android/app/src/main/java/com/radartinder/app/MainApplication.kt](android/app/src/main/java/com/radartinder/app/MainApplication.kt)

Relevant registrations:

```kotlin
add(RadarLifePackage())
add(UIPackage())
```

## 4. What To Copy First

If you want the fastest port into another app, copy in this order:

1. [src/components/RadarAnimation.tsx](src/components/RadarAnimation.tsx)
2. [src/components/RadarLife3DView.tsx](src/components/RadarLife3DView.tsx)
3. [android/app/src/main/java/com/radartinder/app/radarlife/RadarLife3DView.java](android/app/src/main/java/com/radartinder/app/radarlife/RadarLife3DView.java)
4. [android/app/src/main/java/com/radartinder/app/radarlife/RadarLife3DRenderer.java](android/app/src/main/java/com/radartinder/app/radarlife/RadarLife3DRenderer.java)
5. [android/app/src/main/java/com/radartinder/app/radarlife/RadarLife3DViewManager.java](android/app/src/main/java/com/radartinder/app/radarlife/RadarLife3DViewManager.java)
6. [android/app/src/main/java/com/radartinder/app/radarlife/RadarLifePackage.kt](android/app/src/main/java/com/radartinder/app/radarlife/RadarLifePackage.kt)

## 5. What The Files Do

- `RadarAnimation.tsx` is the JS wrapper that chooses native 3D or fallback rendering.
- `RadarLife3DView.tsx` is the React Native bridge wrapper for the native 3D view.
- `RadarLife3DView.java` is the actual animated canvas-style native component.
- `RadarLife3DRenderer.java` is the OpenGL renderer engine behind the 3D effect.
- `GraphicRadarPanelView.java` is another native animated radar panel, but it is more UI-oriented than the main home hero.
- `RadarHomeDashboard.tsx` is the screen component that places the animation into the home page layout.

## 6. Minimal Port Checklist

For another app, you will also need:

- The same React Native native-component registration in `MainApplication.kt`.
- Any helper utilities imported by the JS wrappers, especially `src/utils/logger` and shared animation constants.
- Matching Android package names and import paths if you change the namespace.
- The native package entries in the target app's Android project.

## 7. Important Note

The screenshoted home animation is not just one file. It is a chain:

`RadarScreen -> RadarHomeDashboard -> RadarAnimation -> RadarLife3DView -> RadarLife3DRenderer`

So if you only copy the Java files without the JS wrapper and package registration, the animation will not appear in the new app.
# Kotlin Metadata Mismatch (Android / Expo / React Native)

## Symptom

Android build fails at `:app:compileDebugKotlin` with errors like:

- `Module was compiled with an incompatible version of Kotlin`
- `The binary version of its metadata is 2.1.0, expected version is 1.9.0`
- A `.jar` path that ends in `META-INF/*.kotlin_module`

## Root Cause

Your project’s Kotlin Gradle plugin/compiler is older than a dependency on the classpath. Kotlin refuses to compile against libraries whose metadata version is newer than the compiler understands.

## Preferred Fix (Most Stable)

Before upgrading Kotlin, check for dependency version overrides that forced an upgrade of Firebase/Play Services (common in Expo/RN projects):

- Search for `firebase-bom` in `android/app/build.gradle` and remove/align overrides, especially if you already use `@react-native-firebase/*`.

If you still need it, upgrade the project Kotlin Gradle plugin to a version that can read the dependency’s metadata:

- Expo/RN: update both `android/build.gradle` and `android/react-settings-plugin/build.gradle.kts`
- Then rebuild to confirm the failing task moves past `compileDebugKotlin`

The repo-local helper script in this skill automates the version bump:

- `python3 skills/expo-android-build-doctor/scripts/bump_kotlin_version.py --version 2.1.0 --apply`

## Alternative Mitigation (More Fragile)

Downgrade/pin the dependency that introduced the newer Kotlin metadata (e.g., a Firebase / Play Services bump), but this can be painful because:

- You may need to align multiple transitive dependencies (BOMs)
- Tooling can re-upgrade you on the next install
- It’s easy to end up with an inconsistent dependency graph

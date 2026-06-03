# MapFlow Navigation Kit

## What This Is

This package is a **drop-in source module** for an **Expo React Native app**.

It gives you:

- a dark native `react-native-maps` map surface
- address search with nearby-biased suggestions
- route preview and turn-by-turn navigation UI
- speed display and speed-limit lookup
- automatic metric / imperial switching based on country

This is **not** an npm package and **not** a native SDK wrapper.
The integration method is:

**copy the source folder into your Expo app and import the screen/component directly**

## Best Integration Method

Use this in:

- an Expo app
- an Expo Router app
- a React Navigation app running on Expo

This is the easiest and safest method because the module already depends on:

- `expo-location`
- `react-native-maps`
- `react-native-svg`
- `react-native-safe-area-context`
- `@expo/vector-icons`
- `zustand`

## Folder Structure

- `src/MapFlowNavigationScreen.tsx`
  This is the main full-screen navigation screen.
- `src/components/*`
  UI and map components.
- `src/hooks/*`
  Search, routing, tracking, speed-limit, and location logic.
- `src/services/api.ts`
  Free-provider integrations and provider fallback logic.
- `src/stores/navigationStore.ts`
  Shared navigation state.

## Install In Another App

### 1. Copy The Folder

Copy `mapflow-navigation-kit` into your target Expo app.

Recommended destination:

`your-app/src/vendor/mapflow-navigation-kit`

### 2. Install Required Packages

Run these commands inside the target app:

```bash
npx expo install expo-location react-native-maps react-native-svg react-native-safe-area-context @expo/vector-icons
npm install zustand
```

If your app does not already include standard Expo navigation/runtime packages, also make sure these are installed in the target project:

```bash
npx expo install expo-status-bar react-native-screens react-native-gesture-handler
```

## Environment Variables

Create a `.env` file in the target app and add any of these keys you want to use:

```env
EXPO_PUBLIC_GEOAPIFY_API_KEY=
EXPO_PUBLIC_OPENROUTESERVICE_API_KEY=
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
```

Notes:

- No key is strictly required.
- The kit works with free fallbacks.
- `Geoapify` improves autocomplete quality.
- `OpenRouteService` improves routing quality.
- Google is optional and only used if you add a key.

## Required Expo Permission Setup

In the target app, add `expo-location` permission config in `app.json` or `app.config.ts`.

Example `app.json` snippet:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-location",
        {
          "locationWhenInUsePermission": "Allow this app to access your location for navigation."
        }
      ]
    ]
  }
}
```

## Usage In A Simple Expo Screen

```tsx
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MapFlowNavigationScreen } from './src/vendor/mapflow-navigation-kit/src';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <MapFlowNavigationScreen />
    </SafeAreaProvider>
  );
}
```

## Usage In Expo Router

Create a route file like:

`app/navigation.tsx`

```tsx
import React from 'react';
import { MapFlowNavigationScreen } from '../src/vendor/mapflow-navigation-kit/src';

export default function NavigationRoute() {
  return <MapFlowNavigationScreen />;
}
```

Make sure your app root already uses `SafeAreaProvider`.

## Usage In React Navigation

Register the screen normally:

```tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MapFlowNavigationScreen } from './src/vendor/mapflow-navigation-kit/src';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MapFlowNavigation" component={MapFlowNavigationScreen} />
    </Stack.Navigator>
  );
}
```

## What You May Want To Customize

- map colors in `src/components/map/MapView.native.tsx`
- navigation card layout in `src/components/navigation/NavigationPanel.tsx`
- search UI in `src/components/navigation/SearchBar.tsx`
- result ranking and provider behavior in `src/services/api.ts`

## Current Technical Notes

- The map surface is native `react-native-maps`; routing/search still use free-provider fallbacks.
- Search uses multiple providers with fallback logic.
- Speed-limit data depends on public OSM / Overpass data and may sometimes be missing.
- ETA is updated during navigation using route progress and observed movement, but it is not the same as Google live traffic ETA.

## Recommended Target App Type

For the smoothest integration, use this kit in:

- an Expo app based on SDK 54 or newer
- a full-screen screen route
- an app that already uses TypeScript

## Included Files

This zip includes:

- the reusable navigation source
- the main screen export
- environment variable template
- this integration guide
